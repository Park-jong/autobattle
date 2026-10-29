import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../../core/combat/events';
import { cardCatalog } from '../../core/combat/testSupport';
import { fixtureCard, fixtureCatalog } from '../../core/cards/testSupport';
import { explainUnplayable } from '../cards/cardAvailability';
import { cardTags } from '../cards/cardLabels';
import { ReplayState } from './ReplayState';

const spawn = (unit: number, side: 0 | 1, col: number): CombatEvent =>
  ({ t: 0, type: 'spawn', unit, unitId: 'iron_shieldbearer', side, star: 1, cell: { col, row: 2 }, hp: 650, maxHp: 650, mana: 0, maxMana: 80 });
const cells = [{ col: 4, row: 1 }, { col: 4, row: 2 }];

describe('M5-4 2부-A 연출 이벤트 재생 (ReplayState)', () => {
  it('조건부 추가 피해는 bonus 표시가 붙은 연출이 된다', () => {
    const replay = new ReplayState([
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 0.5, type: 'damage', unit: 1, source: null, amount: 240, absorbed: 0, dmgType: 'magic', hp: 410, bonus: true },
      { t: 0.6, type: 'damage', unit: 1, source: null, amount: 100, absorbed: 0, dmgType: 'magic', hp: 310 },
    ]);
    replay.advanceTo(1);
    const [a, b] = replay.recentEffects(2).filter((e) => e.kind === 'damage');
    expect(a).toMatchObject({ amount: 240, bonus: true });
    expect(b).not.toHaveProperty('bonus');
  });

  it('카드 지연 타격(source -1): 예고 후 발동하면 예고가 사라지고 번쩍임이 남는다', () => {
    const replay = new ReplayState([
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 1, type: 'telegraph', id: 1000, source: -1, pattern: 'card', label: '예언된 재앙', cells, fireAt: 4 },
      { t: 4, type: 'strike', id: 1000, source: -1, cells },
    ]);
    replay.advanceTo(2);
    expect(replay.telegraphs()).toMatchObject([{ id: 1000, label: '예언된 재앙', fireAt: 4 }]);
    replay.advanceTo(4.1);
    expect(replay.telegraphs()).toEqual([]);
    expect(replay.recentEffects(1).some((e) => e.kind === 'strike')).toBe(true);
  });

  it('지속 피해 장판: 깔려 있는 동안 zones()에 나오고 피해 순간마다 번쩍임 연출이 생긴다', () => {
    const replay = new ReplayState([
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 1, type: 'zoneStart', id: 1, cells, endAt: 6, intervalSeconds: 1 },
      { t: 2, type: 'zonePulse', id: 1 },
    ]);
    replay.advanceTo(2.5);
    expect(replay.zones()).toMatchObject([{ id: 1, endAt: 6, pulseProgress: 0.5 }]);
    expect(replay.recentEffects(1).find((e) => e.kind === 'zonePulse')).toMatchObject({ cells });
    replay.advanceTo(6.1);
    expect(replay.zones()).toEqual([]);
    replay.reset();
    expect(replay.zones()).toEqual([]);
  });

  it('장비 부활(inPlace): 쓰러진 것으로 처리하지 않고 HP만 바꾸며 상태·위치는 그대로, phoenix 연출', () => {
    const replay = new ReplayState([
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 0.5, type: 'statusApplied', unit: 0, status: 'reviveOnce', duration: 'combat', source: null, value: 40 },
      { t: 1, type: 'damage', unit: 0, source: 1, amount: 700, absorbed: 0, dmgType: 'physical', hp: 0 },
      { t: 1, type: 'revive', unit: 0, hp: 260, maxHp: 650, cell: { col: 3, row: 2 }, inPlace: true },
      { t: 1, type: 'statusRemoved', unit: 0, status: 'reviveOnce' },
    ]);
    replay.advanceTo(1.1);
    const view = replay.viewOf(0)!;
    expect(view).toMatchObject({ alive: true, hp: 260 });
    expect(view.statuses.map((s) => s.name)).not.toContain('reviveOnce');
    expect(replay.recentEffects(1).some((e) => e.kind === 'phoenix')).toBe(true);
    expect(replay.recentEffects(1).some((e) => e.kind === 'death')).toBe(false);
  });

  it('저주 발동·지휘관 HP 회복 예약이 연출이 된다', () => {
    const replay = new ReplayState([
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 1, type: 'curseTriggered', cardId: 'wound', instanceId: 4 },
      { t: 1.5, type: 'commanderHeal', amount: 5, cardId: 'heal5', instanceId: 2 },
    ]);
    replay.advanceTo(2);
    const kinds = replay.recentEffects(3).map((e) => e.kind);
    expect(kinds).toContain('curse');
    expect(kinds).toContain('commanderHeal');
  });
});

describe('저주 카드 손패 표시', () => {
  const catalog = fixtureCatalog([
    fixtureCard('fear', { type: 'curse', cost: 0, effects: [] }),
    fixtureCard('rot', { type: 'curse', cost: 1, keywords: ['exhaust'], effects: [], curse: { playable: true } }),
  ]);
  const ctx = { phase: 'combat' as const, prepCp: 0, combatCp: 2, usesOf: () => 0 };

  it('사용 불가 저주는 사유와 "사용 불가" 태그가 붙는다', () => {
    expect(explainUnplayable(catalog.get('fear')!, false, ctx)).toContain('저주 카드는 사용할 수 없습니다');
    expect(cardTags(catalog.get('fear')!)).toContain('사용 불가');
  });

  it('써서 없앨 수 있는 저주는 전투 중 CP가 있으면 사용 가능, 부족하면 CP 사유', () => {
    expect(explainUnplayable(catalog.get('rot')!, false, ctx)).toBeNull();
    expect(explainUnplayable(catalog.get('rot')!, false, { ...ctx, combatCp: 0 })).toContain('CP 부족');
    expect(explainUnplayable(catalog.get('rot')!, false, { ...ctx, phase: 'prep' })).toContain('전투 중에만');
    expect(cardTags(catalog.get('rot')!)).not.toContain('사용 불가');
  });

  it('기존 카탈로그 카드의 사유는 그대로다', () => {
    expect(explainUnplayable(cardCatalog.get('hold_the_line')!, false, ctx)).toBeNull();
  });
});
