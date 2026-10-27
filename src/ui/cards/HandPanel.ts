import type { CardController } from '../debug/contracts';
import { CARD_UI } from '../theme';
import type { CardPanelView, HandCardView, PileView } from './cardPanelView';
import { clientToStage } from './stagePoint';
import './handPanel.css';
import { portraitStyle } from '../skin';

type PileKey = 'draw' | 'discard' | 'exhaust';
const PILE_LABELS: Record<PileKey, string> = { draw: '뽑을 더미', discard: '버린 더미', exhaust: '소모 더미' };
const PILE_KEYS: readonly PileKey[] = ['draw', 'discard', 'exhaust'];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 누르고 있는 카드의 포인터 상태 (클릭인지 드래그인지 구분) */
interface Press {
  card: HandCardView;
  startX: number;
  startY: number;
  dragging: boolean;
}

/**
 * 손패 패널 (HTML/CSS 레이어, 캔버스 아래). Phaser 씬을 모르고 CardController 인터페이스로만 세션과 통신한다.
 *
 * 입력: 카드를 클릭하면 선택(이후 보드에서 대상 클릭), 눌러서 움직이면 드래그(캔버스에 놓으면 사용).
 * 우클릭·ESC로 취소. 드래그 중 포인터 위치는 캔버스 사각형 비율로 게임 좌표(1280x720)로 환산해 세션에 전달한다.
 * DOM은 표시 내용이 바뀔 때만 다시 만들고, CP 게이지 진행률은 매 프레임 갱신한다.
 */
export class HandPanel {
  private readonly side = el('div', 'hand-side');
  private readonly cards = el('div', 'hand-cards');
  private readonly toastBox = el('div', 'hand-toast');
  private readonly pileList = el('div', 'hand-pile-list');
  private readonly phaseLabel = el('div', 'hand-phase');
  private readonly commanderBox = el('div', 'hand-commander');
  private readonly cpLabel = el('div', 'hand-cp-label');
  private readonly cpPips: HTMLElement[] = [];
  private readonly cpFills: HTMLElement[] = [];
  private readonly cpBar = el('div', 'hand-cp-bar');
  private readonly prepLabel = el('div', 'hand-prep');
  private readonly hintBox = el('div', 'hand-hint');
  private readonly pileButtons = new Map<PileKey, HTMLButtonElement>();

