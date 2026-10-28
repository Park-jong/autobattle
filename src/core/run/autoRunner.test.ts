import { describe, expect, it } from 'vitest';
import { AutoRunner, type AutoRunOptions } from './autoRunner';
import { RunController } from './runController';
import { basicPlan, newRun, runDeps } from './testSupport';

function auto(seed: number, options: Partial<AutoRunOptions> = {}, deckPreset: 'starter' | 'test' = 'starter') {
  const run = RunController.create(runDeps, { seed, commanderId: 'cmd_harten', deckPreset });
  const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: seed, plan: basicPlan, ...options }).run();
  return { run, summary };
}

describe('헤드리스 자동 런', () => {
  it('여러 시드(첫 경로)에서 예외 없이 보스 처치 또는 사망으로 끝난다', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { run, summary } = auto(seed);
      expect(run.phase).toBe('ended');
      expect(['victory', 'dead']).toContain(summary.outcome);
      expect(summary.floorReached).toBeGreaterThanOrEqual(1);
      expect(summary.floorReached).toBeLessThanOrEqual(13);
      expect(summary.battles).toBe(summary.wins + summary.losses + summary.draws);
      if (summary.outcome === 'victory') {
        expect(summary.floorReached).toBe(13);
        expect(summary.hp).toBeGreaterThan(0);
        expect(summary.diedAt).toBeNull();
      } else {
        expect(summary.hp).toBe(0);
        expect(summary.diedAt).not.toBeNull();
      }
    }
  });

  it('무작위 경로·카드 미사용·확장 테스트 덱에서도 모든 런이 끝난다', () => {
    for (let seed = 20; seed < 26; seed++) {
      expect(['victory', 'dead']).toContain(auto(seed, { pathMode: 'random' }).summary.outcome);
      expect(['victory', 'dead']).toContain(auto(seed, { plan: null }).summary.outcome);
      expect(['victory', 'dead']).toContain(auto(seed, {}, 'test').summary.outcome);
    }
  });

  it('같은 시드·같은 정책이면 결과와 최종 저장 상태가 같다 (결정론)', () => {
    const a = auto(5, { pathMode: 'random' });
    const b = auto(5, { pathMode: 'random' });
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary));
    expect(JSON.stringify(a.run.serialize())).toBe(JSON.stringify(b.run.serialize()));
  });

  it('런이 끝난 뒤 저장해도 복원된다 (종료 상태 체크포인트)', () => {
    const { run } = auto(3);
    const restored = RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
    expect(restored.phase).toBe('ended');
    expect(restored.outcome).toBe(run.outcome);
    expect(restored.hp).toBe(run.hp);
  });

  it('안전 장치: 행동 한도를 넘기면 Error', () => {
    const run = newRun(1);
    expect(() => new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: 1, plan: null, maxSteps: 3 }).run()).toThrow(/끝나지 않았습니다/);
  });
});
