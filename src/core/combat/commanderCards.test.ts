import { describe, expect, it } from 'vitest';
import { effectiveCard } from '../cards/effectiveCard';
import type { Card } from '../data/card';
import type { CommanderDef } from '../data';
import type { PlayTarget } from './cardCommand';
import type { CombatSimulator } from './sim';
import type { CombatUnit } from './unit';
import { cardCatalog, eventsOf, handSnapshot, harten, isera, makeCardSim, nox, unitOf, type Placement } from './testSupport';

/**
 * M5-4 2부-B: 지휘관 전용 카드 90장(하르텐·이세라·녹스 각 30)의 동작을 카드마다 확인한다.
 * 같은 표를 기본 카드와 강화 카드로 두 번 돌려, 강화 수치(v(기본, 강화))까지 단언한다.
 */

// ---- 기본 편성: 특성이 켜지지 않는 편성 (공명은 별도 표에서 켠다) ----
// 아군 uid 0 방패병(3,1) · 1 방패병(3,3) · 2 숲 궁수(2,2) / 적 uid 3 방패병(4,2) · 4 석궁병(6,2)
const PLAIN_A: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['grove_archer', 1, 2, 2]];
const ENEMY_PAIR: readonly Placement[] = [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 6, 2]];

const none: PlayTarget = { kind: 'none' };
const unit = (uid: number): PlayTarget => ({ kind: 'unit', uid });
const cell = (col: number, row: number): PlayTarget => ({ kind: 'cell', cell: { col, row } });
const pair: PlayTarget = { kind: 'units', uids: [0, 2] };

type Phase = 'prep' | 'combat';

/** 한 번 사용한 결과를 담은 실행 기록. check 함수가 읽는다 */
interface Run {
  sim: CombatSimulator;
  /** 사용 직전 이벤트 개수 (이후 이벤트만 본다) */
  from: number;
  upgraded: boolean;
  card: Card;
  /** v(기본값, 강화값): 강화 여부에 따라 고른다 */
  v: <T>(base: T, up: T) => T;
  cpBefore: number;
  shieldBefore: number[];
  ultBefore: number;
  events: <T extends Parameters<typeof eventsOf>[1]>(type: T) => ReturnType<typeof eventsOf<T>>;
  /** 사용 직후 적에게 들어간 피해 이벤트 */
  damage: (uid: number) => { amount: number; dmgType: string; bonus?: boolean; source: number | null }[];
  shieldGain: (uid: number) => number;
  cp: () => number;
  hand: () => number;
}

interface Spec {
  id: string;
  commander: CommanderDef;
  target: PlayTarget;
  /** 기본 'combat' 카드는 전투 시작 후, 작전·장비는 준비 단계에 쓴다 */
  a?: readonly Placement[];
  b?: readonly Placement[];
  extraHand?: string[];
  /** 사용 직전 준비 (상태 만들기) */
  setup?: (sim: CombatSimulator) => void;
  /** 사용으로 얻는 CP (상한 6은 검사에서 반영) */
  cpGain?: number | ((upgraded: boolean) => number);
  hpCost?: (upgraded: boolean) => number;
  check: (r: Run) => void;
}

const STAT_EPS = 1;
/** 방어력·마법 저항을 반영한 기대 피해 (카드 피해: 보정 → 방어 → 반올림) */
function expectedDamage(target: CombatUnit, raw: number, type: 'physical' | 'magic', ignorePct = 0, boostPct = 0): number {
  const defense = target.stat(type === 'physical' ? 'arm' : 'res') * (1 - ignorePct / 100);
  return Math.max(1, Math.round((raw * (1 + boostPct / 100) * 100) / (100 + defense)));
}
const near = (actual: number, expected: number, eps = STAT_EPS) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps);

const fillers = (n: number) => Array.from({ length: n }, (_, i) => ({ instanceId: 100 + i, cardId: 'war_drums', upgraded: false }));

function setupSim(spec: Spec, upgraded: boolean): { sim: CombatSimulator; card: Card; phase: Phase } {
  const card = cardCatalog.get(spec.id) as Card;
  const hand = [spec.id, ...(spec.extraHand ?? [])];
  const base = handSnapshot(hand, upgraded ? [1] : []);
  const phase: Phase = card.type === 'operation' || card.type === 'equipment' ? 'prep' : 'combat';
  const sim = makeCardSim({
    commander: spec.commander,
    commanderHp: 30,
    a: spec.a ?? PLAIN_A,
    b: spec.b ?? ENEMY_PAIR,
    deck: { ...base, draw: fillers(8), nextInstanceId: 200 },
  });
  if (phase === 'combat') sim.startCombat();
  spec.setup?.(sim);
  return { sim, card, phase };
}

/** 카드 1장을 쓰고 Run 기록을 돌려준다 */
function play(spec: Spec, upgraded: boolean): Run {
  const { sim, card, phase } = setupSim(spec, upgraded);
  const view = effectiveCard(card, upgraded);
  const pool = phase === 'prep' ? 'prep' : 'combat';
  const cp = () => sim.commandPoints!.amount(pool);
  // 비용이 모자라면 채운다 (CP 상한 6)
  if (cp() < view.cost) sim.commandPoints!.gainCp(view.cost - cp(), 'effect');
  const from = sim.events.length;
  const cpBefore = cp();
  const shieldBefore = [0, 1, 2].map((uid) => unitOf(sim, uid).statuses.shieldTotal());
  const ultBefore = sim.ultimate?.charge ?? 0;
  const result = sim.playCard(1, spec.target);
  expect(result.ok, `${spec.id}${upgraded ? '+' : ''} 사용 결과`).toBe(true);
  const sliced = () => sim.events.slice(from);
  return {
    sim, from, upgraded, card,
    v: (base, up) => (upgraded ? up : base),
    cpBefore, shieldBefore, ultBefore,
    events: ((type: string) => sliced().filter((e) => e.type === type)) as Run['events'],
    damage: (uid) => sliced().filter((e) => e.type === 'damage' && e.unit === uid) as ReturnType<Run['damage']>,
    shieldGain: (uid) => unitOf(sim, uid).statuses.shieldTotal() - shieldBefore[uid]!,
    cp,
    hand: () => sim.deck!.hand.length,
  };
}

