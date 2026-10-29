import { describe, expect, it } from 'vitest';
import { effectiveCard } from '../cards/effectiveCard';
import type { Card } from '../data/card';
import type { CommanderDef } from '../data';
import type { PlayTarget } from './cardCommand';
import type { CombatSimulator } from './sim';
import type { CombatUnit } from './unit';
import { cardCatalog, eventsOf, handSnapshot, harten, makeCardSim, unitOf, type Placement } from './testSupport';

/**
 * M5-4 2부-C: 공통 카드 35장(보상 풀 30 + 유닛 제공 2 + 저주 3)의 동작.
 * 보상 풀 30장과 제공 카드 2장은 기본/강화 두 번씩 같은 표로 돌려 강화 수치까지 단언한다 (v(기본, 강화)).
 */

// 특성이 켜지지 않는 편성(같은 유닛 2기는 1종으로 센다): 아군 uid 0 방패병(3,1) · 1 방패병(3,3) · 2 숲 궁수(2,2) / 적 uid 3 방패병(4,2) · 4 석궁병(6,2)
const PLAIN_A: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['grove_archer', 1, 2, 2]];
const ENEMY_PAIR: readonly Placement[] = [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 6, 2]];
/** 적 3기: uid 3 (4,2) · 4 (5,2) · 5 (7,2) — 번개 사슬의 "인접" 확인용 */
const ENEMY_TRIO: readonly Placement[] = [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 5, 2], ['legion_crossbow', 1, 7, 2]];

const none: PlayTarget = { kind: 'none' };
const unit = (uid: number): PlayTarget => ({ kind: 'unit', uid });
const cell = (col: number, row: number): PlayTarget => ({ kind: 'cell', cell: { col, row } });

/** 특성 공명이 켜지는 편성: 서로 다른 유닛 2종. uid 0은 모두 방패병(대상용) */
const RES: Record<string, readonly Placement[]> = {
  iron_legion: [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3], ['grove_archer', 1, 2, 2]],
  guardian: [['iron_shieldbearer', 1, 3, 1], ['moss_warden', 1, 3, 3], ['grove_archer', 1, 2, 2]],
  ember: [['iron_shieldbearer', 1, 3, 1], ['ember_kindler', 1, 3, 3], ['ember_slinger', 1, 2, 2]],
  mystic: [['iron_shieldbearer', 1, 3, 1], ['ember_kindler', 1, 3, 3], ['abyss_whisperer', 1, 2, 2]],
  assassin: [['iron_shieldbearer', 1, 3, 1], ['shade_dagger', 1, 3, 3], ['legion_spy', 1, 2, 2]],
  abyss: [['iron_shieldbearer', 1, 3, 1], ['shade_dagger', 1, 3, 3], ['abyss_whisperer', 1, 2, 2]],
  forest_pact: [['iron_shieldbearer', 1, 3, 1], ['moss_warden', 1, 3, 3], ['grove_archer', 1, 2, 2]],
  gladiator: [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3], ['ember_berserker', 1, 2, 2]],
  marksman: [['iron_shieldbearer', 1, 3, 1], ['legion_crossbow', 1, 3, 3], ['grove_archer', 1, 2, 2]],
};

interface Run {
  sim: CombatSimulator;
  upgraded: boolean;
  card: Card;
  v: <T>(base: T, up: T) => T;
  cpBefore: number;
  shieldBefore: number[];
  events: <T extends Parameters<typeof eventsOf>[1]>(type: T) => ReturnType<typeof eventsOf<T>>;
  damage: (uid: number) => { amount: number; dmgType: string; source: number | null }[];
  shieldGain: (uid: number) => number;
  cp: () => number;
  hand: () => number;
}

interface Spec {
  id: string;
  target: PlayTarget;
  commander?: CommanderDef;
  a?: readonly Placement[];
  b?: readonly Placement[];
  extraHand?: string[];
  setup?: (sim: CombatSimulator) => void;
  /** 사용으로 얻는 CP (상한 6은 검사에서 반영) */
  cpGain?: number;
  check: (r: Run) => void;
}

