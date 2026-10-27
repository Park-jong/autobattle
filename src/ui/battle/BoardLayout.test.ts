import { describe, expect, it } from 'vitest';
import { BoardLayout } from './BoardLayout';

describe('BoardLayout', () => {
  const layout = new BoardLayout(224, 120, 104);

  it('칸 중심과 좌상단을 계산한다', () => {
    expect(layout.center(0, 0)).toEqual({ x: 276, y: 172 });
    expect(layout.topLeft(7, 4)).toEqual({ x: 224 + 7 * 104, y: 120 + 4 * 104 });
    expect(layout.center(0.5, 0)).toEqual({ x: 328, y: 172 });
  });

  it('게임 좌표에서 칸을 찾고 경계 밖은 null', () => {
    expect(layout.cellAt(225, 121)).toEqual({ col: 0, row: 0 });
    expect(layout.cellAt(224 + 104 * 8 - 1, 120 + 104 * 5 - 1)).toEqual({ col: 7, row: 4 });
    expect(layout.cellAt(223, 200)).toBeNull();
    expect(layout.cellAt(300, 119)).toBeNull();
    expect(layout.cellAt(224 + 104 * 8, 200)).toBeNull();
  });
});
