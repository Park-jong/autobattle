import type { Card, CardChain, CardEffect, CardHpCost, CardResonance, Keyword } from '../data/card';

/** 강화 여부를 반영한 카드의 실제 비용·효과 */
export interface EffectiveCard {
  cost: number;
  text: string;
  effects: readonly CardEffect[];
  keywords: readonly Keyword[];
  commanderHpCost?: CardHpCost;
  resonance?: CardResonance;
  chain?: CardChain;
}

/**
 * 카드와 강화 여부로 실제 적용될 내용을 계산한다.
 * 강화 카드는 effects·text를 통째로 대체하고, cost·resonance·chain·keywords·commanderHpCost는 upgrade에 있을 때만 대체한다.
 * 강화 버전이 없는 카드를 강화로 요청하면 Error.
 */
export function effectiveCard(card: Card, upgraded: boolean, cardsPlayed = 0): EffectiveCard {
  if (!upgraded) {
    return {
      cost: cardsPlayed > 0 ? card.chain?.cost ?? card.cost : card.cost,
      text: card.text,
      effects: card.effects,
      keywords: card.keywords,
      ...(card.commanderHpCost ? { commanderHpCost: card.commanderHpCost } : {}),
      ...(card.resonance ? { resonance: card.resonance } : {}),
      ...(card.chain ? { chain: card.chain } : {}),
    };
  }
  const up = card.upgrade;
  if (!up) throw new Error(`카드 "${card.id}"에는 강화 버전이 없음`);
  const resonance = up.resonance ?? card.resonance;
  const chain = up.chain ?? card.chain;
  const commanderHpCost = up.commanderHpCost ?? card.commanderHpCost;
  return {
    cost: cardsPlayed > 0 ? chain?.cost ?? up.cost ?? card.cost : up.cost ?? card.cost,
    text: up.text,
    effects: up.effects,
    keywords: up.keywords ?? card.keywords,
    ...(commanderHpCost ? { commanderHpCost } : {}),
    ...(resonance ? { resonance } : {}),
    ...(chain ? { chain } : {}),
  };
}