const near = (actual: number, expected: number, eps = 1) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);
/** 카드 피해 기대값: 방어력 반영 후 반올림 (지휘관 주문 보정 없음) */
function expectedDamage(target: CombatUnit, raw: number, type: 'physical' | 'magic', ignorePct = 0): number {
  const defense = target.stat(type === 'physical' ? 'arm' : 'res') * (1 - ignorePct / 100);
  return Math.max(1, Math.round((raw * 100) / (100 + defense)));
}
const fillers = (n: number) => Array.from({ length: n }, (_, i) => ({ instanceId: 100 + i, cardId: 'war_drums', upgraded: false }));

function setupSim(spec: Spec, upgraded: boolean) {
  const card = cardCatalog.get(spec.id) as Card;
  const base = handSnapshot([spec.id, ...(spec.extraHand ?? [])], upgraded ? [1] : []);
  const phase = card.type === 'operation' || card.type === 'equipment' ? 'prep' : 'combat';
  const sim = makeCardSim({
    commander: spec.commander ?? harten, commanderHp: 30, a: spec.a ?? PLAIN_A, b: spec.b ?? ENEMY_PAIR,
    deck: { ...base, draw: fillers(8), nextInstanceId: 200 },
  });
  if (phase === 'combat') sim.startCombat();
  spec.setup?.(sim);
  return { sim, card, phase } as const;
}

function play(spec: Spec, upgraded: boolean): Run {
  const { sim, card, phase } = setupSim(spec, upgraded);
  const view = effectiveCard(card, upgraded);
  const cp = () => sim.commandPoints!.amount(phase);
  if (cp() < view.cost) sim.commandPoints!.gainCp(view.cost - cp(), 'effect');
  const from = sim.events.length;
  const cpBefore = cp();
  const shieldBefore = [0, 1, 2].map((uid) => unitOf(sim, uid).statuses.shieldTotal());
  expect(sim.playCard(1, spec.target).ok, `${spec.id}${upgraded ? '+' : ''} 사용 결과`).toBe(true);
  const sliced = () => sim.events.slice(from);
  return {
    sim, upgraded, card, v: (base, up) => (upgraded ? up : base), cpBefore, shieldBefore,
    events: ((type: string) => sliced().filter((e) => e.type === type)) as Run['events'],
    damage: (uid) => sliced().filter((e) => e.type === 'damage' && e.unit === uid) as ReturnType<Run['damage']>,
    shieldGain: (uid) => unitOf(sim, uid).statuses.shieldTotal() - shieldBefore[uid]!,
    cp, hand: () => sim.deck!.hand.length,
  };
}

const u = (r: Run, uid: number) => unitOf(r.sim, uid);
const shieldPct = (r: Run, uid: number, pct: number) => near(r.shieldGain(uid), Math.round((u(r, uid).maxHp * pct) / 100));
const bonus = (r: Run, uid: number, stat: 'atk' | 'as' | 'arm' | 'res') => u(r, uid).statuses.statBonus(stat);
const applied = (r: Run, status: string, uid?: number) => r.events('statusApplied').filter((e) => e.status === status && (uid === undefined || e.unit === uid));
const A = [0, 1, 2];

