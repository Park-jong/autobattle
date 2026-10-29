import type { CardCatalog } from '../../core/data/cardLoader';
import type { TraitCatalog } from '../../core/data/traitLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import type { UnitDef } from '../../core/data/unit';
import type { OwnedUnit } from '../../core/management';
import type { DebugController } from '../debug/contracts';
import { unitDragGhost } from '../run/battle/unitFace';
import { RosterDrag } from './RosterDrag';
import { unitArtUrl } from '../skin/skins';
import { appSkin, type SkinStore } from '../skin/SkinStore';
import './managementPanel.css';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, action: () => void): HTMLButtonElement {
  const node = el('button', 'dbg-btn', text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

/** 패널 표시 옵션: 런 전투 준비에서는 경제 플레이 시작/종료 버튼을 숨기고 제목을 바꾼다 */
export interface ManagementPanelOptions {
  title?: string;
  /** 경제 플레이 시작·종료·새로 시작 버튼 표시 (기본 true) */
  modeControls?: boolean;
  /** 주면 상점 진열과 유닛 설명에 기원·직업 이름을 함께 보여 준다 */
  traits?: TraitCatalog;
  /** 화면 스킨 (원화 스킨이면 상점·벤치·배치 목록에 초상화를 붙인다). 기본은 앱 공용 저장소 */
  skin?: SkinStore;
}

/** 상점·레벨·벤치 UI. 보드와 벤치 사이의 드래그도 DOM 좌표를 게임 좌표로 바꿔 명령만 전달한다. */
export class ManagementPanel {
  private readonly drag: RosterDrag;

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: DebugController,
    private readonly units: UnitCatalog,
    private readonly cards?: CardCatalog,
    private readonly canvasHost?: HTMLElement,
    private readonly options: ManagementPanelOptions = {},
  ) {
    this.root.className = 'management-panel';
    this.drag = new RosterDrag({
      controller,
      canvasHost,
      isActive: () => this.isActive(),
      // 끄는 동안 보드 위 유닛 모양을 보여 준다 (전투 화면과 같은 표시)
      ghost: (id) => {
        const state = controller.snapshot().management?.state;
        const unit = state ? [...state.board, ...state.bench].find((u): u is OwnedUnit => u?.id === id) : undefined;
        const def = unit ? units.get(unit.unitId) : undefined;
        return unitDragGhost(unit?.unitId ?? '', def?.name ?? '유닛', def?.tier ?? 1, unit?.star ?? 1, options.skin ?? appSkin);
      },
    });
    controller.subscribe(() => this.render());
    (options.skin ?? appSkin).subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const snapshot = this.controller.snapshot();
    const management = snapshot.management;
    const title = el('h2', '', this.options.title ?? (management ? '경제 플레이 / 상점' : '경제 플레이'));
    if (!management) {
      const start = button('경제 플레이 시작', () => this.controller.startManagementRun());
      const test = button('장비·징집 테스트 시작', () => this.controller.startManagementRun('test'));
      start.disabled = test.disabled = snapshot.commanderId === null || snapshot.series !== null || snapshot.phase !== 'edit';
      const actions = el('div', 'dbg-row');
      actions.append(start, test);
      this.root.replaceChildren(title, actions, el('p', 'dbg-hint', '지휘관 유닛 2기·10G·레벨 3으로 시작합니다. 구매와 합성으로 5연전을 준비하세요.'));
      return;
    }
    const state = management.state;
    const canManage = management.canManage;
    const stats = el('strong', 'management-stats', `레벨 ${state.level} · 배치 ${state.population}/${state.level} · XP ${state.xp}/${state.xpToNext ?? '최대'}`);
    const controls = el('div', 'dbg-row');
    const reroll = button('리롤 1G', () => this.controller.rerollShop());
    const xp = button('경험치 +4 · 4G', () => this.controller.buyExperience());
    const lock = button(state.locked ? '잠금 해제' : '상점 잠금', () => this.controller.toggleShopLock());
    reroll.disabled = !canManage || state.gold < 1;
    xp.disabled = !canManage || state.gold < 4 || state.xpToNext === null;
    lock.disabled = !canManage;
    controls.append(reroll, xp, lock);
    const offers = el('div', 'management-offers');
    state.offers.forEach((offer, slot) => {
      const def = offer ? this.units.get(offer.unitId) : undefined;
      const traitLine = def && this.options.traits ? `\n${this.traitNames(def).join('\n')}` : '';
      const buy = button(offer ? `${def?.name ?? '유닛'}\n${offer.tier}등급 · ${offer.cost}G${traitLine}` : '품절', () => this.controller.buyUnit(slot));
      buy.classList.add('management-offer');
      buy.disabled = !canManage || !offer || state.gold < offer.cost;
      if (def) buy.title = this.describe(def);
      const face = offer ? this.portrait(offer.unitId, 'skin-portrait') : null;
      if (face) buy.prepend(face);
      offers.append(buy);
    });

    const bench = el('div', 'management-bench');
    bench.setAttribute('aria-label', '벤치 6칸');
    state.bench.forEach((unit, index) => {
      const cell = el('div', 'management-bench-cell');
      cell.dataset.benchIndex = String(index);
      const item = unit ? this.unitButton(unit, 'bench', canManage, management.selectedUnitId) : button(`${index + 1} · 빈 칸`, () => {
        if (management.selectedUnitId !== null) this.controller.moveManagedToBench(management.selectedUnitId, index);
      });
      item.disabled = !canManage;
      cell.append(item);
      bench.append(cell);
    });

    const board = el('div', 'management-board-list');
    state.board.forEach((unit) => board.append(this.unitButton(unit, 'board', canManage, management.selectedUnitId)));
    const selected = [...state.board, ...state.bench].find((unit) => unit?.id === management.selectedUnitId);
    const selection = el('div', 'management-selection');
    if (selected) {
      const toBench = button('벤치로 이동', () => this.controller.moveManagedToBench(selected.id));
      const sell = button('선택 유닛 판매', () => this.controller.sellManagedUnit(selected.id));
      toBench.disabled = sell.disabled = !canManage;
      const equipment = selected.equipment.map((id) => {
        const upgraded = id.endsWith('+');
        return `${this.cards?.get(upgraded ? id.slice(0, -1) : id)?.name ?? '장비'}${upgraded ? '+' : ''}`;
      });
      selection.append(el('p', '', `${this.unitName(selected)}${equipment.length ? ` · 장비: ${equipment.join(', ')}` : ''}`), toBench, sell);
    } else {
      selection.append(el('p', 'dbg-hint', '유닛을 선택해 아군 보드의 빈 칸을 누르거나, 보드↔벤치로 드래그하세요.'));
    }
    const showModes = this.options.modeControls !== false;
    const exit = button('경제 플레이 종료', () => this.controller.endManagementRun());
    const restart = button('새 경제 플레이', () => this.controller.startManagementRun());
    const test = button('새 장비·징집 테스트', () => this.controller.startManagementRun('test'));
    restart.disabled = test.disabled = snapshot.phase !== 'finished';
    const modes = el('div', 'dbg-row');
    if (showModes) modes.append(exit, restart, test);
    this.root.replaceChildren(
      title, stats, controls, offers,
      el('p', 'dbg-hint', state.locked ? '다음 전투에서도 진열을 유지한 뒤 잠금이 해제됩니다.' : '다음 전투 준비 때 무료로 새 진열을 받습니다.'),
      el('h3', 'management-subtitle', '벤치'), bench,
      el('h3', 'management-subtitle', '배치 유닛'), board, selection,
      el('p', 'dbg-hint', '같은 유닛 3기는 자동 합성됩니다. 별 1개 → 2개 → 3개, 장비는 합성 유닛에게 이어집니다.'), modes,
    );
  }

  /** 기원·직업 이름 (특성 카탈로그가 없으면 빈 목록) */
  private traitNames(def: UnitDef): string[] {
    const traits = this.options.traits;
    return traits ? [traits.get(def.origin)?.name ?? def.origin, traits.get(def.job)?.name ?? def.job] : [];
  }

  /** 툴팁: 등급·기원·직업과 스킬 이름·설명 */
  private describe(def: UnitDef): string {
    const traits = this.traitNames(def);
    const head = traits.length > 0 ? `${def.tier}등급 · ${traits.join(' · ')}\n` : '';
    return `${head}${def.skill.name}: ${def.skill.text}`;
  }

  /** 원화 스킨일 때 유닛 초상화 (기본 스킨·원화 없는 유닛이면 null, 읽기 실패면 숨김) */
  private portrait(unitId: string, className: string): HTMLImageElement | null {
    const url = unitArtUrl((this.options.skin ?? appSkin).current, unitId, 'portrait');
    if (!url) return null;
    const img = el('img', className);
    img.src = url;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => { img.hidden = true; });
    return img;
  }

  private unitName(unit: OwnedUnit): string {
    return `${this.units.get(unit.unitId)?.name ?? '유닛'} ${'★'.repeat(unit.star)}`;
  }

  private unitButton(unit: OwnedUnit, origin: 'board' | 'bench', enabled: boolean, selected: number | null): HTMLButtonElement {
    const node = el('button', 'dbg-btn management-unit', this.unitName(unit));
    node.type = 'button';
    node.classList.toggle('selected', unit.id === selected);
    node.disabled = !enabled;
    const def = this.units.get(unit.unitId);
    const grant = def?.grantedCard ? this.cards?.get(def.grantedCard)?.name : null;
    node.title = `${def ? this.describe(def) : ''}${grant ? ` / 배치 중 제공 카드: ${grant}` : ''}`;
    const face = this.portrait(unit.unitId, 'skin-portrait-small');
    if (face) node.prepend(face);
    this.drag.bind(node, unit.id, origin, enabled);
    return node;
  }

  /** 화면에 보이는가. 런 전투 패널과 디버그 패널이 같은 캔버스를 쓰므로 숨겨진 쪽은 캔버스 드래그를 처리하지 않는다 */
  private isActive(): boolean {
    return this.root.isConnected && this.root.getClientRects().length > 0;
  }
}
