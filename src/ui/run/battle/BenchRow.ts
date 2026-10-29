import type { UnitCatalog } from '../../../core/data/unitLoader';
import type { OwnedUnit } from '../../../core/management';
import type { RosterDrag } from '../../economy/RosterDrag';
import type { SessionSnapshot } from '../../debug/contracts';
import { BOARD_COLS } from '../../../core/combat/board';
import { LAYOUT, STAGE } from '../../theme';
import { appSkin } from '../../skin/SkinStore';
import { unitSkinName } from '../../skin/skins';
import { button, el, tagged } from '../dom';
import { unitFace } from './unitFace';

/**
 * 보드 아래의 벤치 줄(9칸 가로 일렬). 칸 폭은 화면에 그려진 보드 폭에 맞춘다.
 * 왼쪽: 배치 인원·레벨, 오른쪽: 전투 시작 버튼(준비 단계) 또는 진행 상태.
 */
export class BenchRow {
  private readonly left = el('div', 'bt-bench-side left');
  private readonly slots = tagged(el('div', 'bt-bench-slots'), 'bench');
  private readonly right = el('div', 'bt-bench-side right');
  private signature = '';

  constructor(
    readonly root: HTMLElement,
    private readonly units: UnitCatalog,
    private readonly drag: RosterDrag,
    private readonly canvasHost: HTMLElement,
    private readonly onStart: () => void,
  ) {
    root.replaceChildren(this.left, this.slots, this.right);
    new ResizeObserver(() => this.fitWidth()).observe(canvasHost);
  }

  /** 화면에 그려진 보드 폭(캔버스 폭 × 보드 비율)에 벤치 폭을 맞춘다 */
  fitWidth(): void {
    const canvas = this.canvasHost.querySelector('canvas');
    const width = canvas?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    this.slots.style.width = `${Math.round(width * (BOARD_COLS * LAYOUT.CELL_SIZE) / STAGE.WIDTH)}px`;
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    const management = session.management;
    const signature = JSON.stringify([management?.state.bench, management?.state.level, management?.state.population, management?.selectedUnitId, management?.canManage, stage, session.phase, appSkin.current]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!management) {
      this.slots.replaceChildren();
      return;
    }
    const state = management.state;
    const canManage = management.canManage;
    this.left.replaceChildren(
      el('span', '', '배치 '),
      el('b', '', `${state.population} / ${state.level}`),
      el('span', '', ` · 벤치 ${state.bench.filter((u) => u !== null).length} / ${state.bench.length}`),
    );
    this.slots.replaceChildren(...state.bench.map((unit, index) => this.slot(unit, index, canManage, management.selectedUnitId)));
    if (stage === 'prep') {
      const start = tagged(button('전투 시작', () => this.onStart(), 'bt-btn primary bt-start'), 'start-battle');
      start.title = '단축키 Enter';
      this.right.replaceChildren(start);
    } else {
      this.right.replaceChildren(el('span', '', stage === 'playing' ? (session.phase === 'paused' ? '일시정지 중' : '전투 중 — 유닛 관리 잠김') : '전투 종료'));
    }
    requestAnimationFrame(() => this.fitWidth());
  }

  private slot(unit: OwnedUnit | null, index: number, canManage: boolean, selected: number | null): HTMLElement {
    const cell = el('div', 'bt-slot');
    cell.dataset.benchIndex = String(index);
    if (!unit) {
      cell.textContent = String(index + 1);
      return cell;
    }
    const def = this.units.get(unit.unitId);
    const name = def?.name ?? unit.unitId;
    const node = tagged(el('button', `bt-slot-unit tier-${def?.tier ?? 1}`), `bench-unit-${index}`);
    node.type = 'button';
    node.disabled = !canManage;
    node.classList.toggle('selected', unit.id === selected);
    const label = el('span', 'bt-slot-name');
    label.append(el('b', '', unitSkinName(appSkin.current, unit.unitId, name)), el('span', '', '★'.repeat(unit.star)));
    node.append(unitFace(unit.unitId, name, def?.tier ?? 1), label);
    node.title = `${name} — 클릭: 정보 / 끌기: 보드에 배치·상점에 놓아 판매`;
    this.drag.bind(node, unit.id, 'bench', canManage);
    cell.append(node);
    return cell;
  }
}