const maxHp = (r: Run, uid: number) => unitOf(r.sim, uid).maxHp;
const u = (r: Run, uid: number) => unitOf(r.sim, uid);
const shieldPct = (r: Run, uid: number, pct: number) => near(r.shieldGain(uid), Math.round((maxHp(r, uid) * pct) / 100));
const atkPct = (r: Run, uid: number) => u(r, uid).statuses.statBonus('atk').pct;
const applied = (r: Run, status: string, uid?: number) =>
  r.events('statusApplied').filter((e) => e.status === status && (uid === undefined || e.unit === uid));
const A = [0, 1, 2];
const FRONT = [0, 1];

const lethal = (sim: CombatSimulator, uid: number, source = 0) =>
  sim.world.dealDamage({ source: unitOf(sim, source), target: unitOf(sim, uid), raw: 1e9, type: 'physical' });

// ======================= 하르텐 =======================
const H: Spec[] = [
  { id: 'harten_sturdy_shield', commander: harten, target: unit(0), check: (r) => shieldPct(r, 0, r.v(30, 40)) },
  {
    id: 'harten_phalanx_advance', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) {
        expect(atkPct(r, uid)).toBe(r.v(20, 30));
        expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(0.8);
      }
      expect(atkPct(r, 2)).toBe(0);
    },
  },
  {
    id: 'harten_iron_discipline', commander: harten, target: none,
    check: (r) => { for (const uid of A) expect(u(r, uid).statuses.statBonus('arm').flat).toBe(r.v(20, 30)); },
  },
  {
    id: 'harten_hold_firm', commander: harten, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.takenMultiplier()).toBeCloseTo(r.v(0.6, 0.45));
      expect(u(r, 1).statuses.takenMultiplier()).toBe(1);
    },
  },
  { id: 'harten_counter_stance', commander: harten, target: unit(0), check: (r) => expect(u(r, 0).statuses.reflectPct()).toBe(r.v(30, 45)) },
  {
    id: 'harten_front_rotation', commander: harten, target: pair,
    check: (r) => {
      expect(u(r, 0).cell).toEqual({ col: 2, row: 2 });
      expect(u(r, 2).cell).toEqual({ col: 3, row: 1 });
      shieldPct(r, 0, r.v(15, 25));
      shieldPct(r, 2, r.v(15, 25));
      expect(r.shieldGain(1)).toBe(0);
    },
  },
  {
    id: 'harten_shield_bash', commander: harten, target: unit(3),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(80, 120), 'physical'));
      expect(u(r, 3).statuses.isStunned()).toBe(true);
    },
  },
  {
    id: 'harten_iron_oath', commander: harten, target: none,
    check: (r) => { for (const uid of A) shieldPct(r, uid, 12); },
  },
  {
    id: 'harten_leave_no_one', commander: harten, target: unit(0),
    setup: (sim) => { unitOf(sim, 0).hp = 100; },
    check: (r) => {
      expect(u(r, 0).statuses.isUndying()).toBe(true);
      expect(u(r, 0).hp).toBe(300);
    },
  },
  {
    id: 'harten_guardian_resolve', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(r.v(0.8, 0.7));
      expect(u(r, 2).statuses.takenMultiplier()).toBe(1);
      expect(u(r, 3).statuses.forcedTargetUid()).toBeNull(); // 수호자 공명이 꺼져 있으면 도발 없음
    },
  },
  {
    id: 'harten_solid_formation', commander: harten, target: none,
    a: [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['grove_archer', 1, 0, 2]], // 후열 = 열 0
    check: (r) => {
      for (const uid of FRONT) expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(r.v(0.85, 0.8));
      expect(atkPct(r, 2)).toBe(r.v(10, 15));
      expect(atkPct(r, 0)).toBe(0);
    },
  },
  {
    id: 'harten_build_barrier', commander: harten, target: cell(3, 2),
    check: (r) => { for (const uid of A) shieldPct(r, uid, r.v(25, 35)); },
  },
  {
    id: 'harten_rally_horn', commander: harten, target: none,
    setup: (sim) => { unitOf(sim, 1).statuses.addStun(1e9); },
    check: (r) => {
      expect(r.hand()).toBe(r.v(1, 2));
      expect(u(r, 1).statuses.isStunned()).toBe(false);
    },
  },
  {
    id: 'harten_steel_storm', commander: harten, target: none,
    check: (r) => {
      for (const uid of A) {
        expect(u(r, uid).statuses.reflectPct()).toBe(r.v(25, 35));
        shieldPct(r, uid, 10);
      }
    },
  },
  {
    id: 'harten_unyielding_march', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) {
        expect(u(r, uid).statuses.statBonus('as').pct).toBe(r.v(25, 35));
        expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(0.85);
      }
      expect(u(r, 2).statuses.statBonus('as').pct).toBe(0); // 원거리는 제외
    },
  },
  {
    id: 'harten_iron_curtain', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) shieldPct(r, uid, r.v(15, 22));
      expect(r.shieldGain(2)).toBe(0);
    },
  },
  {
    id: 'harten_hold_formation', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) expect(u(r, uid).statuses.statBonus('arm').flat).toBe(r.v(30, 45));
      expect(u(r, 2).statuses.statBonus('arm').flat).toBe(0);
    },
  },
  {
    id: 'harten_cover', commander: harten, target: unit(0),
    check: (r) => {
      expect(u(r, 3).statuses.forcedTargetUid()).toBe(0);
      expect(u(r, 4).statuses.forcedTargetUid()).toBeNull(); // 반경 2칸 밖
      expect(u(r, 0).statuses.reflectPct()).toBe(r.v(20, 30));
    },
  },
  {
    id: 'harten_legion_command', commander: harten, target: none,
    check: (r) => {
      for (const uid of A) expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(0.7);
      expect(r.sim.ultimate!.charge - r.ultBefore).toBe(r.v(25, 40) + 15); // 카드 사용 충전 +15 포함
    },
  },
  {
    id: 'harten_phalanx_bond', commander: harten, target: none,
    check: (r) => { for (const uid of FRONT) shieldPct(r, uid, r.v(15, 20)); }, // 연쇄 꺼짐
  },
  {
    id: 'harten_trained_shieldbearer', commander: harten, target: none,
    check: (r) => {
      const spawned = r.events('spawn').filter((e) => e.unit >= 5);
      expect(spawned).toHaveLength(1);
      expect(spawned[0]).toMatchObject({ unitId: 'iron_shieldbearer', side: 0, star: r.v(1, 2) });
      expect(spawned[0]!.cell.col).toBe(3);
      expect(u(r, spawned[0]!.unit).temporary).toBe(true);
    },
  },
  {
    id: 'harten_tempered_armor', commander: harten, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.statBonus('arm').flat).toBe(r.v(40, 55));
      expect(u(r, 0).statuses.statBonus('res').flat).toBe(r.v(20, 30));
    },
  },
  {
    id: 'harten_captains_shield', commander: harten, target: unit(0),
    check: (r) => {
      shieldPct(r, 0, r.v(25, 35));
      expect(u(r, 0).statuses.takenMultiplier()).toBeCloseTo(0.9);
    },
  },
  {
    id: 'harten_iron_will', commander: harten, target: unit(0),
    setup: (sim) => { unitOf(sim, 0).statuses.addStun(1e9); },
    check: (r) => {
      expect(u(r, 0).statuses.isStunned()).toBe(false);
      expect(u(r, 0).statuses.statBonus('arm').flat).toBe(r.v(30, 45));
    },
  },
  {
    id: 'harten_counterfire', commander: harten, target: unit(3),
    check: (r) => {
      for (const uid of A) expect(u(r, uid).statuses.forcedTargetUid()).toBe(3);
      expect(u(r, 3).statuses.takenMultiplier()).toBeCloseTo(r.v(1.2, 1.3));
    },
  },
  { id: 'harten_last_line', commander: harten, target: none, check: (r) => { for (const uid of A) expect(u(r, uid).statuses.isUndying()).toBe(true); } },
  {
    id: 'harten_circle_formation', commander: harten, target: none,
    check: (r) => {
      for (const uid of A) {
        expect(u(r, uid).statuses.statBonus('arm').flat).toBe(r.v(15, 20));
        expect(u(r, uid).statuses.statBonus('res').flat).toBe(0); // 강철군단 공명이 꺼져 있음
      }
    },
  },
  {
    id: 'harten_shift_change', commander: harten, target: pair,
    check: (r) => {
      expect(u(r, 0).cell).toEqual({ col: 2, row: 2 });
      expect(u(r, 2).cell).toEqual({ col: 3, row: 1 });
      expect(r.hand()).toBe(1);
    },
  },
  {
    id: 'harten_iron_advance', commander: harten, target: none,
    check: (r) => {
      for (const uid of FRONT) shieldPct(r, uid, r.v(20, 30));
      expect([0, 1]).toContain(u(r, 3).statuses.forcedTargetUid()); // 반경 1칸 안의 적만 도발
      expect(u(r, 4).statuses.forcedTargetUid()).toBeNull();
      expect(atkPct(r, 0)).toBe(0); // 수호자 공명이 꺼져 있음
    },
  },
  {
    id: 'harten_unyielding_memory', commander: harten, target: none,
    check: (r) => expect(r.sim.ultimate!.charge - r.ultBefore).toBe(r.v(40, 60) + 15),
  },
];

