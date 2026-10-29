import type { RunCommands, RunSnapshot, RunViewSource } from './contracts';
import { button, el, tagged } from './dom';
import { encounterPreviewElement } from './encounterPreview';
import { hudElement } from './hudElement';
import { NODE_TYPE_INFO, type MapNodeView, type MapView } from './runViews';
import { NODE_TYPES } from '../../core/run';
import { commanderArt } from '../skin/commanderArt';

const ROW_HEIGHT = 56;
const TOP_PAD = 28;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 맵 화면: 13층 노드·간선, 방문 경로·현재 위치·선택 가능 노드 강조, 노드 선택 시 적 편성 미리보기 */
export class MapScreen {
  readonly root = el('div', 'run-map-screen');
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private readonly side = el('aside', 'run-map-side');

  constructor(
    private readonly view: RunViewSource,
    private readonly commands: RunCommands,
  ) {}

  render(snap: RunSnapshot): void {
    const map = snap.map;
    const hud = snap.hud;
    if (!map || !hud) return;
    this.hoverId = null; // 다시 그리면 마우스를 올린 노드 요소가 사라지므로 mouseleave가 오지 않는다
    // 선택한 노드가 더 이상 맵에 없거나 이미 지난 단계라면 선택을 지운다
    if (this.selectedId && !map.floors.flat().some((n) => n.id === this.selectedId)) this.selectedId = null;
    const header = el('div', 'run-screen-header');
    header.append(hudElement(hud), tagged(button('시작 화면', () => this.commands.toStart()), 'to-start'));
    const actBar = tagged(el('div', 'run-act-bar'), 'act-title');
    actBar.append(el('h2', 'run-act-name', `액트 ${map.act} — ${map.actName}`), el('p', 'dbg-hint', `${map.region} · ${map.actText} (액트 ${map.act} / ${map.actCount})`));

    const scroll = tagged(el('div', 'run-map-scroll'), 'map-scroll');
    scroll.append(this.buildMap(map, hud.commanderId));
    const layout = el('div', 'run-map-layout');
    layout.append(scroll, this.side);
    this.root.replaceChildren(header, actBar, layout);
    this.renderSide(map);
    // 현재 위치(또는 시작점)가 보이도록 스크롤한다
    queueMicrotask(() => {
      const focus = scroll.querySelector<HTMLElement>('.state-current, .state-available');
      focus?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }

  private buildMap(map: MapView, commanderId?: string): HTMLElement {
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
    for (const node of nodes.values()) board.append(this.nodeButton(node, xOf(node), yOf(node.floor)));
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

  private nodeButton(node: MapNodeView, x: number, y: number): HTMLElement {
    const classes = ['run-node', `type-${node.type}`, `state-${node.state}`];
    if (node.id === this.selectedId) classes.push('selected');
    const box = tagged(el('button', classes.join(' ')), `node-${node.id}`);
    box.type = 'button';
    box.dataset.nodeId = node.id;
    box.dataset.state = node.state;
    box.dataset.type = node.type;
    box.style.left = `${x}%`;
    box.style.top = `${y}px`;
    box.setAttribute('aria-label', `${node.floor}층 ${node.label}${node.state === 'available' ? ' (선택 가능)' : node.state === 'visited' ? ' (방문함)' : node.state === 'current' ? ' (현재 위치)' : ''}`);
    box.append(el('span', 'run-node-icon', node.icon), el('span', 'run-node-label', node.label));
    box.addEventListener('click', () => this.select(node.id));
    box.addEventListener('dblclick', () => {
      if (node.state === 'available') this.commands.chooseNode(node.id);
    });
    box.addEventListener('mouseenter', () => { this.hoverId = node.id; this.refreshSide(); });
    box.addEventListener('mouseleave', () => { this.hoverId = null; this.refreshSide(); });
    return box;
  }

  private select(id: string): void {
    this.selectedId = this.selectedId === id ? null : id;
    this.root.querySelectorAll('.run-node.selected').forEach((n) => n.classList.remove('selected'));
    if (this.selectedId) this.root.querySelector(`.run-node[data-node-id="${CSS.escape(this.selectedId)}"]`)?.classList.add('selected');
    this.refreshSide();
  }

  private refreshSide(): void {
    this.renderSide(this.view.snapshot().map);
  }

  private renderSide(map: MapView | null): void {
    if (!map) return;
    const shownId = this.hoverId ?? this.selectedId;
    const node = shownId ? map.floors.flat().find((n) => n.id === shownId) : undefined;
    const parts: HTMLElement[] = [];
    if (node) {
      const preview = this.view.previewNode(node.id);
      // 전투 미리보기 머리글이 이미 "N층 종류"를 보여 주므로 제목은 비전투 노드에만 붙인다
      if (preview) parts.push(encounterPreviewElement(preview));
      else parts.push(tagged(el('h3', '', `액트 ${map.act} · ${node.floor}층 ${node.label}`), 'node-title'), el('p', 'dbg-hint', this.describeNonBattle(node)));
      if (node.id === this.selectedId) {
        const go = tagged(button('이 노드로 이동', () => this.commands.chooseNode(node.id), 'dbg-btn dbg-primary'), 'choose-node');
        go.disabled = node.state !== 'available';
        parts.push(go);
        if (node.state !== 'available') parts.push(el('p', 'dbg-hint', node.state === 'locked' ? '지금은 갈 수 없는 노드입니다 (현재 위치에서 이어진 다음 층만 선택 가능).' : '이미 지나온 노드입니다.'));
      }
    } else {
      parts.push(el('p', 'dbg-hint', '노드에 마우스를 올리거나 눌러서 확인하세요. 초록 테두리 노드로 이동할 수 있습니다.'));
    }
    const legend = el('div', 'run-legend');
    legend.append(el('h4', '', '범례'));
    for (const type of NODE_TYPES) {
      const row = el('div', 'run-legend-row');
      row.append(el('span', `run-node-icon type-${type}`, NODE_TYPE_INFO[type].icon), el('span', '', NODE_TYPE_INFO[type].label));
      legend.append(row);
    }
    parts.push(legend);
    this.side.replaceChildren(...parts);
  }

  private describeNonBattle(node: MapNodeView): string {
    switch (node.type) {
      case 'shop': return '카드를 사고 팔 수 있는 상점입니다. 카드 제거 서비스도 있습니다.';
      case 'event': return '선택지가 있는 이벤트입니다. 무슨 일이 생길지는 들어가 봐야 압니다.';
      case 'camp': return '휴식(HP 회복) / 카드 강화 / 유닛 승급 중 하나를 고를 수 있습니다.';
      default: return '';
    }
  }
}
