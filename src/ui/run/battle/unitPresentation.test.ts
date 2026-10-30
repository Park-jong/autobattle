import { describe, expect, it } from 'vitest';
import { purchaseHint } from './unitPresentation';

describe('shop purchase hints', () => {
  const unit = (star: 1 | 2 | 3, unitId = 'tank') => ({ unitId, star });
  it('distinguishes unowned units and existing copies', () => {
    expect(purchaseHint('tank', [unit(1, 'healer')])).toBe('미보유');
    expect(purchaseHint('tank', [unit(1)])).toBe('보유 1기 · ★ 1/3');
  });
  it('predicts a two-star merge and a chained three-star merge', () => {
    expect(purchaseHint('tank', [unit(1), unit(1)])).toBe('구매 시 ★★ 합성');
    expect(purchaseHint('tank', [unit(1), unit(1), unit(2), unit(2)])).toBe('구매 시 ★★★ 합성');
  });
  it('does not count higher stars as one-star copies', () => {
    expect(purchaseHint('tank', [unit(2), unit(2)])).toBe('보유 2기 · ★ 0/3');
    expect(purchaseHint('tank', [unit(3), unit(1)])).toBe('보유 2기 · ★ 1/3');
  });
});