// ======================= 이세라 =======================
const I: Spec[] = [
  {
    id: 'isera_flame_lance', commander: isera, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(200, 280), 'magic', 0, 25)),
  },
  {
    id: 'isera_flame_wave', commander: isera, target: cell(4, 2),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(100, 140), 'magic', 0, 25));
      near(applied(r, 'burn', 3)[0]!.value!, 25, 1); // 화상 초당 20 x 1.25
      expect(r.damage(4)).toHaveLength(0);
    },
  },
  {
    id: 'isera_ignite', commander: isera, target: unit(3),
    check: (r) => {
      near(applied(r, 'burn', 3)[0]!.value!, r.v(30, 45) * 1.25, 1);
      expect(r.damage(3)).toHaveLength(0);
    },
  },
  { id: 'isera_heat_buildup', commander: isera, target: none, check: (r) => expect(r.hand()).toBe(r.v(1, 2)) },
  {
    id: 'isera_furnace_preheat', commander: isera, target: none,
    check: (r) => {
      expect(r.hand()).toBe(1);
      r.sim.startCombat();
      expect(r.sim.commandPoints!.combat).toBe(2 + 1 + r.v(1, 2)); // 기본 2 + 이세라 1 + 카드
    },
  },
  {
    id: 'isera_lava_eruption', commander: isera, target: cell(4, 2),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(180, 250), 'magic', 0, 25));
      expect(applied(r, 'burn')).toHaveLength(0); // 잿불 공명이 꺼져 있음
    },
  },
  {
    id: 'isera_combustion', commander: isera, target: unit(3),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(120, 160), 'magic', 0, 25));
      expect(r.damage(3)[0]!.bonus).toBeUndefined();
    },
  },
  {
    id: 'isera_mana_flood', commander: isera, target: unit(0),
    check: (r) => {
      expect(u(r, 0).mana).toBe(u(r, 0).maxMana);
      expect(r.hand()).toBe(r.v(1, 2));
    },
  },
  {
    id: 'isera_spell_chain', commander: isera, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(90, 130), 'magic', 0, 25)),
  },
  {
    id: 'isera_ember_rain', commander: isera, target: none,
    check: (r) => {
      for (const uid of [3, 4]) {
        near(r.damage(uid)[0]!.amount, expectedDamage(u(r, uid), r.v(120, 170), 'magic', 0, 25));
        expect(applied(r, 'burn', uid)).toHaveLength(1);
      }
    },
  },
  {
    id: 'isera_flame_armor', commander: isera, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.reflectPct()).toBe(r.v(25, 35));
      shieldPct(r, 0, 15);
    },
  },
  { id: 'isera_hot_wind', commander: isera, target: none, check: (r) => { for (const uid of A) expect(u(r, uid).statuses.statBonus('as').pct).toBe(r.v(20, 30)); } },
  {
    id: 'isera_oath_of_fire', commander: isera, target: none, cpGain: 2,
    check: (r) => expect(r.hand()).toBe(r.v(1, 2)),
  },
  {
    id: 'isera_ember_mark', commander: isera, target: unit(3),
    check: (r) => {
      expect(u(r, 3).statuses.takenMultiplier('magic')).toBeCloseTo(r.v(1.3, 1.45));
      expect(u(r, 3).statuses.takenMultiplier('physical')).toBe(1);
    },
  },
  {
    id: 'isera_hearth_blessing', commander: isera, target: none,
    a: [['iron_shieldbearer', 1, 3, 2], ['grove_archer', 1, 2, 2]],
    b: [['iron_shieldbearer', 1, 4, 2]],
    check: (r) => {
      r.sim.runUntil(40);
      const burns = applied(r, 'burn', 2).concat(applied(r, 'burn', 3)).filter((e) => e.source !== null);
      expect(burns.length).toBeGreaterThan(0);
      const atk = Math.max(...A.slice(0, 2).map((uid) => u(r, uid).stat('atk')));
      expect(Math.max(...burns.map((e) => e.value ?? 0))).toBeLessThanOrEqual((atk * r.v(10, 15)) / 100 + 1e-6);
    },
  },
  { id: 'isera_focus', commander: isera, target: none, check: (r) => expect(r.hand()).toBe(2) },
  {
    id: 'isera_spell_circuit', commander: isera, target: unit(0),
    check: (r) => {
      expect(u(r, 0).mana).toBe(r.v(Math.min(u(r, 0).maxMana, 50), u(r, 0).maxMana));
      expect(r.events('cardCost')).toHaveLength(0); // 주술사 공명이 꺼져 있음
    },
  },
  {
    id: 'isera_volcanic_bomb', commander: isera, target: cell(4, 2),
    check: (r) => {
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(150, 200), 'physical', 0, 25));
      expect(u(r, 3).statuses.isStunned()).toBe(true);
    },
  },
  {
    id: 'isera_flame_snare', commander: isera, target: cell(4, 2),
    check: (r) => {
      expect(applied(r, 'root', 3)[0]!.duration).toBe(r.v(2, 3));
      near(applied(r, 'burn', 3)[0]!.value!, r.v(15, 25) * 1.25, 1);
    },
  },
  { id: 'isera_masters_lesson', commander: isera, target: none, check: (r) => expect(r.hand()).toBe(r.v(3, 4)) },
  {
    id: 'isera_meteor_fall', commander: isera, target: cell(4, 2),
    setup: (sim) => { unitOf(sim, 3).statuses.addStun(1e9); },
    check: (r) => {
      const telegraph = r.events('telegraph')[0]!;
      expect(telegraph).toMatchObject({ source: -1, pattern: 'card', fireAt: 2 });
      expect(r.damage(3)).toHaveLength(0);
      r.sim.runUntil(25);
      near(r.damage(3).filter((e) => e.source === null)[0]!.amount, expectedDamage(u(r, 3), r.v(400, 550), 'magic', 0, 25));
    },
  },
  {
    id: 'isera_ember_spirit', commander: isera, target: none,
    check: (r) => {
      const spawned = r.events('spawn').filter((e) => e.unit >= 5);
      expect(spawned).toHaveLength(1);
      expect(spawned[0]).toMatchObject({ unitId: 'ember_kindler', side: 0, star: r.v(1, 2) });
      expect(spawned[0]!.cell.col).toBe(0);
      expect(u(r, spawned[0]!.unit).mana).toBe(u(r, spawned[0]!.unit).maxMana);
    },
  },
  {
    id: 'isera_small_spark', commander: isera, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(50, 70), 'magic', 0, 25)),
  },
  {
    id: 'isera_heat_amplifier', commander: isera, target: none, extraHand: ['isera_small_spark'],
    check: (r) => {
      expect(r.sim.playCard(2, unit(3)).ok).toBe(true);
      near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), 50, 'magic', 0, 25 + r.v(20, 30)));
    },
  },
  {
    id: 'isera_phoenix_feather', commander: isera, target: unit(0),
    check: (r) => {
      r.sim.startCombat();
      lethal(r.sim, 0, 3);
      expect(u(r, 0).alive).toBe(true);
      expect(u(r, 0).hp).toBe(Math.round(u(r, 0).maxHp * r.v(0.4, 0.6)));
    },
  },
  {
    id: 'isera_flame_field', commander: isera, target: cell(4, 2),
    setup: (sim) => { unitOf(sim, 3).statuses.addStun(1e9); },
    check: (r) => {
      expect(r.events('zoneStart')[0]!.cells).toHaveLength(9);
      r.sim.runUntil(100);
      const hits = r.damage(3).filter((e) => e.source === null);
      expect(hits).toHaveLength(5);
      near(hits[0]!.amount, expectedDamage(u(r, 3), r.v(40, 55), 'magic', 0, 25));
    },
  },
  {
    id: 'isera_eruption_warmup', commander: isera, target: none,
    check: (r) => expect(r.sim.ultimate!.charge - r.ultBefore).toBe(r.v(35, 50) + 15),
  },
  {
    id: 'isera_ignition_chain', commander: isera, target: unit(3),
    b: [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 5, 2]],
    check: (r) => {
      for (const uid of [3, 4]) near(r.damage(uid)[0]!.amount, expectedDamage(u(r, uid), r.v(60, 90), 'magic', 0, 25));
      expect(applied(r, 'burn')).toHaveLength(0); // 연쇄 꺼짐
    },
  },
  {
    id: 'isera_flame_shield', commander: isera, target: unit(0),
    check: (r) => {
      shieldPct(r, 0, r.v(20, 30));
      expect(u(r, 0).statuses.reflectPct()).toBe(15);
    },
  },
  {
    id: 'isera_ash_rain', commander: isera, target: cell(4, 2),
    check: (r) => {
      expect(u(r, 3).statuses.statBonus('atk').pct).toBe(r.v(-20, -30));
      near(applied(r, 'burn', 3)[0]!.value!, 15 * 1.25, 1);
    },
  },
];

