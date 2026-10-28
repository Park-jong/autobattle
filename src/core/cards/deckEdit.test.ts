import { describe, expect, it } from 'vitest';
import { cardCatalog, harten } from '../combat/testSupport';
import { Rng } from '../rng';
import { Deck, type DeckSnapshot } from './deck';
import {
  addCardToDeck, deckCards, exhaustCardInDeck, isUpgradableCard, removableCards,
  removeCardFromDeck, upgradableCards, upgradeCardInDeck,
} from './deckEdit';
import { parseDeckSnapshot } from './deckSnapshot';
import { createStartingDeck, dealOpeningHand } from './deckSetup';

const fresh = (): DeckSnapshot => createStartingDeck(harten, cardCatalog, 7);

describe('덱 편집 (런 보상·상점·이벤트·야영지)', () => {
  it('카드 추가: 새 인스턴스 ID로 뽑을 더미에 들어가고 같은 입력이면 같은 결과다', () => {
    const base = fresh();
    const a = addCardToDeck(base, cardCatalog, 'firestorm');
    const b = addCardToDeck(base, cardCatalog, 'firestorm');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(deckCards(a)).toHaveLength(11);
    expect(a.draw.find((c) => c.cardId === 'firestorm')).toMatchObject({ instanceId: 11, upgraded: false });
    expect(a.nextInstanceId).toBe(12);
    expect(base.draw).toHaveLength(10); // 원본은 그대로
    expect(addCardToDeck(base, cardCatalog, 'firestorm', true).draw.some((c) => c.upgraded)).toBe(true);
    expect(() => addCardToDeck(base, cardCatalog, 'ghost')).toThrow(/없습니다/);
  });

  it('카드 제거: 어느 더미에서든 인스턴스로 제거하고 제공 카드·없는 카드는 거부한다', () => {
    const dealt = dealOpeningHand(fresh(), cardCatalog);
    const inHand = dealt.hand[0]!;
    const removed = removeCardFromDeck(dealt, inHand.instanceId);
    expect(deckCards(removed)).toHaveLength(9);
    expect(removed.exhaust).toHaveLength(0);
    expect(() => removeCardFromDeck(dealt, 999)).toThrow(/덱에 없는 카드/);
    const granted = structuredClone(fresh());
    granted.draw[0]!.grantedBy = '3';
    expect(() => removeCardFromDeck(granted, granted.draw[0]!.instanceId)).toThrow(/제공한 카드는 제거할 수 없습니다/);
    expect(removableCards(granted)).toHaveLength(9);
  });

  it('카드 강화: 강화되지 않은 카드만 가능하다 (이미 강화·제공 카드 불가)', () => {
    const base = fresh();
    const target = base.draw[0]!;
    const upgraded = upgradeCardInDeck(base, cardCatalog, target.instanceId);
    expect(deckCards(upgraded).find((c) => c.instanceId === target.instanceId)?.upgraded).toBe(true);
    expect(base.draw[0]!.upgraded).toBe(false);
    expect(() => upgradeCardInDeck(upgraded, cardCatalog, target.instanceId)).toThrow(/이미 강화된 카드/);
    expect(isUpgradableCard(upgraded.draw.find((c) => c.instanceId === target.instanceId)!, cardCatalog)).toBe(false);
    expect(upgradableCards(upgraded, cardCatalog)).toHaveLength(9);
    expect(() => upgradeCardInDeck(base, cardCatalog, 999)).toThrow(/덱에 없는 카드/);
    const granted = structuredClone(base);
    granted.draw[0]!.grantedBy = '1';
    expect(() => upgradeCardInDeck(granted, cardCatalog, granted.draw[0]!.instanceId)).toThrow(/제공한 카드는 강화할 수 없습니다/);
  });

  it('소모 더미 이동은 덱 크기에서 빠진다', () => {
    const base = fresh();
    const out = exhaustCardInDeck(base, base.draw[0]!.instanceId);
    expect(out.exhaust).toHaveLength(1);
    expect(deckCards(out)).toHaveLength(9);
    expect(Deck.restore(out, cardCatalog, new Rng(0)).size).toBe(9);
  });
});

describe('덱 상태 읽기', () => {
  it('저장한 덱을 그대로 읽는다', () => {
    const dealt = dealOpeningHand(fresh(), cardCatalog);
    expect(parseDeckSnapshot(JSON.parse(JSON.stringify(dealt)), 'deck', cardCatalog)).toEqual(dealt);
  });

  it('형식 오류·중복 ID·모르는 카드·강화 불가 카드를 위치와 함께 거부한다', () => {
    const base = JSON.parse(JSON.stringify(fresh()));
    const bad = (mutate: (s: any) => void) => {
      const copy = structuredClone(base);
      mutate(copy);
      return () => parseDeckSnapshot(copy, 'deck', cardCatalog);
    };
    expect(bad((s) => { s.draw[2].cardId = 'ghost'; })).toThrow(/deck\.draw\[2\]\.cardId.*ghost/);
    expect(bad((s) => { s.draw[1].instanceId = s.draw[0].instanceId; })).toThrow(/deck\.draw\[1\]\.instanceId.*중복/);
    expect(bad((s) => { s.nextInstanceId = 3; })).toThrow(/nextInstanceId/);
    expect(bad((s) => { delete s.hand; })).toThrow(/deck\.hand/);
    expect(bad((s) => { s.draw[0].upgraded = 'yes'; })).toThrow(/deck\.draw\[0\]\.upgraded/);
    expect(bad((s) => { s.extra = 1; })).toThrow(/알 수 없는 필드/);
    expect(bad((s) => { s.rngState = 1.5; })).toThrow(/rngState/);
  });
});
