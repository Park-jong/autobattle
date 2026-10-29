import type { CardCatalog } from '../data/cardLoader';
import type { EffectDef } from '../data/effect';
import type { UnitCatalog } from '../data/unitLoader';
import type { CardInstance } from './cardInstance';
import type { DeckSnapshot } from './deck';

export interface CardProvider { sourceId: string; unitId: string; star: number }

export function assertUnitCardReferences(units: UnitCatalog, catalog: CardCatalog): void {
  for (const unit of units.units) {
    if (unit.grantedCard && !catalog.get(unit.grantedCard)) throw new Error(`유닛 ${unit.id}의 제공 카드 ${unit.grantedCard}가 없습니다`);
  }
}

/** 카드 효과 목록(기본·강화·공명·연쇄·저주 뽑을 때)의 모든 효과 */
function allEffects(card: CardCatalog['cards'][number]): readonly EffectDef[] {
  return [
    ...card.effects, ...(card.resonance?.effects ?? []), ...(card.chain?.effects ?? []), ...(card.curse?.onDraw ?? []),
    ...(card.upgrade ? [...card.upgrade.effects, ...(card.upgrade.resonance?.effects ?? []), ...(card.upgrade.chain?.effects ?? [])] : []),
  ];
}

/** 카드의 징집 효과(summon.unitId)가 가리키는 유닛이 실제로 있고 보스 전용이 아닌지 확인한다 (없으면 Error) */
export function assertCardUnitReferences(catalog: CardCatalog, units: UnitCatalog): void {
  for (const card of catalog.cards) {
    for (const effect of allEffects(card)) {
      if (effect.kind !== 'summon' || effect.unitId === undefined) continue;
      const def = units.get(effect.unitId);
      if (!def) throw new Error(`카드 ${card.id}의 징집 유닛 ${effect.unitId}가 units.json에 없습니다`);
      if (def.boss) throw new Error(`카드 ${card.id}의 징집 유닛 ${effect.unitId}는 보스 전용이라 징집할 수 없습니다`);
    }
  }
}

/** 보드 소유 유닛과 제공 카드의 1:1 관계를 동기화한다. 기본 카드와 원본 입력은 보존한다. */
export function syncGrantedCards(snapshot: DeckSnapshot, catalog: CardCatalog, providers: readonly CardProvider[], units: UnitCatalog): DeckSnapshot {
  assertUnitCardReferences(units, catalog);
  const out = structuredClone(snapshot);
  const wanted = new Map<string, { cardId: string; upgraded: boolean }>();
  for (const provider of providers) {
    if (!provider.sourceId || wanted.has(provider.sourceId)) throw new Error('제공 유닛 ID는 고유해야 합니다');
    const def = units.get(provider.unitId);
    if (!def || ![1, 2, 3].includes(provider.star)) throw new Error('카드 제공 유닛이 올바르지 않습니다');
    if (!def.grantedCard) continue;
    const card = catalog.get(def.grantedCard);
    if (!card) throw new Error(`유닛 ${def.id}의 제공 카드 ${def.grantedCard}가 없습니다`);
    wanted.set(provider.sourceId, { cardId: card.id, upgraded: provider.star === 3 && !!card.upgrade });
  }
  const seen = new Set<string>();
  const filter = (cards: CardInstance[]) => cards.filter((card) => {
    if (card.grantedBy === undefined) return true;
    const spec = wanted.get(card.grantedBy);
    if (!spec || spec.cardId !== card.cardId || seen.has(card.grantedBy)) return false;
    card.upgraded = spec.upgraded;
    seen.add(card.grantedBy);
    return true;
  });
  out.draw = filter(out.draw); out.hand = filter(out.hand); out.discard = filter(out.discard); out.exhaust = filter(out.exhaust);
  for (const [sourceId, spec] of wanted) {
    if (!seen.has(sourceId)) out.draw.push({ instanceId: out.nextInstanceId++, ...spec, grantedBy: sourceId });
  }
  return out;
}
