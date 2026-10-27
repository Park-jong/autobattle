import { describe, expect, it } from 'vitest';
import { assertFormationValid } from '../core/combat';
import { DEFAULT_COMMANDER_ID, loadGameData } from './gameData';

describe('loadGameData', () => {
  const data = loadGameData();

  it('지휘관과 시작 편성을 함께 불러온다', () => {
    expect(data.commanders.get('cmd_harten')).toBeDefined();
    const start = data.startFormations.get('cmd_harten');
    expect(start).toBeDefined();
    assertFormationValid(0, start ?? [], data.units);
  });

  it('기본 지휘관은 하르텐이다', () => {
    expect(DEFAULT_COMMANDER_ID).toBe('cmd_harten');
    expect(data.defaultCommanderId).toBe('cmd_harten');
  });

  it('5연전 적 편성은 5개이고 유효하며 점점 강해진다 (유닛 수는 늘고 성급 합계는 줄지 않음)', () => {
    expect(data.seriesStages).toHaveLength(5);
    const power = data.seriesStages.map((s) => {
      assertFormationValid(1, s.enemy, data.units);
      return { count: s.enemy.length, stars: s.enemy.reduce((sum, e) => sum + e.star, 0) };
    });
    for (let i = 1; i < power.length; i++) {
      expect(power[i]?.count).toBeGreaterThan(power[i - 1]?.count ?? 0);
      expect(power[i]?.stars).toBeGreaterThanOrEqual(power[i - 1]?.stars ?? 0);
    }
    // 새 유닛(점화사·속삭임꾼)이 후반 판에 포함된다
    const ids = data.seriesStages.flatMap((s) => s.enemy.map((e) => e.unitId));
    expect(ids).toContain('ember_kindler');
    expect(ids).toContain('abyss_whisperer');
    expect(data.seriesStages.every((s) => s.name.length > 0)).toBe(true);
  });
});