// ======================= 녹스 =======================
const N: Spec[] = [
  { id: 'nox_blood_contract', commander: nox, target: none, hpCost: () => 2, check: (r) => expect(r.hand()).toBe(r.v(2, 3)) },
  { id: 'nox_usury', commander: nox, target: none, cpGain: 3, hpCost: (up) => (up ? 3 : 4), check: () => undefined },
  {
    id: 'nox_shadow_strike', commander: nox, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(120, 170), 'physical', 30)),
  },
  { id: 'nox_assassin_mark', commander: nox, target: unit(3), check: (r) => expect(u(r, 3).statuses.takenMultiplier()).toBeCloseTo(r.v(1.3, 1.4)) },
  {
    id: 'nox_abyss_leap', commander: nox, target: unit(0),
    check: (r) => {
      expect(u(r, 0).cell.col).toBe(7);
      expect(atkPct(r, 0)).toBe(r.v(20, 35));
    },
  },
  { id: 'nox_life_drain', commander: nox, target: unit(0), check: (r) => expect(u(r, 0).statuses.lifestealPct()).toBe(r.v(30, 45)) },
  {
    id: 'nox_blood_feast', commander: nox, target: none, hpCost: () => 2,
    check: (r) => { for (const uid of A) expect(u(r, uid).statuses.lifestealPct()).toBe(r.v(15, 25)); },
  },
  {
    id: 'nox_final_deal', commander: nox, target: none, cpGain: 6, hpCost: (up) => (up ? 6 : 8),
    check: (r) => {
      expect(r.cp()).toBe(6);
      expect(r.hand()).toBe(2);
    },
  },
  {
    id: 'nox_debt_collection', commander: nox, target: none, hpCost: () => 2,
    check: (r) => {
      const shrunk = r.events('maxHp');
      expect(shrunk).toHaveLength(r.v(1, 2));
      for (const e of shrunk) expect([3, 4]).toContain(e.unit);
    },
  },
  {
    id: 'nox_poisoned_blade', commander: nox, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.statBonus('atk').flat).toBe(r.v(10, 15));
      expect(u(r, 0).statuses.lifestealPct()).toBe(r.v(10, 15));
    },
  },
  {
    id: 'nox_execution', commander: nox, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(150, 200), 'physical')),
  },
  {
    id: 'nox_shadow_veil', commander: nox, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.takenMultiplier('physical')).toBeCloseTo(r.v(0.5, 0.35));
      expect(u(r, 0).statuses.takenMultiplier('magic')).toBe(1);
    },
  },
  { id: 'nox_whisper_of_dread', commander: nox, target: cell(4, 2), check: (r) => expect(atkPct(r, 3)).toBe(r.v(-25, -35)) },
  {
    id: 'nox_contract_renewal', commander: nox, target: none, cpGain: 1, hpCost: () => 2,
    check: (r) => expect(r.hand()).toBe(2),
  },
  {
    id: 'nox_abyss_gaze', commander: nox, target: unit(3),
    setup: (sim) => { unitOf(sim, 3).mana = 70; },
    check: (r) => {
      expect(u(r, 3).statuses.isSilenced()).toBe(true);
      expect(u(r, 3).mana).toBe(20);
    },
  },
  {
    id: 'nox_blood_armor', commander: nox, target: unit(0), hpCost: () => 3,
    check: (r) => shieldPct(r, 0, r.v(40, 55)),
  },
  {
    id: 'nox_shadow_clone', commander: nox, target: none,
    check: (r) => {
      const spawned = r.events('spawn').filter((e) => e.unit >= 5);
      expect(spawned).toHaveLength(2);
      for (const e of spawned) {
        expect(e).toMatchObject({ unitId: 'shade_dagger', side: 0, star: r.v(1, 2) });
        expect(e.cell.col).toBe(7);
      }
    },
  },
  {
    id: 'nox_silent_finish', commander: nox, target: unit(0),
    a: [['iron_shieldbearer', 1, 3, 2], ['grove_archer', 1, 2, 2]],
    b: [['iron_shieldbearer', 1, 4, 2]],
    check: (r) => {
      expect(u(r, 0).statuses.hasEmpoweredAttack()).toBe(true);
      r.sim.runUntil(40);
      expect(u(r, 0).statuses.hasEmpoweredAttack()).toBe(false);
      const first = r.damage(2).find((e) => e.dmgType === 'physical')!;
      expect(first.amount).toBeGreaterThan(expectedDamage(u(r, 2), u(r, 0).stat('atk') * 1.5, 'physical'));
    },
  },
  { id: 'nox_chain_of_debt', commander: nox, target: none, hpCost: () => 1, check: (r) => expect(r.hand()).toBe(r.v(1, 2)) },
  {
    id: 'nox_oblivion_touch', commander: nox, target: none,
    setup: (sim) => { for (const uid of [3, 4]) unitOf(sim, uid).mana = 80; },
    check: (r) => {
      for (const uid of [3, 4]) {
        expect(u(r, uid).mana).toBe(r.v(40, 20));
        expect(u(r, uid).statuses.isSilenced()).toBe(true);
      }
    },
  },
  {
    id: 'nox_blood_alliance', commander: nox, target: none, hpCost: () => 3,
    check: (r) => { for (const uid of A) expect(u(r, uid).statuses.statBonus('atk').pct).toBe(r.v(15, 20)); },
  },
  {
    id: 'nox_hunt_begins', commander: nox, target: unit(3),
    check: (r) => {
      for (const uid of A) expect(u(r, uid).statuses.forcedTargetUid()).toBe(3);
      expect(u(r, 3).statuses.takenMultiplier()).toBeCloseTo(r.v(1.25, 1.35));
    },
  },
  {
    id: 'nox_abyss_rift', commander: nox, target: cell(4, 2),
    check: (r) => {
      // 피해 뒤에 RES -30이 붙으므로 피해는 원래 RES 기준이다
      near(r.damage(3)[0]!.amount, Math.round((r.v(150, 200) * 100) / (100 + u(r, 3).def.stats.res)));
      expect(u(r, 3).statuses.statBonus('res').flat).toBe(-30);
    },
  },
  {
    id: 'nox_soul_harvest', commander: nox, target: none,
    b: [['arena_recruit', 1, 4, 0], ['arena_recruit', 1, 4, 1], ['arena_recruit', 1, 4, 2], ['arena_recruit', 1, 4, 3], ['arena_recruit', 1, 4, 4]],
    check: (r) => {
      const cp = r.cp();
      for (const uid of [3, 4, 5, 6, 7]) lethal(r.sim, uid);
      expect(r.cp() - cp).toBe(r.v(3, 5));
    },
  },
  {
    id: 'nox_blood_veil', commander: nox, target: none, hpCost: () => 3,
    check: (r) => { for (const uid of A) expect(u(r, uid).statuses.takenMultiplier()).toBeCloseTo(r.v(0.75, 0.65)); },
  },
  {
    id: 'nox_prepaid_price', commander: nox, target: none, hpCost: () => 3,
    check: (r) => expect(r.sim.ultimate!.charge - r.ultBefore).toBe(r.v(40, 60) + 15),
  },
  {
    id: 'nox_dance_of_death', commander: nox, target: unit(0),
    check: (r) => {
      expect(u(r, 0).statuses.statBonus('as').pct).toBe(r.v(50, 70));
      expect(u(r, 0).statuses.lifestealPct()).toBe(20);
    },
  },
  {
    id: 'nox_debt_settlement', commander: nox, target: none,
    check: (r) => {
      expect(r.sim.commanderHealPending).toBe(r.v(5, 8));
      expect(r.events('commanderHeal')).toHaveLength(1);
    },
  },
  {
    id: 'nox_shadow_of_nothing', commander: nox, target: unit(3),
    check: (r) => near(r.damage(3)[0]!.amount, expectedDamage(u(r, 3), r.v(300, 400), 'physical', 50)),
  },
  {
    id: 'nox_blood_pact', commander: nox, target: none, hpCost: (up) => (up ? 3 : 4),
    check: (r) => {
      r.sim.startCombat();
      expect(r.sim.commandPoints!.combat).toBe(4);
    },
  },
];

