import { describe, expect, it } from 'vitest';
import type { ReplayEffect, UnitView } from '../replay/ReplayState';
import { CharacterMomentsState } from './CharacterMomentsState';

function unit(uid: number, unitId: string, side: 0 | 1 = 0): UnitView {
  const cell = { col: side === 0 ? 2 : 5, row: uid % 5 };
  return {
    uid, unitId, side, star: 1, hp: 100, maxHp: 100, shield: 0, mana: 0, maxMana: 50,
    alive: true, deadAt: null, cell, pos: cell, moveFrom: cell, moveTo: cell,
    moveProgress: 0, statuses: [], marked: false,
  };
}

const VIEWS = [unit(0, 'iron_shieldbearer'), unit(1, 'arena_recruit'), unit(2, 'shade_dagger', 1)];
type Input = Parameters<CharacterMomentsState['update']>[0];
function input(overrides: Partial<Input> = {}): Input {
  return { phase: 'playing', combatTime: 0, delta: .1, timeScale: 1, views: VIEWS, effects: [], ...overrides };
}
function cast(seq = 10, uid = 0): ReplayEffect { return { kind: 'skill', seq, unit: uid, t: 0, skill: '방패 밀치기' }; }
function advance(state: CharacterMomentsState, seconds: number, overrides: Partial<Input> = {}): void {
  for (let i = 0; i < Math.round(seconds * 10); i++) state.update(input(overrides));
}

describe('CharacterMomentsState', () => {
  it('opens with an allied call and a delayed answer from a different agent', () => {
    const state = new CharacterMomentsState();
    state.update(input());
    expect(state.bubbles.map((bubble) => bubble.uid)).toEqual([0]);
    advance(state, 1.4);
    expect(state.bubbles.map((bubble) => bubble.uid)).toEqual([0, 1]);
  });

  it('deduplicates overlapping replay windows even after the portrait cooldown expires', () => {
    const state = new CharacterMomentsState();
    state.update(input({ effects: [cast()] }));
    const id = state.cutIn!.id;
    advance(state, 8, { effects: [cast()] });
    expect(state.cutIn).toBeNull();
    state.update(input({ effects: [cast(11)] }));
    expect(state.cutIn?.id).not.toBe(id);
    expect(state.cutIn?.uid).toBe(0);
  });

  it('prefers an allied simultaneous cast and discards excess portraits instead of queuing them', () => {
    const state = new CharacterMomentsState();
    state.update(input({ effects: [cast(10, 2), cast(11, 1), cast(12, 0)] }));
    expect(state.cutIn?.uid).toBe(1);
    advance(state, 2.5);
    expect(state.cutIn).toBeNull();
    state.update(input({ effects: [cast(13)] }));
    expect(state.cutIn).toBeNull();
    advance(state, 3.2);
    state.update(input({ effects: [cast(14, 2)] }));
    expect(state.cutIn?.side).toBe(1);
  });

  it('freezes chatter and portraits during pause and card-hold time stop', () => {
    const state = new CharacterMomentsState();
    state.update(input({ effects: [cast()] }));
    advance(state, .5);
    const frozen = { now: state.now, bubbles: [...state.bubbles], cutIn: { ...state.cutIn! } };
    advance(state, 8, { phase: 'paused', effects: [cast()] });
    advance(state, 8, { timeScale: 0, effects: [cast()] });
    expect(state.now).toBe(frozen.now);
    expect(state.bubbles).toEqual(frozen.bubbles);
    expect(state.cutIn).toEqual(frozen.cutIn);
    advance(state, 2);
    expect(state.cutIn).toBeNull();
  });

  it('keeps ×4 cut-ins readable and follows slow motion', () => {
    const normal = new CharacterMomentsState();
    const fast = new CharacterMomentsState();
    const slow = new CharacterMomentsState();
    for (const state of [normal, fast, slow]) state.update(input({ effects: [cast()] }));
    advance(normal, 1);
    advance(fast, 1, { timeScale: 4 });
    advance(slow, 1, { timeScale: .25 });
    expect(fast.now).toBeCloseTo(normal.now);
    expect(slow.now).toBeCloseTo(normal.now * .25);
    expect(fast.cutIn).not.toBeNull();
  });

  it('removes a fallen speaker and cancels their scheduled reply', () => {
    const state = new CharacterMomentsState();
    state.update(input());
    const fallen = VIEWS.map((view) => ({ ...view, alive: view.side === 1, hp: view.side === 1 ? 100 : 0 }));
    advance(state, 2, { views: fallen, effects: [{ kind: 'death', seq: 20, t: 0, unit: 0 }] });
    expect(state.bubbles).toEqual([]);
  });

  it('clears presentation on reset and accepts reused event sequence numbers in the next battle', () => {
    const state = new CharacterMomentsState();
    state.update(input({ effects: [cast()] }));
    const oldId = state.cutIn!.id;
    state.update(input({ phase: 'edit' }));
    expect(state.bubbles).toEqual([]);
    expect(state.cutIn).toBeNull();
    state.update(input({ effects: [cast()] }));
    expect(state.cutIn?.id).not.toBe(oldId);
    expect(state.cutIn?.skill).toBe('방패 밀치기');
  });

  it('also resets when the combat clock goes backward between series rounds', () => {
    const state = new CharacterMomentsState();
    state.update(input({ combatTime: 10, effects: [cast(100)] }));
    state.update(input({ combatTime: 0, effects: [cast(1)] }));
    expect(state.now).toBe(0);
    expect(state.cutIn?.id).toBeGreaterThan(2);
  });

  it('shows the surviving team conclusion once and fades out after combat time stops', () => {
    const state = new CharacterMomentsState();
    state.update(input());
    const survivors = VIEWS.map((view) => ({ ...view, alive: view.side === 0 }));
    state.update(input({ phase: 'finished', views: survivors }));
    expect(state.bubbles).toHaveLength(1);
    const id = state.bubbles[0]!.id;
    advance(state, 1, { phase: 'finished', views: survivors });
    expect(state.bubbles[0]?.id).toBe(id);
    advance(state, 3, { phase: 'finished', views: survivors });
    expect(state.bubbles).toEqual([]);
  });

  it('bounds dialogue and portrait frequency under a flood of skill events', () => {
    const state = new CharacterMomentsState();
    let count = 0, lastId = -1;
    for (let frame = 0; frame < 120; frame++) {
      state.update(input({ combatTime: frame * .1, effects: [cast(frame, frame % 3)] }));
      expect(state.bubbles.length).toBeLessThanOrEqual(2);
      if (state.cutIn && state.cutIn.id !== lastId) { lastId = state.cutIn.id; count++; }
    }
    expect(count).toBe(3);
  });
});
