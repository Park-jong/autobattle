import { describe, expect, it } from 'vitest';
import { CombatSimulator } from './sim';
import type { CombatEvent } from './events';
import { cardCatalog, eventsOf, formation, handSnapshot, traits, unitOf, units, type Placement } from './testSupport';

const ALLY: readonly Placement[] = [
  ['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 2], ['moss_warden', 1, 3, 3], ['grove_archer', 1, 1, 2],
];
const BOSS: readonly Placement[] = [['gate_breaker', 1, 4, 2]];

function make(hand: readonly string[] = [], seed = 3): CombatSimulator {
  return new CombatSimulator(
    { seed, formations: [formation(ALLY), formation(BOSS)], cards: { commander: null, deck: handSnapshot(hand) } },
    units, traits, cardCatalog,
  );
}

/** strike 이벤트 직후에 이어지는 보스 발동 피해 이벤트 */
function strikeDamage(events: readonly CombatEvent[]): Extract<CombatEvent, { type: 'damage' }>[] {
  const at = events.findIndex((e) => e.type === 'strike');
  const out: Extract<CombatEvent, { type: 'damage' }>[] = [];
  for (let i = at + 1; i < events.length; i++) {
    const e = events[i] as CombatEvent;
    // 발동 피해는 유닛 행동(공격·이동·스킬)보다 먼저 같은 틱에 나온다
    if (['attack', 'skillCast', 'moveStart', 'moveEnd', 'end'].includes(e.type)) break;
    if (e.type === 'damage' && e.source === (events[at] as { source: number }).source) out.push(e);
  }
  return out;
}

describe('보스 성문 파괴자: 열 강타 패턴', () => {
  it('보스 데이터: 상점 풀·징집 후보에서 제외되는 보스 유닛이고 패턴 수치가 있다', () => {
    const boss = units.get('gate_breaker')!;
    expect(boss.boss).toBe(true);
    expect(boss.pattern).toMatchObject({ kind: 'columnStrike', intervalSeconds: 10, telegraphSeconds: 2, dmgType: 'physical' });
  });

  it('발동 2초 전(8초)에 대상 열 5칸과 발동 시각 10초를 예고한다', () => {
    const sim = make();
    sim.runUntil(79);
    expect(eventsOf(sim, 'telegraph')).toHaveLength(0);
    sim.runUntil(81);
    const [telegraph] = eventsOf(sim, 'telegraph');
    expect(telegraph).toBeDefined();
    expect(telegraph).toMatchObject({ id: 1, source: 4, pattern: 'columnStrike', fireAt: 10, t: 8 });
    expect(telegraph?.cells).toHaveLength(5);
    const col = telegraph?.cells[0]?.col as number;
    expect(telegraph?.cells.map((c) => c.row)).toEqual([0, 1, 2, 3, 4]);
    expect(telegraph?.cells.every((c) => c.col === col)).toBe(true);
    expect(eventsOf(sim, 'strike')).toHaveLength(0);
  });

  it('예고한 열에 서 있는 아군에게만 10초에 물리 고정 피해를 준다', () => {
    const sim = make();
    sim.runUntil(81);
    const col = eventsOf(sim, 'telegraph')[0]?.cells[0]?.col as number;
    sim.runUntil(100); // 발동 틱 직전: 이 시점의 위치가 피해 판정 기준
    const expected = sim.world.alliesOf(0).filter((u) => u.cell.col === col).map((u) => u.uid).sort();
    // 받는 피해 배율(수호자 특성의 전열 감소 등)과 ARM을 반영한 기대값
    const defense = new Map(sim.world.alliesOf(0).map((u) => [u.uid, { arm: u.stat('arm'), mult: u.statuses.takenMultiplier() }]));
    sim.step();
    const [strike] = eventsOf(sim, 'strike');
    expect(strike).toMatchObject({ id: 1, t: 10 });
    const hits = strikeDamage(sim.world.events);
    expect(hits.map((h) => h.unit).sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit.dmgType).toBe('physical');
      const d = defense.get(hit.unit) as { arm: number; mult: number };
      expect(hit.amount).toBe(Math.round((420 * d.mult * 100) / (100 + d.arm)));
    }
  });

  it('10초 간격으로 반복된다 (예고 8·18초, 발동 10·20초)', () => {
    const sim = make();
    sim.runUntil(205);
    expect(eventsOf(sim, 'telegraph').map((e) => [e.id, e.t, e.fireAt])).toEqual([[1, 8, 10], [2, 18, 20]]);
    expect(eventsOf(sim, 'strike').map((e) => [e.id, e.t])).toEqual([[1, 10], [2, 20]]);
  });

  it('예고 중에 전열 사수(받는 피해 -50%) 카드로 대응하면 같은 시드에서 피해가 줄어든다', () => {
    const run = (withCard: boolean): { hit: number; col: number } => {
      const sim = make(withCard ? ['hold_the_line'] : []);
      sim.startCombat();
      sim.runUntil(81);
      const col = eventsOf(sim, 'telegraph')[0]?.cells[0]?.col as number;
      const target = sim.world.alliesOf(0).find((u) => u.cell.col === col);
      expect(target).toBeDefined();
      if (withCard) expect(sim.playCard(1, { kind: 'unit', uid: (target as { uid: number }).uid }).ok).toBe(true);
      sim.runUntil(100);
      const uid = (target as { uid: number }).uid;
      sim.step();
      return { hit: strikeDamage(sim.world.events).find((h) => h.unit === uid)?.amount ?? 0, col };
    };
    const plain = run(false);
    const guarded = run(true);
    expect(plain.hit).toBeGreaterThan(0);
    expect(guarded.hit).toBeGreaterThan(0);
    expect(guarded.hit).toBeLessThanOrEqual(Math.ceil(plain.hit / 2) + 1);
  });

  it('보스가 발동 전에 죽으면 예약된 강타는 취소되고, 같은 입력이면 로그가 같다', () => {
    const sim = make();
    sim.runUntil(81);
    const boss = unitOf(sim, 4);
    sim.world.dealDamage({ source: unitOf(sim, 0), target: boss, raw: 999999, type: 'magic' });
    expect(boss.alive).toBe(false);
    sim.runUntil(120);
    expect(eventsOf(sim, 'strike')).toHaveLength(0);

    const a = make().run();
    const b = make().run();
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });

  it('가장 많은 유닛이 선 열을 고르고 그 열 밖의 유닛은 피해를 받지 않는다', () => {
    const sim = make();
    for (const unit of sim.world.units) unit.statuses.addStun(1000); // 위치 고정
    sim.runUntil(81);
    expect(eventsOf(sim, 'telegraph')[0]?.cells.every((c) => c.col === 3)).toBe(true);
    sim.runUntil(101);
    expect(strikeDamage(sim.world.events).map((h) => h.unit).sort()).toEqual([0, 1, 2]);
    expect(unitOf(sim, 3).hp).toBe(unitOf(sim, 3).maxHp);
  });
});
