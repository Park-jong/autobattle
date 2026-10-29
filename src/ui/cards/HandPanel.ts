import type { CardController } from '../debug/contracts';
import { CARD_UI } from '../theme';
import { ultimateCostLabel, type CardPanelView, type HandCardView, type PileView } from './cardPanelView';
import { fanLayout } from './cardFan';
import { clientToStage } from './stagePoint';
import './handPanel.css';
import { appSkin } from '../skin/SkinStore';
import { commanderArt } from '../skin/commanderArt';
import { cardFaceElement } from './cardFace';

type PileKey = 'draw' | 'discard' | 'exhaust';
const PILE_LABELS: Record<PileKey, string> = { draw: '뽑을 더미', discard: '버린 더미', exhaust: '소모 더미' };
const PILE_KEYS: readonly PileKey[] = ['draw', 'discard', 'exhaust'];
/** 부채꼴 배치에 쓰는 카드 폭 (handPanel.css의 --card-w와 같다) */
const CARD_WIDTH = 112;

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
  /** 궁극기 영역: 이름 + 게이지 + 사용 버튼 */
  private readonly ultimateBox = el('div', 'hand-ultimate');
  private readonly ultimateFill = el('div', 'hand-ult-fill');
  private readonly ultimateGaugeLabel = el('div', 'hand-ult-label');

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
    this.root.replaceChildren(this.side, this.ultimateBox, this.cards, this.pileList, this.toastBox);
    this.root.hidden = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelAll();
      // 궁극기 단축키 U (입력칸에 글자를 쓰는 중에는 무시)
      const target = e.target as HTMLElement | null;
      const typing = target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'u' || e.key === 'U' || e.code === 'KeyU') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && this.visible) this.controller.useUltimate();
    });
    // 손패 칸 폭이 바뀌면 부채꼴을 다시 편다
    new ResizeObserver(() => this.layoutFan()).observe(this.cards);
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
      appSkin.current,
      view.phaseLabel,
      view.commanderName,
      view.hand,
      view.ultimate && [view.ultimate.name, view.ultimate.used, view.ultimate.ready, view.ultimate.reason, view.ultimate.hpCost],
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
    this.updateUltimateGauge(view);
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
    this.commanderBox.replaceChildren(el('strong', undefined, view.commanderName), el('span', 'hand-passive', `패시브 ${view.passiveName}`));
    const portrait = commanderArt(view.commanderId, 'portrait', 'academy-hand-portrait');
    if (portrait) this.commanderBox.append(portrait);
    this.commanderBox.title = `${view.passiveName}: ${view.passiveText}`;
    this.renderUltimate(view);
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
      this.layoutFan();
    }
  }

  /** 손패를 호(부채꼴)로 편다: 장수가 많으면 겹치고 양 끝은 기울어져 내려간다 */
  private layoutFan(): void {
    const nodes = [...this.cards.querySelectorAll<HTMLElement>('.hcard')];
    const width = this.cards.clientWidth || 600;
    const slots = fanLayout(nodes.length, { cardWidth: CARD_WIDTH, maxWidth: Math.max(CARD_WIDTH, width - 24) });
    nodes.forEach((node, i) => {
      const slot = slots[i];
      if (!slot) return;
      node.style.setProperty('--fx', `${slot.x}px`);
      node.style.setProperty('--fy', `${slot.y}px`);
      node.style.setProperty('--fr', `${slot.rotate}deg`);
      node.style.setProperty('--fz', String(slot.z));
    });
  }

  private cardNode(card: HandCardView): HTMLElement {
    const node = cardFaceElement(card);
    node.dataset.testid = `hand-card-${card.instanceId}`;
    node.tabIndex = 0;
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', `${card.name}, ${card.cost}CP. ${card.reason ?? card.text}`);
    node.setAttribute('aria-disabled', String(!card.playable));
    node.addEventListener('keydown', (e) => {
      if (e.target !== node || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      if (card.playable && card.targetKind === 'none') this.controller.useCardNow(card.instanceId);
      else this.controller.beginCard(card.instanceId, 'click');
    });
    node.classList.toggle('selected', card.selected);
    node.classList.toggle('disabled', !card.playable);
    node.title = card.reason ? `사용 불가: ${card.reason}` : `${card.name}: ${card.text}`;
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

  /** 궁극기 영역: 이름·설명(툴팁), 게이지, 사용 버튼(사유는 툴팁과 아래 줄) */
  private renderUltimate(view: CardPanelView): void {
    const ult = view.ultimate;
    this.ultimateBox.hidden = ult === null;
    if (!ult) return;
    this.ultimateBox.title = `${ult.name}: ${ult.text}`;
    this.ultimateBox.classList.toggle('ready', ult.ready);
    this.ultimateBox.classList.toggle('used', ult.used);
    const gauge = el('div', 'hand-ult-gauge');
    gauge.append(this.ultimateFill);
    const use = el('button', 'hand-ult-use', ult.used ? '사용함' : ult.ready ? `궁극기 사용 (U)` : '궁극기');
    use.type = 'button';
    use.dataset.testid = 'use-ultimate';
    use.disabled = !ult.ready;
    use.addEventListener('click', () => this.controller.useUltimate());
    const costLabel = ultimateCostLabel(ult);
    const cost = costLabel ? el('div', 'hand-ult-cost', costLabel) : null;
    const reason = !ult.ready && ult.reason ? el('div', 'hand-ult-reason', ult.reason) : null;
    this.ultimateBox.replaceChildren(
      el('strong', 'hand-ult-name', ult.name), gauge, this.ultimateGaugeLabel, use, ...(cost ? [cost] : []), ...(reason ? [reason] : []),
    );
  }

  private updateUltimateGauge(view: CardPanelView): void {
    const ult = view.ultimate;
    if (!ult) return;
    const ratio = Math.max(0, Math.min(1, ult.charge / ult.max));
    this.ultimateFill.style.width = `${Math.round(ratio * 100)}%`;
    this.ultimateGaugeLabel.textContent = ult.used ? '게이지 소진' : `게이지 ${ult.charge} / ${ult.max}`;
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
    // 손패와 같은 카드 모양을 포인터에 붙여 끈다 (판정을 막지 않도록 pointer-events: none은 CSS)
    const ghost = cardFaceElement(card);
    ghost.classList.add('hcard-ghost');
    ghost.style.setProperty('--ghost-scale', String(CARD_UI.GHOST_SCALE));
    ghost.style.setProperty('--ghost-tilt', `${CARD_UI.GHOST_TILT_DEG}deg`);
    ghost.style.setProperty('--ghost-lift', `${CARD_UI.GHOST_LIFT_PX}px`);
    document.body.append(ghost);
    return ghost;
  }

}
