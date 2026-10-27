import { describe, expect, it } from 'vitest';
import { cardCatalog, handSnapshot, units } from '../combat/testSupport';
import { syncGrantedCards } from './grantedCards';

describe('유닛 제공 카드', () => {
  it('보드의 공급자마다 한 장을 추가하고 기본 카드는 유지한다', () => {
    const original = handSnapshot(['marching_song']);
    const first = syncGrantedCards(original, cardCatalog, [{ sourceId: 'u1', unitId: 'war_drummer', star: 1 }], units);
    expect(first.draw).toMatchObject([{ cardId: 'marching_song', grantedBy: 'u1', upgraded: false }]);
    expect(original.draw).toHaveLength(0);
    expect(syncGrantedCards(first, cardCatalog, [{ sourceId: 'u1', unitId: 'war_drummer', star: 1 }], units)).toEqual(first);
    const removed = syncGrantedCards(first, cardCatalog, [], units);
    expect(removed.draw).toHaveLength(0);
    expect(removed.hand.map((c) => c.cardId)).toEqual(['marching_song']);
  });

  it('3성 합성 후 강화하고 벤치/판매 후 손패·버린·소모 더미에서도 제거한다', () => {
    let state = syncGrantedCards(handSnapshot([]), cardCatalog, [{ sourceId: 'u1', unitId: 'war_drummer', star: 1 }], units);
    state.hand = state.draw.splice(0);
    state = syncGrantedCards(state, cardCatalog, [{ sourceId: 'u1', unitId: 'war_drummer', star: 3 }], units);
    expect(state.hand[0]?.upgraded).toBe(true);
    for (const pile of ['hand', 'discard', 'exhaust'] as const) {
      const moved = structuredClone(state);
      moved[pile] = moved.hand.splice(0);
      expect(syncGrantedCards(moved, cardCatalog, [], units)[pile]).toEqual([]);
    }
  });

  it('서로 다른 제공자와 카드의 인스턴스 ID를 분리한다', () => {
    const state = syncGrantedCards(handSnapshot([]), cardCatalog, [
      { sourceId: '1', unitId: 'war_drummer', star: 1 },
      { sourceId: '2', unitId: 'legion_spy', star: 3 },
      { sourceId: '3', unitId: 'grove_druid', star: 1 },
    ], units);
    expect(state.draw.map((c) => c.cardId)).toEqual(['marching_song', 'enemy_scout', 'vine_snare']);
    expect(new Set(state.draw.map((c) => c.instanceId)).size).toBe(3);
    expect(state.nextInstanceId).toBe(4);
  });
});
