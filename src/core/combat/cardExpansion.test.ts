import { describe, expect, it } from 'vitest';
import { fixtureCard, fixtureCatalog } from '../cards/testSupport';
import { CombatSimulator } from './sim';
import { eventsOf, formation, handSnapshot, isera, harten, makeCardSim, traits, unitOf, units, type Placement } from './testSupport';
import type { CombatEvent } from './events';

/** M5-4 2부-A 새 효과·규칙: 임시 카드 데이터로 각각의 동작을 확인한다 */

type Card = Record<string, unknown>;

function simWith(cards: Card[], hand: string[], options: Parameters<typeof makeCardSim>[0] = {}): CombatSimulator {
  return makeCardSim({ catalog: fixtureCatalog(cards), hand, ...options });
}

const ENEMY = 3; // CARD_B의 첫 적 (방패병)

const area = (col: number, row: number) => ({ kind: 'cell' as const, cell: { col, row } });
const unit = (uid: number) => ({ kind: 'unit' as const, uid });
const none = { kind: 'none' as const };

function damagesOn(sim: CombatSimulator, uid: number) {
  return eventsOf(sim, 'damage').filter((e) => e.unit === uid);
}

describe('N1 manaGain', () => {
  it('지정 아군의 마나를 정해진 양만큼 올린다 (마나 이벤트)', () => {
    const sim = simWith(
      [fixtureCard('gain', { target: { kind: 'allyUnit' }, effects: [{ kind: 'manaGain', selector: 'target', amount: 30 }] })],
      ['gain'],
    );
    sim.startCombat();
    expect(sim.playCard(1, unit(0)).ok).toBe(true);
    expect(unitOf(sim, 0).mana).toBe(30);
    expect(eventsOf(sim, 'mana').filter((e) => e.unit === 0).map((e) => e.mana)).toEqual([30]);
  });

  it('최대 마나를 넘기지 않는다', () => {
    const sim = simWith(
      [fixtureCard('gain', { effects: [{ kind: 'manaGain', selector: 'allAllies', amount: 9999 }] })],
      ['gain'],
    );
    sim.startCombat();
    sim.playCard(1, none);
    for (const uid of [0, 1, 2]) expect(unitOf(sim, uid).mana).toBe(unitOf(sim, uid).maxMana);
  });
});

describe('N2 alliesBackRow', () => {
  it('아군 후열(열 0)에게만 적용되고 전열(열 3)에는 적용되지 않는다', () => {
    const a: Placement[] = [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 0, 2]];
    const sim = simWith(
      [
        fixtureCard('formation', {
          type: 'operation',
          effects: [
            { kind: 'damageTakenMult', selector: 'alliesFrontRow', mult: 0.85, duration: 'combat' },
            { kind: 'statMod', selector: 'alliesBackRow', stat: 'atk', pct: 10, duration: 'combat' },
          ],
        }),
      ],
      ['formation'],
      { a },
    );
    expect(sim.playCard(1, none).ok).toBe(true);
    const applied = eventsOf(sim, 'statusApplied');
    expect(applied.filter((e) => e.status === 'statMod:atk').map((e) => e.unit)).toEqual([1]);
    expect(applied.filter((e) => e.status === 'damageTakenMult').map((e) => e.unit)).toEqual([0]);
  });
});