const ALL_SPECS: { name: string; specs: Spec[] }[] = [
  { name: '하르텐', specs: H },
  { name: '이세라', specs: I },
  { name: '녹스', specs: N },
];

function expectedCpAfter(run: Run, spec: Spec, view: ReturnType<typeof effectiveCard>): number {
  const gain = typeof spec.cpGain === 'function' ? spec.cpGain(run.upgraded) : spec.cpGain ?? 0;
  return Math.min(6, run.cpBefore - view.cost + gain);
}

for (const group of ALL_SPECS) {
  for (const upgraded of [false, true]) {
    describe(`${group.name} 전용 카드 30장 동작${upgraded ? ' (강화)' : ''}`, () => {
      it('표가 지휘관의 전용 카드 30장을 빠짐없이 한 번씩 다룬다', () => {
        const ids = group.specs.map((s) => s.id);
        expect(new Set(ids).size).toBe(30);
        const owner = group.specs[0]!.commander.id;
        const owned = cardCatalog.cards.filter((c) => c.owner === owner && c.rarity !== 'starter').map((c) => c.id);
        expect([...ids].sort()).toEqual([...owned].sort());
      });

      for (const spec of group.specs) {
        it(`${spec.id}: 사용 가능, 비용·HP 비용 정산, 핵심 효과`, () => {
          const run = play(spec, upgraded);
          const view = effectiveCard(run.card, upgraded);
          const pool = run.card.type === 'operation' || run.card.type === 'equipment' ? 'prep' : 'combat';
          // 비용 정산 (CP 획득 카드는 상한 6을 반영)
          if (pool === 'combat' && spec.cpGain === undefined) expect(run.cp()).toBe(run.cpBefore - view.cost);
          else if (pool === 'combat') expect(run.cp()).toBe(expectedCpAfter(run, spec, view));
          else expect(run.cp()).toBe(run.cpBefore - view.cost);
          // 지휘관 HP 비용
          const hp = spec.hpCost ? spec.hpCost(upgraded) : 0;
          expect(run.sim.commanderHpSpent).toBe(hp);
          // 소모/버림 위치: 장비는 항상 소모, 나머지는 (강화 반영) 키워드를 따른다
          const exhausted = run.card.type === 'equipment' || view.keywords.includes('exhaust');
          expect(run.sim.deck!.exhaustPile.some((c) => c.cardId === spec.id)).toBe(exhausted);
          spec.check(run);
        });
      }
    });
  }
}

