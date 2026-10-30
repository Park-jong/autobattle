import type { NodeType } from '../../core/run';
import { NODE_TYPES } from '../../core/run';
import { commanderArt } from '../skin/commanderArt';
import { el, tagged } from './dom';
import { iconSvg } from './iconButton';
import { NODE_TYPE_INFO, type MapNodeView, type MapView } from './runViews';

const ROW_HEIGHT = 82;
const TOP_PAD = 64;
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
  const terrain = el('div', 'route-terrain');
  terrain.setAttribute('aria-hidden', 'true');
  terrain.innerHTML = `<svg viewBox="0 0 800 1100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor"><path d="M-40 40C230-30 100 200 330 240S650 120 850 290M-40 65C210 0 100 225 320 265S650 145 850 315M-40 90C190 30 100 250 310 290S650 170 850 340M-40 115C170 60 100 275 300 315S650 195 850 365"/><path d="M-30 700C130 520 330 780 490 640S680 540 830 620M-30 725C130 545 330 805 490 665S680 565 830 645M-30 750C130 570 330 830 490 690S680 590 830 670M-30 775C130 595 330 855 490 715S680 615 830 695"/><path d="M80 1100C170 920 60 850 120 700S300 500 260 380S440 160 390-30" stroke-width="18" opacity=".25"/><path d="m620 390 25-42 25 42m-36-18 22 34 22-34m-54 53 25-42 25 42M76 880l24-40 24 40m-12 40 24-40 24 40" stroke-width="2"/></g></svg>`;
  board.append(terrain);

  const nodes = new Map(map.floors.flat().map((n) => [n.id, n]));
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'run-map-edges');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const edge of map.edges) {
    const a = nodes.get(edge.from);
    const b = nodes.get(edge.to);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'path');
    const mid = (yOf(a.floor) + yOf(b.floor)) / 2;
    line.setAttribute('d', `M ${xOf(a)} ${yOf(a.floor)} C ${xOf(a)} ${mid}, ${xOf(b)} ${mid}, ${xOf(b)} ${yOf(b.floor)}`);
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
  if (current) {
    const marker = el('div', `route-position${current.x > .7 ? ' at-left' : ''}`);
    marker.style.left = `${xOf(current)}%`;
    marker.style.top = `${yOf(current.floor)}px`;
    const art = commanderArt(commanderId, 'sd', 'route-commander');
    if (art) marker.append(art);
    marker.append(el('span', '', '현재 위치'));
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
  box.setAttribute('aria-expanded', String(node.id === handlers.selectedId));
  box.setAttribute('aria-haspopup', 'dialog');
  box.append(nodeIconElement(node.type), el('span', 'run-node-label', node.label));
  box.addEventListener('click', () => handlers.onSelect?.(node.id));
  box.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') handlers.onHover?.(node.id);
  });
  box.addEventListener('pointerleave', () => handlers.onHover?.(null));
  box.addEventListener('focus', () => handlers.onHover?.(node.id));
  box.addEventListener('blur', () => handlers.onHover?.(null));
  return box;
}
