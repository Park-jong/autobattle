import { describe, expect, it } from 'vitest';
import { Board, backCol, chebyshev, frontCol, isInOwnHalf, rayCells, sideOfCol } from './board';

describe('보드 기하', () => {
  it('진영은 열 0~3 / 4~7', () => {
    expect([0, 3].map(sideOfCol)).toEqual([0, 0]);
    expect([4, 7].map(sideOfCol)).toEqual([1, 1]);
    expect(isInOwnHalf(0, { col: 3, row: 4 })).toBe(true);
    expect(isInOwnHalf(0, { col: 4, row: 0 })).toBe(false);
    expect(isInOwnHalf(1, { col: 4, row: 5 })).toBe(false);
  });
  it('전열은 중앙 쪽, 후열은 바깥쪽', () => {
    expect([frontCol(0), backCol(0)]).toEqual([3, 0]);
    expect([frontCol(1), backCol(1)]).toEqual([4, 7]);
  });
  it('Chebyshev 거리', () => {
    expect(chebyshev({ col: 0, row: 0 }, { col: 3, row: 2 })).toBe(3);
  });
  it('rayCells: 직선과 대각선을 보드 끝까지', () => {
    expect(rayCells({ col: 0, row: 2 }, { col: 2, row: 2 })).toHaveLength(7);
    expect(rayCells({ col: 0, row: 0 }, { col: 1, row: 1 })).toEqual([
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 3, row: 3 },
      { col: 4, row: 4 },
    ]);
    expect(rayCells({ col: 1, row: 1 }, { col: 1, row: 1 })).toEqual([]);
  });
});

describe('Board 점유와 예약', () => {
  it('점유된 칸에는 배치·예약할 수 없다', () => {
    const board = new Board();
    board.place(1, { col: 0, row: 0 });
    expect(board.isFree({ col: 0, row: 0 })).toBe(false);
    expect(() => board.place(2, { col: 0, row: 0 })).toThrow('배치 불가');
    expect(() => board.reserve(2, { col: 0, row: 0 })).toThrow('예약 불가');
  });
  it('예약한 칸은 다른 유닛이 쓸 수 없고, 이동 완료 시 점유가 넘어간다', () => {
    const board = new Board();
    const from = { col: 0, row: 0 };
    const to = { col: 1, row: 0 };
    board.place(1, from);
    board.reserve(1, to);
    expect(board.isFree(to)).toBe(false);
    expect(() => board.reserve(2, to)).toThrow();
    expect(board.occupantAt(from)).toBe(1); // 출발 칸은 도착 전까지 점유
    board.completeMove(1, from, to);
    expect(board.isFree(from)).toBe(true);
    expect(board.occupantAt(to)).toBe(1);
    expect(board.reservedBy(to)).toBeUndefined();
  });
  it('release는 점유와 예약을 모두 해제', () => {
    const board = new Board();
    board.place(1, { col: 0, row: 0 });
    board.reserve(1, { col: 1, row: 0 });
    board.release(1);
    expect(board.isFree({ col: 0, row: 0 })).toBe(true);
    expect(board.isFree({ col: 1, row: 0 })).toBe(true);
  });
  it('보드 밖은 비어 있지 않은 것으로 취급', () => {
    expect(new Board().isFree({ col: 8, row: 0 })).toBe(false);
  });
});
