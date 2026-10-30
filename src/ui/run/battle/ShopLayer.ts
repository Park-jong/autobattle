import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import { LEVEL_ODDS, MANAGEMENT, type ShopOffer } from '../../../core/management';
import type { DebugController, SessionSnapshot } from '../../debug/contracts';
import { isIllustratedSkin, traitSkinName, unitArtUrl, unitSkinName, unitSkinRole } from '../../skin/skins';
import { appSkin } from '../../skin/SkinStore';
import { unitAbbreviation } from '../../gameData';
import type { ActiveTrait } from '../../../core/combat/traits';
import { button, el, tagged } from '../dom';
import type { HoverPop } from './hoverPop';
import { bindTraitChip } from './TraitPanel';
import { infoHead, skillBlock, statsGrid } from './UnitInfoPanel';
import { buildUnitInfo } from './unitInfoView';
import { sellRefund } from './unitInfoView';
import { tierBadge } from './unitFace';
import { purchaseHint } from './unitPresentation';
import type { OwnedUnit } from '../../../core/management';
import { iconSvg, setIconTip } from '../iconButton';

/**
 * 하단 트레이의 유닛 상점 층: 레벨·XP·골드, 리롤·경험치·잠금, 진열 5칸(원화·등급 색·기원/직업·가격).
 * 판매 구역에 유닛을 끌어 놓으면 판다. 전투 중에는 잠김 안내를 덮는다.
 * 진열 카드에 마우스를 올리면 카드 위에 유닛 정보(능력치·1/2/3성 스킬)를, 특성 이름 위면 특성 설명을 띄운다.
 */
export class ShopLayer {
  readonly root = tagged(el('div', 'bt-shop unit-market'), 'unit-shop');
  private readonly side = el('div', 'bt-shop-side');
  private readonly offers = el('div', 'bt-offers');
  private readonly lockMsg = el('div', 'bt-shop-lockmsg');
  private readonly sellOverlay = el('div', 'bt-sell-overlay', '여기에 놓아 판매');
  private readonly detail = el('dialog', 'bt-shop-detail bt-panel');
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
    this.detail.setAttribute('aria-label', '상점 유닛 상세 정보');
    this.detail.addEventListener('click', (event) => { if (event.target === this.detail) this.detail.close(); });
    this.root.append(this.detail);
    appSkin.subscribe(() => { this.signature = ''; });
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    if (stage !== 'prep' && this.detail.open) this.detail.close();
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
    const reroll = tagged(button('', () => this.controller.rerollShop(), 'bt-btn shop-control shop-refresh'), 'shop-reroll');
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
      const sold = tagged(el('div', 'bt-offer sold'), `shop-offer-${slot}`);
      sold.append(el('span', 'bt-sold-mark', '✓'), el('strong', '', '영입 완료'), el('small', '', '새로고침하면 새 유닛 등장'));
      return sold;
    }
    const def = this.units.get(offer.unitId);
    const name = def?.name ?? offer.unitId;
    const node = tagged(el('article', `bt-offer tier-${offer.tier}`), `shop-offer-${slot}`);
    const displayName = unitSkinName(appSkin.current, offer.unitId, name);
    node.setAttribute('aria-label', `${displayName} · ${offer.tier}등급 · ${offer.cost}G`);
    const hint = purchaseHint(offer.unitId, this.owned);
    const merging = hint.includes('합성');
    node.classList.toggle('merge-ready', merging);
    node.classList.toggle('is-owned', hint !== '미보유');
    node.classList.toggle('unaffordable', gold < offer.cost);
    const art = el('div', 'bt-offer-art');
    const traits = el('div', 'bt-offer-traits');
    const url = unitArtUrl(appSkin.current, offer.unitId, 'portrait');
    if (url) {
      const img = el('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); art.prepend(unitAbbreviation(name)); });
      art.append(img);
    } else {
      art.append(unitAbbreviation(name));
    }
    if (def) {
      for (const id of [def.origin, def.job]) {
        const chip = el('span', '', traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id));
        chip.classList.toggle('shared-trait', this.allyTraits().some((trait) => trait.traitId === id));
        bindTraitChip(chip, id, this.traits, this.traitPop, this.allyTraits);
        traits.append(chip);
      }
      node.dataset.popKey = `offer:${slot}:${offer.unitId}`;
      const content = () => {
        const info = buildUnitInfo(def, 1, { traitName: (id) => traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id) });
        return [infoHead(info, false, { large: false }), el('div', 'bt-unit-pop-cost', `${offer.tier}등급 · ${offer.cost}G`), statsGrid(info), skillBlock(info)];
      };
      const inspect = button('정보', () => {
        this.unitPop.hide();
        this.traitPop.hide();
        this.detail.replaceChildren(button('닫기', () => this.detail.close(), 'bt-btn bt-detail-close'), ...content());
        this.detail.showModal();
      }, 'bt-offer-info');
      inspect.setAttribute('aria-label', `${unitSkinName(appSkin.current, offer.unitId, name)} 상세 정보`);
      art.append(inspect);
      // 특성 이름 위에서는 특성 팝업만, 나머지 부분에서는 유닛 팝업을 띄운다
      node.addEventListener('mouseover', (event) => {
        if (!window.matchMedia('(hover: hover)').matches) return;
        if ((event.target as Element).closest('[data-trait-id]')) this.unitPop.hide();
        else this.unitPop.show(node, content, 'above');
      });
      node.addEventListener('mouseleave', () => this.unitPop.hide());
    }
    art.append(tierBadge(offer.tier));
    const foot = el('div', 'bt-offer-foot');
    const label = el('div', 'academy-offer-label');
    label.append(el('b', '', displayName));
    if (isIllustratedSkin(appSkin.current)) label.append(el('small', '', unitSkinRole(appSkin.current, offer.unitId, name)));
    const buy = button('', () => {
      this.unitPop.hide();
      this.traitPop.hide();
      this.controller.buyUnit(slot);
    }, 'bt-btn bt-offer-buy');
    buy.append(el('span', '', '영입'), el('strong', 'bt-offer-cost', `${offer.cost} G`));
    buy.setAttribute('aria-label', `${displayName} 영입 ${offer.cost}G`);
    buy.disabled = !canManage || gold < offer.cost;
    buy.title = !canManage ? '전투 중 사용 불가' : gold < offer.cost ? '골드 부족' : `${name} 구매`;
    const ownership = el('div', `bt-offer-owned${merging ? ' merge' : ''}`, hint === '미보유' ? '새 유닛' : hint);
    ownership.title = '동일 유닛 3기 합성 기준. 유물의 추가 합성 효과는 별도로 적용됩니다.';
    if (gold < offer.cost && canManage) {
      buy.replaceChildren(el('span', '', '골드 부족'), el('strong', 'bt-offer-cost', `${offer.cost} G`));
    }
    foot.append(label, traits, ownership, buy);
    node.append(art, foot);
    return node;
  }

  previewSale(unit: OwnedUnit | null): void {
    const tier = unit ? this.units.get(unit.unitId)?.tier : undefined;
    this.sellOverlay.textContent = tier && unit ? `여기에 놓아 판매 +${sellRefund(tier, unit.star)}G` : '유닛을 여기에 놓아 판매';
  }

  closeDetails(): void {
    if (this.detail.open) this.detail.close();
  }
}
