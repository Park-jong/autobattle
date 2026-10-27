/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import { loadCards } from './cardLoader';

/** 실제 데이터를 복제해 변형한 뒤 발생하는 에러 메시지를 돌려준다. */
function errorOf(mutate: (d: any) => void): string {
  const d: any = structuredClone(cardsJson);
  mutate(d);
  try {
    loadCards(d);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

describe('loadCards', () => {
  it('실제 data/cards.json 16종이 통과', () => {
    const catalog = loadCards(cardsJson);
    expect(catalog.size).toBe(16);
    expect(catalog.get('focus_fire')?.effects).toHaveLength(1);
    expect(catalog.get('last_stand')?.upgrade?.cost).toBe(1);
  });

  it('알 수 없는 effect.kind', () => {
    const msg = errorOf((d) => (d.cards[4].effects[0].kind = 'foo'));
    expect(msg).toContain('cards[4] (focus_fire).effects[0].kind: 알 수 없는 값 "foo"');
  });
  it('필수 필드 누락', () => {
    expect(errorOf((d) => delete d.cards[2].name)).toBe('cards[2] (war_drums).name: 필수 필드 누락');
  });
  it('잘못된 타입', () => {
    expect(errorOf((d) => (d.cards[0].cost = '1'))).toContain('cards[0] (shield_formation).cost: 숫자여야 함');
  });
  it('알 수 없는 rarity / type / target.kind / selector', () => {
    expect(errorOf((d) => (d.cards[0].rarity = 'legend'))).toContain('cards[0] (shield_formation).rarity');
    expect(errorOf((d) => (d.cards[0].type = 'x'))).toContain('.type: 알 수 없는 값 "x"');
    expect(errorOf((d) => (d.cards[0].target.kind = 'y'))).toContain('.target.kind: 알 수 없는 값 "y"');
    expect(errorOf((d) => (d.cards[0].effects[0].selector = 'z'))).toContain('.effects[0].selector: 알 수 없는 값 "z"');
  });
  it('알 수 없는 keyword', () => {
    expect(errorOf((d) => (d.cards[0].keywords = ['bad']))).toContain('.keywords[0]: 알 수 없는 값 "bad"');
  });
  it('allyUnits는 count 필요', () => {
    expect(errorOf((d) => delete d.cards[3].target.count)).toContain(
      'cards[3] (formation_swap).target.count: 필수 필드 누락',
    );
  });
  it('중복 id', () => {
    const msg = errorOf((d) => (d.cards[1].id = 'shield_formation'));
    expect(msg).toContain('cards[1] (shield_formation).id: 중복된 id "shield_formation"');
  });
  it('upgrade 형식 오류', () => {
    expect(errorOf((d) => (d.cards[0].upgrade = 'x'))).toContain('cards[0] (shield_formation).upgrade: 객체여야 함');
    expect(errorOf((d) => delete d.cards[0].upgrade.effects)).toContain(
      'cards[0] (shield_formation).upgrade.effects: 필수 필드 누락',
    );
    expect(errorOf((d) => (d.cards[0].upgrade.effects[0].duration = 'x'))).toContain('upgrade.effects[0].duration');
    expect(errorOf((d) => (d.cards[5].upgrade.cost = 'a'))).toContain('cards[5] (last_stand).upgrade.cost');
  });
  it('효과 파라미터 누락과 모르는 필드', () => {
    expect(errorOf((d) => delete d.cards[0].effects[0].pctMaxHp)).toContain('.effects[0].pctMaxHp: 필수 필드 누락');
    expect(errorOf((d) => (d.cards[0].extra = 1))).toContain('cards[0] (shield_formation).extra: 알 수 없는 필드');
  });
  it('최상위 구조 오류', () => {
    expect(() => loadCards(null)).toThrow('객체여야 함');
    expect(() => loadCards({ version: 1 })).toThrow('cards: 필수 필드 누락');
  });
});
