/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import commandersJson from '../../../data/commanders.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { loadCards } from './cardLoader';
import { loadCommanders } from './commanderLoader';
import { loadTraits } from './traitLoader';
import { loadUnits } from './unitLoader';

const traits = loadTraits(traitsJson);
const cards = loadCards(cardsJson, traits);
const units = loadUnits(unitsJson, traits);
const catalog = loadCommanders(commandersJson, cards, units);

function errorOf(mutate: (d: any) => void): string {
  const d: any = structuredClone(commandersJson);
  mutate(d);
  try {
    loadCommanders(d, cards, units);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

const deckCounts = (id: string): Record<string, number> =>
  Object.fromEntries((catalog.get(id)?.startingDeck ?? []).map((e) => [e.cardId, e.count]));
const deckSize = (id: string): number => (catalog.get(id)?.startingDeck ?? []).reduce((sum, e) => sum + e.count, 0);

describe('지휘관 3명 데이터 (CHARACTERS 3장)', () => {
  it('하르텐 · 이세라 · 녹스가 모두 있다', () => {
    expect(catalog.commanders.map((c) => c.id)).toEqual(['cmd_harten', 'cmd_isera', 'cmd_nox']);
  });

  it('이세라: 주문 피해 +25%, 시작 CP +1, 잿불 점화사 + 숲 궁수, 덱 10장', () => {
    const isera = catalog.get('cmd_isera')!;
    expect(isera.passive).toMatchObject({ name: '화로의 불씨', spellDamagePct: 25, effects: [] });
    expect(isera.startCpBonus).toBe(1);
    expect(isera.startingUnits).toEqual([{ unitId: 'ember_kindler', count: 1 }, { unitId: 'grove_archer', count: 1 }]);
    expect(deckSize('cmd_isera')).toBe(10);
    expect(deckCounts('cmd_isera')).toEqual({
      ember_arrow: 3, mana_infusion: 2, tactical_reorganization: 2, firestorm: 1, war_drums: 1, focus_fire: 1,
    });
    expect(isera.unlock).toBe('런 1회 완료 (승패 무관)');
    expect(isera.ultimate?.barrage).toMatchObject({ count: 3, intervalSeconds: 1, radius: 1 });
    expect(isera.ultimate?.barrage?.effects[0]).toMatchObject({ kind: 'flatDamage', amount: 250, dmgType: 'magic' });
  });

  it('녹스: 남은 CP 1당 1G, 그림자 단검 ×2, 덱 10장, 대가 지불', () => {
    const nox = catalog.get('cmd_nox')!;
    expect(nox.passive).toMatchObject({ name: '미지불 잔액', goldPerLeftoverCp: 1, effects: [] });
    expect(nox.startingUnits).toEqual([{ unitId: 'shade_dagger', count: 2 }]);
    expect(deckSize('cmd_nox')).toBe(10);
    expect(deckCounts('cmd_nox')).toEqual({
      blood_price: 2, abyss_pact: 2, focus_fire: 2, charge_signal: 1, call_reserves: 1, tactical_reorganization: 1, last_stand: 1,
    });
    expect(nox.unlock).toBe('액트 2 보스 처치');
    expect(nox.ultimate).toMatchObject({ hpCostPct: 10, cpRegenBoostSeconds: 5 });
    expect(nox.ultimate?.effects).toEqual([{ kind: 'lifesteal', selector: 'allAllies', pct: 25, duration: 5 }]);
  });

  it('하르텐 궁극기: 받는 피해 -40% 4초 + 전열 도발', () => {
    const harten = catalog.get('cmd_harten')!;
    expect(harten.ultimate?.effects).toEqual([
      { kind: 'damageTakenMult', selector: 'allAllies', mult: 0.6, duration: 4 },
      { kind: 'taunt', selector: 'alliesFrontRow', radius: 2, duration: 4 },
    ]);
    expect(harten.passive.spellDamagePct).toBeUndefined();
  });

  it('피의 대가: 0CP 명령, 지휘관 HP 2 소모, 아군 1명 4초간 ATK +40%, 녹스 고유', () => {
    expect(cards.get('blood_price')).toMatchObject({
      owner: 'cmd_nox', type: 'command', cost: 0, target: { kind: 'allyUnit' }, commanderHpCost: { amount: 2 },
      effects: [{ kind: 'statMod', selector: 'target', stat: 'atk', pct: 40, duration: 4 }],
    });
  });

  it('고유 카드는 다른 지휘관 덱에 넣을 수 없다', () => {
    expect(errorOf((d) => { d.commanders[0].startingDeck[0].cardId = 'blood_price'; })).toContain('owner가 cmd_nox라서 cmd_harten의 덱에 넣을 수 없음');
  });
});

describe('궁극기·패시브 검증', () => {
  it('음수·0·잘못된 필드를 위치와 함께 거부한다', () => {
    expect(errorOf((d) => { d.commanders[2].ultimate.hpCostPct = 0; })).toContain('commanders[2] (cmd_nox).ultimate.hpCostPct: 1 이상이어야 함');
    expect(errorOf((d) => { d.commanders[2].ultimate.hpCostPct = 150; })).toContain('hpCostPct: 100 이하여야 함');
    expect(errorOf((d) => { d.commanders[2].ultimate.extra = 1; })).toContain('commanders[2] (cmd_nox).ultimate.extra: 알 수 없는 필드');
    expect(errorOf((d) => { d.commanders[1].passive.spellDamagePct = -5; })).toContain('passive.spellDamagePct');
    expect(errorOf((d) => { d.commanders[2].passive.goldPerLeftoverCp = 1.5; })).toContain('passive.goldPerLeftoverCp: 정수여야 함');
  });

  it('궁극기 효과도 공통 효과 검증기를 쓴다 (성급 배열·대상 의존 선택자 거부)', () => {
    expect(errorOf((d) => { d.commanders[0].ultimate.effects[0].mult = [0.6, 0.5, 0.4]; })).toContain('ultimate.effects[0].mult: 이 위치에서는 성급별 배열');
    expect(errorOf((d) => { d.commanders[0].ultimate.effects[0].selector = 'target'; })).toContain('ultimate.effects[0].selector');
    expect(errorOf((d) => { d.commanders[0].ultimate.effects[1].radius = 0; })).toContain('ultimate.effects[1].radius: 1 이상이어야 함');
  });

  it('운석 효과는 범위 선택자를 쓰고, 카드 전용·시전자 전용 효과는 거부한다', () => {
    expect(errorOf((d) => { d.commanders[1].ultimate.barrage.effects = []; })).toContain('barrage.effects: 효과가 최소 1개 필요함');
    expect(errorOf((d) => { d.commanders[1].ultimate.barrage.count = 0; })).toContain('barrage.count: 1 이상이어야 함');
    expect(errorOf((d) => { d.commanders[1].ultimate.barrage.effects[0] = { kind: 'damage', selector: 'enemiesInTargetArea', pctAtk: 100, dmgType: 'magic' }; })).toContain('damage는 시전자의 ATK가 필요해');
  });
});
