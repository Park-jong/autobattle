import type { UnitCatalog } from '../../core/data/unitLoader';
import type { TraitCatalog } from '../../core/data/traitLoader';
import { MANAGEMENT, type OwnedUnit } from '../../core/management';
import type { CardController, DebugController, SessionSnapshot } from '../debug/contracts';
import type { RosterDrag } from '../economy/RosterDrag';
import { appSkin } from '../skin/SkinStore';
import { traitSkinName, unitArtUrl, unitSkinName, unitSkillName } from '../skin/skins';
import { button, el, tagged } from '../run/dom';
import { buildUnitInfo, sellRefund, starHpAtk } from '../run/battle/unitInfoView';
import { infoHead, skillBlock, statsGrid } from '../run/battle/UnitInfoPanel';
import { tierBadge } from '../run/battle/unitFace';

/** Owned, unsummoned units share the hand's layout, not its draw/discard piles. */
export class UnitHand {
  readonly detail = el('dialog', 'hand-detail unit-card-detail');
  nodes: HTMLElement[] = [];
  active = false;
  canManage = false;
  selected = false;
  count = 0;
  signature = '';
  readonly capacity = MANAGEMENT.BENCH_SIZE;
  private readonly entries = new Map<number, { key: string; node: HTMLElement }>();

  constructor(
    private readonly controller: DebugController,
    private readonly cards: CardController,
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    private readonly drag: RosterDrag,
  ) {
    this.detail.setAttribute('aria-label', '소환 유닛 상세 정보');
    this.detail.addEventListener('click', event => { if (event.target === this.detail) this.detail.close(); });
  }

  render(session: SessionSnapshot, active: boolean): void {
    const management = active ? session.management : null;
    const signature = JSON.stringify([appSkin.current, management?.state.bench, management?.state.level, management?.state.population, management?.canManage, management?.selectedUnitId]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.active = management !== null;
    this.canManage = management?.canManage ?? false;
    const reserve = management?.state.bench.filter((unit): unit is OwnedUnit => unit !== null) ?? [];
    this.count = reserve.length;
    this.selected = reserve.some(unit => unit.id === management?.selectedUnitId);
    if (!this.canManage && this.detail.open) this.detail.close();
    const live = new Set(reserve.map(unit => unit.id));
    for (const id of this.entries.keys()) if (!live.has(id)) this.entries.delete(id);
    this.nodes = reserve.map(unit => {
      const key = JSON.stringify([appSkin.current, unit, this.canManage]);
      let entry = this.entries.get(unit.id);
      if (!entry || entry.key !== key) {
        entry = { key, node: this.card(unit) };
        this.entries.set(unit.id, entry);
      }
      entry.node.classList.toggle('selected', unit.id === management?.selectedUnitId);
      return entry.node;
    });
  }

  cancel(): void {
    if (this.selected) this.controller.selectManagedUnit(null);
  }

  private select(id: number): void {
    if (!this.canManage) return;
    this.cards.cancelCard();
    this.controller.selectManagedUnit(id);
  }

  private card(unit: OwnedUnit): HTMLElement {
    const def = this.units.get(unit.unitId);
    const name = unitSkinName(appSkin.current, unit.unitId, def?.name ?? unit.unitId);
    const node = tagged(el('article', `hcard unit-summon-card tier-${def?.tier ?? 1}${this.canManage ? '' : ' unavailable'}`), `unit-card-${unit.id}`);
    node.dataset.unitCardId = String(unit.id);
    node.dataset.reserveIndex = String(unit.benchIndex);
    node.tabIndex = 0;
    node.setAttribute('role', 'group');
    node.setAttribute('aria-label', `${name}, ${unit.star}성 유닛. ${this.canManage ? '선택 후 아군 칸에 소환' : '다음 준비 단계에서 소환 가능'}`);
    node.addEventListener('keydown', event => {
      if (event.target !== node || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault(); event.stopPropagation(); this.select(unit.id);
    });
    const art = el('div', 'unit-card-art');
    const url = unitArtUrl(appSkin.current, unit.unitId, 'portrait');
    if (url) {
      const image = el('img'); image.src = url; image.alt = ''; image.draggable = false;
      image.addEventListener('error', () => { image.remove(); art.prepend(name.slice(0, 2)); });
      art.append(image);
    } else art.append(name.slice(0, 2));
    art.append(tierBadge(def?.tier ?? 1), el('span', 'unit-card-stars', '★'.repeat(unit.star)));
    const info = button('정보', () => {
      if (!def) return;
      const model = buildUnitInfo(def, unit.star, { traitName: id => traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id) });
      model.skillName = unitSkillName(appSkin.current, unit.unitId, model.skillName);
      const summon = button('소환할 칸 선택', () => { this.detail.close(); this.select(unit.id); });
      summon.disabled = !this.canManage;
      const sell = button(`판매 +${sellRefund(def.tier, unit.star)}G`, () => { this.detail.close(); this.controller.sellManagedUnit(unit.id); });
      sell.disabled = !this.canManage;
      this.detail.replaceChildren(infoHead(model, false), statsGrid(model), skillBlock(model), summon, sell, button('닫기', () => this.detail.close()));
      this.detail.showModal();
    }, 'hcard-info');
    info.setAttribute('aria-label', `${name} 소환 유닛 정보`);
    info.addEventListener('pointerdown', event => event.stopPropagation());
    info.addEventListener('keydown', event => event.stopPropagation());
    art.append(info);
    const body = el('div', 'unit-card-body');
    const traits = def ? [def.origin, def.job].map(id => traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id)).join(' · ') : '';
    body.append(el('strong', 'unit-card-name', name), el('span', 'unit-card-traits', traits));
    if (def) {
      const stats = starHpAtk(def, unit.star);
      body.append(el('span', 'unit-card-stats', `체력 ${stats.hp} · 공격 ${stats.atk}`));
    }
    const summon = button(this.canManage ? '소환' : '준비 중 소환', () => this.select(unit.id), 'unit-card-summon');
    summon.disabled = !this.canManage;
    summon.setAttribute('aria-label', `${name} 소환할 칸 선택`);
    summon.addEventListener('pointerdown', event => event.stopPropagation());
    summon.addEventListener('keydown', event => event.stopPropagation());
    body.append(summon);
    node.append(art, body);
    this.drag.bind(node, unit.id, 'bench', this.canManage);
    return node;
  }
}