  private press: Press | null = null;
  private ghost: HTMLElement | null = null;
  private signature = '';
  private visible = false;
  private openPile: PileKey | null = null;
  private shownToast = 0;
  private toastTimer: number | undefined;
  private frame = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: CardController,
    private readonly canvasHost: HTMLElement,
  ) {
    this.root.classList.add('hand-bar');
    this.root.style.setProperty('--hand-height', `${CARD_UI.HAND_HEIGHT}px`);
    this.buildSide();
    this.root.replaceChildren(this.side, this.cards, this.pileList, this.toastBox);
    this.root.hidden = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelAll();
    });
    this.loop();
  }

  // ---- 구성 ----

  private buildSide(): void {
    for (let i = 0; i < 6; i++) {
      const pip = el('div', 'hand-pip');
      const fill = el('div', 'hand-pip-fill');
      pip.append(fill);
      this.cpPips.push(pip);
      this.cpFills.push(fill);
      this.cpBar.append(pip);
    }
    const piles = el('div', 'hand-piles');
    for (const key of PILE_KEYS) {
      const b = el('button', 'hand-pile-btn');
      b.type = 'button';
      b.addEventListener('click', () => this.togglePile(key));
      this.pileButtons.set(key, b);
      piles.append(b);
    }
    this.pileList.hidden = true;
    this.side.append(this.phaseLabel, this.commanderBox, this.cpLabel, this.cpBar, this.prepLabel, piles, this.hintBox);
  }

  // ---- 갱신 루프 ----

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    const view = this.controller.cardView();
    this.setVisible(view.visible);
    if (!view.visible) return;

    const signature = JSON.stringify([
      view.phaseLabel,
      view.commanderName,
      view.hand,
      view.draw,
      view.discard,
      view.exhaust,
      view.cp.combat,
      view.cp.prep,
      view.cp.showPrep,
      view.holding,
      view.hint,
      view.notice,
      this.openPile,
    ]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.render(view);
    }
    this.updateGauge(view);
    this.updateToast(view);
  };

  /** 정리용 (현재 앱에서는 호출하지 않지만 테스트/핫리로드를 위해 둔다) */
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.cancelAll();
  }

  private setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    // 캔버스가 남는 높이에 맞춰 다시 크기를 잡도록 알린다 (Phaser Scale.FIT)
    window.dispatchEvent(new Event('resize'));
  }

  private render(view: CardPanelView): void {
    this.phaseLabel.textContent = view.phaseLabel;
    this.commanderBox.replaceChildren(el('strong', undefined, view.commanderName === '철벽 장군 하르텐 볼크' ? '세라 / FIELD COMMANDER' : view.commanderName), el('span', 'hand-passive', `패시브 ${view.passiveName}`));
    this.commanderBox.title = `${view.passiveName}: ${view.passiveText}`;
    this.hintBox.textContent = view.holding ? view.hint : '';
    this.hintBox.hidden = !view.holding;

    this.cpLabel.textContent = `지휘력 CP ${view.cp.combat} / ${view.cp.max}`;
    this.prepLabel.hidden = !view.cp.showPrep;
    this.prepLabel.textContent = `준비 CP ${view.cp.prep} / ${view.cp.prepMax} (작전 전용)`;

    for (const key of PILE_KEYS) {
      const b = this.pileButtons.get(key);
      if (!b) continue;
      b.textContent = `${PILE_LABELS[key]} ${view[key].count}`;
      b.classList.toggle('open', this.openPile === key);
    }
    this.renderPileList(view);

    if (view.hand.length === 0) {
      this.cards.replaceChildren(el('p', 'hand-empty', view.notice ?? '손패가 없습니다.'));
    } else {
      const nodes = view.hand.map((c) => this.cardNode(c));
      if (view.notice) nodes.unshift(el('p', 'hand-notice', view.notice));
      this.cards.replaceChildren(...nodes);
    }
  }

  private cardNode(card: HandCardView): HTMLElement {
    const node = el('div', `hcard type-${card.type}`);
    const cardArt: Record<string, number> = { shield_formation: 0, hold_the_line: 0, war_drums: 1, formation_swap: 3, focus_fire: 4, last_stand: 5, charge_signal: 1 };
    portraitStyle(node, cardArt[card.cardId] ?? (card.type === 'spell' ? 2 : 0));
    node.classList.toggle('selected', card.selected);
    node.classList.toggle('disabled', !card.playable);
    node.classList.toggle('upgraded', card.upgraded);
    node.title = card.reason ? `사용 불가: ${card.reason}` : `${card.name}: ${card.text}`;

    const head = el('div', 'hcard-head');
    head.append(el('span', 'hcard-cost', String(card.cost)), el('span', 'hcard-name', card.name));
    const meta = el('div', 'hcard-meta', `${card.typeLabel} · ${card.targetLabel}`);
    const text = el('div', 'hcard-text', card.text);
    node.append(head, meta, text);
    if (card.tags.length > 0) node.append(el('div', 'hcard-tags', card.tags.join(' · ')));
    if (card.reason) node.append(el('div', 'hcard-reason', card.reason));
    if (card.playable && card.targetKind === 'none') {
      const use = el('button', 'hcard-use', '바로 사용');
      use.type = 'button';
      use.addEventListener('pointerdown', (e) => e.stopPropagation());
      use.addEventListener('click', (e) => {
        e.stopPropagation();
        this.controller.useCardNow(card.instanceId);
      });
      node.append(use);
    }
    node.addEventListener('pointerdown', (e) => this.onCardDown(e, card));
    return node;
  }

  private renderPileList(view: CardPanelView): void {
    const key = this.openPile;
    this.pileList.hidden = key === null;
    if (key === null) return;
    const pile: PileView = view[key];
    const title = el('div', 'hand-pile-title', `${PILE_LABELS[key]} (${pile.count}장)`);
    const rows =
      pile.entries.length === 0
        ? [el('div', 'hand-pile-row', '비어 있음')]
        : pile.entries.map((entry) => el('div', 'hand-pile-row', `${entry.name} ×${entry.count}`));
    const note =
      key === 'draw'
        ? el('div', 'hand-pile-note', '뽑는 순서는 알 수 없어 이름순으로 표시합니다.')
        : key === 'exhaust'
          ? el('div', 'hand-pile-note', '이번 런에서 제거된 카드입니다.')
          : null;
    this.pileList.replaceChildren(title, ...rows, ...(note ? [note] : []));
  }

  private togglePile(key: PileKey): void {
    this.openPile = this.openPile === key ? null : key;
    this.signature = ''; // 다음 프레임에 다시 그린다
  }

  private updateGauge(view: CardPanelView): void {
    const { combat, max, regenProgress } = view.cp;
    for (let i = 0; i < max; i++) {
      const fill = this.cpFills[i];
      const pip = this.cpPips[i];
      if (!fill || !pip) continue;
      const full = i < combat;
      pip.classList.toggle('full', full);
      fill.style.width = full ? '100%' : i === combat ? `${Math.round(regenProgress * 100)}%` : '0%';
    }
  }

  private updateToast(view: CardPanelView): void {
    const toast = view.toast;
    if (!toast || toast.id === this.shownToast) return;
    this.shownToast = toast.id;
    this.toastBox.textContent = toast.message;
    this.toastBox.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.remove('show'), CARD_UI.TOAST_SECONDS * 1000);
  }

  // ---- 입력: 클릭 / 드래그 ----

  private onCardDown(e: PointerEvent, card: HandCardView): void {
    if (e.button !== 0) return;
    if (!card.playable) {
      this.controller.beginCard(card.instanceId, 'click'); // 사유 토스트를 띄운다
      return;
    }
    this.press = { card, startX: e.clientX, startY: e.clientY, dragging: false };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.cancelAll);
    window.addEventListener('contextmenu', this.cancelAll);
  }

  private onMove = (e: PointerEvent): void => {
    const press = this.press;
    if (!press) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.startX, e.clientY - press.startY) < CARD_UI.DRAG_START_PX) return;
      press.dragging = true;
      this.controller.beginCard(press.card.instanceId, 'drag');
      this.ghost = this.createGhost(press.card);
    }
    if (this.ghost) {
      this.ghost.style.left = `${e.clientX}px`;
      this.ghost.style.top = `${e.clientY}px`;
    }
    const point = this.stagePoint(e);
    if (point) this.controller.pointerMoved(point.x, point.y);
    else this.controller.pointerLeft();
  };

  private onUp = (e: PointerEvent): void => {
    const press = this.press;
    this.endPress();
    if (!press) return;
    if (press.dragging) this.controller.dropCard(this.stagePoint(e));
    else this.controller.beginCard(press.card.instanceId, 'click');
  };

  private cancelAll = (e?: Event): void => {
    this.endPress();
    if (e?.type === 'contextmenu') e.preventDefault();
    this.controller.cancelCard();
  };

  private endPress(): void {
    this.press = null;
    this.ghost?.remove();
    this.ghost = null;
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.cancelAll);
    window.removeEventListener('contextmenu', this.cancelAll);
  }

  private stagePoint(e: PointerEvent): { x: number; y: number } | null {
    const canvas = this.canvasHost.querySelector('canvas');
    if (!canvas) return null;
    return clientToStage(e.clientX, e.clientY, canvas.getBoundingClientRect());
  }

  private createGhost(card: HandCardView): HTMLElement {
    const ghost = el('div', `hcard-ghost type-${card.type}`);
    ghost.append(el('span', 'hcard-cost', String(card.cost)), el('span', 'hcard-name', card.name));
    document.body.append(ghost);
    return ghost;
  }

}
