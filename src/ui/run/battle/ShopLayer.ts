import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import { LEVEL_ODDS, MANAGEMENT, type ShopOffer } from '../../../core/management';
import type { DebugController, SessionSnapshot } from '../../debug/contracts';
import { traitSkinName, unitArtUrl, unitSkinName, unitSkillName } from '../../skin/skins';
import { appSkin } from '../../skin/SkinStore';
import { unitAbbreviation } from '../../gameData';
import type { ActiveTrait } from '../../../core/combat/traits';
import { button, el, tagged } from '../dom';
import { traitPopContent, type HoverPop } from './hoverPop';
import { skillBlock, statsGrid } from './UnitInfoPanel';
import { buildUnitInfo } from './unitInfoView';
import { sellRefund } from './unitInfoView';
import { tierBadge } from './unitFace';
import { purchaseHint } from './unitPresentation';
import type { OwnedUnit } from '../../../core/management';
import { iconSvg, setIconTip } from '../iconButton';
import { traitBadge } from './traitBadge';
import { traitRowFor } from './traitPanelView';

/**
 * 하단 트레이의 유닛 상점 층: 레벨·XP·골드, 리롤·경험치·잠금, 진열 5칸(원화·등급 색·기원/직업·가격).
 * 판매 구역에 유닛을 끌어 놓으면 판다. 전투 중에는 잠김 안내를 덮는다.
 * 초상화를 누르면 소속·직업과 유닛 설명이 있는 뒷면을 보여 준다. 영입은 별도 버튼으로 한다.
 */
export class ShopLayer {
  readonly root = tagged(el('div', 'bt-shop unit-market'), 'unit-shop');
  private readonly side = el('div', 'bt-shop-side');
  private readonly offers = el('div', 'bt-offers');
  private readonly lockMsg = el('div', 'bt-shop-lockmsg');
  private readonly sellOverlay = el('div', 'bt-sell-overlay', '여기에 놓아 판매');
  private readonly flipped = new Map<number, string>();
  private owned: OwnedUnit[] = [];
  private signature = '';

