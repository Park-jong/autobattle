import type { CardCatalog } from '../data/cardLoader';
import type { CommanderDef } from '../data/commander';
import { Rng } from '../rng';
import { CARDS } from './constants';
import { Deck, type DeckSnapshot } from './deck';
import { startingDeckSpecs, type DeckPreset } from './startingDeck';

/** 지휘관의 시작 덱을 시드로 섞은 새 덱 상태 (손패는 비어 있음) */
export function createStartingDeck(commander: CommanderDef, catalog: CardCatalog, seed: number, preset: DeckPreset = 'starter'): DeckSnapshot {
  return Deck.create(startingDeckSpecs(commander, preset), catalog, new Rng(seed)).serialize();
}

/**
 * 덱 상태에서 전투 준비용 손패(기본 5장)를 뽑은 새 상태. 원본은 바뀌지 않는다.
 * 유물(전령의 가방)이 있으면 extraDraw장을 더 뽑고, 손패 상한을 handLimitBonus만큼 올린다.
 */
export function dealOpeningHand(snapshot: DeckSnapshot, catalog: CardCatalog, extraDraw = 0, handLimitBonus = 0): DeckSnapshot {
  const options = handLimitBonus > 0 ? { handLimit: CARDS.HAND_LIMIT + handLimitBonus } : {};
  const deck = Deck.restore(snapshot, catalog, new Rng(0), options);
  deck.draw(CARDS.HAND_SIZE + extraDraw);
  return deck.serialize();
}
