import type { RunViewSource } from './contracts';
import type { MapNodeView, MapView } from './runViews';
import { button, el, tagged } from './dom';
import { buildMapBoard, mapLegend, nodeIconElement } from './mapBoard';
import { encounterPreviewElement } from './encounterPreview';
import { nodeScene } from './nodePresentation';
import { appSkin } from '../skin/SkinStore';
import { encounterSkinName } from '../skin/skins';
import './routeMap.css';

const DESCRIPTIONS: Record<MapNodeView['type'], string> = {
  combat: '적 부대를 돌파하고 다음 경로를 여세요.',
  elite: '더 강한 적이 기다립니다. 부대의 전력을 확인하세요.',
  boss: '이 지역을 지키는 보스입니다. 편성과 패턴을 확인하세요.',
  shop: '골드로 카드와 유물을 구매하거나, 덱의 카드를 제거할 수 있습니다.',
  event: '뜻밖의 만남이 기다립니다. 들어간 뒤 선택지를 확인할 수 있습니다.',
  camp: 'HP 회복, 카드 강화, 유닛 승급 중 하나를 선택할 수 있습니다.',
};

const BENEFITS: Record<MapNodeView['type'], string> = {
  combat: '승리 보상 · 골드 / 카드 선택',
  elite: '승리 보상 · 골드 / 카드 / 유물',
  boss: '승리 시 액트 돌파',
  shop: '카드 · 유물 · 덱 정비',
  event: '선택에 따라 보상과 대가가 달라집니다',
  camp: '휴식 · 강화 · 승급',
};

let explorerId = 0;

/** 원정 지도와 전투 중 지도에서 함께 쓰는 노드 설명 창. 이동은 명시적인 진입 버튼으로만 한다. */
export class MapExplorer {
  readonly root = el('div', 'route-explorer');
  private readonly scroll = tagged(el('div', 'run-map-scroll route-scroll'), 'map-scroll');
  private readonly popup = tagged(el('section', 'route-node-popover'), 'node-popover');
  private readonly popupTitleId = `route-node-title-${++explorerId}`;
  private map: MapView | null = null;
  private selectedId: string | null = null;
  private shownId: string | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private openEvents: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private restoringFocus = false;

  constructor(private readonly view: RunViewSource, private readonly onChoose?: (id: string) => void) {
    if (!onChoose) {
      this.scroll.dataset.testid = 'map-modal-scroll';
      this.popup.dataset.testid = 'map-modal-node-popover';
    }
    this.popup.popover = 'manual';
    this.popup.id = `route-node-popover-${explorerId}`;
    this.popup.setAttribute('aria-labelledby', this.popupTitleId);
    this.popup.addEventListener('pointerenter', () => this.cancelClose());
    this.popup.addEventListener('pointerleave', () => this.scheduleClose());
    this.popup.addEventListener('focusin', () => this.cancelClose());
    this.popup.addEventListener('focusout', (event) => {
      if (!this.popup.contains(event.relatedTarget as Node | null)) this.scheduleClose();
    });
    // Removing a screen also closes its top-layer popover. Release the temporary document listeners.
    this.popup.addEventListener('toggle', () => {
      if (!this.popup.matches(':popover-open')) this.close();
    });
    const toolbar = el('div', 'route-map-toolbar');
    const heading = el('div');
    heading.append(el('span', 'route-eyebrow', 'EXPEDITION'), el('h2', '', '원정 경로'));
    const legend = el('details', 'route-legend');
    legend.append(el('summary', '', '노드 안내'), mapLegend());
    toolbar.append(heading, legend);
    const footer = el('div', 'route-map-footer');
    footer.append(el('span', 'route-help', onChoose ? '노드를 살펴보고 다음 목적지를 선택하세요' : '노드를 선택해 경로와 적 편성을 확인하세요'),
      el('span', 'route-help-controls', '올려서 미리보기 · 눌러서 상세 보기'));
    this.root.append(toolbar, this.scroll, footer, this.popup);
    this.scroll.addEventListener('scroll', () => this.position());
  }

