import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import { MANAGEMENT, type ShopOffer } from '../../../core/management';
import type { DebugController, SessionSnapshot } from '../../debug/contracts';
import { unitArtUrl } from '../../skin/skins';
import { appSkin } from '../../skin/SkinStore';
import { unitAbbreviation } from '../../gameData';
import { button, el, tagged } from '../dom';

/**
 * 하단 트레이의 유닛 상점 층: 레벨·XP·골드, 리롤·경험치·잠금, 진열 5칸(원화·등급 색·기원/직업·가격).
 * 층 전체가 판매 구역이라 유닛을 끌어 놓으면 판다. 전투 중에는 잠김 안내를 덮는다.
 */
export class ShopLayer {
  readonly root = tagged(el('div', 'bt-shop'), 'unit-shop');
  private readonly side = el('div', 'bt-shop-side');
  private readonly offers = el('div', 'bt-offers');
  private readonly lockMsg = el('div', 'bt-shop-lockmsg');
  private readonly sellOverlay = el('div', 'bt-sell-overlay', '여기에 놓아 판매');
  private signature = '';

  constructor(
    private readonly controller: DebugController,
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
  ) {
    this.root.dataset.sellZone = 'true';
    this.root.append(this.side, this.offers, this.lockMsg, this.sellOverlay);
    appSkin.subscribe(() => { this.signature = ''; });
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    const management = session.management;
    const signature = JSON.stringify([management?.state.offers, management?.state.level, management?.state.xp, management?.state.locked, management?.canManage, session.economy.gold, stage, appSkin.current]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!management) {
      this.offers.replaceChildren();
      return;
    }
    const state = management.state;
    const canManage = management.canManage;
    const gold = session.economy.gold;

    const level = el('div', 'bt-shop-level', `레벨 ${state.level}`);
    level.append(el('span', '', state.xpToNext === null ? '최대 레벨' : `XP ${state.xp} / ${state.xpToNext}`));
    const xp = el('div', 'bt-xp');
    const fill = el('div', 'bt-xp-fill');
    fill.style.width = state.xpToNext ? `${Math.round((state.xp / state.xpToNext) * 100)}%` : '100%';
    xp.append(fill);
    const reroll = tagged(button(`리롤 ${MANAGEMENT.REROLL_COST}G`, () => this.controller.rerollShop(), 'bt-btn'), 'shop-reroll');
    reroll.append(el('span', 'bt-key', 'R'));
    const buyXp = tagged(button(`경험치 ${MANAGEMENT.XP_COST}G`, () => this.controller.buyExperience(), 'bt-btn'), 'shop-xp');
    buyXp.append(el('span', 'bt-key', 'F'));
    const lock = tagged(button(state.locked ? '잠금 해제' : '상점 잠금', () => this.controller.toggleShopLock(), `bt-btn lock${state.locked ? ' selected' : ''}`), 'shop-lock');
    lock.title = state.locked ? '다음 전투에서도 진열을 유지한 뒤 잠금이 해제됩니다.' : '다음 전투 준비 때 무료로 새 진열을 받습니다. 잠그면 유지합니다.';
    reroll.disabled = lock.disabled = !canManage;
    buyXp.disabled = !canManage || gold < MANAGEMENT.XP_COST || state.xpToNext === null;
    const actions = el('div', 'bt-shop-actions');
    actions.append(reroll, buyXp, lock);
    this.side.replaceChildren(level, xp, el('div', 'bt-shop-gold', `${gold}G`), actions);

    this.offers.replaceChildren(...state.offers.map((offer, slot) => this.offer(offer, slot, canManage, gold)));
    this.lockMsg.hidden = stage === 'prep';
    this.lockMsg.textContent = stage === 'playing' ? '전투 중에는 상점을 이용할 수 없습니다' : '전투가 끝났습니다';
  }

  private offer(offer: ShopOffer | null, slot: number, canManage: boolean, gold: number): HTMLElement {
    if (!offer) {
      const sold = el('button', 'bt-offer sold', '품절');
      sold.type = 'button';
      sold.disabled = true;
      return sold;
    }
    const def = this.units.get(offer.unitId);
    const name = def?.name ?? offer.unitId;
    const node = tagged(el('button', `bt-offer tier-${offer.tier}`), `shop-offer-${slot}`);
    node.type = 'button';
    node.disabled = !canManage || gold < offer.cost;
    node.addEventListener('click', () => this.controller.buyUnit(slot));
    const art = el('div', 'bt-offer-art');
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
      const traits = el('div', 'bt-offer-traits');
      for (const id of [def.origin, def.job]) traits.append(el('span', '', this.traits.get(id)?.name ?? id));
      art.append(traits);
      node.title = `${name} · ${offer.tier}등급\n${def.skill.name}: ${def.skill.text}`;
    }
    const foot = el('div', 'bt-offer-foot');
    foot.append(el('b', '', name), el('span', 'bt-offer-cost', `${offer.cost}G`));
    node.append(art, foot);
    return node;
  }
}