// ======================= 보상 풀 30장 =======================
const COMMON: Spec[] = [
  { id: 'shield_wall', target: unit(0), check: (r) => { shieldPct(r, 0, r.v(25, 35)); expect(r.shieldGain(1)).toBe(0); } },
  {
    id: 'first_aid', target: unit(0),
    setup: (sim) => { unitOf(sim, 0).hp = 100; },
    check: (r) => expect(u(r, 0).hp).toBe(100 + r.v(150, 250)),
  },
  {
    id: 'regroup', target: none,
    setup: (sim) => { unitOf(sim, 0).hp = 100; unitOf(sim, 2).hp = 100; unitOf(sim, 1).statuses.addStun(1e9); },
    check: (r) => {
      expect(u(r, 0).hp).toBe(100 + r.v(80, 120));
      expect(u(r, 2).hp).toBe(100 + r.v(80, 120));
      expect(u(r, 1).statuses.isStunned()).toBe(false);
    },
  },
  {
    id: 'blockade_line', target: none,
    check: (r) => {
      for (const uid of [0, 1]) expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(r.v(0.7, 0.55));
      expect(u(r, 2).statuses.takenMultiplier()).toBe(1);
      expect(applied(r, 'damageTakenMult', 0)[0]!.duration).toBe(3);
    },
  },
  {
    id: 'mark_weakness', target: unit(3),
    check: (r) => {
      expect(u(r, 3).statuses.takenMultiplier()).toBeCloseTo(r.v(1.25, 1.35));
      expect(u(r, 4).statuses.takenMultiplier()).toBe(1);
      expect(applied(r, 'damageTakenMult', 3)[0]!.duration).toBe(5);
    },
  },
  {
    id: 'armor_shatter', target: unit(3),
    check: (r) => {
      // 방어력은 0 밑으로 내려가지 않아 합산값(flat)은 기본 ARM에서 멈춘다. 카드가 건 수치는 이벤트로 확인한다
      expect(applied(r, 'statMod:arm', 3).map((e) => e.value)).toEqual([r.v(-40, -60)]);
      expect(applied(r, 'statMod:arm', 3)[0]!.duration).toBe(6);
      expect(applied(r, 'statMod:arm', 4)).toHaveLength(0);
    },
  },
  {
    id: 'flashbang', target: cell(5, 2),
    check: (r) => {
      for (const uid of [3, 4]) expect(u(r, uid).statuses.isStunned()).toBe(true);
      expect(applied(r, 'stun', 3)[0]!.duration).toBe(r.v(1.5, 2));
    },
  },
  {
    id: 'silence_bell', target: unit(3),
    check: (r) => {
      expect(u(r, 3).statuses.isSilenced()).toBe(true);
      expect(u(r, 4).statuses.isSilenced()).toBe(false);
      expect(applied(r, 'silence', 3)[0]!.duration).toBe(r.v(4, 6));
    },
  },
  {
    id: 'fireball', target: unit(3),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(160, 230), 'magic'));
      expect(r.damage(3)[0]!.dmgType).toBe('magic');
      expect(r.damage(4)).toHaveLength(0);
    },
  },
  {
    id: 'chain_lightning', target: unit(3), b: ENEMY_TRIO,
    check: (r) => {
      for (const uid of [3, 4]) near(r.damage(uid)[0]!.amount, expectedDamage(u(r, uid), r.v(120, 170), 'magic'));
      expect(r.damage(5)).toHaveLength(0); // 대상과 인접하지 않은 적
    },
  },
  {
    id: 'earth_collapse', target: cell(4, 2),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(260, 340), 'physical', 50));
      expect(u(r, 3).statuses.isStunned()).toBe(true);
      expect(applied(r, 'stun', 3)[0]!.duration).toBe(1);
      expect(r.damage(4)).toHaveLength(0); // (6,2)는 범위 밖
    },
  },
  {
    id: 'battle_cry', target: none,
    check: (r) => {
      for (const uid of A) {
        expect(bonus(r, uid, 'atk').pct).toBe(25);
        expect(bonus(r, uid, 'as').pct).toBe(25);
        expect(applied(r, 'statMod:atk', uid)[0]!.duration).toBe(r.v(5, 7));
      }
    },
  },
  {
    id: 'weakening_curse', target: cell(4, 2),
    check: (r) => {
      expect(bonus(r, 3, 'atk').pct).toBe(r.v(-20, -30));
      expect(bonus(r, 4, 'atk').pct).toBe(0);
    },
  },
  {
    id: 'supplies', target: none,
    check: (r) => expect(r.hand()).toBe(r.v(2, 3)),
  },
  {
    id: 'messenger', target: none, cpGain: 1,
    check: (r) => expect(r.hand()).toBe(r.v(1, 2)),
  },
  {
    id: 'full_mobilization', target: none, cpGain: 3,
    check: (r) => expect(r.hand()).toBe(2),
  },
  {
    id: 'chain_stratagem', target: none,
    check: (r) => expect(r.hand()).toBe(r.v(1, 2)), // 연쇄가 꺼진 단독 사용
  },
  {
    id: 'field_prep', target: none,
    check: (r) => { for (const uid of A) shieldPct(r, uid, r.v(10, 15)); },
  },
  {
    id: 'morale_boost', target: none,
    check: (r) => {
      for (const uid of A) {
        expect(bonus(r, uid, 'as').pct).toBe(r.v(10, 15));
        expect(bonus(r, uid, 'atk').pct).toBe(5);
      }
    },
  },
  { id: 'steel_cuirass', target: unit(0), check: (r) => { expect(bonus(r, 0, 'arm').flat).toBe(r.v(30, 45)); expect(bonus(r, 1, 'arm').flat).toBe(0); } },
  { id: 'vampiric_dagger', target: unit(0), check: (r) => { expect(u(r, 0).statuses.lifestealPct()).toBe(r.v(15, 20)); expect(u(r, 1).statuses.lifestealPct()).toBe(0); } },
  {
    id: 'iron_ranks', target: none,
    check: (r) => {
      for (const uid of A) {
        expect(applied(r, 'statMod:arm', uid).map((e) => e.value)).toEqual([r.v(15, 25)]);
        expect(applied(r, 'statMod:arm', uid)[0]!.duration).toBe(5);
      }
      expect(r.events('shield')).toHaveLength(0); // 공명 꺼짐: 전열 보호막 없음
    },
  },
  {
    id: 'ember_spread', target: cell(5, 2),
    check: (r) => {
      for (const uid of [3, 4]) {
        const burn = applied(r, 'burn', uid)[0]!;
        near(burn.value!, r.v(25, 35), 0.01);
        expect(burn.duration).toBe(4);
      }
    },
  },
  {
    id: 'void_veil', target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.takenMultiplier()).toBeCloseTo(0.4);
      expect(applied(r, 'damageTakenMult', 0)[0]!.duration).toBe(r.v(3, 4));
      expect(u(r, 0).statuses.lifestealPct()).toBe(0);
    },
  },
  {
    id: 'root_prison', target: cell(5, 2),
    check: (r) => {
      for (const uid of [3, 4]) expect(u(r, uid).statuses.isRooted()).toBe(true);
      expect(applied(r, 'root', 3)[0]!.duration).toBe(r.v(3, 4));
      expect(bonus(r, 0, 'as').pct).toBe(0);
    },
  },
  {
    id: 'shield_oath', target: unit(0),
    check: (r) => {
      expect(u(r, 3).statuses.forcedTargetUid()).toBe(0);
      expect(u(r, 4).statuses.forcedTargetUid()).toBeNull(); // 반경 2칸 밖
      expect(applied(r, 'taunted', 3)[0]!.duration).toBe(r.v(3, 4));
      expect(u(r, 0).statuses.takenMultiplier()).toBeCloseTo(0.7);
      expect(r.shieldGain(0)).toBe(0);
    },
  },
  {
    id: 'arena_roar', target: unit(0),
    check: (r) => {
      expect(bonus(r, 0, 'atk').pct).toBe(r.v(30, 45));
      expect(applied(r, 'statMod:atk', 0)[0]!.duration).toBe(5);
      expect(u(r, 0).statuses.lifestealPct()).toBe(0);
    },
  },
  { id: 'volley', target: unit(2), check: (r) => { expect(u(r, 2).statuses.extraShots).toBe(r.v(4, 6)); expect(u(r, 0).statuses.extraShots).toBe(0); } },
  {
    id: 'spell_amplify', target: none, extraHand: ['war_drums'],
    check: (r) => {
      expect(r.hand()).toBe(1 + r.v(1, 2));
      expect(r.events('cardCost')).toHaveLength(0);
    },
  },
  {
    id: 'shadow_step', target: unit(0),
    check: (r) => {
      expect(u(r, 0).cell.col).toBe(7); // 적 후열
      expect(r.events('teleport')).toHaveLength(1);
      expect(bonus(r, 0, 'atk').pct).toBe(0);
    },
  },
];