  render(map: MapView, commanderId?: string): void {
    this.close();
    this.map = map;
    this.scroll.replaceChildren(buildMapBoard(map, commanderId, {
      onSelect: (id) => this.select(id),
      onHover: (id) => this.hover(id),
    }));
    this.scroll.querySelectorAll('.run-node').forEach((node) => node.setAttribute('aria-controls', this.popup.id));
    queueMicrotask(() => {
      const focus = this.scroll.querySelector<HTMLElement>('.state-current, .state-available');
      focus?.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
  }

  /** true일 때만 Esc가 노드 설명 창을 닫았다. 바깥 지도 모달은 그대로 유지한다. */
  close(restoreFocus = false): boolean {
    const wasOpen = this.shownId !== null;
    const anchor = this.anchor();
    this.cancelClose();
    this.openEvents?.abort();
    this.openEvents = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.selectedId = null;
    this.shownId = null;
    if (this.popup.matches(':popover-open')) this.popup.hidePopover();
    this.syncSelection();
    if (restoreFocus && anchor?.isConnected) {
      // Focus restores keyboard position without reopening the preview.
      this.restoringFocus = true;
      anchor.focus({ preventScroll: true });
      this.restoringFocus = false;
    }
    return wasOpen;
  }

  private hover(id: string | null): void {
    if (this.selectedId || this.restoringFocus) return;
    if (!id) return this.scheduleClose();
    this.cancelClose();
    if (this.shownId !== id) this.show(id, false);
  }

  private select(id: string): void {
    if (this.selectedId === id) { this.close(); return; }
    this.cancelClose();
    this.show(id, true);
    if (this.anchor()?.matches(':focus-visible')) this.popup.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private show(id: string, pinned: boolean): void {
    const node = this.map?.floors.flat().find((entry) => entry.id === id);
    if (!node) return;
    this.shownId = id;
    this.selectedId = pinned ? id : null;
    this.popup.classList.toggle('pinned', pinned);
    this.popup.dataset.type = node.type;
    this.popup.setAttribute('role', pinned ? 'dialog' : 'tooltip');
    const head = el('header', 'route-popover-head');
    const title = el('div');
    const state = { available: '진입 가능', locked: '미탐방', current: '현재 위치', visited: '방문 완료' }[node.state];
    const label = tagged(el('h3', '', `${node.floor}층 · ${node.label}`), 'node-title');
    label.id = this.popupTitleId;
    title.append(el('span', `route-eyebrow route-status is-${node.state}`, state), label);
    head.append(nodeIconElement(node.type), title);
    if (pinned) {
      const close = button('×', () => this.close(true), 'route-popover-close');
      close.setAttribute('aria-label', '노드 설명 닫기');
      head.append(close);
    }
    const body = el('div', 'route-popover-body');
    const preview = this.view.previewNode(id);
    if (preview) {
      if (pinned) body.append(encounterPreviewElement(preview));
      else body.append(el('strong', 'route-encounter-name', encounterSkinName(appSkin.current, preview.kind, preview.name)),
        el('p', 'route-popover-description', preview.text),
        el('div', 'route-intel', `적 ${preview.units.length}기 · ${preview.scaleLabel}${preview.mutations.length ? ` · 변이 ${preview.mutations.length}` : ''}`));
    } else {
      if (pinned) body.append(nodeScene(node.type === 'shop' ? 'market' : 'camp'));
      body.append(el('p', 'route-popover-description', DESCRIPTIONS[node.type]));
    }
    body.append(el('p', 'route-benefit', BENEFITS[node.type]));
    const footer = el('footer', 'route-popover-footer');
    if (pinned) {
      if (node.state === 'available' && this.onChoose) {
        const go = tagged(button('이 노드로 진입 →', () => {
          // Re-check the live route before dispatching a move from a pinned preview.
          if (!this.view.mapView()?.availableIds.includes(id)) return this.close();
          this.close();
          this.onChoose?.(id);
        }, 'route-enter'), 'choose-node');
        footer.append(go);
      } else footer.append(el('p', '', !this.onChoose ? '경로 이동은 원정 지도에서 할 수 있습니다.' :
        node.state === 'locked' ? '현재 위치에서 이어진 다음 경로만 진입할 수 있습니다.' :
        node.state === 'current' ? '부대가 현재 머무는 위치입니다.' : '이미 지나온 경로입니다.'));
    } else footer.append(el('span', '', '노드를 눌러 상세 보기'));
    this.popup.replaceChildren(head, body, footer);
    this.syncSelection();
    if (!this.popup.isConnected) return;
    if (!this.popup.matches(':popover-open')) this.popup.showPopover();
    this.position();
    if (!this.openEvents) {
      this.openEvents = new AbortController();
      const { signal } = this.openEvents;
      document.addEventListener('pointerdown', (event) => {
        const target = event.target as Node;
        if (this.popup.contains(target) || this.scroll.contains(target) && (target as Element).closest('.run-node')) return;
        this.close();
      }, { capture: true, signal });
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close(true);
      }, { capture: true, signal });
      window.addEventListener('resize', () => this.position(), { signal });
      this.resizeObserver = new ResizeObserver(() => this.position());
      this.resizeObserver.observe(this.popup);
    }
  }

  private syncSelection(): void {
    this.scroll.querySelectorAll<HTMLElement>('.run-node').forEach((node) => {
      const selected = node.dataset.nodeId === this.selectedId;
      node.classList.toggle('selected', selected);
      node.classList.toggle('previewing', node.dataset.nodeId === this.shownId);
      node.setAttribute('aria-expanded', String(selected));
      if (node.dataset.nodeId === this.shownId && !selected) node.setAttribute('aria-describedby', this.popup.id);
      else node.removeAttribute('aria-describedby');
    });
  }

  private anchor(): HTMLElement | null {
    return this.shownId ? this.scroll.querySelector(`[data-node-id="${CSS.escape(this.shownId)}"]`) : null;
  }

  private position(): void {
    const anchor = this.anchor();
    if (!anchor || !this.popup.matches(':popover-open')) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = this.scroll.getBoundingClientRect();
    if (rect.bottom < viewport.top || rect.top > viewport.bottom) { this.close(); return; }
    const gap = 12;
    const width = this.popup.offsetWidth;
    const clamp = (value: number, max: number) => Math.max(gap, Math.min(value, max));
    const right = window.innerWidth - rect.right - gap * 2;
    const left = rect.left - gap * 2;
    let x: number;
    let y: number;
    this.popup.style.maxHeight = `${Math.min(540, window.innerHeight - gap * 2)}px`;
    const sideX = right >= width ? rect.right + gap : rect.left - width - gap;
    const sideY = clamp(rect.top - 20, window.innerHeight - this.popup.offsetHeight - gap);
    // Keep the other immediate choices reachable instead of covering them with the card.
    const coversChoice = [...this.scroll.querySelectorAll('.state-available, .state-current')].some((choice) => {
      if (choice === anchor) return false;
      const bounds = choice.getBoundingClientRect();
      return bounds.right > sideX && bounds.left < sideX + width && bounds.bottom > sideY && bounds.top < sideY + this.popup.offsetHeight;
    });
    if (Math.max(left, right) >= width && !coversChoice) {
      x = sideX;
      y = sideY;
    } else {
      const above = rect.top - gap * 2;
      const below = window.innerHeight - rect.bottom - gap * 2;
      const space = Math.max(above, below);
      this.popup.style.maxHeight = `${Math.min(540, space >= 190 ? space : window.innerHeight - gap * 2)}px`;
      x = clamp(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - gap);
      y = space < 190 ? gap : above >= below ? rect.top - this.popup.offsetHeight - gap : rect.bottom + gap;
    }
    this.popup.style.left = `${Math.round(x)}px`;
    this.popup.style.top = `${Math.round(y)}px`;
  }

  private cancelClose(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
  }

  private scheduleClose(): void {
    if (this.selectedId) return;
    this.cancelClose();
    this.closeTimer = setTimeout(() => this.close(), 240);
  }
}
