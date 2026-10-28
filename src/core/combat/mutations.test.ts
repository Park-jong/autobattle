import { describe, expect, it } from 'vitest';
import { MUTATION } from './constants';
import type { MutationId } from './mutations';
import { CombatSimulator, type EnemyModifiers } from './sim';
import { cardCatalog, eventsOf, formation, handSnapshot, traits, unitOf, units, type Placement } from './testSupport';

const ALLY: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3]];
const ENEMY: readonly Placement[] = [['iron_shieldbearer', 1, 4, 2], ['arena_recruit', 1, 5, 2], ['legion_crossbow', 1, 7, 4]];

function make(enemy: EnemyModifiers | undefined, hand: readonly string[] = [], enemyUnits: readonly Placement[] = ENEMY): CombatSimulator {
  return new CombatSimulator(
    {
      seed: 5,
      formations: [formation(ALLY), formation(enemyUnits)],
      cards: { commander: null, deck: handSnapshot(hand) },
      ...(enemy ? { enemy } : {}),
    },
    units, traits, cardCatalog,
  );
}

describe('적 보정(층 배율)', () => {
  it('적 편성의 HP·ATK에만 배율이 곱해지고 spawn 이벤트에 반영된다', () => {
    const plain = make(undefined);
    const scaled = make({ hpMult: 1.4, atkMult: 1.2 });
    const spawns = (sim: CombatSimulator) => eventsOf(sim, 'spawn');
    expect(spawns(scaled).filter((e) => e.side === 0).map((e) => e.maxHp)).toEqual(spawns(plain).filter((e) => e.side === 0).map((e) => e.maxHp));
    const enemyPlain = spawns(plain).filter((e) => e.side === 1);
    spawns(scaled).filter((e) => e.side === 1).forEach((e, i) => expect(e.maxHp).toBe(Math.round((enemyPlain[i]?.maxHp ?? 0) * 1.4)));
    expect(unitOf(scaled, 2).stat('atk')).toBe(Math.round(units.get('iron_shieldbearer')!.stats.atk * 1.2));
  });

  it('보정과 변이를 주지 않으면 기존 전투와 이벤트 로그가 완전히 같다', () => {
    const a = make(undefined).run();
    const b = make({}).run();
    const c = make({ hpMult: 1, atkMult: 1, mutations: [] }).run();
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(c.events)).toBe(JSON.stringify(a.events));
  });
});

