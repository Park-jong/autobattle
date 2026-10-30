import type { CardCatalog } from '../../../core/data/cardLoader';
import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import type { OwnedUnit } from '../../../core/management';
import { clientToStage } from '../../cards/stagePoint';
import type { CardController, DebugController, SessionSnapshot, UnitHoverSource } from '../../debug/contracts';
import { RosterDrag } from '../../economy/RosterDrag';
import { appSkin } from '../../skin/SkinStore';
import type { BattleStage, RunCommands, RunSnapshot, RunViewSource } from '../contracts';
import { button, el, tagged } from '../dom';
import { BattleTopBar } from './BattleTopBar';
import { DeploymentBar } from './DeploymentBar';
import { MapModal } from '../MapModal';
import { HoverPop } from './hoverPop';
import { ShopLayer } from './ShopLayer';
import { TraitPanel } from './TraitPanel';
import { TrayStack, isTyping } from './TrayStack';
import { unitDragGhost } from './unitFace';
import { UnitInfoPanel, type InfoSubject } from './UnitInfoPanel';
import { UnitTooltip } from './UnitTooltip';
import './battleScreen.css';
import { BoardViewport } from './BoardViewport';
import type { HandPanel } from '../../cards/HandPanel';
import { UnitHand } from '../../cards/UnitHand';

/** 전투 화면이 쓰는 DOM 자리 (index.html) */
export interface BattleScreenHosts {
  /** 상단 바 */
  top: HTMLElement;
  /** 보드 영역 (캔버스 + 떠 있는 패널) */
  arena: HTMLElement;
  /** Phaser 캔버스를 담은 요소 */
  canvasHost: HTMLElement;
  /** 보드 아래 소환 현황과 전투 시작 줄 */
  bench: HTMLElement;
  /** 하단 트레이 (상점·카드 겹침) */
  tray: HTMLElement;
  /** 손패 패널(HandPanel)의 루트. 트레이의 카드 층으로 옮겨진다 */
  hand: HTMLElement;
}

export interface BattleScreenCatalogs {
  units: UnitCatalog;
  cards: CardCatalog;
  traits: TraitCatalog;
}

/**
 * 런 전투 화면(오른쪽 패널 없이 화면에 직접 배치):
 * 상단 바 / 보드 + 특성·유닛 정보 / 소환 현황 / 하단 유닛 상점·통합 손패 트레이.
 * 세션은 기존 인터페이스(RunViewSource·RunCommands·DebugController·CardController·UnitHoverSource)로만 본다.
 */
export class BattleScreen {
  private readonly overlay = el('div', 'bt-overlay-host');
  private readonly traitToggle = tagged(button('특성', () => {
    const open = this.traitPanel.root.classList.toggle('mobile-open');
    this.traitToggle.textContent = open ? '특성 닫기' : '특성';
    this.traitToggle.setAttribute('aria-expanded', String(open));
  }, 'bt-btn bt-trait-toggle'), 'trait-toggle');
  private readonly errorBox = tagged(el('div', 'bt-error'), 'battle-error');
  private readonly resultBackdrop = el('div', 'bt-result-backdrop');
  private readonly topBar: BattleTopBar;
  private readonly boardViewport: BoardViewport;
  private readonly deployment: DeploymentBar;
  private readonly shop: ShopLayer;
  private readonly tray: TrayStack;
  private readonly traitPanel: TraitPanel;
  private readonly info: UnitInfoPanel;
  private readonly tooltip: UnitTooltip;
  private readonly drag: RosterDrag;
  private readonly unitHand: UnitHand;
  /** 전투 중 맵 보기 창 */
  private readonly mapModal: MapModal;
  /** 특성 설명 팝업(특성 패널·상점·정보 창 공용) / 상점 진열 유닛 정보 팝업 */
  private readonly traitPop = new HoverPop('bt-trait-pop', 'trait-pop');
  private readonly unitPop = new HoverPop('bt-unit-pop', 'unit-pop');
  private active = false;
  private stage: BattleStage | null = null;
  /** 전투 중 클릭해 정보를 띄운 유닛 uid (적·보스 포함, 준비 단계는 소유 유닛 선택) */
  private inspectUid: number | null = null;
  private resultSignature = '';

