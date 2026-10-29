import type { NodeType } from '../../core/run';
import { NODE_TYPES } from '../../core/run';
import { commanderArt } from '../skin/commanderArt';
import { el, tagged } from './dom';
import { iconSvg } from './iconButton';
import { NODE_TYPE_INFO, type MapNodeView, type MapView } from './runViews';

const ROW_HEIGHT = 56;
const TOP_PAD = 28;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 노드 종류 아이콘 (원 안의 그림) */
export function nodeIconElement(type: NodeType): HTMLElement {
  const icon = el('span', `run-node-icon type-${type}`);
  icon.innerHTML = iconSvg(type, type === 'boss' ? 24 : 20);
  return icon;
}

/** 노드 종류 범례 */
export function mapLegend(): HTMLElement {
  const legend = el('div', 'run-legend');
  legend.append(el('h4', '', '범례'));
  for (const type of NODE_TYPES) {
    const row = el('div', 'run-legend-row');
    row.append(nodeIconElement(type), el('span', '', NODE_TYPE_INFO[type].label));
    legend.append(row);
  }
  return legend;
}

export interface MapBoardHandlers {
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onChoose?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

/** 13층 맵 판: 간선(SVG)·층 표시·노드 버튼·지휘관 현재 위치. 맵 화면과 전투 중 맵 창이 함께 쓴다 */
export function buildMapBoard(map: MapView, commanderId: string | undefined, handlers: MapBoardHandlers = {}): HTMLElement {
  const floorCount = map.floors.length;
  const height = TOP_PAD * 2 + (floorCount - 1) * ROW_HEIGHT;
  const yOf = (floor: number): number => TOP_PAD + (floorCount - floor) * ROW_HEIGHT;
  const xOf = (node: MapNodeView): number => 10 + node.x * 80;
  const board = el('div', 'run-map');
  board.style.height = `${height}px`;

  const nodes = new Map(map.floors.flat().map((n) => [n.id, n]));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'run-map-edges');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const edge of map.edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(xOf(a)));
    line.setAttribute('y1', String(yOf(a.floor)));
    line.setAttribute('x2', String(xOf(b)));
    line.setAttribute('y2', String(yOf(b.floor)));
    line.setAttribute('class', `edge edge-${edge.state}`);
    svg.append(line);
  }
  board.append(svg);

  for (let floor = 1; floor <= floorCount; floor++) {
    const label = el('div', 'run-floor-label', `${floor}층`);
    label.style.top = `${yOf(floor)}px`;
    board.append(label);
  }
  for (const node of nodes.values()) board.append(nodeButton(node, xOf(node), yOf(node.floor), handlers));
  const current = map.currentId ? nodes.get(map.currentId) : undefined;
  const marker = current ? commanderArt(commanderId, 'sd', 'academy-map-commander') : null;
  if (marker && current) {
    marker.style.left = `${xOf(current)}%`;
    marker.style.top = `${yOf(current.floor)}px`;
    marker.title = '지휘관의 현재 위치';
    marker.alt = '현재 위치';
    board.append(marker);
  }
  return board;
}

function nodeButton(node: MapNodeView, x: number, y: number, handlers: MapBoardHandlers): HTMLElement {
  const classes = ['run-node', `type-${node.type}`, `state-${node.state}`];
  if (node.id === handlers.selectedId) classes.push('selected');
  const box = tagged(el('button', classes.join(' ')), `node-${node.id}`);
  box.type = 'button';
  box.dataset.nodeId = node.id;
  box.dataset.state = node.state;
  box.dataset.type = node.type;
  box.style.left = `${x}%`;
  box.style.top = `${y}px`;
  box.setAttribute('aria-label', `${node.floor}층 ${node.label}${node.state === 'available' ? ' (선택 가능)' : node.state === 'visited' ? ' (방문함)' : node.state === 'current' ? ' (현재 위치)' : ''}`);
  box.append(nodeIconElement(node.type), el('span', 'run-node-label', node.label));
  box.addEventListener('click', () => handlers.onSelect?.(node.id));
  box.addEventListener('dblclick', () => {
    if (node.state === 'available') handlers.onChoose?.(node.id);
  });
  box.addEventListener('mouseenter', () => handlers.onHover?.(node.id));
  box.addEventListener('mouseleave', () => handlers.onHover?.(null));
  return box;
}
