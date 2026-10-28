import { isRewardCard, type Card } from '../data/card';
import type { CardCatalog } from '../data/cardLoader';
import type { BattleKind } from '../economy';
import type { Rng } from '../rng';
import { RUN } from './constants';

export type RewardRarity = 'common' | 'rare' | 'epic';
const RARITIES: readonly RewardRarity[] = ['common', 'rare', 'epic'];
const RARE_OR_BETTER: readonly RewardRarity[] = ['rare', 'epic'];

/**
 * 카드 보상·상점 진열·이벤트 획득의 카드 뽑기. 후보 풀은 isRewardCard(공용·비저주·시작 전용 아님).
 * 희귀도는 종류별 가중치(RUN.REWARD.WEIGHTS)로 뽑고, 같은 제시 안에서 카드는 겹치지 않는다.
 * 정예·보스는 희귀 이상 가중치가 높고, 보스는 첫 장을 희귀 이상에서 보장한다.
 */
export class CardRewardGenerator {
  constructor(private readonly cards: CardCatalog) {}

  /** 해당 희귀도의 후보 카드 (파일 순서) */
  pool(rarity: RewardRarity): Card[] {
    return this.cards.cards.filter((card) => isRewardCard(card) && card.rarity === rarity);
  }

  /** 전투 보상 제시: count장의 서로 다른 카드 id */
  offer(kind: BattleKind, rng: Rng, count: number = RUN.REWARD.CHOICES): string[] {
    const weights = RUN.REWARD.WEIGHTS[kind];
    const pools = new Map<RewardRarity, Card[]>(RARITIES.map((rarity) => [rarity, this.pool(rarity)]));
    const result: string[] = [];
    const take = (allowed: readonly RewardRarity[]): void => {
      const open = allowed.filter((rarity) => (pools.get(rarity)?.length ?? 0) > 0);
      if (open.length === 0) return;
      const rarity = this.weighted(open, open.map((r) => weights[r]), rng);
      const pool = pools.get(rarity) as Card[];
      const [card] = pool.splice(rng.int(0, pool.length - 1), 1);
      if (card) result.push(card.id);
    };
    if (kind === 'boss') take(RARE_OR_BETTER);
    while (result.length < count) {
      const before = result.length;
      take(RARITIES);
      if (result.length === before) break; // 후보가 바닥남
    }
    return result;
  }

  /** 이벤트용: 해당 희귀도에서 무작위 1장 */
  pickRandom(rarity: RewardRarity, rng: Rng): string {
    const pool = this.pool(rarity);
    if (pool.length === 0) throw new Error(`${rarity} 보상 카드가 없습니다`);
    return rng.pick(pool).id;
  }

  /** 이벤트용: 해당 희귀도에서 서로 다른 count장 */
  pickDistinct(rarity: RewardRarity, count: number, rng: Rng): string[] {
    const pool = this.pool(rarity);
    if (pool.length < count) throw new Error(`${rarity} 보상 카드가 ${count}장 필요합니다 (실제: ${pool.length}장)`);
    return rng.shuffle(pool).slice(0, count).map((card) => card.id);
  }

  private weighted<T>(options: readonly T[], weights: readonly number[], rng: Rng): T {
    const sum = weights.reduce((s, w) => s + w, 0);
    let roll = rng.next() * sum;
    for (let i = 0; i < options.length; i++) {
      roll -= weights[i] as number;
      if (roll < 0) return options[i] as T;
    }
    return options[options.length - 1] as T;
  }
}
