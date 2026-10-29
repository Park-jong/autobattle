import { describe, expect, it } from 'vitest';
import unitsJson from '../../../../data/units.json';
import type { UnitDef } from '../../../core/data/unit';
import { buildUnitInfo, hasStarValues, sellRefund, skillTextForStar, starHpAtk, statusLabel } from './unitInfoView';

const units = (unitsJson as unknown as { units: UnitDef[] }).units;
const def = (id: string): UnitDef => units.find((u) => u.id === id)!;
const names = { traitName: (id: string) => `[${id}]` };

describe('skillTextForStar', () => {
  it('"a / b / c" 표기를 성급 값으로 바꾼다 (단위·% 유지)', () => {
    const text = '앞의 적에게 ATK 150% 물리 피해 + 기절 1 / 1.25 / 1.5초.';
    expect(skillTextForStar(text, 1)).toBe('앞의 적에게 ATK 150% 물리 피해 + 기절 1초.');
    expect(skillTextForStar(text, 3)).toBe('앞의 적에게 ATK 150% 물리 피해 + 기절 1.5초.');
    expect(skillTextForStar('무작위 적 2/3/4명에게 마법 피해 60/90/150 + 속박 1.5초.', 2)).toBe('무작위 적 3명에게 마법 피해 90 + 속박 1.5초.');
    expect(skillTextForStar('ATK 120/150/200% 피해', 2)).toBe('ATK 150% 피해');
  });

  it('값 표기가 없으면 그대로', () => {
    expect(hasStarValues('ATK 200% 피해')).toBe(false);
    expect(skillTextForStar('ATK 200% 피해', 3)).toBe('ATK 200% 피해');
  });

  it('상점 유닛 30종 모두 성급별 설명을 만들 수 있다', () => {
    for (const unit of units.filter((u) => !u.boss)) {
      const info = buildUnitInfo(unit, 2, names);
      expect(info.skillLines.length === 3 || info.skillLines.length === 1, unit.id).toBe(true);
      expect(info.skillLines.some((l) => l.current), unit.id).toBe(true);
    }
  });
});

describe('buildUnitInfo', () => {
  it('성급 배율을 HP·ATK에 반영하고 기원·직업 이름을 붙인다', () => {
    const shield = def('iron_shieldbearer');
    const info = buildUnitInfo(shield, 2, names);
    expect(info.stats.find((s) => s.key === 'hp')?.value).toBe(String(starHpAtk(shield, 2).hp));
    expect(info.stats.find((s) => s.key === 'hp')?.value).toBe('1170');
    expect(info.traits).toEqual(['[iron_legion]', '[guardian]']);
    expect(info.skillLines.map((l) => l.current)).toEqual([false, true, false]);
  });

  it('실제 전투 수치를 주면 그 값을 쓴다', () => {
    const info = buildUnitInfo(def('iron_shieldbearer'), 1, names, { hp: 777, atk: 55 });
    expect(info.stats.slice(0, 2).map((s) => s.value)).toEqual(['777', '55']);
  });
});

describe('보조 함수', () => {
  it('판매 환급은 Management.sell과 같은 식', () => {
    expect(sellRefund(1, 1)).toBe(1);
    expect(sellRefund(2, 2)).toBe(5);
    expect(sellRefund(3, 3)).toBe(26);
  });

  it('상태 이름을 한국어로', () => {
    expect(statusLabel('stun')).toBe('기절');
    expect(statusLabel('statMod:atk')).toBe('능력치 변화 (atk)');
    expect(statusLabel('unknown')).toBe('unknown');
  });
});
