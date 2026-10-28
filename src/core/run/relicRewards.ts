import type { RelicDef, RelicRarity } from '../data/relic';
import type { RelicCatalog } from '../data/relicLoader';
import type { Rng } from '../rng';
import { RUN } from './constants';

/** 상점 유물 진열 한 칸 */
export interface ShopRelicSlot {
  relicId: string;
  price: number;
  sold: boolean;
}

/** 일반(보스 제외) 유물 희귀도 */
export type DroppableRarity = Exclude<RelicRarity, 'boss'>;

/** 유물 가격: 희귀도별 고정 (보스 유물은 팔지 않는다) */
export function relicPrice(rarity: DroppableRarity): number {
  return RUN.RELIC.PRICES[rarity];
}

/**
 * 유물 획득 경로별 후보 뽑기 (정예 보상·상점 진열·이벤트·보스 선택). 이미 가진 유물은 후보에서 빠지므로 중복 획득이 없다.
 * 무작위는 호출하는 쪽이 (런 시드, 용도, 노드)에서 파생한 Rng를 넘긴다.
 */
export class RelicRewardGenerator {
  constructor(private readonly catalog: RelicCatalog) {}

  /** 아직 없는 해당 희귀도 유물 (파일 순서) */
  available(owned: readonly string[], rarity: RelicRarity): RelicDef[] {
    return this.catalog.ofRarity(rarity).filter((relic) => !owned.includes(relic.id));
  }

  /** 정예 보상 1개: 희귀도 가중치로 고르고, 그 등급이 바닥나면 다른 등급에서. 줄 유물이 없으면 null */
  offerElite(owned: readonly string[], rng: Rng): string | null {
    return this.pickWeighted(owned, RUN.RELIC.ELITE_WEIGHTS, rng);
  }

  /** 상점 진열: 서로 다른 유물 SHOP_SLOTS개까지 (남은 유물이 적으면 그만큼) */
  stock(owned: readonly string[], rng: Rng): ShopRelicSlot[] {
    const taken = [...owned];
    const slots: ShopRelicSlot[] = [];
    for (let i = 0; i < RUN.RELIC.SHOP_SLOTS; i++) {
      const id = this.pickWeighted(taken, RUN.RELIC.SHOP_WEIGHTS, rng);
      if (id === null) break;
      taken.push(id);
      const rarity = this.catalog.get(id)?.rarity as DroppableRarity;
      slots.push({ relicId: id, price: relicPrice(rarity), sold: false });
    }
    return slots;
  }

  /** 이벤트용: 해당 희귀도에서 무작위 1개. 남은 게 없으면 null */
  pickRandom(owned: readonly string[], rarity: DroppableRarity, rng: Rng): string | null {
    const pool = this.available(owned, rarity);
    return pool.length === 0 ? null : rng.pick(pool).id;
  }

  /** 보스 처치 보상 후보: 보스 유물에서 서로 다른 BOSS_CHOICES개까지 */
  offerBoss(owned: readonly string[], rng: Rng): string[] {
    return rng.shuffle(this.available(owned, 'boss')).slice(0, RUN.RELIC.BOSS_CHOICES).map((relic) => relic.id);
  }

  private pickWeighted(owned: readonly string[], weights: Readonly<Record<DroppableRarity, number>>, rng: Rng): string | null {
    const open = (['common', 'rare'] as const).filter((rarity) => this.available(owned, rarity).length > 0);
    if (open.length === 0) return null;
    const total = open.reduce((sum, rarity) => sum + weights[rarity], 0);
    let roll = rng.next() * total;
    let chosen: DroppableRarity = open[open.length - 1] as DroppableRarity;
    for (const rarity of open) {
      roll -= weights[rarity];
      if (roll < 0) {
        chosen = rarity;
        break;
      }
    }
    return rng.pick(this.available(owned, chosen)).id;
  }
}
