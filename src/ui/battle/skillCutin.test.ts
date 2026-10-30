import { describe, expect, it } from 'vitest';
import type { ReplayEffect } from '../replay/ReplayState';
import { ReplayState } from '../replay/ReplayState';
import { activeSkillCutins } from './skillCutin';

const replay = new ReplayState([0, 1, 2].map(unit => ({
  type: 'spawn' as const, t: 0, unit, unitId: 'iron_shieldbearer', side: unit === 2 ? 1 as const : 0 as const,
  star: 1, cell: { col: unit, row: 1 }, hp: 100, maxHp: 100, mana: 0, maxMana: 80,
})));
const views = new Map(replay.views().map(unit => [unit.uid, unit]));
const effects: ReplayEffect[] = [
  { kind: 'skill', seq: 3, t: 1, unit: 0, skill: '방패 밀치기' },
  { kind: 'skill', seq: 4, t: 1.2, unit: 1, skill: '방패 밀치기' },
  { kind: 'skill', seq: 5, t: 1.2, unit: 2, skill: '방패 밀치기' },
];

describe('스킬 컷인 동시 발동과 재생', () => {
  it('같은 진영의 연속 발동은 현재 컷인을 끊지 않고, 적군은 반대쪽에 함께 표시한다', () => {
    expect(activeSkillCutins(1.3, [...effects].reverse(), views).map(e => e.unit).sort()).toEqual([0, 2]);
    expect(activeSkillCutins(1.81, effects, views).map(e => e.unit).sort()).toEqual([1, 2]);
  });
  it('미래 이벤트와 만료한 이벤트는 표시하지 않고 오래된 스킬을 나중에 재생하지 않는다', () => {
    expect(activeSkillCutins(0.9, effects, views)).toEqual([]);
    expect(activeSkillCutins(2.1, effects, views)).toEqual([]);
    expect(activeSkillCutins(1.4, [{ kind: 'skill', seq: 9, t: 1, unit: 99, skill: '없음' }], views)).toEqual([]);
  });
  it('일시정지와 되감기에 같은 시각의 결과를 재현한다', () => {
    const before = activeSkillCutins(1.1, effects, views);
    activeSkillCutins(3, effects, views);
    expect(activeSkillCutins(1.1, effects, views)).toEqual(before);
    expect(activeSkillCutins(1.1, effects, views)).toEqual(before);
  });
});