// ======================= 유닛 제공 2장 =======================
const GRANTED: Spec[] = [
  {
    id: 'rift_opening', target: cell(5, 2),
    check: (r) => {
      for (const uid of [3, 4]) {
        expect(bonus(r, uid, 'res').flat).toBe(r.v(-30, -45));
        expect(applied(r, 'statMod:res', uid)[0]!.duration).toBe(4);
      }
    },
  },
  {
    id: 'prophesied_calamity', target: cell(4, 2),
    setup: (sim) => { unitOf(sim, 3).statuses.addStun(1e9); },
    check: (r) => {
      expect(r.events('telegraph')[0]).toMatchObject({ source: -1, pattern: 'card', fireAt: 3 });
      expect(r.damage(3)).toHaveLength(0); // 3초 뒤에 떨어진다
      r.sim.runUntil(35);
      const hit = r.damage(3).filter((e) => e.source === null);
      expect(hit).toHaveLength(1);
      near(hit[0]!.amount, expectedDamage(u(r, 3), r.v(400, 550), 'magic'));
      expect(r.damage(4)).toHaveLength(0);
    },
  },
];

const ALL: Spec[] = [...COMMON, ...GRANTED];

/** 비용 정산에서 쓰는 풀: 작전·장비는 준비 CP */
const poolOf = (card: Card) => (card.type === 'operation' || card.type === 'equipment' ? 'prep' : 'combat');