describe('N5 handCostCut', () => {
  const cut = fixtureCard('cut', { cost: 0, effects: [{ kind: 'handCostCut', selector: 'allAllies', amount: 1 }] });

  it('비용이 1 이상인 손패 한 장의 비용을 줄이고 cardCost 이벤트를 남긴다 (비용 0인 카드는 후보가 아님)', () => {
    const sim = simWith([cut, fixtureCard('pricey', { cost: 2 }), fixtureCard('free', { cost: 0 })], ['cut', 'pricey', 'free']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(sim.cardSurcharge(2)).toBe(-1);
    expect(sim.cardSurcharge(3)).toBe(0);
    const costs = eventsOf(sim, 'cardCost');
    expect(costs).toHaveLength(1);
    expect(costs[0]).toMatchObject({ instanceId: 2, cardId: 'pricey', surcharge: -1, delta: -1 });
    expect(costs[0]?.source).toBeUndefined();
  });

  it('줄일 카드가 없으면 아무 일도 없고 Rng도 쓰지 않는다', () => {
    const sim = simWith([cut, fixtureCard('free', { cost: 0 })], ['cut', 'free']);
    sim.startCombat();
    const before = sim.world.rng.getState();
    sim.playCard(1, none);
    expect(eventsOf(sim, 'cardCost')).toHaveLength(0);
    expect(sim.world.rng.getState()).toBe(before);
  });

  it('같은 시드면 같은 카드가 선택된다 (결정론)', () => {
    const pick = () => {
      const sim = simWith([cut, fixtureCard('a', { cost: 1 }), fixtureCard('b', { cost: 2 }), fixtureCard('c', { cost: 3 })], ['cut', 'a', 'b', 'c'], { seed: 7 });
      sim.startCombat();
      sim.playCard(1, none);
      return eventsOf(sim, 'cardCost')[0]?.cardId;
    };
    expect(pick()).toBe(pick());
  });

  it('줄어든 비용으로 실제 CP를 낸다', () => {
    const sim = simWith([cut, fixtureCard('pricey', { cost: 2 })], ['cut', 'pricey']);
    sim.startCombat();
    sim.playCard(1, none);
    const cp = sim.commandPoints?.combat ?? 0;
    expect(sim.playCard(2, none).ok).toBe(true);
    expect(sim.commandPoints?.combat).toBe(cp - 1);
  });
});

describe('N6 조건부 추가 피해', () => {
  const strike = fixtureCard('burnBlast', {
    type: 'spell',
    target: { kind: 'enemyUnit' },
    effects: [{ kind: 'flatDamage', selector: 'target', amount: 100, dmgType: 'magic', bonusIfBurning: 100 }],
  });
  const execute = fixtureCard('execute', {
    type: 'spell',
    target: { kind: 'enemyUnit' },
    effects: [{ kind: 'flatDamage', selector: 'target', amount: 100, dmgType: 'physical', hpBelowPct: 30, belowMult: 2 }],
  });

  it('대상이 화상 중이면 추가 피해가 붙고 damage 이벤트에 bonus 표시가 남는다', () => {
    const plain = simWith([strike], ['burnBlast']);
    plain.startCombat();
    plain.playCard(1, unit(ENEMY));
    const base = damagesOn(plain, ENEMY)[0];
    expect(base?.bonus).toBeUndefined();

    const burning = simWith([strike], ['burnBlast']);
    burning.startCombat();
    unitOf(burning, ENEMY).statuses.addBurn(1, 100, null);
    burning.playCard(1, unit(ENEMY));
    const bonus = damagesOn(burning, ENEMY)[0];
    expect(bonus?.bonus).toBe(true);
    expect(bonus!.amount).toBeGreaterThan(base!.amount * 1.9);
  });

  it('대상 HP 비율이 기준 이하일 때만 배율이 적용된다', () => {
    const healthy = simWith([execute], ['execute']);
    healthy.startCombat();
    healthy.playCard(1, unit(ENEMY));
    const normal = damagesOn(healthy, ENEMY)[0]!;

    const weak = simWith([execute], ['execute']);
    weak.startCombat();
    const target = unitOf(weak, ENEMY);
    target.hp = Math.floor(target.maxHp * 0.3);
    weak.playCard(1, unit(ENEMY));
    const doubled = damagesOn(weak, ENEMY)[0]!;
    expect(doubled.bonus).toBe(true);
    expect(Math.abs(doubled.amount - normal.amount * 2)).toBeLessThanOrEqual(1); // 반올림 오차
  });

  it('주문 피해 보정(이세라 +25%)이 추가 피해에도 적용된다', () => {
    const sim = simWith([strike], ['burnBlast'], { commander: isera });
    sim.startCombat();
    unitOf(sim, ENEMY).statuses.addBurn(1, 100, null);
    sim.playCard(1, unit(ENEMY));
    const withPassive = damagesOn(sim, ENEMY)[0]!.amount;

    const base = simWith([strike], ['burnBlast']);
    base.startCombat();
    unitOf(base, ENEMY).statuses.addBurn(1, 100, null);
    base.playCard(1, unit(ENEMY));
    expect(withPassive / damagesOn(base, ENEMY)[0]!.amount).toBeCloseTo(1.25, 1);
  });
});

describe('N7 특정 유닛 징집', () => {
  const summon = (extra: Record<string, unknown>, count = 1) =>
    fixtureCard('summon', { keywords: ['conscript', 'exhaust'], effects: [{ kind: 'summon', selector: 'allAllies', count, unitId: 'iron_shieldbearer', ...extra }] });

  it('지정 유닛을 지정 성급으로 전열 빈 칸에 소환하고 마나를 가득 채울 수 있다', () => {
    const sim = simWith([summon({ star: 2, placement: 'allyFront', manaFull: true })], ['summon']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    const spawned = eventsOf(sim, 'spawn').filter((e) => e.unit >= 5);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({ unitId: 'iron_shieldbearer', side: 0, star: 2, cell: { col: 3, row: 0 } });
    const summoned = unitOf(sim, spawned[0]!.unit);
    expect(summoned.temporary).toBe(true);
    expect(summoned.mana).toBe(summoned.maxMana);
  });

  it('기본 위치는 후열이고 징집은 Rng를 쓰지 않는다', () => {
    const sim = simWith([summon({})], ['summon']);
    sim.startCombat();
    const before = sim.world.rng.getState();
    sim.playCard(1, none);
    expect(eventsOf(sim, 'spawn').find((e) => e.unit >= 5)?.cell.col).toBe(0);
    expect(sim.world.rng.getState()).toBe(before);
  });

  it('적 후열 빈 칸에 소환한다 (아군 소속)', () => {
    const sim = simWith([summon({ placement: 'enemyBack' }, 2)], ['summon']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    const spawned = eventsOf(sim, 'spawn').filter((e) => e.unit >= 5);
    expect(spawned.map((e) => e.side)).toEqual([0, 0]);
    // 적 후열은 열 7: 가운데 행(2)부터, 그다음 위쪽 행(1)
    expect(spawned.map((e) => e.cell)).toEqual([{ col: 7, row: 2 }, { col: 7, row: 1 }]);
  });

  it('빈 칸이 모자라면 사용할 수 없고 상태가 바뀌지 않는다', () => {
    const sim = simWith([summon({ placement: 'allyFront' }, 5)], ['summon']);
    sim.startCombat();
    const result = sim.playCard(1, none);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.reason).toContain('전열에 빈 칸 5개');
    expect(sim.deck?.hand).toHaveLength(1);
  });

  it('기존 등급 징집(tier)은 그대로 동작한다', () => {
    const sim = simWith([fixtureCard('tier', { effects: [{ kind: 'summon', selector: 'allAllies', count: 1, tier: 1 }] })], ['tier']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(eventsOf(sim, 'spawn').filter((e) => e.unit >= 5)).toHaveLength(1);
  });
});

describe('N8 ultimateGain', () => {
  const gain = (amount: number) => fixtureCard(`gain${amount}`, { cost: 0, effects: [{ kind: 'ultimateGain', selector: 'allAllies', amount }] });

  it('궁극기 게이지를 올리되 100을 넘기지 않는다 (이벤트 없이 상태 조회)', () => {
    const sim = simWith([gain(40), gain(70)], ['gain40', 'gain70', 'gain40'], { commander: harten });
    sim.startCombat();
    const base = sim.ultimate!.charge;
    // 카드 사용 자체의 충전(+15)도 들어간다
    sim.playCard(1, none);
    expect(sim.ultimate!.charge).toBe(base + 40 + 15);
    sim.playCard(2, none);
    expect(sim.ultimate!.charge).toBe(100);
  });

  it('이미 쓴 궁극기는 게이지를 올려도 다시 쓸 수 없다', () => {
    const sim = simWith([gain(100)], ['gain100', 'gain100'], { commander: harten });
    sim.startCombat();
    sim.playCard(1, none);
    expect(sim.useUltimate().ok).toBe(true);
    sim.playCard(2, none);
    expect(sim.ultimate).toMatchObject({ used: true, ready: false });
    expect(sim.useUltimate().ok).toBe(false);
  });

  it('궁극기가 없는 전투에서도 카드는 오류 없이 쓸 수 있다', () => {
    const sim = simWith([gain(40)], ['gain40']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(sim.ultimate).toBeNull();
  });
});

describe('N9 카드용 지연 타격', () => {
  const prophecy = fixtureCard('prophecy', {
    type: 'spell',
    target: { kind: 'area3x3' },
    keywords: ['retain'],
    effects: [
      {
        kind: 'delayedStrike', selector: 'allAllies', delay: 3, area: 'targetArea',
        effects: [{ kind: 'flatDamage', selector: 'enemiesInTargetArea', amount: 400, dmgType: 'magic' }],
      },
    ],
  });

  it('3초 뒤 지정 범위를 친다: 예고(telegraph)→발동(strike)→피해, 그 전에는 피해가 없다', () => {
    const sim = simWith([prophecy], ['prophecy']);
    sim.startCombat();
    // 적 석궁병(6,2)은 움직이지 않도록 기절시킨다
    unitOf(sim, 4).statuses.addStun(1e9);
    expect(sim.playCard(1, area(6, 2)).ok).toBe(true);
    const telegraph = eventsOf(sim, 'telegraph')[0]!;
    expect(telegraph).toMatchObject({ source: -1, pattern: 'card', label: 'prophecy', fireAt: 3 });
    expect(telegraph.cells).toHaveLength(9);
    sim.runUntil(29);
    expect(damagesOn(sim, 4)).toHaveLength(0);
    expect(eventsOf(sim, 'strike')).toHaveLength(0);
    sim.runUntil(31);
    expect(eventsOf(sim, 'strike')[0]).toMatchObject({ id: telegraph.id, source: -1 });
    expect(damagesOn(sim, 4).some((e) => e.amount > 0)).toBe(true);
  });

  it('범위 밖 유닛은 맞지 않고, 이세라 주문 피해 보정이 적용된다', () => {
    const plain = simWith([prophecy], ['prophecy']);
    plain.startCombat();
    unitOf(plain, 4).statuses.addStun(1e9);
    plain.playCard(1, area(6, 2));
    plain.runUntil(35);
    const normal = damagesOn(plain, 4)[0]!.amount;

    const boosted = simWith([prophecy], ['prophecy'], { commander: isera });
    boosted.startCombat();
    unitOf(boosted, 4).statuses.addStun(1e9);
    boosted.playCard(1, area(6, 2));
    boosted.runUntil(35);
    expect(damagesOn(boosted, 4)[0]!.amount / normal).toBeCloseTo(1.25, 1);
    expect(damagesOn(boosted, 0).filter((e) => e.source === null)).toHaveLength(0);
  });

  it('보존 키워드: 전투가 끝나도 손패에 남는다', () => {
    const sim = simWith([prophecy], ['prophecy']);
    sim.run();
    expect(sim.deck?.hand.map((c) => c.cardId)).toEqual(['prophecy']);
  });
});

describe('N10 지속 범위 피해 장판', () => {
  const flame = fixtureCard('flame', {
    type: 'spell',
    cost: 0,
    target: { kind: 'area3x3' },
    effects: [{ kind: 'damageZone', selector: 'enemiesInTargetArea', amount: 40, dmgType: 'magic', duration: 5, intervalSeconds: 1 }],
  });

  it('5초 동안 1초마다 칸 안의 적에게 피해를 주고 끝나면 멈춘다', () => {
    const sim = simWith([flame], ['flame']);
    sim.startCombat();
    unitOf(sim, 4).statuses.addStun(1e9);
    expect(sim.playCard(1, area(6, 2)).ok).toBe(true);
    const start = eventsOf(sim, 'zoneStart')[0]!;
    expect(start.cells).toHaveLength(9);
    expect(start.endAt).toBe(5);
    sim.runUntil(100);
    expect(eventsOf(sim, 'zonePulse')).toHaveLength(5);
    const hits = damagesOn(sim, 4);
    expect(hits).toHaveLength(5);
    expect(hits.map((e) => e.t)).toEqual([1, 2, 3, 4, 5]);
  });

  it('칸 기준이라 범위 밖에 있는 적은 맞지 않는다', () => {
    const sim = simWith([flame], ['flame']);
    sim.startCombat();
    unitOf(sim, 4).statuses.addStun(1e9);
    unitOf(sim, ENEMY).statuses.addStun(1e9);
    sim.playCard(1, area(6, 2));
    sim.runUntil(70);
    expect(damagesOn(sim, 4)).toHaveLength(5);
    expect(damagesOn(sim, ENEMY).filter((e) => e.source === null)).toHaveLength(0);
  });
});

describe('N11 spellDamageBoost', () => {
  const boost = fixtureCard('boost', { cost: 0, effects: [{ kind: 'spellDamageBoost', selector: 'allAllies', pct: 20 }] });
  const bolt = fixtureCard('bolt', { type: 'spell', cost: 0, target: { kind: 'enemyUnit' }, effects: [{ kind: 'flatDamage', selector: 'target', amount: 100, dmgType: 'magic' }] });

  it('지휘관 패시브(+25%p)와 합산된다: 25% → 45%', () => {
    const sim = simWith([boost, bolt], ['bolt', 'boost', 'bolt'], { commander: isera });
    sim.startCombat();
    sim.playCard(1, unit(ENEMY));
    sim.playCard(2, none);
    sim.playCard(3, unit(ENEMY));
    const [before, after] = damagesOn(sim, ENEMY).filter((e) => e.dmgType === 'magic');
    expect(after!.amount / before!.amount).toBeCloseTo(1.45 / 1.25, 1);
  });

  it('주문이 아닌 카드와 이전에 쓴 지연 타격은 영향받지 않고, 지휘관이 없어도 동작한다', () => {
    const sim = simWith([boost, bolt], ['boost', 'bolt']);
    sim.startCombat();
    sim.playCard(1, none);
    sim.playCard(2, unit(ENEMY));
    const plain = simWith([bolt], ['bolt']);
    plain.startCombat();
    plain.playCard(1, unit(ENEMY));
    expect(damagesOn(sim, ENEMY)[0]!.amount / damagesOn(plain, ENEMY)[0]!.amount).toBeCloseTo(1.2, 1);
  });
});

describe('N12 reviveOnce (부활 장비)', () => {
  const feather = fixtureCard('feather', {
    type: 'equipment',
    target: { kind: 'allyUnit' },
    effects: [{ kind: 'reviveOnce', selector: 'target', hpPct: 40 }],
  });

  function lethal(sim: CombatSimulator, uid: number): void {
    sim.world.dealDamage({ source: null, target: unitOf(sim, uid), raw: 1e9, type: 'magic' });
  }

  it('쓰러질 때 최대 HP의 40%로 그 자리에서 되살아나고, 두 번째에는 죽는다', () => {
    const sim = simWith([feather], ['feather']);
    expect(sim.playCard(1, unit(0)).ok).toBe(true);
    sim.startCombat();
    const target = unitOf(sim, 0);
    const cell = { ...target.cell };
    lethal(sim, 0);
    expect(target.alive).toBe(true);
    expect(target.hp).toBe(Math.round(target.maxHp * 0.4));
    expect(eventsOf(sim, 'death').filter((e) => e.unit === 0)).toHaveLength(0);
    expect(eventsOf(sim, 'revive')[0]).toMatchObject({ unit: 0, inPlace: true, cell });
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.unit === 0 && e.status === 'reviveOnce')).toBe(true);
    lethal(sim, 0);
    expect(target.alive).toBe(false);
  });

  it('편성에 장비로 달려 온 전투에서도 전투마다 1회 동작한다', () => {
    const sim = new CombatSimulator(
      {
        seed: 1,
        formations: [formation([]).concat([{ unitId: 'iron_shieldbearer', star: 1, cell: { col: 3, row: 1 }, equipment: ['feather'] }]), formation([['arena_recruit', 1, 4, 2]])],
        cards: { commander: null, deck: handSnapshot([]) },
      },
      units, traits, fixtureCatalog([feather]),
    );
    lethal(sim, 0);
    expect(unitOf(sim, 0).alive).toBe(true);
    lethal(sim, 0);
    expect(unitOf(sim, 0).alive).toBe(false);
  });
});

describe('N13 처치 시 CP', () => {
  it('cpOnKill 카드: 이번 전투 동안 아군이 처치할 때마다 CP, 합계는 한도까지 (이유 effect)', () => {
    const harvest = fixtureCard('harvest', { cost: 0, effects: [{ kind: 'cpOnKill', selector: 'allAllies', amount: 1, maxPerCombat: 2 }] });
    const sim = simWith([harvest], ['harvest'], { b: [['arena_recruit', 1, 4, 1], ['arena_recruit', 1, 4, 2], ['arena_recruit', 1, 4, 3]] });
    sim.startCombat();
    sim.playCard(1, none);
    const cp0 = sim.commandPoints!.combat;
    for (const uid of [3, 4, 5]) sim.world.dealDamage({ source: unitOf(sim, 0), target: unitOf(sim, uid), raw: 1e9, type: 'physical' });
    expect(sim.commandPoints!.combat).toBe(cp0 + 2);
    const reasons = eventsOf(sim, 'cp').filter((e) => e.delta > 0 && e.reason === 'effect');
    expect(reasons).toHaveLength(2);
    expect(eventsOf(sim, 'cp').some((e) => e.reason === 'abyss')).toBe(false);
  });

  it('killCp: 이 카드 피해로 처치하면 CP, 못 죽이면 없다', () => {
    const reap = fixtureCard('reap', {
      type: 'spell', cost: 0, target: { kind: 'enemyUnit' },
      effects: [{ kind: 'flatDamage', selector: 'target', amount: 1, dmgType: 'physical', killCp: 2 }],
    });
    const sim = simWith([reap], ['reap']);
    sim.startCombat();
    const cp0 = sim.commandPoints!.combat;
    sim.playCard(1, unit(ENEMY));
    expect(sim.commandPoints!.combat).toBe(cp0);

    const kill = fixtureCard('kill', {
      type: 'spell', cost: 0, target: { kind: 'enemyUnit' },
      effects: [{ kind: 'flatDamage', selector: 'target', amount: 1e7, dmgType: 'physical', killCp: 2 }],
    });
    const sim2 = simWith([kill], ['kill']);
    sim2.startCombat();
    sim2.playCard(1, unit(ENEMY));
    expect(sim2.commandPoints!.combat).toBe(cp0 + 2);
  });
});

describe('N14 startCp (준비 단계 작전)', () => {
  it('이번 전투 시작 CP를 늘린다 (상한 6) — 준비 단계에 카드를 뽑아도 된다', () => {
    const brazier = fixtureCard('brazier', {
      type: 'operation', cost: 0,
      effects: [{ kind: 'startCp', selector: 'allAllies', amount: 2 }, { kind: 'drawCards', selector: 'allAllies', count: 1 }],
    });
    const base = simWith([brazier, fixtureCard('other')], ['brazier']);
    const handBefore = base.deck!.hand.length;
    const withDraw = makeCardSim({
      catalog: fixtureCatalog([brazier, fixtureCard('other')]),
      deck: { ...handSnapshot(['brazier']), draw: [{ instanceId: 2, cardId: 'other', upgraded: false }], nextInstanceId: 3 },
    });
    expect(withDraw.playCard(1, none).ok).toBe(true);
    expect(withDraw.deck!.hand.map((c) => c.cardId)).toEqual(['other']);
    withDraw.startCombat();
    expect(withDraw.commandPoints!.combat).toBe(4);
    expect(handBefore).toBe(1);
  });

  it('전투 중에는 쓸 수 없다 (작전 카드)', () => {
    const op = fixtureCard('op', { type: 'operation', cost: 0, effects: [{ kind: 'startCp', selector: 'allAllies', amount: 1 }] });
    const sim = simWith([op], ['op']);
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(false);
  });
});

describe('N15 commanderHeal', () => {
  const settle = fixtureCard('settle', { cost: 0, keywords: ['exhaust'], effects: [{ kind: 'commanderHeal', selector: 'allAllies', amount: 5 }] });

  it('사용 즉시 HP가 늘지 않고 회복 예약(commanderHeal 이벤트)만 쌓인다', () => {
    const sim = simWith([settle], ['settle'], { commanderHp: 10 });
    sim.startCombat();
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(sim.commanderHealPending).toBe(5);
    expect(eventsOf(sim, 'commanderHeal')).toEqual([expect.objectContaining({ amount: 5, cardId: 'settle', instanceId: 1 })]);
    expect(eventsOf(sim, 'commanderHp')).toHaveLength(0);
    expect(sim.commanderHpSpent).toBe(0);
  });
});

describe('N16 카드용 강화 공격', () => {
  it('지정 아군의 다음 기본 공격만 ATK의 배율 피해가 되고 소비된다', () => {
    const strike = fixtureCard('strike', { target: { kind: 'allyUnit' }, effects: [{ kind: 'empoweredAttack', selector: 'target', pctAtk: 300, dmgType: 'physical' }] });
    const sim = simWith([strike], ['strike'], { a: [['arena_recruit', 1, 3, 2]], b: [['iron_shieldbearer', 1, 4, 2]] });
    sim.startCombat();
    sim.playCard(1, unit(0));
    expect(unitOf(sim, 0).statuses.hasEmpoweredAttack()).toBe(true);
    const base = simWith([strike], [], { a: [['arena_recruit', 1, 3, 2]], b: [['iron_shieldbearer', 1, 4, 2]] });
    sim.runUntil(40);
    base.runUntil(40);
    expect(unitOf(sim, 0).statuses.hasEmpoweredAttack()).toBe(false);
    const first = (s: CombatSimulator) => damagesOn(s, 1).find((e) => e.source === 0)!.amount;
    expect(first(sim) / first(base)).toBeGreaterThan(2.5);
  });
});

describe('I15 작전 카드의 onAttackBurn', () => {
  it('이번 전투 아군이 공격하면 대상에게 화상 (ATK 비례), 공명처럼 여러 번 걸면 큰 쪽으로 갱신', () => {
    const ember = fixtureCard('ember', {
      type: 'operation',
      effects: [
        { kind: 'onAttackBurn', selector: 'allAllies', pctAtk: 10, duration: 3 },
        { kind: 'onAttackBurn', selector: 'allAllies', pctAtk: 20, duration: 3 },
      ],
    });
    const sim = simWith([ember], ['ember'], { a: [['arena_recruit', 1, 3, 2]], b: [['iron_shieldbearer', 1, 4, 2]] });
    expect(sim.playCard(1, none).ok).toBe(true);
    sim.runUntil(30);
    const burns = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'burn' && e.unit === 1);
    expect(burns.length).toBeGreaterThan(0);
    const atk = unitOf(sim, 0).stat('atk');
    expect(Math.max(...burns.map((e) => e.value ?? 0))).toBeCloseTo(atk * 0.2, 5);
  });
});

describe('lifesteal 전투 내내 (장비)', () => {
  it('duration "combat"를 받아 전투 끝까지 흡혈한다', () => {
    const dagger = fixtureCard('dagger', { type: 'equipment', target: { kind: 'allyUnit' }, effects: [{ kind: 'lifesteal', selector: 'target', pct: 15, duration: 'combat' }] });
    const sim = simWith([dagger], ['dagger']);
    expect(sim.playCard(1, unit(0)).ok).toBe(true);
    const applied = eventsOf(sim, 'statusApplied').find((e) => e.status === 'lifesteal');
    expect(applied).toMatchObject({ unit: 0, duration: 'combat', value: 15 });
    sim.startCombat();
    sim.runUntil(800);
    expect(unitOf(sim, 0).statuses.lifestealPct()).toBe(15);
  });
});

describe('N17 저주', () => {
  const fear = fixtureCard('fear', { type: 'curse', cost: 0, text: '사용 불가' , effects: [] });
  const wound = fixtureCard('wound', {
    type: 'curse', cost: 0, effects: [],
    curse: { onDraw: [{ kind: 'statMod', selector: 'randomAlly', stat: 'atk', pct: -10, duration: 'combat' }] },
  });
  const rot = fixtureCard('rot', {
    type: 'curse', cost: 1, keywords: ['exhaust'], effects: [],
    curse: { playable: true, goldLossAtEnd: 3 },
  });
  const draw = fixtureCard('draw', { cost: 0, effects: [{ kind: 'drawCards', selector: 'allAllies', count: 1 }] });

  it('사용 불가 저주는 낼 수 없고 상태·로그가 바뀌지 않는다', () => {
    const sim = simWith([fear], ['fear']);
    sim.startCombat();
    const events = sim.events.length;
    const result = sim.playCard(1, none);
    expect(result).toEqual({ ok: false, reason: '저주 카드는 사용할 수 없습니다' });
    expect(sim.events).toHaveLength(events);
    expect(sim.deck?.hand).toHaveLength(1);
  });

  it('써서 없앨 수 있는 저주는 비용을 내고 소모된다', () => {
    const sim = simWith([rot], ['rot']);
    sim.startCombat();
    const cp = sim.commandPoints!.combat;
    expect(sim.playCard(1, none).ok).toBe(true);
    expect(sim.commandPoints!.combat).toBe(cp - 1);
    expect(sim.deck!.exhaustPile.map((c) => c.cardId)).toEqual(['rot']);
    // 소모했으니 전투가 끝나도 골드 손실이 없다
    sim.run();
    expect(eventsOf(sim, 'cursePenalty')).toHaveLength(0);
  });

  it('전투 중 뽑으면 뽑을 때 효과가 자동 발동한다 (무작위 아군 1명 ATK -10%)', () => {
    const deck = { ...handSnapshot(['draw']), draw: [{ instanceId: 2, cardId: 'wound', upgraded: false }], nextInstanceId: 3 };
    const sim = simWith([draw, wound], [], { deck });
    sim.startCombat();
    sim.playCard(1, none);
    expect(eventsOf(sim, 'curseTriggered')).toEqual([expect.objectContaining({ cardId: 'wound', instanceId: 2 })]);
    const hit = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:atk' && e.value === -10);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.unit).toBeLessThan(3);
    expect(sim.deck!.hand.map((c) => c.cardId)).toEqual(['wound']);
  });

  it('전투 시작 때 손패에 있던 저주도 시작할 때 한 번 발동한다', () => {
    const sim = simWith([wound], ['wound']);
    expect(eventsOf(sim, 'curseTriggered')).toHaveLength(0);
    sim.startCombat();
    expect(eventsOf(sim, 'curseTriggered')).toHaveLength(1);
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:atk' && e.value === -10)).toHaveLength(1);
  });

  it('전투가 끝날 때 손패에 남은 저주는 골드 손실 이벤트를 남긴다', () => {
    const sim = simWith([rot, fear], ['rot', 'fear', 'rot']);
    sim.run();
    const penalties = eventsOf(sim, 'cursePenalty');
    expect(penalties.map((e) => e.gold)).toEqual([3, 3]);
    expect(eventsOf(sim, 'cursePenalty')[0]!.t).toBe(eventsOf(sim, 'end')[0]!.t);
    // 이벤트 순서: 골드 손실이 end보다 먼저
    const types = sim.events.map((e: CombatEvent) => e.type);
    expect(types.lastIndexOf('cursePenalty')).toBeLessThan(types.indexOf('end'));
  });

  it('같은 입력이면 같은 로그다 (결정론)', () => {
    const run = () => {
      const deck = { ...handSnapshot(['draw', 'wound']), draw: [{ instanceId: 3, cardId: 'wound', upgraded: false }], nextInstanceId: 4 };
      const sim = simWith([draw, wound], [], { deck, seed: 5 });
      sim.startCombat();
      sim.playCard(1, none);
      return JSON.stringify(sim.run().events);
    };
    expect(run()).toBe(run());
  });
});

describe('회귀: 새 효과를 쓰지 않는 카드는 이벤트·Rng가 늘지 않는다', () => {
  it('기존 카드(불씨 화살+화염 폭풍)의 로그에 새 이벤트 종류가 없다', () => {
    const sim = makeCardSim({ hand: ['ember_arrow', 'firestorm'], commander: isera });
    sim.startCombat();
    sim.playCard(1, unit(ENEMY));
    sim.runUntil(60);
    const NEW = ['zoneStart', 'zonePulse', 'curseTriggered', 'cursePenalty', 'commanderHeal'];
    expect(sim.events.some((e) => NEW.includes(e.type) || (e.type === 'damage' && e.bonus) || (e.type === 'revive' && e.inPlace))).toBe(false);
  });
});