describe('전투당 사용 제한 (limits.perCombat)', () => {
  const specs = ALL_SPECS.flatMap((g) => g.specs).filter((s) => cardCatalog.get(s.id)?.limits?.perCombat !== undefined);

  it('제한이 있는 카드가 표에 있다 (전열 교대·작은 불씨·불굴의 기억·대분화 예열·대가 선불)', () => {
    expect(specs.map((s) => s.id).sort()).toEqual([
      'harten_front_rotation', 'harten_unyielding_memory', 'isera_eruption_warmup', 'isera_small_spark', 'nox_prepaid_price',
    ]);
  });

  for (const spec of specs) {
    it(`${spec.id}: 제한 횟수만큼만 쓸 수 있고 다음은 거부된다`, () => {
      const limit = cardCatalog.get(spec.id)!.limits!.perCombat!;
      const hand = Array.from({ length: limit + 1 }, () => spec.id);
      const sim = makeCardSim({ commander: spec.commander, commanderHp: 30, a: spec.a ?? PLAIN_A, b: spec.b ?? ENEMY_PAIR, hand });
      sim.startCombat();
      for (let i = 1; i <= limit; i++) {
        sim.commandPoints!.gainCp(6, 'effect');
        expect(sim.playCard(i, spec.target).ok).toBe(true);
      }
      sim.commandPoints!.gainCp(6, 'effect');
      const denied = sim.playCard(limit + 1, spec.target);
      expect(denied.ok).toBe(false);
      expect(!denied.ok && denied.reason).toContain(`전투당 ${limit}회`);
    });
  }
});