for (const upgraded of [false, true]) {
  describe(`공통 카드 32장 동작${upgraded ? ' (강화)' : ''}`, () => {
    it('표가 공통 보상 카드 30장 + 제공 카드 2장을 빠짐없이 한 번씩 다룬다', () => {
      const ids = ALL.map((s) => s.id);
      expect(new Set(ids).size).toBe(32);
      const neutral = cardCatalog.cards.filter((c) => c.owner === 'neutral' && c.type !== 'curse' && c.rarity !== 'starter');
      const added = neutral.filter((c) => ids.includes(c.id));
      expect(added).toHaveLength(32);
    });

    for (const spec of ALL) {
      it(`${spec.id}: 사용 가능, 비용 정산, 핵심 효과`, () => {
        const run = play(spec, upgraded);
        const view = effectiveCard(run.card, upgraded);
        if (poolOf(run.card) === 'combat') expect(run.cp()).toBe(Math.min(6, run.cpBefore - view.cost + (spec.cpGain ?? 0)));
        else expect(run.cp()).toBe(run.cpBefore - view.cost);
        expect(run.sim.commanderHpSpent).toBe(0); // 공통 카드에는 HP 비용이 없다
        const exhausted = run.card.type === 'equipment' || view.keywords.includes('exhaust');
        expect(run.sim.deck!.exhaustPile.some((c) => c.cardId === spec.id)).toBe(exhausted);
        spec.check(run);
      });
    }
  });
}

describe('강화 비용·키워드', () => {
  it('총동원은 강화하면 비용 1, 소모는 유지된다', () => {
    const card = cardCatalog.get('full_mobilization')!;
    expect(effectiveCard(card, false).cost).toBe(2);
    expect(effectiveCard(card, true).cost).toBe(1);
    expect(effectiveCard(card, true).keywords).toContain('exhaust');
  });
  it('예언된 재앙은 보존 키워드다 (손패에 남는다)', () => {
    expect(effectiveCard(cardCatalog.get('prophesied_calamity')!, false).keywords).toContain('retain');
    expect(effectiveCard(cardCatalog.get('prophesied_calamity')!, true).keywords).toContain('retain');
  });
});

