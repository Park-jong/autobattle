import type { UnitCatalog } from '../../../core/data/unitLoader';
import { MANAGEMENT, type OwnedUnit } from '../../../core/management';
import type { CardController, DebugController, SessionSnapshot } from '../../debug/contracts';
import type { RosterDrag } from '../../economy/RosterDrag';
import { unitAbbreviation } from '../../gameData';
import { appSkin } from '../../skin/SkinStore';
import { unitArtUrl, unitSkinName } from '../../skin/skins';
import { button, el, tagged } from '../dom';
import { sellRefund } from './unitInfoView';

/** A persistent reserve shelf between the battlefield and the shop/card tray. */
export class BenchBar {
  private readonly heading = el('div', 'reserve-heading');
  private readonly count = tagged(el('span', 'reserve-count'), 'bench-count');
  private readonly population = tagged(el('strong', 'reserve-population'), 'bench-population');
  private readonly hint = el('span', 'reserve-hint');
  private readonly slots = el('div', 'reserve-slots');
  private readonly actions = el('div', 'reserve-actions');
  private readonly start: HTMLButtonElement;
  private readonly auto: HTMLButtonElement;
  private readonly sell: HTMLButtonElement;
  private signature = '';
  private selected: OwnedUnit | null = null;
  private canManage = false;

  constructor(
    readonly root: HTMLElement,
    private readonly controller: DebugController,
    private readonly cards: CardController,
    private readonly units: UnitCatalog,
    private readonly drag: RosterDrag,
    onStart: () => void,
  ) {
    root.classList.add('bt-reserve');
    root.setAttribute('aria-label', '대기 벤치');
    this.slots.setAttribute('role', 'group');
    this.slots.setAttribute('aria-label', `대기 유닛 ${MANAGEMENT.BENCH_SIZE}칸`);
    this.slots.dataset.benchZone = 'true';
    const title = el('div', 'reserve-title');
    title.append(el('b', '', '대기 벤치'), this.count);
    this.auto = tagged(button('자동 편성', () => this.controller.autoArrangeUnits(), 'reserve-auto'), 'auto-arrange-units');
    this.auto.title = '보유 유닛의 성급·소속·직업 시너지를 맞추고 전열·후열에 자동 배치';
    const status = el('div', 'reserve-status');
    status.append(this.population, this.auto);
    this.heading.append(title, status, this.hint);
    this.start = tagged(button('', onStart, 'reserve-start'), 'start-battle');
    this.start.append(el('span', '', '전투 시작'), el('kbd', '', 'Enter'));
    this.start.title = '전투 시작 · Enter';
    this.sell = tagged(button('', () => {
      if (this.selected && this.canManage) this.controller.sellManagedUnit(this.selected.id);
    }, 'reserve-sell'), 'bench-sell');
    this.sell.dataset.sellZone = 'true';
    this.actions.append(this.start, this.sell);
    root.replaceChildren(this.heading, this.slots, this.actions);
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    const management = session.management;
    const signature = JSON.stringify([appSkin.current, management?.state.bench, management?.state.board,
      management?.state.population, management?.state.level, management?.canManage, management?.selectedUnitId, stage]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.canManage = stage === 'prep' && !!management?.canManage;
    this.start.hidden = stage !== 'prep';
    this.auto.disabled = !this.canManage || !management || management.state.population + management.state.bench.filter(Boolean).length === 0;
    if (!management) {
      this.slots.replaceChildren();
      this.selected = null;
      this.previewSale(null);
      return;
    }
    const { state, selectedUnitId } = management;
    this.selected = [...state.board, ...state.bench].find((unit): unit is OwnedUnit => unit?.id === selectedUnitId) ?? null;
    const count = state.bench.filter(Boolean).length;
    this.count.textContent = `${count} / ${MANAGEMENT.BENCH_SIZE}`;
    this.root.classList.toggle('is-full', count === MANAGEMENT.BENCH_SIZE);
    this.root.classList.toggle('is-placing', this.selected !== null);
    this.population.textContent = `출전 ${state.population} / ${state.level}`;
    this.population.classList.toggle('has-room', state.population < state.level);
    this.hint.textContent = this.selected
      ? this.selected.benchIndex === null ? '빈 벤치를 눌러 회수' : '아군 칸을 눌러 배치 · Esc 취소'
      : count === MANAGEMENT.BENCH_SIZE ? '벤치 가득 참 · 배치 또는 판매' : '유닛 선택 후 배치 · 드래그 이동';
    this.previewSale(null);
    this.slots.replaceChildren(...Array.from({ length: MANAGEMENT.BENCH_SIZE }, (_, index) => this.slot(state.bench[index] ?? null, index)));
  }

  previewSale(dragged: OwnedUnit | null): void {
    const unit = dragged ?? this.selected;
    const tier = unit ? this.units.get(unit.unitId)?.tier : undefined;
    this.sell.textContent = tier && unit ? `판매 +${sellRefund(tier, unit.star)}G` : '끌어 놓아 판매';
    this.sell.disabled = !this.canManage || !unit;
    this.sell.classList.toggle('has-unit', !!unit);
  }

  private slot(unit: OwnedUnit | null, index: number): HTMLButtonElement {
    const node = tagged(button('', () => {
      if (!unit && this.selected && this.canManage) {
        this.cards.cancelCard();
        this.controller.moveManagedToBench(this.selected.id, index);
      }
    }, `reserve-slot${unit ? ' occupied' : ' empty'}`), `bench-slot-${index}`);
    node.dataset.benchIndex = String(index);
    node.disabled = !this.canManage;
    node.append(el('span', 'reserve-index', String(index + 1).padStart(2, '0')));
    if (!unit) {
      node.setAttribute('aria-label', `빈 벤치 ${index + 1}번${this.selected ? ', 선택 유닛을 여기로 이동' : ''}`);
      node.title = '유닛을 끌어 놓거나, 선택한 뒤 눌러 회수하세요';
      const mark = el('span', 'reserve-empty-mark', '+');
      mark.setAttribute('aria-hidden', 'true');
      node.append(mark, el('span', 'reserve-name', '대기'));
      return node;
    }
    const def = this.units.get(unit.unitId);
    const name = unitSkinName(appSkin.current, unit.unitId, def?.name ?? unit.unitId);
    node.classList.add(`tier-${def?.tier ?? 1}`);
    node.classList.toggle('selected', this.selected?.id === unit.id);
    node.setAttribute('aria-pressed', String(this.selected?.id === unit.id));
    node.setAttribute('aria-label', `${name}, ${unit.star}성, ${def?.tier ?? 1}등급. 선택 후 아군 칸에 배치`);
    node.title = `${name} · ${'★'.repeat(unit.star)} · ${def?.tier ?? 1}등급\n클릭 후 아군 칸에 배치 · 드래그로 이동`;
    const art = el('span', 'reserve-art');
    const url = unitArtUrl(appSkin.current, unit.unitId, 'sd');
    if (url) {
      const img = el('img');
      img.src = url;
      img.alt = '';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); art.append(unitAbbreviation(name)); });
      art.append(img);
    } else art.append(unitAbbreviation(name));
    node.append(art, el('span', 'reserve-stars', '★'.repeat(unit.star)), el('span', 'reserve-name', name));
    this.drag.bind(node, unit.id, 'bench', this.canManage);
    return node;
  }
}
