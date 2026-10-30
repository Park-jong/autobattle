import type { Card } from '../data/card';
import type { CardCatalog } from '../data/cardLoader';
import { Rng } from '../rng';
import type { CardInstance } from './cardInstance';
import type { DeckSnapshot } from './deck';

/** 런에 남아 있는 덱의 카드 (뽑을 + 손패 + 버린 더미; 소모 더미 제외). 순서는 더미 순 */
export function deckCards(snapshot: DeckSnapshot): CardInstance[] {
  return [...snapshot.draw, ...snapshot.hand, ...snapshot.discard];
}

/** 제거·강화 대상이 될 수 있는 카드: 유닛이 제공한 카드는 유닛과 함께 관리되므로 제외 */
export function isEditableCard(card: CardInstance): boolean {
  return card.grantedBy === undefined;
}

export function isUpgradableCard(card: CardInstance, catalog: CardCatalog): boolean {
  const def = catalog.get(card.cardId);
  return isEditableCard(card) && !card.upgraded && def?.upgrade !== undefined;
}

export function removableCards(snapshot: DeckSnapshot): CardInstance[] {
  return deckCards(snapshot).filter(isEditableCard);
}

export function upgradableCards(snapshot: DeckSnapshot, catalog: CardCatalog): CardInstance[] {
  return deckCards(snapshot).filter((card) => isUpgradableCard(card, catalog));
}

/**
 * 새 카드를 덱에 넣는다: 뽑을 더미에 넣고 덱의 Rng(상태 포함)로 뽑을 더미를 다시 섞는다.
 * 원본 스냅샷은 바뀌지 않으며 같은 입력이면 같은 결과다.
 */
export function addCardToDeck(snapshot: DeckSnapshot, catalog: CardCatalog, cardId: string, upgraded = false): DeckSnapshot {
  const def: Card | undefined = catalog.get(cardId);
  if (!def) throw new Error(`덱에 넣을 카드 "${cardId}"가 없습니다`);
  if (upgraded && !def.upgrade) throw new Error(`카드 "${cardId}"에는 강화 버전이 없습니다`);
  const out = structuredClone(snapshot);
  const rng = new Rng(0);
  rng.setState(out.rngState);
  out.draw.push({ instanceId: out.nextInstanceId++, cardId, upgraded });
  out.draw = rng.shuffle(out.draw);
  out.rngState = rng.getState();
  return out;
}

/**
 * 장비를 장착 해제하거나 장착 유닛을 팔 때 장비 카드를 덱(뽑을 더미)으로 되돌린다.
 * 장착할 때 소모 더미로 보낸 같은 카드(id·강화 여부)가 있으면 그 인스턴스를 되살리고, 없으면 새로 넣는다. 뽑을 더미는 덱 Rng로 다시 섞는다
 */
export function returnCardToDeck(snapshot: DeckSnapshot, catalog: CardCatalog, cardId: string, upgraded: boolean): DeckSnapshot {
  const index = snapshot.exhaust.findIndex((card) => card.cardId === cardId && card.upgraded === upgraded && card.grantedBy === undefined);
  if (index < 0) return addCardToDeck(snapshot, catalog, cardId, upgraded);
  const out = structuredClone(snapshot);
  const [card] = out.exhaust.splice(index, 1);
  const rng = new Rng(0);
  rng.setState(out.rngState);
  out.draw.push(card as CardInstance);
  out.draw = rng.shuffle(out.draw);
  out.rngState = rng.getState();
  return out;
}

/** 덱에서 카드 한 장을 제거한다 (소모 더미로 보내지 않고 완전히 삭제). 제공 카드·없는 카드는 Error */
export function removeCardFromDeck(snapshot: DeckSnapshot, instanceId: number): DeckSnapshot {
  const out = structuredClone(snapshot);
  for (const key of ['draw', 'hand', 'discard'] as const) {
    const index = out[key].findIndex((card) => card.instanceId === instanceId);
    if (index < 0) continue;
    if (!isEditableCard(out[key][index] as CardInstance)) throw new Error('유닛이 제공한 카드는 제거할 수 없습니다');
    out[key].splice(index, 1);
    return out;
  }
  throw new Error(`덱에 없는 카드 인스턴스 ${instanceId}`);
}

/** 카드 한 장을 강화한다. 이미 강화됐거나 강화 버전이 없거나 제공 카드면 Error */
export function upgradeCardInDeck(snapshot: DeckSnapshot, catalog: CardCatalog, instanceId: number): DeckSnapshot {
  const out = structuredClone(snapshot);
  for (const key of ['draw', 'hand', 'discard'] as const) {
    const card = out[key].find((entry) => entry.instanceId === instanceId);
    if (!card) continue;
    if (!isEditableCard(card)) throw new Error('유닛이 제공한 카드는 강화할 수 없습니다');
    if (card.upgraded) throw new Error('이미 강화된 카드입니다');
    if (!catalog.get(card.cardId)?.upgrade) throw new Error(`카드 "${card.cardId}"에는 강화 버전이 없습니다`);
    card.upgraded = true;
    return out;
  }
  throw new Error(`덱에 없는 카드 인스턴스 ${instanceId}`);
}

/** 소모 더미로 보낸다 (영구 장비 장착 등). 없으면 Error */
export function exhaustCardInDeck(snapshot: DeckSnapshot, instanceId: number): DeckSnapshot {
  const out = structuredClone(snapshot);
  for (const key of ['draw', 'hand', 'discard'] as const) {
    const index = out[key].findIndex((card) => card.instanceId === instanceId);
    if (index < 0) continue;
    const [card] = out[key].splice(index, 1);
    out.exhaust.push(card as CardInstance);
    return out;
  }
  throw new Error(`덱에 없는 카드 인스턴스 ${instanceId}`);
}
