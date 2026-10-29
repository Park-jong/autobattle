import { describe, expect, it } from 'vitest';
import { cardCatalog } from '../../core/combat/testSupport';
import { explainUnplayable, type AvailabilityContext } from './cardAvailability';

const card = (id: string) => {
  const c = cardCatalog.get(id);
  if (!c) throw new Error(id);
  return c;
};
const ctx = (over: Partial<AvailabilityContext> = {}): AvailabilityContext => ({
  phase: 'combat',
  prepCp: 0,
  combatCp: 2,
  usesOf: () => 0,
  ...over,
});

describe('explainUnplayable', () => {
  it('연쇄 비용을 반영해 CP가 0이어도 전술 재정비를 허용한다', () => {
    expect(explainUnplayable(card('tactical_reorganization'), false, ctx({ combatCp: 0 }))).toContain('CP 부족');
    expect(explainUnplayable(card('tactical_reorganization'), false, ctx({ combatCp: 0, cardsPlayed: 1 }))).toBeNull();
    expect(explainUnplayable(card('tactical_reorganization'), true, ctx({ combatCp: 0, cardsPlayed: 1 }))).toBeNull();
  });
  it('쓸 수 있으면 null', () => {
    expect(explainUnplayable(card('hold_the_line'), false, ctx())).toBeNull();
    expect(explainUnplayable(card('war_drums'), false, ctx({ phase: 'prep', prepCp: 2 }))).toBeNull();
  });

  it('단계가 맞지 않으면 이유를 돌려준다', () => {
    expect(explainUnplayable(card('war_drums'), false, ctx())).toContain('준비 단계에서만');
    expect(explainUnplayable(card('hold_the_line'), false, ctx({ phase: 'prep', prepCp: 2 }))).toContain('전투 중에만');
    expect(explainUnplayable(card('hold_the_line'), false, ctx({ phase: 'ended' }))).toContain('끝났습니다');
  });

  it('CP 부족은 풀에 따라 다르게 표시하고 강화 비용을 반영한다', () => {
    expect(explainUnplayable(card('last_stand'), false, ctx({ combatCp: 1 }))).toBe('CP 부족 (필요 2, 보유 1)');
    expect(explainUnplayable(card('last_stand'), true, ctx({ combatCp: 1 }))).toBeNull();
    expect(explainUnplayable(card('war_drums'), false, ctx({ phase: 'prep', prepCp: 0 }))).toContain('준비 CP 부족');
  });

  it('써서 없애는 저주는 준비 단계에서 저주 전용 사유를 보여준다', () => {
    expect(explainUnplayable(card('rotten_supplies'), false, ctx({ phase: 'prep', prepCp: 2 }))).toBe('이 저주는 전투 중에만 비용을 내고 써서 없앨 수 있습니다');
    expect(explainUnplayable(card('rotten_supplies'), false, ctx())).toBeNull();
  });

  it('전투당 사용 제한을 소진하면 이유를 돌려준다', () => {
    expect(explainUnplayable(card('formation_swap'), false, ctx({ usesOf: () => 1 }))).toContain('전투당 1회');
  });
});
