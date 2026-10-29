import { describe, expect, it } from 'vitest';
import { fanLayout } from './cardFan';

describe('fanLayout', () => {
  it('0장이면 빈 배열, 1장이면 가운데에 회전 없이', () => {
    expect(fanLayout(0, { cardWidth: 120, maxWidth: 800 })).toEqual([]);
    expect(fanLayout(1, { cardWidth: 120, maxWidth: 800 })).toEqual([{ x: 0, y: 0, rotate: 0, z: 1 }]);
  });

  it('좌우 대칭이고 가운데가 가장 높으며 오른쪽 카드가 위에 쌓인다', () => {
    const slots = fanLayout(5, { cardWidth: 120, maxWidth: 2000 });
    expect(slots.map((s) => s.x)).toEqual([-206.4, -103.2, 0, 103.2, 206.4]);
    expect(slots[0]!.rotate).toBe(-slots[4]!.rotate);
    expect(slots[0]!.y).toBe(slots[4]!.y);
    expect(slots[2]!.y).toBe(0);
    expect(slots[0]!.y).toBeGreaterThan(slots[1]!.y);
    expect(slots.map((s) => s.z)).toEqual([1, 2, 3, 4, 5]);
  });

  it('최대 폭을 넘으면 간격을 줄여 겹치고, 전체 회전 폭은 상한을 넘지 않는다', () => {
    const slots = fanLayout(10, { cardWidth: 120, maxWidth: 600, maxSpread: 30 });
    const span = slots[9]!.x - slots[0]!.x + 120;
    expect(span).toBeLessThanOrEqual(600.01);
    expect(slots[9]!.rotate - slots[0]!.rotate).toBeLessThanOrEqual(30.01);
  });
});
