import { describe, expect, it } from 'vitest';
import { CombatSimulator } from '../../core/combat/sim';
import { cardCatalog, formation, handSnapshot, traits, unitOf, units, type Placement } from '../../core/combat/testSupport';
import { ReplayState } from './ReplayState';

const ALLY: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['arena_recruit', 1, 2, 2]];
const SER = ALLY.length;
const MIR = ALLY.length + 1;

function sim(enemy: readonly Placement[]): CombatSimulator {
  return new CombatSimulator({ seed: 6, formations: [formation(ALLY), formation(enemy)], cards: { commander: null, deck: handSnapshot([]) } }, units, traits, cardCatalog);
}
const kill = (s: CombatSimulator, uid: number): void => { s.world.dealDamage({ source: null, target: unitOf(s, uid), raw: 1e9, type: 'magic' }); };

const TWINS: readonly Placement[] = [['twin_ser', 1, 6, 1], ['twin_mir', 1, 6, 3], ['iron_shieldbearer', 1, 4, 2]];

describe('쌍둥이 부활 표시 (ReplayState)', () => {
  it('한쪽이 죽으면 남은 시간이 줄어드는 부활 대기가 보이고, 부활하면 다시 살아난다', () => {
    const s = sim(TWINS);
    s.runUntil(5);
    kill(s, SER);
    s.runUntil(40);
    const replay = new ReplayState(s.events);
    replay.advanceTo(0.6);
    const [watch] = replay.reviveWatches();
    expect(watch).toMatchObject({ unit: SER, partner: MIR, startedAt: 0.5, fireAt: 3.5 });
    expect(watch!.remaining).toBeCloseTo(2.9);
    expect(replay.viewOf(SER)!.alive).toBe(false);
    replay.advanceTo(2);
    expect(replay.reviveWatches()[0]!.remaining).toBeCloseTo(1.5);
    expect(replay.reviveWatches()[0]!.progress).toBeCloseTo(0.5);
    replay.advanceTo(3.5);
    expect(replay.reviveWatches()).toEqual([]);
    const view = replay.viewOf(SER)!;
    expect(view.alive).toBe(true);
    expect(view.deadAt).toBeNull();
    expect(view.hp).toBe(Math.round(view.maxHp / 2));
    expect(view.cell).toEqual({ col: 6, row: 1 });
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toContain('revive');
  });

  it('3초 안에 짝도 죽으면 부활 대기가 사라지고 처치 확정 연출이 남는다 (부활하지 않음)', () => {
    const s = sim(TWINS.slice(0, 2));
    s.runUntil(5);
    kill(s, SER);
    s.runUntil(20);
    kill(s, MIR);
    s.runUntil(60);
    const replay = new ReplayState(s.events);
    replay.advanceTo(1.9);
    expect(replay.reviveWatches()).toHaveLength(1);
    replay.advanceTo(2.1);
    expect(replay.reviveWatches()).toEqual([]);
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toContain('reviveCancel');
    replay.advanceTo(5);
    expect(replay.viewOf(SER)!.alive).toBe(false);
  });

  it('빈 칸이 없어 부활이 실패하면(reviveCancel noCell) 부활 대기 표시가 사라진다', () => {
    const s = sim(TWINS);
    s.runUntil(5);
    kill(s, SER);
    for (let col = 4, uid = 900; col < 8; col++) {
      for (let row = 0; row < 5; row++) if (s.world.board.isFree({ col, row })) s.world.board.place(uid++, { col, row });
    }
    s.runUntil(40);
    const replay = new ReplayState(s.events);
    replay.advanceTo(3.3);
    expect(replay.reviveWatches()).toHaveLength(1);
    replay.advanceTo(3.6);
    expect(replay.reviveWatches()).toEqual([]);
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toContain('reviveCancel');
    expect(replay.viewOf(SER)!.alive).toBe(false);
  });

  it('reset하면 부활 대기도 처음 상태로 돌아간다', () => {
    const s = sim(TWINS);
    s.runUntil(5);
    kill(s, SER);
    s.runUntil(20);
    const replay = new ReplayState(s.events);
    replay.advanceTo(1.5);
    expect(replay.reviveWatches()).toHaveLength(1);
    replay.reset();
    replay.advanceTo(0.4);
    expect(replay.reviveWatches()).toEqual([]);
  });
});

describe('군주 페이즈 전환 표시 (ReplayState)', () => {
  const LORD: readonly Placement[] = [['legion_lord', 1, 4, 2]];

  it('페이즈 연출 이벤트와 증원 유닛 스폰, 아군 버프 해제가 재생된다', () => {
    const s = sim(LORD);
    s.runUntil(2);
    const ally = unitOf(s, 0);
    s.world.addShield(ally, 200, Infinity);
    ally.statuses.addStatMod({ stat: 'atk', pct: 30, flat: 0, until: s.world.now + 30, duration: 30, refreshOnKill: false });
    s.world.emit({ type: 'statusApplied', unit: 0, status: 'statMod:atk', duration: 30, source: null, value: 30 });
    s.world.emit({ type: 'statusApplied', unit: 0, status: 'statMod:as', duration: 30, source: null, value: -20 });
    s.runUntil(3);
    const boss = unitOf(s, ALLY.length);
    boss.hp = Math.round(boss.maxHp * 0.6);
    s.runUntil(6);

    const replay = new ReplayState(s.events);
    replay.advanceTo(0.25);
    expect(replay.viewOf(0)!.shield).toBe(200);
    expect(replay.viewOf(0)!.statuses.map((x) => x.name).sort()).toEqual(['statMod:arm', 'statMod:as', 'statMod:atk']); // arm은 특성이 준 영구 버프
    expect(replay.views().filter((v) => v.side === 1)).toHaveLength(1);
    replay.advanceTo(0.35);
    const phase = replay.recentEffects(0.5).find((e) => e.kind === 'phase');
    expect(phase).toMatchObject({ kind: 'phase', phase: 2, hpPct: 66, summoned: 2, dispelled: 1 });
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toContain('dispel');
    expect(replay.views().filter((v) => v.side === 1)).toHaveLength(3); // 증원 2기
    expect(replay.viewOf(0)!.shield).toBe(0);
    expect(replay.viewOf(0)!.statuses.map((x) => x.name).sort()).toEqual(['statMod:arm', 'statMod:as']); // 시간제 이로운 버프만 사라지고 약화·영구 효과는 남는다
  });
});
