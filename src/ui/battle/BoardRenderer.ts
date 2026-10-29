import Phaser from 'phaser';
import { BOARD_COLS, BOARD_ROWS, frontCol, type Cell } from '../../core/combat/board';
import { createText, type HiDpiMetrics } from '../hidpi';
import { ACADEMY_COLORS, COLORS, LAYOUT, TEXT_COLORS } from '../theme';
import type { BoardLayout } from './BoardLayout';

/** 8x5 보드 배경: 아군/적 영역 색 구분, 전열 열 표시, 과열 테두리, 편성 중 커서 강조 */
export class BoardRenderer {
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private academy = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layout: BoardLayout,
    private readonly metrics: HiDpiMetrics,
  ) {
    this.backdrop = scene.add.graphics().setDepth(0);
    this.drawStatic(scene, metrics);
    this.dynamic = scene.add.graphics().setDepth(1);
  }

  setAcademy(value: boolean): void {
    if (value === this.academy) return;
    this.academy = value;
    this.drawStatic(this.scene, this.metrics);
  }

  /** 매 프레임 호출: 과열 테두리와 커서 칸 강조를 그린다. */
  drawDynamic(overheating: boolean, hover: { cell: Cell; valid: boolean } | null, openCells: readonly Cell[] = [], pulse = 0): void {
    const g = this.dynamic;
    g.clear();
    const { originX, originY, width, height, cellSize } = this.layout;
    // 배치 인원이 상한보다 적으면 아군 진영의 빈 칸이 맥동하며 "여기에 더 놓을 수 있다"를 알린다
    for (const cell of openCells) {
      const p = this.layout.topLeft(cell.col, cell.row);
      g.fillStyle(COLORS.OPEN_SLOT, 0.05 + 0.09 * pulse);
      g.fillRect(p.x + 3, p.y + 3, cellSize - 6, cellSize - 6);
      g.lineStyle(2, COLORS.OPEN_SLOT, 0.25 + 0.4 * pulse);
      g.strokeRect(p.x + 6, p.y + 6, cellSize - 12, cellSize - 12);
    }
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
    const g = this.backdrop;
    g.clear();
    for (const label of this.labels) label.destroy();
    this.labels = [];
    const palette = this.academy ? ACADEMY_COLORS : COLORS;
    const size = this.layout.cellSize;
    if (this.academy) {
      g.fillStyle(0x060a14, 0.8);
      g.fillRoundedRect(this.layout.originX - 14, this.layout.originY - 14, this.layout.width + 28, this.layout.height + 28, 14);
      g.lineStyle(1, palette.BOARD_BORDER, 0.3);
      g.strokeRoundedRect(this.layout.originX - 11, this.layout.originY - 11, this.layout.width + 22, this.layout.height + 22, 10);
    }
    for (let col = 0; col < BOARD_COLS; col++) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        const ally = col < BOARD_COLS / 2;
        const alt = (col + row) % 2 === 0;
        const color = ally
          ? alt ? palette.ALLY_CELL_A : palette.ALLY_CELL_B
          : alt ? palette.ENEMY_CELL_A : palette.ENEMY_CELL_B;
        const p = this.layout.topLeft(col, row);
        g.fillStyle(color, 1);
        g.fillRect(p.x, p.y, size, size);
      }
    }
    // 전열 열(아군 3, 적 4) 강조
    for (const side of [0, 1] as const) {
      const p = this.layout.topLeft(frontCol(side), 0);
      g.fillStyle(COLORS.FRONT_TINT, 0.08);
      g.fillRect(p.x, p.y, size, this.layout.height);
    }
    if (this.academy) {
      const cx = this.layout.originX + this.layout.width / 2, cy = this.layout.originY + this.layout.height / 2;
      g.lineStyle(1, 0xd0b781, 0.12);
      for (const radius of [174, 184, 242]) g.strokeCircle(cx, cy, radius);
      const vertices = Array.from({ length: 7 }, (_, i) => ({ x: cx + Math.cos(i * Math.PI / 3) * 184, y: cy + Math.sin(i * Math.PI / 3) * 184 }));
      g.strokePoints(vertices, false);
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6;
        g.lineBetween(cx + Math.cos(angle) * 232, cy + Math.sin(angle) * 232, cx + Math.cos(angle) * 242, cy + Math.sin(angle) * 242);
      }
    }
    g.lineStyle(1, palette.GRID_LINE, this.academy ? 0.55 : 1);
    for (let col = 0; col <= BOARD_COLS; col++) {
      const p = this.layout.topLeft(col, 0);
      g.lineBetween(p.x, p.y, p.x, p.y + this.layout.height);
    }
    for (let row = 0; row <= BOARD_ROWS; row++) {
      const p = this.layout.topLeft(0, row);
      g.lineBetween(p.x, p.y, p.x + this.layout.width, p.y);
    }
    g.lineStyle(2, palette.BOARD_BORDER, this.academy ? 0.7 : 1);
    g.strokeRect(this.layout.originX, this.layout.originY, this.layout.width, this.layout.height);

    // 라벨
    const half = (BOARD_COLS / 2) * size;
    const labelStyle = { fontSize: '20px', color: TEXT_COLORS.MUTED };
    this.labels.push(createText(scene, metrics, this.layout.originX + half / 2, LAYOUT.SIDE_LABEL_Y, this.academy ? '◇ 아카데미 분대' : '아군 영역', labelStyle).setOrigin(0.5));
    this.labels.push(createText(scene, metrics, this.layout.originX + half * 1.5, LAYOUT.SIDE_LABEL_Y, this.academy ? '금서의 잔영 ◇' : '적 영역', labelStyle).setOrigin(0.5));
    for (const side of [0, 1] as const) {
      const c = this.layout.center(frontCol(side), 0);
      this.labels.push(createText(scene, metrics, c.x, LAYOUT.FRONT_LABEL_Y, '전열', { fontSize: '18px', color: TEXT_COLORS.MUTED }).setOrigin(0.5));
    }
  }
}
