import { describe, expect, it } from 'vitest';
import { RUN } from './constants';
import { driveTo, finishBattle, newRunAs } from './testSupport';

describe('전투 승리 경험치', () => {
  it('상수: 일반 2 / 정예 4 / 보스 10', () => {
    expect(RUN.WIN_XP).toEqual({ normal: 2, elite: 4, boss: 10 });
  });

  it('일반 전투 승리: 경험치 +2 (정산 결과에 기록)', () => {
    const run = newRunAs('cmd_harten', 1);
    run.chooseNode(run.availableNodes()[0]!.id);
    const before = run.roster.snapshot();
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.xpGained).toBe(2);
    const after = run.roster.snapshot();
    expect([after.level, after.xp]).toEqual([before.level, before.xp + 2]); // 레벨 3 → 4는 4 XP 필요
  });

  it('패배·무승부는 경험치 없음', () => {
    for (const result of ['loss', 'draw'] as const) {
      const run = newRunAs('cmd_harten', 1);
      run.chooseNode(run.availableNodes()[0]!.id);
      const settle = finishBattle(run, result);
      expect(settle.ok && settle.settlement.xpGained).toBe(0);
      expect(run.roster.snapshot().xp).toBe(0);
    }
  });

  it('정예 승리 +4, 보스 승리 +10 (레벨업·이월)', () => {
    const elite = newRunAs('cmd_harten', 7);
    driveTo(elite, 'elite');
    const { level, xp } = elite.roster.snapshot();
    const settle = finishBattle(elite, 'win');
    expect(settle.ok && settle.settlement.xpGained).toBe(4);
    const snap = elite.roster.snapshot();
    expect(snap.level * 1000 + snap.xp).toBeGreaterThan(level * 1000 + xp);

    const boss = newRunAs('cmd_harten', 7);
    driveTo(boss, 'boss');
    const bossSettle = finishBattle(boss, 'win');
    expect(bossSettle.ok && bossSettle.settlement.xpGained).toBe(10);
  });
});
