import { BOARD_COLS, BOARD_ROWS, type Cell } from '../../core/combat/board';

export interface Point {
  x: number;
  y: number;
}

/** 칸 좌표 ↔ 게임 좌표(1280x720 기준) 변환. Phaser 비의존 순수 클래스 */
export class BoardLayout {
  constructor(
    readonly originX: number,
    readonly originY: number,
    readonly cellSize: number,
  ) {}

  get width(): number {
    return BOARD_COLS * this.cellSize;
  }

  get height(): number {
    return BOARD_ROWS * this.cellSize;
  }

  /** 칸(소수 가능)의 중심 좌표 */
  center(col: number, row: number): Point {
    return {
      x: this.originX + (col + 0.5) * this.cellSize,
      y: this.originY + (row + 0.5) * this.cellSize,
    };
  }

  /** 칸의 좌상단 좌표 */
  topLeft(col: number, row: number): Point {
    return { x: this.originX + col * this.cellSize, y: this.originY + row * this.cellSize };
  }

  /** 게임 좌표가 속한 칸. 보드 밖이면 null */
  cellAt(x: number, y: number): Cell | null {
    const col = Math.floor((x - this.originX) / this.cellSize);
    const row = Math.floor((y - this.originY) / this.cellSize);
    if (col < 0 || col >= BOARD_COLS || row < 0 || row >= BOARD_ROWS) return null;
    return { col, row };
  }
}
