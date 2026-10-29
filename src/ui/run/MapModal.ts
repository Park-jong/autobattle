import type { RunViewSource } from './contracts';
import { button, el, tagged } from './dom';
import { encounterPreviewElement } from './encounterPreview';
import { buildMapBoard, mapLegend } from './mapBoard';
import type { MapView } from './runViews';

/**
 * 맵 보기 창(모달): 전투 중에도 지금 액트의 경로를 확인한다. 읽기 전용 — 노드에 마우스를 올리거나 누르면
 * 옆에 그 노드의 적 편성 미리보기가 나오지만 이동은 할 수 없다.
 * 닫기는 ×·Esc·배경 클릭. 열려 있는 동안 막이 뒤 화면 조작을 막고, 키 입력은 캡처 단계에서 가로채 단축키가 새지 않는다.
 */
export class MapModal {
  readonly root = tagged(el('div', 'rw-backdrop cl-backdrop'), 'map-modal');
  private readonly panel = el('div', 'rw-panel cl-panel mp-panel');
  private readonly title = tagged(el('h2', 'rw-title'), 'map-modal-title');
  private readonly scroll = tagged(el('div', 'run-map-scroll mp-scroll'), 'map-modal-scroll');
  private readonly side = el('aside', 'run-map-side mp-side');
  private readonly closeButton = tagged(button('×', () => this.close(), 'rw-btn cl-close'), 'map-modal-close');
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private map: MapView | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly view: RunViewSource) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '맵');
    this.closeButton.setAttribute('aria-label', '닫기');
    const header = el('div', 'cl-header');
    header.append(this.title, this.closeButton);
    const layout = el('div', 'mp-layout');
    layout.append(this.scroll, this.side);
    this.panel.append(header, layout);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', this.onKey, true);
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    const map = this.view.mapView();
    if (!map) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.map = map;
    this.selectedId = null;
    this.hoverId = null;
    this.title.textContent = `맵 — 액트 ${map.act} ${map.actName}`;
    this.renderBoard();
    this.renderSide();
    this.root.hidden = false;
    this.closeButton.focus();
    // 현재 위치(또는 갈 수 있는 노드)가 보이도록 스크롤한다
    queueMicrotask(() => {
      this.scroll.querySelector<HTMLElement>('.state-current, .state-available')?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  private renderBoard(): void {
    if (!this.map) return;
    const commanderId = this.view.snapshot().hud?.commanderId;
    this.scroll.replaceChildren(buildMapBoard(this.map, commanderId, {
      selectedId: this.selectedId,
      onSelect: (id) => {
        this.selectedId = this.selectedId === id ? null : id;
        this.scroll.querySelectorAll('.run-node.selected').forEach((n) => n.classList.remove('selected'));
        if (this.selectedId) this.scroll.querySelector(`.run-node[data-node-id="${CSS.escape(this.selectedId)}"]`)?.classList.add('selected');
        this.renderSide();
      },
      onHover: (id) => {
        this.hoverId = id;
        this.renderSide();
      },
    }));
  }

  private renderSide(): void {
    const map = this.map;
    if (!map) return;
    const shownId = this.hoverId ?? this.selectedId;
    const node = shownId ? map.floors.flat().find((n) => n.id === shownId) : undefined;
    const parts: HTMLElement[] = [];
    if (node) {
      const preview = this.view.previewNode(node.id);
      if (preview) parts.push(encounterPreviewElement(preview));
      else parts.push(el('h3', '', `${node.floor}층 ${node.label}`));
    } else {
      parts.push(el('p', 'dbg-hint', '노드에 마우스를 올리거나 눌러서 확인하세요. 이동은 맵 화면에서 합니다.'));
    }
    parts.push(mapLegend());
    this.side.replaceChildren(...parts);
  }

  /** 열려 있는 동안 모든 키를 이 창이 받는다: Esc는 닫고, 나머지는 뒤 화면의 단축키로 가지 않게 막는다 */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (e.key === 'Tab' && !this.root.contains(document.activeElement)) {
      e.preventDefault();
      this.closeButton.focus();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
    e.stopPropagation();
  };
}
