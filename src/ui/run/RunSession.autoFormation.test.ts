import { describe, expect, it } from 'vitest';
import { createHarness } from './testSupport';

describe('런 자동 편성', () => {
  it('전투 준비에서 보유 유닛을 편성·저장하고 복원하며 전투 중에는 거부한다', () => {
    const h = createHarness();
    const feedback: string[] = [];
    h.battle.subscribeActionFeedback(cue => { if (cue.kind === 'event') feedback.push(cue.label); });
    h.session.startTestRun(1, { gold: 100, level: 4, units: [
      { unitId: 'grove_archer', star: 2, place: 'bench' },
      { unitId: 'legion_centurion', star: 1, place: 'bench' },
      { unitId: 'moss_warden', star: 1, place: 'bench' },
    ] });
    h.session.testCommand({ kind: 'jumpToBoss', viaCamp: false });
    const before = h.battle.snapshot().management!.state;
    h.battle.autoArrangeUnits();
    const after = h.battle.snapshot().management!.state;
    expect(after.population).toBe(4);
    expect(after.gold).toBe(before.gold);
    expect(after.pool).toEqual(before.pool);
    expect(after.board.length + after.bench.filter(Boolean).length).toBe(before.board.length + before.bench.filter(Boolean).length);
    expect(feedback[0]).toContain('자동 편성 완료');
    const saved = createHarness(h.storage);
    saved.session.continueRun();
    expect(saved.battle.snapshot().management!.state.board).toEqual(after.board);
    h.battle.autoArrangeUnits();
    expect(h.battle.snapshot().management!.state).toEqual(after);
    h.session.startBattle();
    const playing = h.battle.snapshot().management!.state;
    h.battle.autoArrangeUnits();
    expect(h.battle.snapshot().management!.state).toEqual(playing);
  });
});
