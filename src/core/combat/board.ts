/** 전투 보드: 8열 × 5행. 아군(side 0)은 열 0~3, 적(side 1)은 열 4~7. */

export type Side = 0 | 1;

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export const BOARD_COLS = 8;
export const BOARD_ROWS = 5;
/** 한 진영의 열 수 */
export const HALF_COLS = 4;

/** 8방향 이웃 (탐색 순서가 결정론의 일부이므로 고정) */
export const NEIGHBOR_OFFSETS: readonly Cell[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 1 },
  { col: 1, row: -1 },
  { col: -1, row: 1 },
  { col: -1, row: -1 },
];

export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

export function isInsideBoard(c: Cell): boolean {
  return c.col >= 0 && c.col < BOARD_COLS && c.row >= 0 && c.row < BOARD_ROWS;
}

export function sideOfCol(col: number): Side {
  return col < HALF_COLS ? 0 : 1;
}

/** 해당 진영 영역 안의 칸인지 */
export function isInOwnHalf(side: Side, c: Cell): boolean {
  return isInsideBoard(c) && sideOfCol(c.col) === side;
}

/** 전열 = 중앙에 가장 가까운 열 (아군 3, 적 4) */
export function frontCol(side: Side): number {
  return side === 0 ? HALF_COLS - 1 : HALF_COLS;
}

/** 후열 = 중앙에서 가장 먼 열 (아군 0, 적 7) */
export function backCol(side: Side): number {
  return side === 0 ? 0 : BOARD_COLS - 1;
}

/** from에서 through 방향으로 보드 끝까지 뻗는 직선이 지나는 칸들 (from 제외, 가까운 순) */
export function rayCells(from: Cell, through: Cell): Cell[] {
  const dx = through.col - from.col;
  const dy = through.row - from.row;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  const cells: Cell[] = [];
  if (steps === 0) return cells;
  for (let i = 1; ; i++) {
    const cell = {
      col: Math.round(from.col + (dx * i) / steps),
      row: Math.round(from.row + (dy * i) / steps),
    };
    if (!isInsideBoard(cell)) break;
    cells.push(cell);
  }
  return cells;
}

/**
 * from에서 through 방향을 가운데로 arrows개의 직선(부채꼴, 인접 직선 사이 stepDegrees도)이 지나는 칸들.
 * 직선마다 from 제외, 가까운 순, 중복 없이 보드 끝까지. 첫 번째 직선이 가장 시계 반대(행이 작은) 쪽이다.
 */
export function fanRays(from: Cell, through: Cell, arrows = 5, stepDegrees = 15): Cell[][] {
  const base = Math.atan2(through.row - from.row, through.col - from.col);
  const rays: Cell[][] = [];
  for (let k = 0; k < arrows; k++) {
    const angle = base + (((k - (arrows - 1) / 2) * stepDegrees) * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const cells: Cell[] = [];
    for (let s = 0.5; s <= BOARD_COLS + 1; s += 0.5) {
      // 정확히 .5인 좌표는 반올림 오차로 흔들리지 않게 아주 작은 편향을 준다. +0은 -0을 0으로 만든다
      const cell = { col: Math.round(from.col + dx * s + 1e-9) + 0, row: Math.round(from.row + dy * s + 1e-9) + 0 };
      if (!isInsideBoard(cell)) break;
      const last = cells[cells.length - 1];
      if (sameCell(cell, from) || (last && sameCell(last, cell))) continue;
      cells.push(cell);
    }
    rays.push(cells);
  }
  return rays;
}

function keyOf(c: Cell): number {
  return c.row * BOARD_COLS + c.col;
}

/**
 * 칸 점유와 이동 예약.
 * 점유: 유닛이 서 있는 칸. 예약: 이동 중인 유닛의 목적 칸.
 * 점유되었거나 예약된 칸에는 다른 유닛이 들어갈 수 없다.
 */
export class Board {
  private readonly occupants = new Map<number, number>();
  private readonly reservations = new Map<number, number>();

  occupantAt(cell: Cell): number | undefined {
    return this.occupants.get(keyOf(cell));
  }

  reservedBy(cell: Cell): number | undefined {
    return this.reservations.get(keyOf(cell));
  }

  /** 비어 있고 예약도 없는 칸 */
  isFree(cell: Cell): boolean {
    if (!isInsideBoard(cell)) return false;
    const key = keyOf(cell);
    return !this.occupants.has(key) && !this.reservations.has(key);
  }

  place(uid: number, cell: Cell): void {
    if (!this.isFree(cell)) throw new Error(`배치 불가: (${cell.col},${cell.row})가 비어 있지 않음`);
    this.occupants.set(keyOf(cell), uid);
  }

  /** 이동 시작: 목적 칸을 예약한다. 출발 칸은 도착 전까지 계속 점유한다. */
  reserve(uid: number, cell: Cell): void {
    if (!this.isFree(cell)) throw new Error(`예약 불가: (${cell.col},${cell.row})가 비어 있지 않음`);
    this.reservations.set(keyOf(cell), uid);
  }

  /** 이동 완료: 출발 칸 점유를 풀고 예약해 둔 목적 칸을 점유한다. */
  completeMove(uid: number, from: Cell, to: Cell): void {
    if (this.occupants.get(keyOf(from)) !== uid) throw new Error('이동 완료 실패: 출발 칸 점유자가 다름');
    if (this.reservations.get(keyOf(to)) !== uid) throw new Error('이동 완료 실패: 목적 칸 예약자가 다름');
    this.occupants.delete(keyOf(from));
    this.reservations.delete(keyOf(to));
    this.occupants.set(keyOf(to), uid);
  }

  /** 순간이동 등: 빈 칸으로 즉시 옮긴다. */
  relocate(uid: number, from: Cell, to: Cell): void {
    if (this.occupants.get(keyOf(from)) !== uid) throw new Error('이동 실패: 출발 칸 점유자가 다름');
    if (!this.isFree(to)) throw new Error(`이동 불가: (${to.col},${to.row})가 비어 있지 않음`);
    this.occupants.delete(keyOf(from));
    this.occupants.set(keyOf(to), uid);
  }

  /** 두 유닛의 칸을 맞바꾼다. */
  swap(uidA: number, cellA: Cell, uidB: number, cellB: Cell): void {
    if (this.occupants.get(keyOf(cellA)) !== uidA || this.occupants.get(keyOf(cellB)) !== uidB) {
      throw new Error('교환 실패: 점유자가 다름');
    }
    this.occupants.set(keyOf(cellA), uidB);
    this.occupants.set(keyOf(cellB), uidA);
  }

  /** 사망 등: 해당 유닛의 점유·예약을 모두 해제 */
  release(uid: number): void {
    for (const map of [this.occupants, this.reservations]) {
      for (const [key, value] of map) if (value === uid) map.delete(key);
    }
  }
}

/**
 * from에 가장 가까운(체비쇼프) 빈 칸을 side 진영 영역 안에서 찾는다. from이 비어 있으면 from.
 * 같은 거리면 (열, 행) 오름차순 — 결정론. 빈 칸이 없으면 null.
 */
export function nearestFreeCell(board: Board, from: Cell, side: Side): Cell | null {
  let best: Cell | null = null;
  let bestDistance = Infinity;
  for (let col = 0; col < BOARD_COLS; col++) {
    for (let row = 0; row < BOARD_ROWS; row++) {
      const cell = { col, row };
      if (!isInOwnHalf(side, cell) || !board.isFree(cell)) continue;
      const distance = chebyshev(cell, from);
      if (distance < bestDistance) {
        best = cell;
        bestDistance = distance;
      }
    }
  }
  return best;
}
