import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { CARDS } from './constants';
import { Deck } from './deck';
import { fixtureCard, fixtureCatalog } from './testSupport';

const catalog = fixtureCatalog([
  fixtureCard('plain'),
  fixtureCard('burn_after', { keywords: ['exhaust'] }),
  fixtureCard('keeper', { keywords: ['retain'] }),
  fixtureCard('plus', { upgrade: { text: '강화', effects: [{ kind: 'heal', selector: 'allAllies', amount: 10 }] } }),
]);

const ids = (cards: readonly { cardId: string }[]) => cards.map((c) => c.cardId);
const make = (cardIds: string[], seed = 1) =>
  Deck.create(cardIds.map((cardId) => ({ cardId })), catalog, new Rng(seed));
const many = (n: number, cardId = 'plain') => Array.from({ length: n }, () => cardId);

describe('덱 생성과 뽑기', () => {
  it('같은 카드 여러 장은 instanceId로 구분된다', () => {
    const deck = make(['plain', 'plain', 'plain']);
    expect(deck.drawPile.map((c) => c.instanceId).sort()).toEqual([1, 2, 3]);
    expect(deck.size).toBe(3);
  });

  it('섞기는 시드에 따라 결정적이고 시드가 다르면 순서도 달라진다', () => {
    const a = make(many(10), 7).drawPile.map((c) => c.instanceId);
    const b = make(many(10), 7).drawPile.map((c) => c.instanceId);
    const c = make(many(10), 8).drawPile.map((c2) => c2.instanceId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('전투 준비 시 HAND_SIZE(5)장을 뽑는다', () => {
    const deck = make(many(10));
    const result = deck.drawOpeningHand();
    expect(result.drawn).toHaveLength(CARDS.HAND_SIZE);
    expect(deck.hand).toHaveLength(5);
    expect(deck.drawPile).toHaveLength(5);
  });

  it('뽑을 더미가 비면 버린 더미를 섞어 다시 뽑는다', () => {
    const deck = make(many(4));
    deck.draw(4);
    for (const card of [...deck.hand]) deck.play(card.instanceId);
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(4);
    expect(deck.draw(2).drawn).toHaveLength(2);
    expect(deck.drawPile).toHaveLength(2);
    expect(deck.discardPile).toHaveLength(0);
  });

  it('카드가 모자라면 있는 만큼만 뽑는다', () => {
    expect(make(many(2)).draw(5).drawn).toHaveLength(2);
  });

  it('손패 상한을 넘기는 뽑기는 그 카드를 버린 더미로 보낸다', () => {
    const deck = Deck.create(many(6).map((cardId) => ({ cardId })), catalog, new Rng(1), { handLimit: 4 });
    const result = deck.draw(6);
    expect(result.drawn).toHaveLength(4);
    expect(result.overflowed).toHaveLength(2);
    expect(deck.hand).toHaveLength(4);
    expect(deck.discardPile).toHaveLength(2);
  });

  it('기본 손패 상한은 CARDS.HAND_LIMIT', () => {
    const deck = make(many(12));
    deck.draw(12);
    expect(deck.hand).toHaveLength(CARDS.HAND_LIMIT);
    expect(deck.discardPile).toHaveLength(2);
  });
});

describe('사용과 전투 종료', () => {
  it('사용한 카드는 버린 더미로, 소모 카드는 소모 더미로', () => {
    const deck = make(['plain', 'burn_after']);
    deck.draw(2);
    deck.play(deck.hand.find((c) => c.cardId === 'plain')!.instanceId);
    deck.play(deck.hand.find((c) => c.cardId === 'burn_after')!.instanceId);
    expect(ids(deck.discardPile)).toEqual(['plain']);
    expect(ids(deck.exhaustPile)).toEqual(['burn_after']);
    expect(deck.hand).toHaveLength(0);
    expect(deck.size).toBe(1);
  });

  it('손패에 없는 카드를 쓰면 Error', () => {
    expect(() => make(['plain']).play(1)).toThrow('손패에 없는');
  });

  it('전투 종료: 손패는 모두 버리되 보존 카드만 남는다', () => {
    const deck = make(['plain', 'keeper', 'plain', 'keeper']);
    deck.draw(4);
    deck.endCombat();
    expect(ids(deck.hand)).toEqual(['keeper', 'keeper']);
    expect(ids(deck.discardPile)).toEqual(['plain', 'plain']);
  });

  it('소모 더미는 전투 종료와 재섞기에도 돌아오지 않는다', () => {
    const deck = make(['burn_after', 'plain']);
    deck.draw(2);
    deck.play(deck.hand.find((c) => c.cardId === 'burn_after')!.instanceId);
    deck.endCombat();
    deck.draw(5);
    deck.endCombat();
    deck.draw(5);
    expect(ids(deck.exhaustPile)).toEqual(['burn_after']);
    expect(ids(deck.hand)).toEqual(['plain']);
  });
});

describe('직렬화', () => {
  it('JSON 왕복 후 같은 상태이고 이후 섞기도 똑같이 이어진다', () => {
    const deck = make(['plain', 'plain', 'burn_after', 'keeper', 'plain', 'plain'], 3);
    deck.draw(4);
    deck.play(deck.hand[0]!.instanceId);
    const snapshot = JSON.parse(JSON.stringify(deck.serialize()));
    const restored = Deck.restore(snapshot, catalog, new Rng(999));
    expect(restored.serialize()).toEqual(deck.serialize());

    for (const d of [deck, restored]) {
      d.endCombat();
      d.draw(6);
    }
    expect(restored.serialize()).toEqual(deck.serialize());
  });

  it('강화 여부가 보존되고 강화 버전이 없는 카드를 강화로 만들면 Error', () => {
    const deck = Deck.create([{ cardId: 'plus', upgraded: true }], catalog, new Rng(1));
    expect(deck.drawPile[0]?.upgraded).toBe(true);
    expect(() => Deck.create([{ cardId: 'plain', upgraded: true }], catalog, new Rng(1))).toThrow('강화 버전이 없음');
  });

  it('알 수 없는 카드 id는 Error', () => {
    expect(() => make(['ghost'])).toThrow('알 수 없는 카드');
  });
});