  constructor(
    private readonly controller: DebugController,
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    private readonly traitPop: HoverPop,
    private readonly unitPop: HoverPop,
    /** 아군의 지금 특성 (특성 팝업의 종류 수·단계) */
    private readonly allyTraits: () => readonly ActiveTrait[],
  ) {
    this.sellOverlay.dataset.sellZone = 'true';
    this.sellOverlay.setAttribute('aria-label', '유닛 판매 구역');
    this.root.append(this.side, this.offers, this.lockMsg);
    appSkin.subscribe(() => { this.signature = ''; });
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    if (stage !== 'prep') this.flipped.clear();
    const management = session.management;
    const signature = JSON.stringify([management?.state.offers, management?.state.board, management?.state.bench, management?.state.level, management?.state.xp, management?.state.locked, management?.canManage, session.economy.gold, stage, appSkin.current, session.traits[0]]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!management) {
      this.offers.replaceChildren();
      return;
    }
    const state = management.state;
    this.owned = [...state.board, ...state.bench.filter((unit): unit is OwnedUnit => unit !== null)];
    const canManage = management.canManage;
    const gold = session.economy.gold;
    this.root.classList.toggle('shop-locked', state.locked);

    const wallet = el('div', 'bt-shop-wallet');
    wallet.append(el('span', '', '보유 골드'), tagged(el('strong', 'bt-shop-gold', `${gold} G`), 'shop-gold'));

    const level = el('div', 'bt-shop-level', `레벨 ${state.level}`);
    level.append(el('span', '', state.xpToNext === null ? 'MAX' : `${state.xp} / ${state.xpToNext} XP`));
    const xp = el('div', 'bt-xp');
    xp.setAttribute('role', 'progressbar');
    xp.setAttribute('aria-label', '다음 레벨까지 경험치');
    xp.setAttribute('aria-valuemin', '0');
    xp.setAttribute('aria-valuemax', String(state.xpToNext ?? 1));
    xp.setAttribute('aria-valuenow', String(state.xpToNext === null ? 1 : state.xp));
    const fill = el('div', 'bt-xp-fill');
    fill.style.width = state.xpToNext ? `${Math.round((state.xp / state.xpToNext) * 100)}%` : '100%';
    xp.append(fill);
    const reroll = tagged(button('', () => { this.flipped.clear(); this.controller.rerollShop(); }, 'bt-btn shop-control shop-refresh'), 'shop-reroll');
    reroll.innerHTML = iconSvg('reroll', 24);
    reroll.append(el('span', 'shop-control-label', '리롤'), el('strong', 'shop-control-cost', `${MANAGEMENT.REROLL_COST}G`), el('span', 'bt-key', 'R'));
    setIconTip(reroll, '리롤 · 1G · R (유물의 무료 리롤 우선 사용)');
    const buyXp = tagged(button('', () => this.controller.buyExperience(), 'bt-btn shop-control shop-experience'), 'shop-xp');
    buyXp.innerHTML = iconSvg('experience', 24);
    buyXp.append(el('span', 'shop-control-label', '경험치'), el('strong', 'shop-control-cost', `${MANAGEMENT.XP_COST}G`), el('span', 'bt-key', 'F'));
    setIconTip(buyXp, `경험치 +${MANAGEMENT.XP_PER_PURCHASE} · ${MANAGEMENT.XP_COST}G · F`);
    const lock = tagged(button('', () => this.controller.toggleShopLock(), `bt-btn shop-control lock${state.locked ? ' selected' : ''}`), 'shop-lock');
    lock.innerHTML = iconSvg(state.locked ? 'lock' : 'unlock', 24);
    lock.append(el('span', 'shop-control-label', state.locked ? '잠금 중' : '잠금'));
    setIconTip(lock, state.locked ? '잠금 해제 · 다음 전투 진열 유지 취소' : '상점 잠금 · 다음 전투에도 진열 유지');
    lock.setAttribute('aria-pressed', String(state.locked));
    lock.title = state.locked ? '다음 전투에서도 진열을 유지한 뒤 잠금이 해제됩니다.' : '다음 전투 준비 때 무료로 새 진열을 받습니다. 잠그면 유지합니다.';
    reroll.disabled = lock.disabled = !canManage;
    buyXp.disabled = !canManage || gold < MANAGEMENT.XP_COST || state.xpToNext === null;
    reroll.title = !canManage ? '전투 중 사용 불가' : '유물의 무료 리롤을 먼저 사용합니다. 무료 횟수가 없으면 1G를 지불합니다.';
    buyXp.title = !canManage ? '전투 중 사용 불가' : state.xpToNext === null ? '최대 레벨' : gold < MANAGEMENT.XP_COST ? '골드 부족' : `경험치 +${MANAGEMENT.XP_PER_PURCHASE}`;
    const actions = el('div', 'bt-shop-actions');
    actions.append(reroll, buyXp, lock);
    const reason = el('div', 'bt-action-reason', state.locked ? '다음 전투에도 이 진열을 유지합니다' : '다음 전투 준비 시 무료로 새로고침');
    const odds = el('div', 'bt-shop-odds');
    odds.setAttribute('aria-label', `레벨 ${state.level} 기본 등장 확률`);
    odds.title = '레벨별 기본 등장 확률입니다. 해당 등급의 재고가 없으면 남은 등급에 재분배됩니다.';
    for (const [index, chance] of (LEVEL_ODDS[state.level] ?? []).entries()) {
      const entry = el('span', `shop-odds-tier tier-${index + 1}${chance === 0 ? ' unavailable' : ''}`, `${chance}%`);
      entry.setAttribute('aria-label', `${index + 1}등급 ${chance}%`);
      odds.append(entry);
    }
    const progression = el('div', 'bt-shop-progression');
    progression.append(level, xp, odds);
    this.side.replaceChildren(wallet, progression, actions, reason, this.sellOverlay);

    this.offers.replaceChildren(...state.offers.map((offer, slot) => this.offer(offer, slot, canManage, gold)));
    this.unitPop.reattach(this.offers);
    this.traitPop.reattach(this.offers);
    this.lockMsg.hidden = stage === 'prep';
    this.lockMsg.textContent = stage === 'playing' ? '전투 중에는 상점을 이용할 수 없습니다' : '전투가 끝났습니다';
  }

