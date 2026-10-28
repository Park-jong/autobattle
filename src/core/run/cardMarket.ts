import type { CardCatalog } from '../data/cardLoader';
import type { Rng } from '../rng';
import type { CardRewardGenerator, RewardRarity } from './cardRewards';
import { RUN } from './constants';

/** 상점 노드의 카드 진열 한 칸 */
export interface ShopCardSlot {
  cardId: string;
  price: number;
  sold: boolean;
}

/** 희귀도별 카드 가격 */
export function cardPrice(rarity: RewardRarity): number {
  return RUN.SHOP.CARD_PRICES[rarity];
}

/** 카드 제거 가격: 75G부터, 제거할 때마다(런 누적) +25G */
export function removalPrice(removalsDone: number): number {
  return RUN.SHOP.REMOVE_BASE + RUN.SHOP.REMOVE_STEP * removalsDone;
}

/** 상점 진열 3종: 일반 전투 보상과 같은 희귀도 가중치로 서로 다른 카드를 결정적으로 뽑고 희귀도별 가격을 붙인다 */
export function generateCardStock(cards: CardCatalog, generator: CardRewardGenerator, rng: Rng): ShopCardSlot[] {
  return generator.offer('normal', rng, RUN.SHOP.CARD_SLOTS).map((cardId) => {
    const rarity = cards.get(cardId)?.rarity;
    if (rarity !== 'common' && rarity !== 'rare' && rarity !== 'epic') throw new Error(`상점에 진열할 수 없는 카드 "${cardId}"`);
    return { cardId, price: cardPrice(rarity), sold: false };
  });
}
