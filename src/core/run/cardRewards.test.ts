import { describe, expect, it } from 'vitest';
import { isRewardCard } from '../data/card';
import { Rng } from '../rng';
import { cardPrice, generateCardStock, removalPrice } from './cardMarket';
import { CardRewardGenerator } from './cardRewards';
import { runDeps } from './testSupport';

const generator = new CardRewardGenerator(runDeps.cards);
const rarityOf = (id: string) => runDeps.cards.get(id)?.rarity;

describe('카드 보상 풀', () => {
  it('공용·비저주·시작 전용이 아닌 카드만 후보다 (지휘관 고유·시작 카드 제외)', () => {
    const pool = ['common', 'rare', 'epic'].flatMap((r) => generator.pool(r as 'common'));
    expect(pool.length).toBeGreaterThanOrEqual(9); // 불씨 화살은 이세라 고유 시작 카드가 되어 공용 풀에서 빠졌다
    for (const card of pool) {
      expect(isRewardCard(card)).toBe(true);
      expect(card.owner).toBe('neutral');
      expect(card.type).not.toBe('curse');
      expect(card.rarity).not.toBe('starter');
    }
    expect(pool.map((c) => c.id)).not.toContain('shield_formation'); // 하르텐 고유
    expect(pool.map((c) => c.id)).not.toContain('hold_the_line'); // 시작 카드
    expect(pool.map((c) => c.id)).toContain('abyss_pact');
  });
});

describe('카드 보상 제시', () => {
  it('3장의 서로 다른 카드를 결정적으로 제시한다', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const offer = generator.offer('normal', new Rng(seed));
      expect(offer).toHaveLength(3);
      expect(new Set(offer).size).toBe(3);
      expect(generator.offer('normal', new Rng(seed))).toEqual(offer);
    }
  });

  it('희귀도 가중: 일반 < 정예의 희귀 이상 비율, 정예는 희귀 이상이 절반 가까이', () => {
    const share = (kind: 'normal' | 'elite') => {
      let rare = 0;
      let total = 0;
      for (let seed = 1; seed <= 600; seed++) {
        for (const id of generator.offer(kind, new Rng(seed))) {
          total++;
          if (rarityOf(id) !== 'common') rare++;
        }
      }
      return rare / total;
    };
    const normal = share('normal');
    const elite = share('elite');
    expect(elite).toBeGreaterThan(normal + 0.1);
    expect(normal).toBeGreaterThan(0.1); // 후보 수가 적어 가중치 70/27/3보다 희귀 비율이 올라가지만 일반이 더 많다
    expect(normal).toBeLessThan(0.5);
  });

  it('보스 보상은 희귀 이상을 항상 1장 이상 포함한다', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const offer = generator.offer('boss', new Rng(seed));
      expect(offer).toHaveLength(3);
      expect(offer.some((id) => rarityOf(id) === 'rare' || rarityOf(id) === 'epic')).toBe(true);
    }
  });

  it('이벤트용: 희귀도별 무작위 1장 / 서로 다른 n장', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(rarityOf(generator.pickRandom('rare', new Rng(seed)))).toBe('rare');
      const picks = generator.pickDistinct('rare', 3, new Rng(seed));
      expect(new Set(picks).size).toBe(3);
    }
    expect(() => generator.pickDistinct('epic', 4, new Rng(1))).toThrow(/epic/); // 공용 에픽은 3장 (M5-4 2부-C)
    expect(rarityOf(generator.pickRandom('epic', new Rng(1)))).toBe('epic');
  });
});

describe('상점 카드 진열과 가격', () => {
  it('희귀도별 가격으로 3종을 결정적으로 진열한다', () => {
    const stock = generateCardStock(runDeps.cards, generator, new Rng(5));
    expect(stock).toHaveLength(3);
    expect(new Set(stock.map((s) => s.cardId)).size).toBe(3);
    for (const slot of stock) {
      expect(slot.sold).toBe(false);
      expect(slot.price).toBe(cardPrice(rarityOf(slot.cardId) as 'common'));
    }
    expect(cardPrice('common')).toBeLessThan(cardPrice('rare'));
    expect(cardPrice('rare')).toBeLessThan(cardPrice('epic'));
    expect(generateCardStock(runDeps.cards, generator, new Rng(5))).toEqual(stock);
  });

  it('카드 제거 가격은 75G에서 시작해 제거할 때마다 25G씩 오른다', () => {
    expect([0, 1, 2, 3].map(removalPrice)).toEqual([75, 100, 125, 150]);
  });
});
