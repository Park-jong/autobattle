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

describe('loadCommanders', () => {
  it('실제 data/commanders.json: 하르텐', () => {
    const catalog = loadCommanders(commandersJson, cards, units);
    expect(catalog.size).toBe(3);
    const harten = catalog.get('cmd_harten');
    expect(harten?.name).toContain('하르텐');
    expect(harten?.startCpBonus).toBe(0);
    expect(harten?.passive.name).toBe('철의 서약');
    expect(harten?.passive.effects).toEqual([
      { kind: 'shield', selector: 'alliesFrontRow', pctMaxHp: 10, duration: 'combat' },
    ]);
    expect(harten?.startingUnits).toEqual([{ unitId: 'iron_shieldbearer', count: 2 }]);
  });

  it('시작 덱은 10장이고 구성이 CHARACTERS 3-1과 같다', () => {
    const deck = loadCommanders(commandersJson, cards, units).get('cmd_harten')?.startingDeck ?? [];
    expect(deck.reduce((sum, e) => sum + e.count, 0)).toBe(10);
    const counts = Object.fromEntries(deck.map((e) => [e.cardId, e.count]));
    expect(counts).toEqual({
      shield_formation: 2,
      hold_the_line: 2,
      war_drums: 2,
      formation_swap: 1,
      focus_fire: 1,
      last_stand: 1,
      charge_signal: 1,
    });
  });

  it('없는 카드 id / 없는 유닛 id', () => {
    expect(errorOf((d) => (d.commanders[0].startingDeck[0].cardId = 'ghost'))).toContain(
      'commanders[0] (cmd_harten).startingDeck[0].cardId: cards.json에 없는 카드 id "ghost"',
    );
    expect(errorOf((d) => (d.commanders[0].startingUnits[0].unitId = 'ghost'))).toContain('startingUnits[0].unitId: units.json에 없는');
  });

  it('다른 지휘관 전용 카드는 덱에 넣을 수 없다', () => {
    const otherCards = loadCards(
      { version: 1, cards: [{ ...(cardsJson.cards[0] as object), owner: 'cmd_other' }, ...cardsJson.cards.slice(1)] },
      traits,
    );
    expect(() => loadCommanders(commandersJson, otherCards, units)).toThrow('owner가 cmd_other');
  });

  it('필수 필드와 형식 오류', () => {
    expect(errorOf((d) => delete d.commanders[0].passive)).toContain('commanders[0] (cmd_harten).passive: 필수 필드 누락');
    expect(errorOf((d) => delete d.commanders[0].startCpBonus)).toContain('startCpBonus: 필수 필드 누락');
    expect(errorOf((d) => (d.commanders[0].startingDeck = []))).toContain('startingDeck: 최소 1개');
    expect(errorOf((d) => (d.commanders[0].startingDeck[0].count = 0))).toContain('startingDeck[0].count');
    expect(errorOf((d) => d.commanders[0].startingDeck.push({ cardId: 'war_drums', count: 1 }))).toContain('중복된 id');
    expect(errorOf((d) => (d.commanders[0].extra = 1))).toContain('알 수 없는 필드');
  });

  it('중복 id', () => {
    expect(errorOf((d) => d.commanders.push(structuredClone(d.commanders[0])))).toContain('중복된 id "cmd_harten"');
  });

  it('패시브 효과는 공통 효과 검증기를 쓰며 성급 배열·대상 의존 효과는 거부', () => {
    expect(
      errorOf((d) => (d.commanders[0].passive.effects[0].pctMaxHp = [10, 20, 30])),
    ).toContain('passive.effects[0].pctMaxHp: 이 위치에서는 성급별 배열');
    expect(errorOf((d) => (d.commanders[0].passive.effects[0].selector = 'target'))).toContain('selector');
    expect(errorOf((d) => (d.commanders[0].passive.effects[0].kind = 'nuke'))).toContain('알 수 없는 값 "nuke"');
    // 패시브 효과가 비어도 된다 (이세라·녹스는 효과 없이 보정 필드만 쓴다)
    expect(() => loadCommanders(structuredClone(Object.assign({}, commandersJson, { commanders: [{ ...commandersJson.commanders[0], passive: { ...commandersJson.commanders[0]!.passive, effects: [] } }] })), cards, units)).not.toThrow();
  });

  it('궁극기는 선택 필드', () => {
    const d: any = structuredClone(commandersJson);
    delete d.commanders[0].ultimate;
    expect(loadCommanders(d, cards, units).get('cmd_harten')?.ultimate).toBeUndefined();
  });
});