// ======================= 공명 (특성이 켜졌을 때만 추가 효과) =======================
describe('공명 9종: 특성이 켜졌을 때만 추가 효과', () => {
  const specOf = (id: string) => ALL.find((s) => s.id === id)!;
  const withA = (id: string, a: readonly Placement[], upgraded: boolean, extra: Partial<Spec> = {}) => play({ ...specOf(id), a, ...extra }, upgraded);

  for (const upgraded of [false, true]) {
    const tag = upgraded ? ' (강화)' : '';

    it(`C42 강철 대열${tag}: 강철군단 공명이면 ARM +20 추가, 전열 보호막 10%`, () => {
      const on = withA('iron_ranks', RES.iron_legion!, upgraded);
      for (const uid of A) {
        // 카드 효과 두 번: 기본(15/25) 뒤에 공명 +20
        expect(applied(on, 'statMod:arm', uid).map((e) => e.value)).toEqual([upgraded ? 25 : 15, 20]);
      }
      for (const uid of [0, 1]) shieldPct(on, uid, 10);
      expect(on.shieldGain(2)).toBe(0);
      const off = withA('iron_ranks', PLAIN_A, upgraded);
      expect(applied(off, 'statMod:arm', 0)).toHaveLength(1);
      expect(off.events('shield')).toHaveLength(0);
    });

    it(`C44 불씨 퍼뜨리기${tag}: 잿불 공명이면 화상 초당 40/55`, () => {
      const on = withA('ember_spread', RES.ember!, upgraded);
      const peak = Math.max(...applied(on, 'burn', 3).map((e) => e.value ?? 0));
      near(peak, upgraded ? 55 : 40, 0.01);
      const off = withA('ember_spread', PLAIN_A, upgraded);
      near(Math.max(...applied(off, 'burn', 3).map((e) => e.value ?? 0)), upgraded ? 35 : 25, 0.01);
    });

    it(`C47 공허 장막${tag}: 심연 공명이면 4초간 생명력 흡수 30%`, () => {
      const on = withA('void_veil', RES.abyss!, upgraded);
      expect(u(on, 0).statuses.lifestealPct()).toBe(30);
      expect(applied(on, 'lifesteal', 0)[0]).toMatchObject({ value: 30, duration: 4 });
      const off = withA('void_veil', PLAIN_A, upgraded);
      expect(applied(off, 'lifesteal', 0)).toHaveLength(0);
    });

    it(`C49 뿌리 감옥${tag}: 숲의 맹약 공명이면 아군 전체 4초간 AS +15%`, () => {
      const on = withA('root_prison', RES.forest_pact!, upgraded);
      for (const uid of A) {
        const mods = applied(on, 'statMod:as', uid).filter((e) => e.value === 15);
        expect(mods).toHaveLength(1);
        expect(mods[0]!.duration).toBe(4);
      }
      expect(applied(withA('root_prison', PLAIN_A, upgraded), 'statMod:as')).toHaveLength(0);
    });

    it(`C50 방패 맹세${tag}: 수호자 공명이면 최대 HP 20% 보호막`, () => {
      const on = withA('shield_oath', RES.guardian!, upgraded);
      shieldPct(on, 0, 20);
      expect(withA('shield_oath', PLAIN_A, upgraded).shieldGain(0)).toBe(0);
    });

    it(`C52 투기장의 함성${tag}: 검투사 공명이면 5초간 생명력 흡수 20%`, () => {
      const on = withA('arena_roar', RES.gladiator!, upgraded);
      expect(applied(on, 'lifesteal', 0)[0]).toMatchObject({ value: 20, duration: 5 });
      expect(withA('arena_roar', PLAIN_A, upgraded).events('statusApplied').some((e) => e.status === 'lifesteal')).toBe(false);
    });

    it(`C54 일제 사격${tag}: 사수 공명이면 기본 4/6회에 +2회 (6/8회)`, () => {
      const on = withA('volley', RES.marksman!, upgraded, { target: unit(2) });
      expect(u(on, 2).statuses.extraShots).toBe(upgraded ? 8 : 6);
      expect(withA('volley', PLAIN_A, upgraded).sim.world.unitByUid(2)!.statuses.extraShots).toBe(upgraded ? 6 : 4);
    });

    it(`C56 주문 증폭${tag}: 주술사 공명이면 손패 한 장의 비용이 1 줄어든다`, () => {
      const on = withA('spell_amplify', RES.mystic!, upgraded, { extraHand: ['war_drums'] });
      const cut = on.events('cardCost');
      expect(cut).toHaveLength(1);
      expect(cut[0]).toMatchObject({ delta: -1 });
      expect(withA('spell_amplify', PLAIN_A, upgraded, { extraHand: ['war_drums'] }).events('cardCost')).toHaveLength(0);
    });

    it(`C58 그림자 걸음${tag}: 암살자 공명이면 3초간 ATK +30%/+45%`, () => {
      const on = withA('shadow_step', RES.assassin!, upgraded);
      expect(bonus(on, 0, 'atk').pct).toBe(upgraded ? 45 : 30);
      expect(applied(on, 'statMod:atk', 0)[0]!.duration).toBe(3);
      expect(bonus(withA('shadow_step', PLAIN_A, upgraded), 0, 'atk').pct).toBe(0);
    });

    it(`U1 균열 개방${tag}: 심연 공명이면 CP 1을 돌려받는다`, () => {
      const on = withA('rift_opening', RES.abyss!, upgraded);
      expect(on.cp()).toBe(Math.min(6, on.cpBefore - 2 + 1));
      const off = withA('rift_opening', PLAIN_A, upgraded);
      expect(off.cp()).toBe(off.cpBefore - 2);
    });
  }
});

