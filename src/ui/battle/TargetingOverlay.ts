import Phaser from 'phaser';
import type { UnitView } from '../replay/ReplayState';
import type { TargetingView } from '../debug/contracts';
import { COLORS, LAYOUT } from '../theme';
import type { BoardLayout } from './BoardLayout';

/**
 * 카드 대상 지정 중 보드 위에 겹쳐 그리는 강조: 유효 대상 링, 고른 대상, 가리키는 대상, 범위 미리보기, 놓을 곳.
 * TargetingView(세션이 계산한 값)만 보고 그린다.
 */
export class TargetingOverlay {
  private readonly gfx: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly layout: BoardLayout,
  ) {
    this.gfx = scene.add.graphics().setDepth(15);
  }

  /** timeMs: 깜박임 계산용 실시간(밀리초) */
  update(view: TargetingView, units: ReadonlyMap<number, UnitView>, timeMs: number): void {
    const g = this.gfx;
    g.clear();
    if (!view.active) return;
    const pulse = 0.55 + 0.3 * Math.sin(timeMs / 180);
    const r = LAYOUT.UNIT_RADIUS;
    const size = this.layout.cellSize;

    if (view.dropZone) {
      g.fillStyle(COLORS.TARGET_DROP_ZONE, 0.06 + 0.04 * pulse);
      g.fillRect(this.layout.originX, this.layout.originY, this.layout.width, this.layout.height);
      g.lineStyle(4, COLORS.TARGET_DROP_ZONE, pulse);
      g.strokeRect(this.layout.originX - 2, this.layout.originY - 2, this.layout.width + 4, this.layout.height + 4);
    }

    for (const cell of view.areaCells) {
      const p = this.layout.topLeft(cell.col, cell.row);
      g.fillStyle(COLORS.TARGET_AREA, 0.35);
      g.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
      g.lineStyle(3, COLORS.TARGET_AREA, 1);
      g.strokeRect(p.x + 2, p.y + 2, size - 4, size - 4);
    }

    for (const uid of view.validUnits) {
      const u = units.get(uid);
      if (!u) continue;
      const c = this.layout.center(u.pos.col, u.pos.row);
      const hovered = uid === view.hoverUnit;
      g.lineStyle(hovered ? 5 : 3, COLORS.TARGET_VALID, hovered ? 1 : pulse);
      g.strokeCircle(c.x, c.y, r + (hovered ? 12 : 9));
      if (hovered) {
        g.fillStyle(COLORS.TARGET_VALID, 0.22);
        g.fillCircle(c.x, c.y, r + 12);
      }
    }

    // 이미 고른 유닛: 노란 이중 링과 순서 점
    view.selectedUnits.forEach((uid, i) => {
      const u = units.get(uid);
      if (!u) return;
      const c = this.layout.center(u.pos.col, u.pos.row);
      g.lineStyle(5, COLORS.TARGET_SELECTED, 1);
      g.strokeCircle(c.x, c.y, r + 12);
      g.fillStyle(COLORS.TARGET_SELECTED, 1);
      for (let n = 0; n <= i; n++) g.fillCircle(c.x - 8 + n * 16, c.y - r - 22, 5);
    });
  }

  clear(): void {
    this.gfx.clear();
  }
}
