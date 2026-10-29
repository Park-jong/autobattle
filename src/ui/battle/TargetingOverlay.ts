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

    // 범위: 칸 채움 + 굵은 테두리(맥동), 중심 칸은 더 밝게 + 모서리 브래킷
    for (const cell of view.areaCells) {
      const p = this.layout.topLeft(cell.col, cell.row);
      g.fillStyle(COLORS.TARGET_AREA, 0.2 + 0.2 * pulse);
      g.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
      g.lineStyle(4, COLORS.TARGET_AREA, 0.6 + 0.4 * pulse);
      g.strokeRect(p.x + 3, p.y + 3, size - 6, size - 6);
    }
    if (view.areaCenter) {
      const p = this.layout.topLeft(view.areaCenter.col, view.areaCenter.row);
      g.fillStyle(COLORS.TARGET_AREA_CENTER, 0.25);
      g.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
      this.brackets(p.x + 6, p.y + 6, size - 12, size - 12, 14, COLORS.TARGET_AREA_CENTER, 4);
    }
    // 범위 안에 들어오는 유닛: 주황 링
    for (const uid of view.areaUnits) {
      const u = units.get(uid);
      if (!u) continue;
      const c = this.layout.center(u.pos.col, u.pos.row);
      g.lineStyle(4, COLORS.TARGET_AREA_UNIT, 0.7 + 0.3 * pulse);
      g.strokeCircle(c.x, c.y, r + 7);
    }

    for (const uid of view.validUnits) {
      const u = units.get(uid);
      if (!u || uid === view.hoverUnit) continue;
      const c = this.layout.center(u.pos.col, u.pos.row);
      g.lineStyle(3, COLORS.TARGET_VALID, pulse);
      g.strokeCircle(c.x, c.y, r + 9);
    }

    // 가리키는 유효 대상: 맥동하는 굵은 이중 링 + 모서리 조준 브래킷
    const hovered = view.hoverUnit === null ? undefined : units.get(view.hoverUnit);
    if (hovered) {
      const c = this.layout.center(hovered.pos.col, hovered.pos.row);
      const wave = 3 * Math.sin(timeMs / 120);
      g.fillStyle(COLORS.TARGET_AIM, 0.25);
      g.fillCircle(c.x, c.y, r + 14);
      g.lineStyle(6, COLORS.TARGET_AIM, 1);
      g.strokeCircle(c.x, c.y, r + 14 + wave);
      g.lineStyle(3, COLORS.TARGET_VALID, 1);
      g.strokeCircle(c.x, c.y, r + 24 + wave);
      const half = r + 18;
      this.brackets(c.x - half, c.y - half, half * 2, half * 2, 12, COLORS.TARGET_AIM, 4);
    }

    // 대상이 될 수 없는 유닛 위: 빨간 X
    const bad = view.invalidHoverUnit === null ? undefined : units.get(view.invalidHoverUnit);
    if (bad) {
      const c = this.layout.center(bad.pos.col, bad.pos.row);
      const d = r * 0.6;
      g.lineStyle(5, COLORS.TARGET_INVALID, 0.9);
      g.strokeCircle(c.x, c.y, r + 6);
      g.lineBetween(c.x - d, c.y - d, c.x + d, c.y + d);
      g.lineBetween(c.x - d, c.y + d, c.x + d, c.y - d);
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

  /** 사각형 네 모서리에 ㄱ자 브래킷을 그린다 */
  private brackets(x: number, y: number, w: number, h: number, len: number, color: number, width: number): void {
    const g = this.gfx;
    g.lineStyle(width, color, 1);
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
      g.lineBetween(cx, cy, cx + sx * len, cy);
      g.lineBetween(cx, cy, cx, cy + sy * len);
    }
  }

  clear(): void {
    this.gfx.clear();
  }
}