describe('정예 변이', () => {
  it('장갑: 적 전원의 ARM이 50 늘고 아군은 그대로다', () => {
    const base = make(undefined);
    const sim = make({ mutations: ['armored'] });
    expect(eventsOf(sim, 'mutation').map((e) => e.id)).toEqual(['armored']);
    for (const uid of [2, 3, 4]) expect(unitOf(sim, uid).stat('arm')).toBe(unitOf(base, uid).stat('arm') + MUTATION.ARMORED_ARM);
    for (const uid of [0, 1]) expect(unitOf(sim, uid).stat('arm')).toBe(unitOf(base, uid).stat('arm'));
    const applied = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:arm' && e.value === MUTATION.ARMORED_ARM);
    expect(applied.map((e) => e.unit).sort()).toEqual([2, 3, 4]);
    expect(applied.every((e) => e.value === 50 && e.duration === 'combat')).toBe(true);
  });

  it('분노: HP가 50% 이하가 되면 AS가 ×2가 되고 한 번만 적용된다', () => {
    const sim = make({ mutations: ['rage'] });
    const target = unitOf(sim, 2);
    const baseAs = target.stat('as');
    sim.world.dealDamage({ source: unitOf(sim, 0), target, raw: target.maxHp * 0.5, type: 'magic' });
    expect(target.stat('as')).toBe(baseAs);
    sim.world.dealDamage({ source: unitOf(sim, 0), target, raw: target.maxHp * 0.5, type: 'magic' });
    expect(target.hp).toBeLessThanOrEqual(target.maxHp / 2);
    expect(target.stat('as')).toBeCloseTo(baseAs * 2);
    sim.world.dealDamage({ source: unitOf(sim, 0), target, raw: 10, type: 'magic' });
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.unit === 2 && e.status === 'statMod:as')).toHaveLength(1);
    // 다른 적과 아군은 영향이 없다
    expect(unitOf(sim, 3).stat('as')).toBe(unitOf(make(undefined), 3).stat('as'));
  });

  it('전파: 적이 죽으면 반경 1칸의 살아 있는 적만 최대 HP의 20%를 회복한다', () => {
    const sim = make({ mutations: ['contagion'] });
    const dying = unitOf(sim, 2); // (4,2)
    const near = unitOf(sim, 3); // (5,2) 인접
    const far = unitOf(sim, 4); // (7,4)
    near.hp = 100;
    far.hp = 100;
    sim.world.dealDamage({ source: unitOf(sim, 0), target: dying, raw: 99999, type: 'magic' });
    expect(dying.alive).toBe(false);
    const heals = eventsOf(sim, 'heal');
    expect(heals).toHaveLength(1);
    expect(heals[0]).toMatchObject({ unit: 3, source: null, amount: Math.round(near.maxHp * MUTATION.CONTAGION_HEAL_PCT / 100) });
    expect(far.hp).toBe(100);
    // 아군이 죽어도 전파되지 않는다
    unitOf(sim, 1).hp = 1;
    const before = eventsOf(sim, 'heal').length;
    sim.world.dealDamage({ source: dying, target: unitOf(sim, 1), raw: 99999, type: 'magic' });
    expect(eventsOf(sim, 'heal').length).toBe(before);
  });

  it('방해: 3초마다 손패 1장의 비용이 오르고 그 카드는 더 비싸게 쓴다', () => {
    const sim = make({ mutations: ['disrupt'] }, ['last_stand']);
    sim.startCombat();
    sim.runUntil(MUTATION.DISRUPT_INTERVAL_SECONDS * 10 - 1);
    expect(eventsOf(sim, 'cardCost')).toHaveLength(0);
    sim.runUntil(MUTATION.DISRUPT_INTERVAL_SECONDS * 10 + 1);
    const costs = eventsOf(sim, 'cardCost');
    expect(costs).toEqual([{ type: 'cardCost', t: 3, instanceId: 1, cardId: 'last_stand', surcharge: 1 }]);
    expect(sim.cardSurcharge(1)).toBe(1);
    // 최후의 저항(2CP)이 3CP가 되어 CP 2로는 쓸 수 없다
    const result = sim.playCard(1, { kind: 'unit', uid: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('필요 3');
    sim.runUntil(61);
    expect(eventsOf(sim, 'cardCost').map((e) => e.surcharge)).toEqual([1, 2]);
  });

  it('방해: 손패가 비어 있으면 아무 일도 없고, 같은 입력이면 같은 로그다', () => {
    const empty = make({ mutations: ['disrupt'] });
    empty.runUntil(100);
    expect(eventsOf(empty, 'cardCost')).toHaveLength(0);
    const a = make({ mutations: ['disrupt'] }, ['last_stand', 'focus_fire', 'hold_the_line']).run();
    const b = make({ mutations: ['disrupt'] }, ['last_stand', 'focus_fire', 'hold_the_line']).run();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(a.events.filter((e) => e.type === 'cardCost').length).toBeGreaterThan(0);
  });

  it('변이는 중복 지정해도 한 번만 설치되고 여러 변이를 함께 쓸 수 있다', () => {
    const ids: MutationId[] = ['armored', 'armored', 'rage'];
    const sim = make({ mutations: ids });
    expect(eventsOf(sim, 'mutation').map((e) => e.id)).toEqual(['armored', 'rage']);
    expect(unitOf(sim, 2).stat('arm')).toBe(units.get('iron_shieldbearer')!.stats.arm + 15 + 50); // 강철군단 1단계 ARM +15 포함
  });
});
