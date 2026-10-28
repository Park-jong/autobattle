import { describe, expect, it } from 'vitest';
import type { CombatSimulator } from './sim';
import { eventsOf, makeCardSim, unitOf, units, type Placement } from './testSupport';

const ALLY: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['arena_recruit', 1, 2, 2]];
const TWINS: readonly Placement[] = [['twin_ser', 1, 6, 1], ['twin_mir', 1, 6, 3]];
const SER = ALLY.length;
const MIR = ALLY.length + 1;

function make(extra: readonly Placement[] = [], hand: readonly string[] = [], seed = 5): CombatSimulator {
  return makeCardSim({ a: ALLY, b: [...TWINS, ...extra], hand, seed });
}

const kill = (sim: CombatSimulator, uid: number): void => {
  sim.world.dealDamage({ source: null, target: unitOf(sim, uid), raw: 1e9, type: 'magic' });
};

describe('쌍둥이 주술사 세르·미르 (twinRevive)', () => {
  it('데이터: 서로를 짝으로 하는 보스 전용 유닛 2기, 부활 3초·HP 50%', () => {
    const ser = units.get('twin_ser')!;
    const mir = units.get('twin_mir')!;
    expect([ser.boss, mir.boss]).toEqual([true, true]);
    expect(ser.pattern).toEqual({ kind: 'twinRevive', partner: 'twin_mir', windowSeconds: 3, reviveHpPct: 50 });
    expect(mir.pattern).toEqual({ kind: 'twinRevive', partner: 'twin_ser', windowSeconds: 3, reviveHpPct: 50 });
  });

  it('한쪽이 죽으면 부활 예고(남은 시간)를 내고, 3초 안에 짝이 죽지 않으면 최대 HP 50%로 부활한다', () => {
    const sim = make(['iron_shieldbearer'].map((u) => [u, 1, 4, 2] as Placement));
    sim.runUntil(5);
    kill(sim, SER);
    const [telegraph] = eventsOf(sim, 'reviveTelegraph');
    expect(telegraph).toEqual({ type: 'reviveTelegraph', t: 0.5, unit: SER, partner: MIR, fireAt: 3.5 });
    sim.runUntil(35); // 부활 틱(35)은 아직 처리 전
    expect(unitOf(sim, SER).alive).toBe(false);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
    sim.runUntil(36);
    const [revive] = eventsOf(sim, 'revive');
    const ser = unitOf(sim, SER);
    expect(revive).toMatchObject({ type: 'revive', t: 3.5, unit: SER, hp: Math.round(ser.maxHp / 2), maxHp: ser.maxHp, cell: { col: 6, row: 1 } });
    expect(ser.alive).toBe(true);
    expect(ser.hp).toBe(Math.round(ser.maxHp / 2));
    expect(ser.mana).toBeLessThanOrEqual(10); // 마나 0으로 시작 (부활 틱에 한 번 공격한 만큼만)
    expect(sim.world.board.occupantAt({ col: 6, row: 1 })).toBe(SER);
  });

  it('3초 안에 짝도 죽으면 부활은 취소되고 둘 다 처치된 것이다 (전멸이면 승리)', () => {
    const sim = make();
    sim.runUntil(3);
    kill(sim, SER);
    sim.runUntil(25); // 2.2초 뒤
    kill(sim, MIR);
    expect(eventsOf(sim, 'reviveCancel')).toEqual([{ type: 'reviveCancel', t: 2.5, unit: SER }]);
    expect(eventsOf(sim, 'reviveTelegraph')).toHaveLength(1); // 짝이 이미 죽은 상태의 사망은 새 예고를 만들지 않는다
    sim.runUntil(80);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
    expect(sim.world.alliesOf(1)).toHaveLength(0);
    expect(sim.finished).toBe(true);
    expect(sim.result().winner).toBe(0);
  });

  it('같은 틱에 둘이 죽어도(동시 처치) 부활하지 않는다', () => {
    const sim = make();
    sim.runUntil(4);
    kill(sim, SER);
    kill(sim, MIR);
    expect(eventsOf(sim, 'reviveCancel')).toHaveLength(1);
    sim.runUntil(60);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
    expect(sim.finished).toBe(true);
  });

  it('제한 시간(3초)이 지난 뒤 짝을 죽이면 이미 부활한 뒤라 새 부활 예고가 시작된다', () => {
    const sim = make([['iron_shieldbearer', 1, 4, 2]]);
    sim.runUntil(2);
    kill(sim, SER);
    sim.runUntil(40); // 3.8초 뒤: 세르는 이미 부활
    expect(eventsOf(sim, 'revive')).toHaveLength(1);
    kill(sim, MIR);
    expect(eventsOf(sim, 'reviveCancel')).toHaveLength(0);
    expect(eventsOf(sim, 'reviveTelegraph').map((e) => [e.unit, e.partner])).toEqual([[SER, MIR], [MIR, SER]]);
    sim.runUntil(75);
    expect(unitOf(sim, MIR).alive).toBe(true); // 미르도 부활
  });

  it('부활한 유닛은 상태가 초기화된다 (기절·보호막 없음)', () => {
    const sim = make([['iron_shieldbearer', 1, 4, 2]]);
    sim.runUntil(2);
    const ser = unitOf(sim, SER);
    ser.statuses.addStun(Infinity);
    ser.statuses.addShield(500, Infinity);
    kill(sim, SER);
    sim.runUntil(40);
    expect(ser.alive).toBe(true);
    expect(ser.statuses.isStunned()).toBe(false);
    expect(ser.statuses.shieldTotal()).toBe(0);
  });

  it('카드 처치: 화염 폭풍으로 한쪽만 맞히면 부활하고, 3초 안에 두 번째 폭풍으로 짝을 처치하면 취소된다', () => {
    const sim = make([['iron_shieldbearer', 1, 4, 2]], ['firestorm', 'firestorm']);
    sim.startCombat();
    sim.commandPoints?.gainCp(6, 'effect');
    unitOf(sim, SER).hp = 10;
    unitOf(sim, MIR).hp = 10;
    expect(sim.playCard(1, { kind: 'cell', cell: { col: 6, row: 0 } }).ok).toBe(true); // 세르(6,1)만 범위
    expect(unitOf(sim, SER).alive).toBe(false);
    expect(unitOf(sim, MIR).alive).toBe(true);
    sim.runUntil(20);
    expect(sim.playCard(2, { kind: 'cell', cell: { col: 6, row: 4 } }).ok).toBe(true); // 미르(6,3)만 범위
    expect(unitOf(sim, MIR).alive).toBe(false);
    expect(eventsOf(sim, 'reviveCancel')).toHaveLength(1);
    sim.runUntil(80);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
  });

  it('카드 처치: 3×3 범위에 둘이 함께 들어가면 한 장으로 동시에 처치된다 (범위 주문)', () => {
    const sim = make([], ['firestorm']);
    sim.startCombat();
    sim.commandPoints?.gainCp(3, 'effect');
    unitOf(sim, SER).hp = 10;
    unitOf(sim, MIR).hp = 10;
    expect(sim.playCard(1, { kind: 'cell', cell: { col: 6, row: 2 } }).ok).toBe(true); // (6,1)·(6,3)이 모두 3×3 안
    expect(sim.world.alliesOf(1)).toHaveLength(0);
    expect(eventsOf(sim, 'reviveCancel')).toHaveLength(1);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
  });

  it('부활 시점에 진영에 빈 칸이 없으면 부활하지 못하고 사유가 담긴 reviveCancel을 낸다', () => {
    const sim = make([['iron_shieldbearer', 1, 4, 2]]);
    sim.runUntil(2);
    kill(sim, SER);
    const board = sim.world.board;
    let fake = 900;
    for (let col = 4; col < 8; col++) {
      for (let row = 0; row < 5; row++) if (board.isFree({ col, row })) board.place(fake++, { col, row });
    }
    sim.runUntil(40);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
    expect(eventsOf(sim, 'reviveCancel')).toEqual([{ type: 'reviveCancel', t: 3.2, unit: SER, reason: 'noCell' }]);
    expect(unitOf(sim, SER).alive).toBe(false);
  });

  it('짝이 편성에 없으면 평범한 유닛처럼 죽는다 (예고·부활 없음)', () => {
    const sim = makeCardSim({ a: ALLY, b: [['twin_ser', 1, 6, 1], ['iron_shieldbearer', 1, 4, 2]], hand: [] });
    sim.runUntil(3);
    kill(sim, SER);
    sim.runUntil(60);
    expect(eventsOf(sim, 'reviveTelegraph')).toHaveLength(0);
    expect(eventsOf(sim, 'revive')).toHaveLength(0);
  });

  it('같은 입력이면 이벤트 로그가 JSON까지 같다', () => {
    const run = (): string => {
      const sim = make([['iron_shieldbearer', 1, 4, 2]]);
      sim.runUntil(10);
      kill(sim, SER);
      sim.runUntil(150);
      return JSON.stringify(sim.world.events);
    };
    expect(run()).toBe(run());
  });
});
