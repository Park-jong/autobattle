import type { RunCommands, RunSnapshot, RunViewSource } from './contracts';
import { CardListModal, type CardListSpec } from './CardListModal';
import { button, el, tagged } from './dom';
import { iconButton } from './iconButton';
import { encounterPreviewElement } from './encounterPreview';
import { hudElement } from './hudElement';
import { buildMapBoard, mapLegend } from './mapBoard';
import type { MapNodeView, MapView } from './runViews';

/** 맵 화면: 13층 노드·간선, 방문 경로·현재 위치·선택 가능 노드 강조, 노드 선택 시 적 편성 미리보기 */
export class MapScreen {
  readonly root = el('div', 'run-map-screen');
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private readonly side = el('aside', 'run-map-side');

  constructor(
    private readonly view: RunViewSource,
    private readonly commands: RunCommands,
    private readonly deckModal = new CardListModal(),
  ) {}

  private deckSpec(snap: RunSnapshot): CardListSpec {
    return { title: '덱', entries: snap.deck ?? [] };
  }

  render(snap: RunSnapshot): void {
    const map = snap.map;
    const hud = snap.hud;
    if (!map || !hud) return;
    this.hoverId = null; // 다시 그리면 마우스를 올린 노드 요소가 사라지므로 mouseleave가 오지 않는다
    // 선택한 노드가 더 이상 맵에 없거나 이미 지난 단계라면 선택을 지운다
    if (this.selectedId && !map.floors.flat().some((n) => n.id === this.selectedId)) this.selectedId = null;
    const header = el('div', 'run-screen-header');
    const openDeck = tagged(iconButton('deck', '덱 보기', () => this.deckModal.open(this.deckSpec(this.view.snapshot()))), 'open-deck');
    // 덱 보기는 시작 화면 버튼 바로 옆에 붙여 둔다
    const actions = el('div', 'run-header-actions');
    actions.append(openDeck, tagged(iconButton('home', '시작 화면으로', () => this.commands.toStart()), 'to-start'));
    header.append(hudElement(hud), actions);
    this.deckModal.update(this.deckSpec(snap));
    const actBar = tagged(el('div', 'run-act-bar'), 'act-title');
    actBar.append(el('h2', 'run-act-name', `액트 ${map.act} — ${map.actName}`), el('p', 'dbg-hint', `${map.region} · ${map.actText} (액트 ${map.act} / ${map.actCount})`));

    const scroll = tagged(el('div', 'run-map-scroll'), 'map-scroll');
    scroll.append(buildMapBoard(map, hud.commanderId, {
      selectedId: this.selectedId,
      onSelect: (id) => this.select(id),
      onChoose: (id) => this.commands.chooseNode(id),
      onHover: (id) => { this.hoverId = id; this.refreshSide(); },
    }));
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

  private select(id: string): void {
    // 이미 선택한 노드를 한 번 더 누르면: 갈 수 있는 노드면 그 노드로 이동(전투·이벤트 등 진행), 아니면 선택 해제
    if (this.selectedId === id) {
      const node = this.view.snapshot().map?.floors.flat().find((n) => n.id === id);
      if (node?.state === 'available') {
        this.commands.chooseNode(id);
        return;
      }
    }
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
      parts.push(el('p', 'dbg-hint', '노드에 마우스를 올리거나 눌러서 확인하세요. 초록 테두리 노드를 한 번 더 누르면(또는 더블클릭) 이동합니다.'));
    }
    parts.push(mapLegend());
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
