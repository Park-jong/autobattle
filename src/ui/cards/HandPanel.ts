import type { CardController } from '../debug/contracts';
import { CARD_UI } from '../theme';
import { buildUltimateHelp, ultimateCostLabel, type CardPanelView, type HandCardView, type PileView, type UltimateHelpView } from './cardPanelView';
import { fanLayout } from './cardFan';
import { clientToStage } from './stagePoint';
import './handPanel.css';
import { appSkin } from '../skin/SkinStore';
import { commanderArt } from '../skin/commanderArt';
import { cardFaceElement } from './cardFace';
import { commanderSkinName, commanderSkillName } from '../skin/skins';

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
  /** 궁극기 설명 말풍선 (body에 붙는 fixed — 좁은 궁극기 칸·트레이 overflow에 잘리지 않게) */
  private readonly ultimatePop = el('div', 'hand-ult-pop');
  private ultimateHelp: UltimateHelpView | null = null;

  /** 손패 카드 노드 (인스턴스 id → 모양 키·노드·최신 상태) */
  private readonly cardNodes = new Map<number, { face: string; node: HTMLElement; card: HandCardView }>();
  private notice: HTMLElement | null = null;
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
    this.ultimatePop.dataset.testid = 'ultimate-help';
    this.ultimatePop.setAttribute('role', 'tooltip');
    this.ultimatePop.hidden = true;
    document.body.append(this.ultimatePop);
    // 마우스를 올리거나 키보드로 포커스하면 설명을 띄운다. 터치는 이름을 눌러 열고 닫는다
    this.ultimateBox.addEventListener('mouseenter', () => this.showUltimateHelp());
    this.ultimateBox.addEventListener('mouseleave', () => this.hideUltimateHelp());
    this.ultimateBox.addEventListener('focusin', () => this.showUltimateHelp());
    this.ultimateBox.addEventListener('focusout', () => this.hideUltimateHelp());
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
    if (!visible) this.hideUltimateHelp();
    // 캔버스가 남는 높이에 맞춰 다시 크기를 잡도록 알린다 (Phaser Scale.FIT)
    window.dispatchEvent(new Event('resize'));
  }

  private render(view: CardPanelView): void {
    this.phaseLabel.textContent = view.phaseLabel;
    const passive = commanderSkillName(appSkin.current, view.commanderId, 'passive', view.passiveName);
    this.commanderBox.replaceChildren(el('strong', undefined, commanderSkinName(appSkin.current, view.commanderId, view.commanderName)), el('span', 'hand-passive', `패시브 ${passive}`));
    const portrait = commanderArt(view.commanderId, 'portrait', 'academy-hand-portrait');
    if (portrait) this.commanderBox.append(portrait);
    this.commanderBox.title = `${passive}: ${view.passiveText}`;
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
      this.cardNodes.clear();
      this.cards.replaceChildren(el('p', 'hand-empty', view.notice ?? '손패가 없습니다.'));
    } else {
      this.renderHand(view);
    }
  }

  /**
   * 손패 카드는 인스턴스별로 노드를 재사용한다. CP가 차거나 사용 가능 여부·선택만 바뀌면 그 자리에서 상태만 고치고,
   * 카드 모양(이름·비용·설명 등)이 바뀐 장만 새로 만든다 — 매번 새로 만들면 원화를 다시 읽고 호버 들림·부채꼴이
   * 처음부터 다시 그려져 손패가 "다시 펼쳐지는" 것처럼 보인다.
   */
  private renderHand(view: CardPanelView): void {
    const alive = new Set<number>();
    const nodes: HTMLElement[] = [];
    for (const card of view.hand) {
      alive.add(card.instanceId);
      const face = JSON.stringify([appSkin.current, card.cardId, card.name, card.type, card.typeLabel, card.targetLabel, card.rarity, card.cost, card.baseCost, card.upgraded, card.text, card.tags]);
      let entry = this.cardNodes.get(card.instanceId);
      if (!entry || entry.face !== face) {
        entry = { face, node: this.cardNode(card.instanceId, card), card };
        this.cardNodes.set(card.instanceId, entry);
      }
      entry.card = card;
      this.applyCardState(entry.node, card);
      nodes.push(entry.node);
    }
    for (const id of [...this.cardNodes.keys()]) if (!alive.has(id)) this.cardNodes.delete(id);
    if (view.notice) nodes.unshift(this.noticeNode(view.notice));
    // 순서·구성이 같으면 DOM을 건드리지 않는다
    const current = [...this.cards.children];
    if (current.length !== nodes.length || current.some((n, i) => n !== nodes[i])) {
      this.cards.replaceChildren(...nodes);
      this.layoutFan();
    }
  }

  private noticeNode(text: string): HTMLElement {
    if (this.notice?.textContent !== text) this.notice = el('p', 'hand-notice', text);
    return this.notice!;
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

  /** 카드 노드(모양 + 이벤트). 이벤트는 늘 최신 상태(cardNodes)를 읽는다 */
  private cardNode(instanceId: number, card: HandCardView): HTMLElement {
    const node = cardFaceElement(card);
    const current = (): HandCardView => this.cardNodes.get(instanceId)?.card ?? card;
    node.dataset.testid = `hand-card-${instanceId}`;
    node.tabIndex = 0;
    node.setAttribute('role', 'group');
    node.addEventListener('keydown', (e) => {
      if (e.target !== node || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      e.stopPropagation();
      const now = current();
      if (now.playable && now.targetKind === 'none') this.controller.useCardNow(instanceId);
      else this.controller.beginCard(instanceId, 'click');
    });
    node.addEventListener('pointerdown', (e) => this.onCardDown(e, current()));
    return node;
  }

  /** 사용 가능 여부·선택·사유·바로 사용 버튼처럼 전투 중 자주 바뀌는 상태만 고친다 */
  private applyCardState(node: HTMLElement, card: HandCardView): void {
    node.setAttribute('aria-label', `${card.name}, ${card.cost}CP. ${card.reason ?? card.text}`);
    node.setAttribute('aria-disabled', String(!card.playable));
    node.classList.toggle('selected', card.selected);
    node.classList.toggle('disabled', !card.playable);
    node.title = card.reason ? `사용 불가: ${card.reason}` : `${card.name}: ${card.text}`;

    let reason = node.querySelector<HTMLElement>(':scope > .hcard-reason');
    if (card.reason) {
      if (!reason) {
        reason = el('div', 'hcard-reason');
        node.append(reason);
      }
      reason.textContent = card.reason;
    } else {
      reason?.remove();
    }

    const wantsUse = card.playable && card.targetKind === 'none';
    const use = node.querySelector<HTMLElement>(':scope > .hcard-use');
    if (wantsUse && !use) {
      const button = el('button', 'hcard-use', '바로 사용');
      button.type = 'button';
      button.addEventListener('pointerdown', (e) => e.stopPropagation());
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.controller.useCardNow(card.instanceId);
      });
      node.append(button);
    } else if (!wantsUse && use) {
      use.remove();
    }
  }

  /** 궁극기 영역: 이름·설명(툴팁), 게이지, 사용 버튼(사유는 툴팁과 아래 줄) */
  private renderUltimate(view: CardPanelView): void {
    const ult = view.ultimate;
    this.ultimateBox.hidden = ult === null;
    if (!ult) return;
    const name = commanderSkillName(appSkin.current, view.commanderId, 'ultimate', ult.name);
    this.ultimateHelp = buildUltimateHelp(ult, name);
    if (!this.ultimatePop.hidden) this.fillUltimateHelp();
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
    const title = el('button', 'hand-ult-name', name);
    title.type = 'button';
    title.dataset.testid = 'ultimate-name';
    title.setAttribute('aria-label', `${name} — 궁극기 설명 보기`);
    title.addEventListener('click', () => (this.ultimatePop.hidden ? this.showUltimateHelp() : this.hideUltimateHelp()));
    // 칸 안에도 효과 요약을 보여 준다 (좁으면 3줄까지, 전체는 말풍선)
    const desc = el('div', 'hand-ult-desc', ult.text);
    desc.dataset.testid = 'ultimate-desc';
    this.ultimateBox.replaceChildren(
      title, desc, gauge, this.ultimateGaugeLabel, use, ...(cost ? [cost] : []), ...(reason ? [reason] : []),
    );
  }

  private showUltimateHelp(): void {
    if (!this.ultimateHelp || this.ultimateBox.hidden) return;
    this.fillUltimateHelp();
    this.ultimatePop.hidden = false;
    // 궁극기 칸 위쪽에 띄우고, 화면 밖으로 나가지 않게 맞춘다
    const rect = this.ultimateBox.getBoundingClientRect();
    const width = this.ultimatePop.offsetWidth;
    const height = this.ultimatePop.offsetHeight;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : Math.min(window.innerHeight - height - 8, rect.bottom + 8);
    this.ultimatePop.style.left = `${Math.round(left)}px`;
    this.ultimatePop.style.top = `${Math.round(top)}px`;
  }

  private hideUltimateHelp(): void {
    this.ultimatePop.hidden = true;
  }

  private fillUltimateHelp(): void {
    const help = this.ultimateHelp;
    if (!help) return;
    this.ultimatePop.replaceChildren(
      el('strong', 'hand-ult-pop-title', `궁극기 · ${help.name}`),
      el('p', 'hand-ult-pop-effect', help.effect),
      ...(help.cost ? [el('p', 'hand-ult-pop-cost', help.cost)] : []),
      el('p', 'hand-ult-pop-rules', help.rules),
      el('p', 'hand-ult-pop-status', help.status),
    );
  }

  private updateUltimateGauge(view: CardPanelView): void {
    const ult = view.ultimate;
    if (!ult) return;
    const ratio = Math.max(0, Math.min(1, ult.charge / ult.max));
    this.ultimateFill.style.width = `${Math.round(ratio * 100)}%`;
    this.ultimateGaugeLabel.textContent = ult.used ? '게이지 소진' : `게이지 ${ult.charge} / ${ult.max}`;
    // 설명 말풍선이 열려 있으면 "지금 상태" 줄(게이지)을 따라 갱신한다
    if (!this.ultimatePop.hidden && this.ultimateHelp) {
      const next = buildUltimateHelp(ult, this.ultimateHelp.name);
      if (next.status !== this.ultimateHelp.status) {
        this.ultimateHelp = next;
        this.fillUltimateHelp();
      }
    }
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
