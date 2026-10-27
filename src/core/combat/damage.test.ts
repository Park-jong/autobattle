import { describe, expect, it } from 'vitest';
import { computeDamage, overheatMultiplier } from './damage';

describe('computeDamage', () => {
  it('방어 공식: 값 × 100/(100+방어)', () => {
    expect(computeDamage(100, 1, 0)).toBe(100);
    expect(computeDamage(100, 1, 100)).toBe(50);
    expect(computeDamage(60, 1, 25)).toBe(48);
  });
  it('받는 피해 배율은 방어 전에 곱한다', () => {
    expect(computeDamage(260, 0.5, 30)).toBe(100); // 260×0.5=130 → 130×100/130
  });
  it('방어 무시', () => {
    expect(computeDamage(100, 1, 100, 50)).toBe(67); // 방어 50 → 100×100/150
    expect(computeDamage(100, 1, 100, 100)).toBe(100);
  });
  it('최소 피해 1', () => {
    expect(computeDamage(0, 1, 0)).toBe(1);
  });
});

describe('overheatMultiplier', () => {
  it('30초까지 1, 이후 초당 +0.1', () => {
    expect(overheatMultiplier(0)).toBe(1);
    expect(overheatMultiplier(30)).toBe(1);
    expect(overheatMultiplier(35)).toBeCloseTo(1.5);
    expect(overheatMultiplier(60)).toBeCloseTo(4);
  });
});