describe('공명 (특성이 켜졌을 때만 추가 효과)', () => {
  const RES: Record<string, readonly Placement[]> = {
    iron_legion: [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3], ['grove_archer', 1, 2, 2]],
    guardian: [['iron_shieldbearer', 1, 3, 1], ['moss_warden', 1, 3, 3], ['grove_archer', 1, 2, 2]],
    ember: [['iron_shieldbearer', 1, 3, 1], ['ember_kindler', 1, 3, 3], ['ember_slinger', 1, 2, 2]],
    mystic: [['iron_shieldbearer', 1, 3, 1], ['ember_kindler', 1, 3, 3], ['abyss_whisperer', 1, 2, 2]],
    assassin: [['iron_shieldbearer', 1, 3, 1], ['shade_dagger', 1, 3, 3], ['legion_spy', 1, 2, 2]],
    abyss: [['iron_shieldbearer', 1, 3, 1], ['shade_dagger', 1, 3, 3], ['abyss_whisperer', 1, 2, 2]],
  };
  const lone: readonly Placement[] = PLAIN_A;

  function with_(spec: Spec, a: readonly Placement[], upgraded: boolean): Run {
    return play({ ...spec, a }, upgraded);
  }
  const specOf = (id: string): Spec => ALL_SPECS.flatMap((g) => g.specs).find((s) => s.id === id)!;

  for (const upgraded of [false, true]) {
    const tag = upgraded ? ' (강화)' : '';

    it(`H08 강철의 맹세${tag}: 강철군단 공명이면 보호막이 20%/25%가 된다`, () => {
      const on = with_(specOf('harten_iron_oath'), RES.iron_legion!, upgraded);
      const total = (r: Run) => r.shieldGain(0);
      near(total(on), Math.round(maxHp(on, 0) * (upgraded ? 0.25 : 0.2)), 2);
      const off = with_(specOf('harten_iron_oath'), lone, upgraded);
      near(total(off), Math.round(maxHp(off, 0) * 0.12), 1);
    });

    it(`H10 수호자의 결의${tag}: 수호자 공명이면 전열 아군이 반경 2칸 적을 도발한다`, () => {
      const on = with_(specOf('harten_guardian_resolve'), RES.guardian!, upgraded);
      expect(u(on, 3).statuses.forcedTargetUid()).toBe(0);
      expect(u(on, 4).statuses.forcedTargetUid()).toBeNull();
    });

    it(`H27 원진${tag}: 강철군단 공명이면 RES도 오른다`, () => {
      const on = with_(specOf('harten_circle_formation'), RES.iron_legion!, upgraded);
      const off = with_(specOf('harten_circle_formation'), lone, upgraded);
      for (const uid of A) {
        expect(applied(on, 'statMod:arm', uid).map((e) => e.value)).toEqual([upgraded ? 20 : 15]);
        expect(applied(on, 'statMod:res', uid).map((e) => e.value)).toEqual([upgraded ? 20 : 15]);
        expect(applied(off, 'statMod:res', uid)).toHaveLength(0);
      }
    });

    it(`H29 철벽 전진${tag}: 수호자 공명이면 전열 ATK +25%`, () => {
      const on = with_(specOf('harten_iron_advance'), RES.guardian!, upgraded);
      expect(atkPct(on, 0)).toBe(25);
    });

    it(`I06 용암 분출${tag}: 잿불 공명이면 화상 초당 40 (4초)`, () => {
      const on = with_(specOf('isera_lava_eruption'), RES.ember!, upgraded);
      const burn = applied(on, 'burn', 3)[0]!;
      near(burn.value!, 40 * 1.25, 1);
      expect(burn.duration).toBe(4);
    });

    it(`I15 대화로의 축복${tag}: 잿불 공명이면 화상이 ATK 20%/30%로 커진다`, () => {
      const spec = { ...specOf('isera_hearth_blessing'), b: [['iron_shieldbearer', 1, 4, 2]] as const };
      const run = (a: readonly Placement[]) => {
        const r = play({ ...spec, a }, upgraded);
        r.sim.runUntil(40);
        const ally = u(r, 0);
        const burns = applied(r, 'burn', a.length).filter((e) => e.source === 0); // 적 uid = 아군 수
        return { max: Math.max(...burns.map((e) => e.value ?? 0)), atk: ally.stat('atk') };
      };
      const on = run([['iron_shieldbearer', 1, 3, 2], ['ember_kindler', 1, 2, 1], ['ember_slinger', 1, 2, 3]]);
      const off = run([['iron_shieldbearer', 1, 3, 2], ['grove_archer', 1, 2, 2]]);
      expect(on.max).toBeCloseTo((on.atk * (upgraded ? 30 : 20)) / 100, 5);
      expect(off.max).toBeCloseTo((off.atk * (upgraded ? 15 : 10)) / 100, 5);
    });

    it(`I17 주술 회로${tag}: 주술사 공명이면 손패 한 장의 비용이 1 줄어든다`, () => {
      const spec = { ...specOf('isera_spell_circuit'), a: RES.mystic!, extraHand: ['war_drums'] };
      const on = play(spec, upgraded);
      const cut = on.events('cardCost');
      expect(cut).toHaveLength(1);
      expect(cut[0]).toMatchObject({ delta: -1 });
      const off = play({ ...spec, a: lone }, upgraded);
      expect(off.events('cardCost')).toHaveLength(0);
    });

    it(`N04 암살 표식${tag}: 암살자 공명이면 받는 피해가 합쳐서 +50%/+65%`, () => {
      const on = with_(specOf('nox_assassin_mark'), RES.assassin!, upgraded);
      expect(u(on, 3).statuses.takenMultiplier()).toBeCloseTo(upgraded ? 1.65 : 1.5, 3);
      const off = with_(specOf('nox_assassin_mark'), lone, upgraded);
      expect(u(off, 3).statuses.takenMultiplier()).toBeCloseTo(upgraded ? 1.4 : 1.3, 5);
    });

    it(`N15 심연 응시${tag} · N24 심연 균열${tag}: 심연 공명이면 CP +1`, () => {
      for (const [id, cost] of [['nox_abyss_gaze', 2], ['nox_abyss_rift', 3]] as const) {
        const on = with_(specOf(id), RES.abyss!, upgraded);
        expect(on.cp()).toBe(Math.min(6, on.cpBefore - cost + 1));
        const off = with_(specOf(id), lone, upgraded);
        expect(off.cp()).toBe(off.cpBefore - cost);
      }
    });
  }
});

