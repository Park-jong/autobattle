import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import threatJson from '../../../data/threat.json';
import traitsJson from '../../../data/traits.json';
import { loadCards } from './cardLoader';
import { loadThreat } from './threatLoader';
import { loadTraits } from './traitLoader';

const cards = loadCards(cardsJson, loadTraits(traitsJson));

type Json = { version: number; levels: { level: number; name: string; text: string; effects: Record<string, unknown>[] }[] };
const clone = (): Json => structuredClone(threatJson) as unknown as Json;
const errorOf = (mutate: (d: Json) => void): string => {
  const data = clone();
  mutate(data);
  try {
    loadThreat(data, cards);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('검증이 통과함');
};

describe('threat.json 로더', () => {
  it('실제 data/threat.json이 통과하고 레벨 1~10을 순서대로 가진다', () => {
    const catalog = loadThreat(threatJson, cards);
    expect(catalog.maxLevel).toBe(10);
    expect(catalog.levels.map((l) => l.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(catalog.get(0)).toBeUndefined();
    expect(catalog.get(5)?.name).toBe('불길한 시작');
    expect(catalog.upTo(0)).toEqual([]);
    expect(catalog.upTo(3).map((l) => l.level)).toEqual([1, 2, 3]);
  });

  it('레벨 수·순서가 틀리면 경로가 담긴 오류', () => {
    expect(errorOf((d) => { d.levels.pop(); })).toContain('levels: 레벨 1~10을 하나씩 정확히 10개');
    expect(errorOf((d) => { d.levels[2]!.level = 9; })).toContain('levels[2].level: 3이어야 함');
  });

  it('모르는 필드와 효과 종류를 거부한다', () => {
    expect(errorOf((d) => { (d as unknown as Record<string, unknown>).extra = 1; })).toContain('extra: 알 수 없는 필드');
    expect(errorOf((d) => { (d.levels[0] as unknown as Record<string, unknown>).bonus = 1; })).toContain('levels[0].bonus: 알 수 없는 필드');
    expect(errorOf((d) => { d.levels[0]!.effects[0]!.kind = 'nope'; })).toContain('levels[0].effects[0].kind: 알 수 없는 값');
    expect(errorOf((d) => { d.levels[1]!.effects[0]!.extra = 1; })).toContain('levels[1].effects[0].extra: 알 수 없는 필드');
  });

  it('효과 값 범위를 검증한다', () => {
    expect(errorOf((d) => { d.levels[0]!.effects = []; })).toContain('levels[0].effects: 효과가 하나 이상');
    expect(errorOf((d) => { d.levels[0]!.effects[0]!.kinds = ['normal', 'normal']; })).toContain('kinds: 중복된 적 종류');
    expect(errorOf((d) => { d.levels[0]!.effects[0]!.kinds = ['hero']; })).toContain('kinds[0]: 알 수 없는 값');
    expect(errorOf((d) => { delete d.levels[0]!.effects[0]!.hp; })).toContain('hp 또는 atk 중 하나 이상');
    expect(errorOf((d) => { d.levels[0]!.effects[0]!.hp = -5; })).toContain('hp: 1 이상이어야 함');
    expect(errorOf((d) => { d.levels[1]!.effects[0]!.amount = 0; })).toContain('amount: 0이 아니어야 함');
    expect(errorOf((d) => { d.levels[5]!.effects[0]!.count = 3; })).toContain('count: 2 이하여야 함');
    expect(errorOf((d) => { d.levels[7]!.effects[0]!.delta = 0; })).toContain('delta');
    expect(errorOf((d) => { d.levels[6]!.effects[0]!.pct = 1.5; })).toContain('pct: 정수여야 함');
  });

  it('저주 카드 참조를 확인한다 (없는 카드, 저주가 아닌 카드)', () => {
    expect(errorOf((d) => { d.levels[4]!.effects[0]!.cardId = 'no_such_card'; })).toContain('levels[4].effects[0].cardId: cards.json에 없는 카드');
    expect(errorOf((d) => { d.levels[4]!.effects[0]!.cardId = 'nox_whisper_of_dread'; })).toContain('저주 카드여야 함');
  });
});