  private offer(offer: ShopOffer | null, slot: number, canManage: boolean, gold: number): HTMLElement {
    if (!offer) {
      this.flipped.delete(slot);
      const sold = tagged(el('div', 'bt-offer sold'), `shop-offer-${slot}`);
      sold.append(el('span', 'bt-sold-mark', '✓'), el('strong', '', '영입 완료'));
      return sold;
    }
    const def = this.units.get(offer.unitId);
    const name = def?.name ?? offer.unitId;
    const node = tagged(el('article', `bt-offer tier-${offer.tier}`), `shop-offer-${slot}`);
    const displayName = unitSkinName(appSkin.current, offer.unitId, name);
    node.setAttribute('aria-label', `${displayName} · ${offer.tier}등급 · ${offer.cost}G`);
    if (this.flipped.get(slot) !== offer.unitId) this.flipped.delete(slot);
    const hint = purchaseHint(offer.unitId, this.owned);
    const merging = hint.includes('합성');
    node.classList.toggle('merge-ready', merging);
    node.classList.toggle('is-owned', hint !== '미보유');
    node.classList.toggle('unaffordable', gold < offer.cost);
    const turner = el('div', 'bt-offer-turner');
    const front = el('div', 'bt-offer-front');
    const back = el('div', 'bt-offer-back');
    back.id = `shop-back-${slot}`;
    const backTitle = el('strong', 'bt-offer-back-name', displayName);
    backTitle.tabIndex = -1;
    const toggle = tagged(button('', () => setFlipped(true, true), 'bt-offer-flip'), `shop-flip-${slot}`);
    toggle.setAttribute('aria-label', `${displayName} 정보 보기 · 카드 뒤집기`);
    toggle.setAttribute('aria-controls', back.id);
    const setFlipped = (show: boolean, focus = false): void => {
      if (show) this.flipped.set(slot, offer.unitId);
      else this.flipped.delete(slot);
      node.classList.toggle('is-flipped', show);
      front.inert = show;
      back.inert = !show;
      front.setAttribute('aria-hidden', String(show));
      back.setAttribute('aria-hidden', String(!show));
      toggle.setAttribute('aria-expanded', String(show));
      this.traitPop.hide();
      this.unitPop.hide();
      if (focus) (show ? backTitle : toggle).focus({ preventScroll: true });
    };
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape' && node.classList.contains('is-flipped')) {
        event.preventDefault();
        event.stopPropagation();
        setFlipped(false, true);
      }
    });
    const art = el('div', 'bt-offer-art');
    const traits = el('div', 'bt-offer-traits');
    const url = unitArtUrl(appSkin.current, offer.unitId, 'portrait');
    if (url) {
      const img = el('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); art.prepend(unitAbbreviation(displayName)); });
      art.append(img);
    } else {
      art.append(unitAbbreviation(displayName));
    }
    const backScroll = el('div', 'bt-offer-back-scroll');
    backScroll.tabIndex = 0;
    backScroll.setAttribute('role', 'region');
    backScroll.setAttribute('aria-label', `${displayName} 소속·직업·스킬 정보 · 다시 누르면 초상화`);
    back.title = '다시 누르면 초상화로 뒤집기';
    let backPress: { x: number; y: number; moved: boolean } | null = null;
    back.addEventListener('pointerdown', event => {
      if (event.button === 0) backPress = { x: event.clientX, y: event.clientY, moved: false };
    });
    back.addEventListener('pointermove', event => {
      if (backPress && Math.hypot(event.clientX - backPress.x, event.clientY - backPress.y) >= 8) backPress.moved = true;
    });
    back.addEventListener('pointercancel', () => { if (backPress) backPress.moved = true; });
    backScroll.addEventListener('scroll', () => { if (backPress) backPress.moved = true; }, { passive: true });
    back.addEventListener('click', event => {
      const moved = backPress?.moved;
      backPress = null;
      if (event.detail !== 0 && moved) return;
      setFlipped(false, true);
    });
    back.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      setFlipped(false, true);
    });
    backScroll.append(backTitle, el('span', 'bt-offer-back-tier', `${offer.tier}등급 · 1성`));
    if (def) {
      for (const id of [def.origin, def.job]) {
        const trait = this.traits.get(id);
        const traitName = traitSkinName(appSkin.current, id, trait?.name ?? id);
        const kind = id === def.origin ? 'origin' : 'job';
        const chip = traitBadge(id, traitName, kind);
        chip.classList.toggle('shared-trait', this.allyTraits().some((trait) => trait.traitId === id));
        chip.dataset.traitId = id;
        chip.dataset.popKey = `offer-trait:${slot}:${id}`;
        chip.removeAttribute('title');
        chip.setAttribute('aria-label', `${kind === 'origin' ? '소속' : '직업'} ${traitName} 정보 보기`);
        const showTrait = () => {
          if (!trait) return;
          this.unitPop.hide();
          this.traitPop.show(chip, () => traitPopContent(traitRowFor(trait, this.allyTraits().find(t => t.traitId === id))), 'above');
        };
        chip.addEventListener('mouseenter', showTrait);
        chip.addEventListener('focus', showTrait);
        chip.addEventListener('mouseleave', () => this.traitPop.hide());
        chip.addEventListener('blur', () => this.traitPop.hide());
        chip.addEventListener('click', () => setFlipped(true, true));
        traits.append(chip);
        const section = el('section', 'bt-offer-back-trait');
        section.append(el('strong', '', `${kind === 'origin' ? '소속' : '직업'} · ${traitName}`));
        if (trait) {
          const row = traitRowFor(trait, this.allyTraits().find(t => t.traitId === id));
          section.append(el('span', 'bt-offer-back-progress', `보유 ${row.count}종 · ${trait.thresholds.join('/')}종 활성`), el('p', '', row.currentText));
        }
        backScroll.append(section);
      }
      const info = buildUnitInfo(def, 1, { traitName: id => traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id) });
      info.skillName = unitSkillName(appSkin.current, offer.unitId, info.skillName);
      backScroll.append(statsGrid(info), skillBlock(info));
    }
    const caption = el('span', 'bt-offer-caption');
    caption.append(el('strong', 'bt-offer-name', displayName));
    toggle.append(caption);
    front.append(art, toggle, traits, tierBadge(offer.tier));
    back.append(backScroll);
    turner.append(front, back);
    const buy = button('', () => {
      this.unitPop.hide();
      this.traitPop.hide();
      this.controller.buyUnit(slot);
    }, 'bt-btn bt-offer-buy');
    buy.append(el('span', '', gold < offer.cost && canManage ? '부족' : '영입'), el('strong', 'bt-offer-cost', `${offer.cost}G`));
    if (hint !== '미보유') {
      const ownership = el('span', `bt-offer-owned${merging ? ' merge' : ''}`, hint);
      ownership.title = '동일 유닛 3기 합성 기준. 유물의 추가 합성 효과는 별도로 적용됩니다.';
      toggle.prepend(ownership);
    }
    buy.setAttribute('aria-label', `${displayName} 영입 ${offer.cost}G`);
    buy.disabled = !canManage || gold < offer.cost;
    buy.title = !canManage ? '전투 중 사용 불가' : gold < offer.cost ? '골드 부족' : `${displayName} 영입 · ${offer.cost}G`;
    node.append(turner, buy);
    setFlipped(this.flipped.get(slot) === offer.unitId);
    return node;
  }

  previewSale(unit: OwnedUnit | null): void {
    const tier = unit ? this.units.get(unit.unitId)?.tier : undefined;
    this.sellOverlay.textContent = tier && unit ? `여기에 놓아 판매 +${sellRefund(tier, unit.star)}G` : '유닛을 여기에 놓아 판매';
  }

  closeDetails(): void {
    this.flipped.clear();
    this.signature = '';
  }
}