  constructor(
    private readonly hosts: BattleScreenHosts,
    private readonly view: RunViewSource,
    private readonly commands: RunCommands,
    private readonly battle: DebugController,
    private readonly cards: CardController,
    private readonly hover: UnitHoverSource,
    catalogs: BattleScreenCatalogs,
    private readonly handPanel: HandPanel,
  ) {
    this.boardViewport = new BoardViewport(hosts.arena, hosts.canvasHost);
    this.resultBackdrop.hidden = true;
    this.errorBox.hidden = true;
    const sideTraits = (side: 0 | 1) => this.battle.snapshot().traits[side];
    this.traitPanel = new TraitPanel(catalogs.traits, this.traitPop);
    this.traitPanel.root.id = 'battle-trait-panel';
    this.traitToggle.setAttribute('aria-controls', 'battle-trait-panel');
    this.traitToggle.setAttribute('aria-expanded', 'false');
    this.info = new UnitInfoPanel(catalogs.units, catalogs.traits, catalogs.cards, battle, () => this.closeInfo(), this.traitPop, sideTraits);
    this.tooltip = new UnitTooltip(hosts.arena, hosts.canvasHost, hover, catalogs.units, catalogs.traits, () => this.cards.cardView().holding || this.drag.dragging);
    this.overlay.append(this.traitToggle, this.traitPanel.root, this.info.root, this.errorBox, this.resultBackdrop);
    hosts.arena.append(this.overlay, this.tooltip.root);
    this.overlay.hidden = true;

    this.shop = new ShopLayer(battle, catalogs.units, catalogs.traits, this.traitPop, this.unitPop, () => sideTraits(0));
    this.tray = new TrayStack(hosts.tray, { shop: this.shop.root, cards: hosts.hand }, this.boardViewport.tools);
    this.drag = new RosterDrag({
      controller: battle,
      canvasHost: hosts.canvasHost,
      isActive: () => this.active && this.stage === 'prep',
      ghost: (id) => {
        const unit = this.ownedUnit(id);
        const def = unit ? catalogs.units.get(unit.unitId) : undefined;
        return unitDragGhost(unit?.unitId ?? '', def?.name ?? '유닛', def?.tier ?? 1, unit?.star ?? 1);
      },
      onDragStart: (id) => {
        this.traitPop.hide();
        this.unitPop.hide();
        this.cards.cancelCard();
        this.tray.bringFront('cards');
        this.shop.previewSale(this.ownedUnit(id));
      },
      onSelect: id => { this.cards.cancelCard(); this.battle.selectManagedUnit(id); },
    });
    this.unitHand = new UnitHand(battle, cards, catalogs.units, catalogs.traits, this.drag);
    handPanel.attachUnits(this.unitHand);
    battle.subscribeActionFeedback?.(cue => {
      if (this.active && (cue.kind === 'purchase' && cue.shopSlot !== undefined || cue.kind === 'recall' || cue.kind === 'merge' && cue.benchIndex != null)) {
        this.handPanel.showUnifiedHand();
        this.tray.bringFront('cards');
      }
    });
    this.deployment = new DeploymentBar(hosts.bench, () => this.commands.startBattle(), () => {
      this.handPanel.showUnifiedHand(); this.tray.bringFront('cards');
    });
    this.mapModal = new MapModal(view);
    this.topBar = new BattleTopBar(hosts.top, battle, () => this.cards.cardView(), undefined, () => this.mapModal.open(), (ownedId, index) => this.commands.unequipItem(ownedId, index));

    hosts.canvasHost.addEventListener('pointerdown', this.onCanvasDown);
    hosts.canvasHost.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch' && hosts.canvasHost.closest('.bt-board-viewport.zoomed')) this.onCanvasDown(event);
    });
    window.addEventListener('keydown', this.onKey);
    view.subscribe(() => this.render());
    battle.subscribe(() => this.render());
    appSkin.subscribe(() => this.render());
    this.render();
    requestAnimationFrame(this.loop);
  }

  render(): void {
    const snap = this.view.snapshot();
    const active = snap.screen === 'battle' && snap.battle !== null && snap.hud !== null;
    this.setActive(active);
    if (!active || !snap.battle) return;
    const session = this.battle.snapshot();
    const stage = snap.battle.stage;
    this.unitHand.render(session, true);
    this.hosts.bench.dataset.stage = stage;
    if (stage !== this.stage) {
      // 준비 단계는 상점이, 전투가 시작되면 카드가 앞으로 나온다
      if (stage === 'prep') this.tray.bringFront('shop', false);
      if (stage === 'playing') this.tray.bringFront('cards', false);
      if (stage === 'prep') this.inspectUid = null;
      this.stage = stage;
    }
    this.tooltip.setEnabled(true, snap.battle.plan);
    this.topBar.render(snap, session);
    this.deployment.render(session, stage);
    this.shop.render(session, stage);
    this.traitPanel.render(session.traits[0], session.traits[1]);
    this.errorBox.hidden = session.error === null;
    this.errorBox.textContent = session.error ?? '';
    this.renderInfo(session);
    this.renderResult(snap);
  }

  private setActive(active: boolean): void {
    if (!active) this.unitHand.render(this.battle.snapshot(), false);
    if (active === this.active) return;
    this.active = active;
    this.hosts.top.hidden = !active;
    this.hosts.bench.hidden = !active;
    this.overlay.hidden = !active;
    this.tray.setStacked(active);
    this.boardViewport.setActive(active);
    if (!active) {
      this.shop.closeDetails();
      this.tooltip.setEnabled(false, null);
      this.traitPop.hide();
      this.unitPop.hide();
      this.mapModal.close();
      this.stage = null;
      this.inspectUid = null;
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  /** 매 프레임: 상단 더미 장수, 전투 중 정보 패널의 HP·상태 */
  private loop = (): void => {
    requestAnimationFrame(this.loop);
    if (!this.active) return;
    this.topBar.tick();
    this.tray.setCardCount(this.cards.cardView().hand.length, this.unitHand.count);
    if (this.inspectUid !== null) this.renderInfo(this.battle.snapshot());
  };

  private renderInfo(session: SessionSnapshot): void {
    this.info.render(this.infoSubject(session));
  }

  private infoSubject(session: SessionSnapshot): InfoSubject | null {
    if (this.stage === 'prep') {
      const id = session.management?.selectedUnitId ?? null;
      if (this.unitHand.selected) return null;
      const unit = id === null ? null : this.ownedUnit(id);
      return unit ? { kind: 'owned', unit, canManage: session.management?.canManage ?? false } : null;
    }
    if (this.inspectUid === null) return null;
    const view = this.hover.views().find((v) => v.uid === this.inspectUid);
    if (!view) return null;
    const planned = view.side === 1 ? this.view.snapshot().battle?.plan.units.find((u) => u.unitId === view.unitId && u.star === view.star) : undefined;
    if (planned) {
      return { kind: 'live', view, stats: {
        hp: view.maxHp, atk: planned.atk, as: planned.as, range: planned.range,
        arm: planned.arm, res: planned.res, mana: planned.mana,
      } };
    }
    return { kind: 'live', view };
  }

  private ownedUnit(id: number): OwnedUnit | null {
    const state = this.battle.snapshot().management?.state;
    if (!state) return null;
    return [...state.board, ...state.bench].find((u): u is OwnedUnit => u?.id === id) ?? null;
  }

  private closeInfo(): void {
    if (this.stage === 'prep') this.battle.selectManagedUnit(null);
    this.inspectUid = null;
    this.renderInfo(this.battle.snapshot());
  }

  /** 전투 중 유닛을 누르면 읽기 전용 정보를 띄운다. 카드 대상 지정이 우선이다. */
  private onCanvasDown = (event: PointerEvent): void => {
    if (event.type === 'pointerdown' && event.pointerType === 'touch' && this.hosts.canvasHost.closest('.bt-board-viewport.zoomed')) return;
    if (!this.active || this.stage !== 'playing' || event.button !== 0 || this.cards.cardView().holding) return;
    const canvas = this.hosts.canvasHost.querySelector('canvas');
    const point = canvas ? clientToStage(event.clientX, event.clientY, canvas.getBoundingClientRect()) : null;
    const unit = point ? this.hover.unitAtStage(point.x, point.y) : null;
    this.inspectUid = unit?.uid ?? null;
    this.renderInfo(this.battle.snapshot());
  };

  private onKey = (event: KeyboardEvent): void => {
    if (!this.active || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target) || document.querySelector('dialog[open]')) return;
    if (event.key === 'Enter' && event.target instanceof HTMLElement && event.target.closest('button, summary')) return;
    if (event.key === 'Escape' && !this.cards.cardView().holding) return this.closeInfo();
    if (this.stage !== 'prep') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commands.startBattle();
    } else if (event.code === 'KeyR') {
      this.battle.rerollShop();
    } else if (event.code === 'KeyF') {
      this.battle.buyExperience();
    }
  };

  private renderResult(snap: RunSnapshot): void {
    const settlement = snap.battle?.settlement ?? null;
    const signature = JSON.stringify(settlement);
    if (signature === this.resultSignature) return;
    this.resultSignature = signature;
    this.resultBackdrop.hidden = settlement === null;
    if (!settlement) {
      this.resultBackdrop.replaceChildren();
      return;
    }
    const box = tagged(el('div', `bt-panel bt-result ${settlement.outcome}`), 'battle-result');
    box.append(tagged(el('h2', '', settlement.headline), 'settlement-headline'), el('p', '', `골드 ${settlement.goldLine}`));
    if (settlement.xpLine) box.append(tagged(el('p', '', settlement.xpLine), 'settlement-xp'));
    for (const line of settlement.hpLines) box.append(el('p', 'hp', line));
    box.append(el('p', '', `지휘관 HP ${settlement.hpBefore} → ${settlement.hpAfter}`));
    if (settlement.runEnded === 'dead') box.append(el('p', 'hp', '지휘관이 쓰러졌습니다.'));
    if (settlement.runEnded === 'victory') box.append(el('p', 'win', '보스를 쓰러뜨렸습니다!'));
    if (settlement.actCleared !== null) box.append(tagged(el('p', 'win', `액트 ${settlement.actCleared} 보스를 쓰러뜨렸습니다!`), 'act-cleared'));
    box.append(tagged(button(settlement.continueLabel, () => this.commands.continueAfterBattle(), 'bt-btn primary'), 'continue-battle'));
    this.resultBackdrop.replaceChildren(box);
  }
}