// ======================= 연쇄 =======================
describe('연쇄 (앞서 카드를 쓴 뒤의 비용·추가 효과)', () => {
  function chained(id: string, upgraded: boolean) {
    const sim = makeCardSim({
      commander: harten, commanderHp: 30, a: PLAIN_A, b: ENEMY_PAIR,
      deck: { ...handSnapshot(['hold_the_line', id], upgraded ? [2] : []), draw: fillers(6), nextInstanceId: 200 },
    });
    sim.startCombat();
    sim.commandPoints!.gainCp(6, 'effect');
    expect(sim.playCard(1, unit(1)).ok).toBe(true);
    const cp = sim.commandPoints!.combat;
    const hand = sim.deck!.hand.length;
    expect(sim.playCard(2, none).ok).toBe(true);
    return { cpDelta: sim.commandPoints!.combat - cp, drawn: sim.deck!.hand.length - (hand - 1) };
  }

  for (const upgraded of [false, true]) {
    const tag = upgraded ? ' (강화)' : '';
    it(`C23 전령${tag}: 연쇄하면 비용 0 (CP +1이 그대로 남는다)`, () => {
      const r = chained('messenger', upgraded);
      expect(r.cpDelta).toBe(1);
      expect(r.drawn).toBe(upgraded ? 2 : 1);
    });
    it(`C27 연환계${tag}: 연쇄하면 CP +2 (비용 1 지불)`, () => {
      const r = chained('chain_stratagem', upgraded);
      expect(r.cpDelta).toBe(-1 + 2);
      expect(r.drawn).toBe(upgraded ? 2 : 1);
    });
  }

  it('연쇄가 아니면 전령은 비용 1, 연환계는 CP를 얻지 않는다', () => {
    const solo = (id: string) => {
      const sim = makeCardSim({ commander: harten, a: PLAIN_A, b: ENEMY_PAIR, deck: { ...handSnapshot([id]), draw: fillers(4), nextInstanceId: 200 } });
      sim.startCombat();
      const cp = sim.commandPoints!.combat;
      expect(sim.playCard(1, none).ok).toBe(true);
      return sim.commandPoints!.combat - cp;
    };
    expect(solo('messenger')).toBe(-1 + 1);
    expect(solo('chain_stratagem')).toBe(-1);
  });
});

