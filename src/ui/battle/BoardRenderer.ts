import Phaser from 'phaser';
import { BOARD_COLS, BOARD_ROWS, frontCol, type Cell } from '../../core/combat/board';
import { createText, type HiDpiMetrics } from '../hidpi';
import { COLORS, LAYOUT, TEXT_COLORS } from '../theme';
import type { BoardLayout } from './BoardLayout';

/** 8x5 보드 배경: 아군/적 영역 색 구분, 전열 열 표시, 과열 테두리, 편성 중 커서 강조 */
export class BoardRenderer {
  private readonly dynamic: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: BoardLayout,
    metrics: HiDpiMetrics,
  ) {
    this.drawStatic(scene, metrics);
    this.dynamic = scene.add.graphics().setDepth(1);
  }

  /** 매 프레임 호출: 과열 테두리와 커서 칸 강조를 그린다. */
  drawDynamic(overheating: boolean, hover: { cell: Cell; valid: boolean } | null): void {
    const g = this.dynamic;
    g.clear();
    const { originX, originY, width, height, cellSize } = this.layout;
    if (overheating) {
      g.lineStyle(6, COLORS.OVERHEAT_BORDER, 0.9);
      g.strokeRect(originX - 3, originY - 3, width + 6, height + 6);
    }
    if (hover) {
      const p = this.layout.topLeft(hover.cell.col, hover.cell.row);
      g.lineStyle(4, hover.valid ? COLORS.HOVER_OK : COLORS.HOVER_BAD, 1);
      g.strokeRect(p.x + 2, p.y + 2, cellSize - 4, cellSize - 4);
    }
  }

  private drawStatic(scene: Phaser.Scene, metrics: HiDpiMetrics): void {
    const g = scene.add.graphics().setDepth(0);
    const size = this.layout.cellSize;
    g.fillStyle(0x17151f, 1);
    g.fillRoundedRect(this.layout.originX - 12, this.layout.originY - 12, this.layout.width + 24, this.layout.height + 24, 8);
    for (let col = 0; col < BOARD_COLS; col++) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        const ally = col < BOARD_COLS / 2;
        const alt = (col + row) % 2 === 0;
        const color = ally
          ? alt ? COLORS.ALLY_CELL_A : COLORS.ALLY_CELL_B
          : alt ? COLORS.ENEMY_CELL_A : COLORS.ENEMY_CELL_B;
        const p = this.layout.topLeft(col, row);
        g.fillStyle(color, 1);
        g.fillRoundedRect(p.x + 3, p.y + 3, size - 6, size - 6, 5);
        g.lineStyle(1, ally ? 0x645472 : 0x755065, .4);
        g.strokeRoundedRect(p.x + 3, p.y + 3, size - 6, size - 6, 5);
      }
    }
    // 전열 열(아군 3, 적 4) 강조
    for (const side of [0, 1] as const) {
      const p = this.layout.topLeft(frontCol(side), 0);
      g.fillStyle(COLORS.FRONT_TINT, 0.08);
      g.fillRect(p.x, p.y, size, this.layout.height);
    }
    g.lineStyle(1, COLORS.GRID_LINE, .3);
    for (let col = 0; col <= BOARD_COLS; col++) {
      const p = this.layout.topLeft(col, 0);
      g.lineBetween(p.x, p.y, p.x, p.y + this.layout.height);
    }
    for (let row = 0; row <= BOARD_ROWS; row++) {
      const p = this.layout.topLeft(0, row);
      g.lineBetween(p.x, p.y, p.x + this.layout.width, p.y);
    }
    g.lineStyle(2, COLORS.BOARD_BORDER, 1);
    g.strokeRect(this.layout.originX, this.layout.originY, this.layout.width, this.layout.height);

    // 라벨
    const half = (BOARD_COLS / 2) * size;
    const labelStyle = { fontSize: '13px', color: TEXT_COLORS.MUTED };
    createText(scene, metrics, this.layout.originX + half / 2, LAYOUT.SIDE_LABEL_Y, '01 / ALLIED AGENTS', labelStyle).setOrigin(0.5);
    createText(scene, metrics, this.layout.originX + half * 1.5, LAYOUT.SIDE_LABEL_Y, '02 / HOSTILE SQUAD', labelStyle).setOrigin(0.5);
    for (const side of [0, 1] as const) {
      const c = this.layout.center(frontCol(side), 0);
      createText(scene, metrics, c.x, LAYOUT.FRONT_LABEL_Y + 9, 'FRONT LINE', { fontSize: '10px', color: TEXT_COLORS.MUTED }).setOrigin(0.5);
    }
  }
}
