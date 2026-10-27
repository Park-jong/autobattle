import { BOARD_COLS, NEIGHBOR_OFFSETS, chebyshev, isInsideBoard, type Cell } from './board';

interface Node {
  cell: Cell;
  g: number;
  h: number;
  order: number;
  parent: Node | null;
}

function keyOf(c: Cell): number {
  return c.row * BOARD_COLS + c.col;
}

/**
 * 8방향 그리드 A*.
 * 목표: target과의 Chebyshev 거리가 range 이하인 칸. 반환: start 다음 칸부터 목표 칸까지의 경로.
 * 이미 사거리 안이면 빈 배열, 경로가 없으면 null.
 * stepCost(cell)이 null이면 통행 불가, 아니면 그 칸에 들어가는 비용(≥1).
 * 동률은 (f, h, 삽입 순서)로 깨서 결과가 결정론적이다.
 */
export function findPath(
  start: Cell,
  target: Cell,
  range: number,
  stepCost: (cell: Cell) => number | null,
): Cell[] | null {
  if (chebyshev(start, target) <= range) return [];

  const heuristic = (c: Cell) => Math.max(0, chebyshev(c, target) - range);
  const open: Node[] = [{ cell: start, g: 0, h: heuristic(start), order: 0, parent: null }];
  const bestG = new Map<number, number>([[keyOf(start), 0]]);
  const closed = new Set<number>();
  let order = 1;

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i] as Node;
      const b = open[bestIndex] as Node;
      const fa = a.g + a.h;
      const fb = b.g + b.h;
      if (fa < fb || (fa === fb && (a.h < b.h || (a.h === b.h && a.order < b.order)))) bestIndex = i;
    }
    const node = open.splice(bestIndex, 1)[0] as Node;
    const key = keyOf(node.cell);
    if (closed.has(key)) continue;
    closed.add(key);

    if (node.h === 0) {
      const path: Cell[] = [];
      for (let n: Node | null = node; n !== null && n.parent !== null; n = n.parent) path.push(n.cell);
      return path.reverse();
    }

    for (const offset of NEIGHBOR_OFFSETS) {
      const cell = { col: node.cell.col + offset.col, row: node.cell.row + offset.row };
      if (!isInsideBoard(cell)) continue;
      const neighborKey = keyOf(cell);
      if (closed.has(neighborKey)) continue;
      const cost = stepCost(cell);
      if (cost === null) continue;
      const g = node.g + cost;
      const known = bestG.get(neighborKey);
      if (known !== undefined && known <= g) continue;
      bestG.set(neighborKey, g);
      open.push({ cell, g, h: heuristic(cell), order: order++, parent: node });
    }
  }
  return null;
}
