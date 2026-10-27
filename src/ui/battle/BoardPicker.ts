import type { Cell } from '../../core/combat/board';
import type { UnitView } from '../replay/ReplayState';
import type { BoardLayout } from './BoardLayout';

/** 게임 좌표 한 점이 가리키는 것: 칸(보드 밖이면 null)과 유닛(없으면 null) */
export interface BoardPick {
  cell: Cell | null;
  unitUid: number | null;
}

/**
 * 게임 좌표 → 칸/유닛 변환 (Phaser 비의존). 유닛 판정은 이동 중이면 보간된 위치(view.pos) 기준이다.
 * 살아 있는 유닛 중 중심이 반경 안이고 가장 가까운 유닛을 고른다.
 */
export class BoardPicker {
  constructor(
    private readonly layout: BoardLayout,
    private readonly unitRadius: number,
  ) {}

  pick(x: number, y: number, views: readonly UnitView[]): BoardPick {
    return { cell: this.layout.cellAt(x, y), unitUid: this.unitAt(x, y, views) };
  }

  private unitAt(x: number, y: number, views: readonly UnitView[]): number | null {
    let best: number | null = null;
    let bestDist = this.unitRadius;
    for (const view of views) {
      if (!view.alive) continue;
      const c = this.layout.center(view.pos.col, view.pos.row);
      const dist = Math.hypot(c.x - x, c.y - y);
      if (dist <= bestDist) {
        best = view.uid;
        bestDist = dist;
      }
    }
    return best;
  }
}
