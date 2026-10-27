import { describe, expect, it } from 'vitest';
import { chebyshev, type Cell } from './board';
import { findPath } from './pathfinding';

const open = () => 1;

describe('findPath (A*)', () => {
  it('이미 사거리 안이면 빈 경로', () => {
    expect(findPath({ col: 3, row: 2 }, { col: 4, row: 2 }, 1, open)).toEqual([]);
  });

  it('직선 접근: 사거리 안에 들어서는 최단 경로 (8방향이라 Chebyshev 거리만큼)', () => {
    const path = findPath({ col: 0, row: 0 }, { col: 7, row: 4 }, 1, open);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(6); // 거리 7 → 사거리 1까지 6칸
    expect(chebyshev(path?.at(-1) as Cell, { col: 7, row: 4 })).toBeLessThanOrEqual(1);
  });

  it('원거리는 사거리만큼 덜 이동', () => {
    expect(findPath({ col: 0, row: 2 }, { col: 7, row: 2 }, 4, open)).toHaveLength(3);
  });

  it('장애물을 돌아간다', () => {
    const blocked = new Set(['1,1', '1,2', '1,3']);
    const path = findPath({ col: 0, row: 2 }, { col: 3, row: 2 }, 1, (c) => (blocked.has(`${c.col},${c.row}`) ? null : 1));
    expect(path).not.toBeNull();
    for (const c of path as Cell[]) expect(blocked.has(`${c.col},${c.row}`)).toBe(false);
  });

  it('완전히 막히면 null', () => {
    const wall = (c: Cell) => (c.col === 1 ? null : 1);
    expect(findPath({ col: 0, row: 2 }, { col: 5, row: 2 }, 1, wall)).toBeNull();
  });

  it('같은 입력이면 같은 경로 (결정론)', () => {
    const a = findPath({ col: 0, row: 0 }, { col: 6, row: 3 }, 2, open);
    const b = findPath({ col: 0, row: 0 }, { col: 6, row: 3 }, 2, open);
    expect(a).toEqual(b);
  });
});