describe('연쇄 (앞서 카드를 쓴 뒤의 비용·추가 효과)', () => {
  const opener = 'hold_the_line'; // 1CP 명령 (대상: 아군 1명)

  function chained(id: string, commander: CommanderDef, target: PlayTarget, upgraded: boolean, extra: Partial<Parameters<typeof makeCardSim>[0]> = {}) {
    const sim = makeCardSim({
      commander,
      commanderHp: 30,
      a: PLAIN_A,
      b: ENEMY_PAIR,
      deck: { ...handSnapshot([opener, id], upgraded ? [2] : []), draw: fillers(6), nextInstanceId: 200 },
      ...extra,
    });
    sim.startCombat();
    sim.commandPoints!.gainCp(6, 'effect');
    expect(sim.playCard(1, unit(1)).ok).toBe(true);
    const cp = sim.commandPoints!.combat;
    const from = sim.events.length;
    expect(sim.playCard(2, target).ok).toBe(true);
    return { sim, cpSpent: cp - sim.commandPoints!.combat, from };
  }

  for (const upgraded of [false, true]) {
    const tag = upgraded ? ' (강화)' : '';
    it(`H04 버텨라${tag}·I09 주문 연쇄${tag}: 연쇄하면 비용 0`, () => {
      expect(chained('harten_hold_firm', harten, unit(0), upgraded).cpSpent).toBe(0);
      expect(chained('isera_spell_chain', isera, unit(3), upgraded).cpSpent).toBe(0);
    });

    it(`H20 방진 결속${tag}: 연쇄하면 보호막이 25%/30%가 된다`, () => {
      const { sim, from } = chained('harten_phalanx_bond', harten, none, upgraded);
      const gained = sim.events.slice(from).filter((e) => e.type === 'shield' && e.unit === 0).reduce((s, e) => s + (e.type === 'shield' ? e.amount : 0), 0);
      near(gained, Math.round(unitOf(sim, 0).maxHp * (upgraded ? 0.3 : 0.25)), 2);
    });

    it(`I04 열기 축적${tag}·N19 대가의 연쇄${tag}: 연쇄하면 CP +1`, () => {
      const i = chained('isera_heat_buildup', isera, none, upgraded);
      expect(i.cpSpent).toBe(1 - 1); // 비용 1, CP +1
      const n = chained('nox_chain_of_debt', nox, none, upgraded);
      expect(n.cpSpent).toBe(-1); // 비용 0, CP +1
    });

    it(`I28 점화 연쇄${tag}: 연쇄하면 대상과 인접한 적에게 화상 초당 25 (3초)`, () => {
      const { sim, from } = chained('isera_ignition_chain', isera, unit(3), upgraded, { b: [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 5, 2]] });
      const burns = sim.events.slice(from).filter((e) => e.type === 'statusApplied' && e.status === 'burn');
      expect(burns.map((e) => (e.type === 'statusApplied' ? e.unit : -1)).sort()).toEqual([3, 4]);
      for (const e of burns) if (e.type === 'statusApplied') near(e.value ?? 0, 25 * 1.25, 1);
    });
  }
});

describe('조건부 피해', () => {
  it('I07 연소 폭발: 화상 중인 대상에게는 피해가 두 배(120+120 / 160+160)', () => {
    for (const upgraded of [false, true]) {
      const spec = ALL_SPECS[1]!.specs.find((s) => s.id === 'isera_combustion')!;
      const r = play({ ...spec, setup: (sim) => { unitOf(sim, 3).statuses.addBurn(1, 100, null); } }, upgraded);
      const hit = r.damage(3).find((e) => e.dmgType === 'magic' && e.bonus)!;
      near(hit.amount, expectedDamage(u(r, 3), upgraded ? 320 : 240, 'magic', 0, 25));
    }
  });

  it('N11 처형: 대상 HP 30% 이하면 피해 2배', () => {
    for (const upgraded of [false, true]) {
      const spec = ALL_SPECS[2]!.specs.find((s) => s.id === 'nox_execution')!;
      const r = play({ ...spec, setup: (sim) => { const t = unitOf(sim, 3); t.hp = Math.floor(t.maxHp * 0.3); } }, upgraded);
      const hit = r.damage(3)[0]!;
      expect(hit.bonus).toBe(true);
      near(hit.amount, expectedDamage(u(r, 3), (upgraded ? 200 : 150) * 2, 'physical'));
    }
  });

  it('N30 무혼의 그림자: 처치하면 CP +2, 못 죽이면 없음', () => {
    const spec = ALL_SPECS[2]!.specs.find((s) => s.id === 'nox_shadow_of_nothing')!;
    const miss = play(spec, false);
    expect(miss.cp()).toBe(miss.cpBefore - 4);
    const kill = play({ ...spec, setup: (sim) => { unitOf(sim, 3).hp = 1; } }, false);
    expect(kill.cp()).toBe(Math.min(6, kill.cpBefore - 4 + 2));
  });
});

describe('지휘관 HP 회복 · 강화 필드', () => {
  it('N29 빚 청산: 사용 즉시는 HP 변화 없음, 승리 시 확정할 회복량을 남긴다', () => {
    const r = play(ALL_SPECS[2]!.specs.find((s) => s.id === 'nox_debt_settlement')!, false);
    expect(r.sim.commanderHpSpent).toBe(0);
    expect(r.sim.commanderHealPending).toBe(5);
  });

  it('H09 강화는 소모가 사라지고(버린 더미로), N08 강화는 HP 비용이 6으로 준다', () => {
    const base = effectiveCard(cardCatalog.get('harten_leave_no_one')!, false);
    const up = effectiveCard(cardCatalog.get('harten_leave_no_one')!, true);
    expect(base.keywords).toContain('exhaust');
    expect(up.keywords).not.toContain('exhaust');
    expect(effectiveCard(cardCatalog.get('nox_final_deal')!, false).commanderHpCost?.amount).toBe(8);
    expect(effectiveCard(cardCatalog.get('nox_final_deal')!, true).commanderHpCost?.amount).toBe(6);
  });

  it('지휘관 HP가 모자라면 HP 비용 카드를 쓸 수 없다 (사용 후 1 이상 남아야 함)', () => {
    const sim = makeCardSim({ commander: nox, commanderHp: 8, hand: ['nox_final_deal'] });
    sim.startCombat();
    const result = sim.playCard(1, none);
    expect(result.ok).toBe(false);
    expect(sim.commanderHpSpent).toBe(0);
  });
});

describe('이벤트 로그 결정론', () => {
  it('같은 입력(편성·시드·카드)이면 이벤트 로그가 JSON까지 같다', () => {
    const run = () => {
      const sim = makeCardSim({ commander: isera, hand: ['isera_ember_rain', 'isera_flame_field'], commanderHp: 30 });
      sim.startCombat();
      sim.commandPoints!.gainCp(6, 'effect');
      sim.playCard(1, none);
      sim.playCard(2, cell(5, 2));
      sim.runUntil(150);
      return JSON.stringify(sim.events);
    };
    expect(run()).toBe(run());
  });

  it('카드 사용 이벤트는 spawn·zoneStart 같은 새 이벤트 종류를 쓰는 카드에서만 생긴다', () => {
    const sim = makeCardSim({ commander: harten, hand: ['harten_sturdy_shield'] });
    sim.startCombat();
    sim.playCard(1, unit(0));
    expect(eventsOf(sim, 'zoneStart')).toHaveLength(0);
  });
});
