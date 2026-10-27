import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

const seq = (r: Rng, n: number) => Array.from({ length: n }, () => r.next());

describe('Rng', () => {
  it('같은 시드는 같은 수열', () => {
    expect(seq(new Rng(42), 20)).toEqual(seq(new Rng(42), 20));
  });
  it('다른 시드는 다른 수열', () => {
    expect(seq(new Rng(1), 20)).not.toEqual(seq(new Rng(2), 20));
  });
  it('next는 [0,1) 범위', () => {
    for (const v of seq(new Rng(7), 1000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('int는 경계를 포함하고 벗어나지 않음', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    expect(r.int(4, 4)).toBe(4);
  });
  it('int는 잘못된 범위에서 에러', () => {
    expect(() => new Rng(1).int(5, 2)).toThrow();
  });
  it('pick은 배열 원소를 반환, 빈 배열은 에러', () => {
    const r = new Rng(9);
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    expect(() => r.pick([])).toThrow();
  });
  it('shuffle은 결정적이고 원소를 보존하며 원본을 바꾸지 않음', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new Rng(5).shuffle(src);
    const b = new Rng(5).shuffle(src);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).not.toBe(src);
  });
  it('상태 복원 후 같은 수열', () => {
    const r = new Rng(11);
    seq(r, 5);
    const state = r.getState();
    const expected = seq(r, 10);
    const r2 = new Rng(999);
    r2.setState(state);
    expect(seq(r2, 10)).toEqual(expected);
  });
});