// ======================= 저주 =======================
describe('저주 3장 (공포·부상·부패한 보급)', () => {
  const simWith = (hand: string[], extra: Partial<Parameters<typeof makeCardSim>[0]> = {}) =>
    makeCardSim({ commander: harten, a: PLAIN_A, b: ENEMY_PAIR, deck: handSnapshot(hand), ...extra });

  it('데이터: 타입 curse, 효과 없음, 각자의 동작 필드', () => {
    for (const id of ['dread', 'wound', 'rotten_supplies']) {
      const card = cardCatalog.get(id)!;
      expect(card.type).toBe('curse');
      expect(card.owner).toBe('neutral');
      expect(card.effects).toEqual([]);
      expect(card.upgrade).toBeUndefined();
    }
    expect(cardCatalog.get('dread')!.curse).toBeUndefined();
    expect(cardCatalog.get('wound')!.curse).toEqual({ onDraw: [{ kind: 'statMod', selector: 'randomAlly', stat: 'atk', pct: -10, duration: 'combat' }] });
    expect(cardCatalog.get('rotten_supplies')).toMatchObject({ cost: 1, keywords: ['exhaust'], curse: { playable: true, goldLossAtEnd: 3 } });
  });

  it('K1 공포: 사용할 수 없고 손패를 차지한다 (상태·로그 불변)', () => {
    const sim = simWith(['dread']);
    sim.startCombat();
    const length = sim.events.length;
    expect(sim.playCard(1, none)).toEqual({ ok: false, reason: '저주 카드는 사용할 수 없습니다' });
    expect(sim.events).toHaveLength(length);
    expect(sim.deck!.hand.map((c) => c.cardId)).toEqual(['dread']);
  });

  it('K2 부상: 전투 시작 때 손패에 있으면 아군 무작위 1명의 ATK가 10% 줄고, 뽑을 때도 발동한다', () => {
    const start = simWith(['wound']);
    start.startCombat();
    const hit = eventsOf(start, 'statusApplied').filter((e) => e.status === 'statMod:atk' && e.value === -10);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.unit).toBeLessThan(3); // 아군
    expect(eventsOf(start, 'curseTriggered')).toEqual([expect.objectContaining({ cardId: 'wound' })]);

    const draw = { ...handSnapshot(['supplies']), draw: [{ instanceId: 2, cardId: 'wound', upgraded: false }], nextInstanceId: 3 };
    const sim = simWith([], { deck: draw });
    sim.startCombat();
    expect(eventsOf(sim, 'curseTriggered')).toHaveLength(0);
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(eventsOf(sim, 'curseTriggered')).toHaveLength(1);
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:atk' && e.value === -10)).toHaveLength(1);
  });

  it('K4 부패한 보급: 1CP로 쓰면 소모되어 골드 손실이 없고, 손패에 남으면 장당 3G 손실 이벤트', () => {
    const used = simWith(['rotten_supplies']);
    used.startCombat();
    const cp = used.commandPoints!.combat;
    expect(used.playCard(1, none).ok).toBe(true);
    expect(used.commandPoints!.combat).toBe(cp - 1);
    expect(used.deck!.exhaustPile.map((c) => c.cardId)).toEqual(['rotten_supplies']);
    used.run();
    expect(eventsOf(used, 'cursePenalty')).toHaveLength(0);

    const kept = simWith(['rotten_supplies', 'dread', 'rotten_supplies']);
    kept.run();
    expect(eventsOf(kept, 'cursePenalty').map((e) => e.gold)).toEqual([3, 3]);
  });

  it('저주를 쓰지 않는 전투의 로그에는 저주 이벤트가 없다', () => {
    const sim = simWith(['shield_wall', 'fireball']);
    sim.startCombat();
    sim.commandPoints!.gainCp(4, 'effect');
    sim.playCard(1, unit(0));
    sim.playCard(2, unit(3));
    sim.runUntil(60);
    expect(sim.events.some((e) => e.type === 'curseTriggered' || e.type === 'cursePenalty')).toBe(false);
  });
});

describe('이벤트 로그 결정론', () => {
  it('같은 입력(편성·시드·카드)이면 이벤트 로그가 JSON까지 같다', () => {
    const run = () => {
      const sim = makeCardSim({ commander: harten, a: RES.ember!, b: ENEMY_PAIR, hand: ['ember_spread', 'chain_lightning', 'flashbang'] });
      sim.startCombat();
      sim.commandPoints!.gainCp(6, 'effect');
      sim.playCard(1, cell(5, 2));
      sim.playCard(2, unit(3));
      sim.playCard(3, cell(4, 2));
      sim.runUntil(150);
      return JSON.stringify(sim.events);
    };
    expect(run()).toBe(run());
  });
});
