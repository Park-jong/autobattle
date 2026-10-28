import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../../core/combat/events';
import { driveTo, newRun } from '../../core/run/testSupport';
import { ReplayState } from './ReplayState';

const COLUMN = Array.from({ length: 5 }, (_, row) => ({ col: 3, row }));

const telegraph = (t: number, id: number, fireAt: number): CombatEvent => ({ t, type: 'telegraph', id, source: 9, pattern: 'columnStrike', cells: COLUMN, fireAt });
const strike = (t: number, id: number): CombatEvent => ({ t, type: 'strike', id, source: 9, cells: COLUMN });

describe('보스 예고(telegraph) 표시 상태', () => {
  it('예고 시각부터 발동 시각 직전까지만 유효하고 진행률이 오른다', () => {
    const replay = new ReplayState([telegraph(8, 1, 10), strike(10, 1)]);
    replay.advanceTo(7.9);
    expect(replay.telegraphs()).toEqual([]);
    replay.advanceTo(8);
    expect(replay.telegraphs()).toHaveLength(1);
    expect(replay.telegraphs()[0]).toMatchObject({ id: 1, fireAt: 10, startedAt: 8, progress: 0 });
    expect(replay.telegraphs()[0]!.cells).toEqual(COLUMN);
    replay.advanceTo(9);
    expect(replay.telegraphs()[0]!.progress).toBeCloseTo(0.5);
    replay.advanceTo(9.95);
    expect(replay.telegraphs()[0]!.progress).toBeCloseTo(0.975);
    replay.advanceTo(10);
    expect(replay.telegraphs()).toEqual([]);
  });

  it('발동(strike)은 연출 이벤트로 남고 예고는 사라진다', () => {
    const replay = new ReplayState([telegraph(8, 1, 10), strike(10, 1), telegraph(18, 2, 20)]);
    replay.advanceTo(10);
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toEqual(['strike']);
    expect(replay.telegraphs()).toEqual([]);
    replay.advanceTo(18.5);
    expect(replay.telegraphs().map((t) => t.id)).toEqual([2]);
  });

  it('예고만 있고 발동이 아직 오지 않았어도 시각이 지나면 강조를 끈다 (보스 사망 등)', () => {
    const replay = new ReplayState([telegraph(8, 1, 10)]);
    replay.advanceTo(9);
    expect(replay.telegraphs()).toHaveLength(1);
    replay.advanceTo(11);
    expect(replay.telegraphs()).toEqual([]);
  });

  it('reset하면 예고도 처음 상태로 돌아간다', () => {
    const replay = new ReplayState([telegraph(0, 1, 2)]);
    replay.advanceTo(1);
    expect(replay.telegraphs()).toHaveLength(1);
    replay.reset();
    replay.advanceTo(0);
    expect(replay.telegraphs()).toHaveLength(1);
    replay.advanceTo(2);
    expect(replay.telegraphs()).toEqual([]);
  });

  it('실제 보스 전투 로그에서 예고(8초)와 발동(10초)이 재생 시각을 따라간다', () => {
    const run = newRun(5);
    driveTo(run, 'boss');
    const sim = run.createSimulator();
    sim.startCombat();
    sim.runUntil(130);
    const replay = new ReplayState(sim.events);
    replay.advanceTo(7.9);
    expect(replay.telegraphs()).toEqual([]);
    replay.advanceTo(9);
    const [active] = replay.telegraphs();
    expect(active).toBeDefined();
    expect(active!.fireAt).toBeCloseTo(10);
    expect(new Set(active!.cells.map((c) => c.col)).size).toBe(1);
    expect(active!.cells).toHaveLength(5);
    replay.advanceTo(10.05);
    expect(replay.telegraphs()).toEqual([]);
    expect(replay.recentEffects(0.5).some((e) => e.kind === 'strike')).toBe(true);
  });
});
