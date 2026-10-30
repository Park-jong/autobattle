import type { DebugController } from '../debug/contracts';
import { clientToStage } from '../cards/stagePoint';

type Origin = 'board' | 'bench' | 'canvas';

interface UnitPress { id: number; x: number; y: number; origin: Origin; dragging: boolean; pointerId: number; pointerType: string; }

export interface RosterDragOptions {
  controller: DebugController;
  canvasHost?: HTMLElement | undefined;
  /** 이 드래그 처리기가 지금 화면에 보이는가 (같은 캔버스를 여러 패널이 공유하므로 숨겨진 쪽은 무시) */
  isActive(): boolean;
  /** 드래그 중 포인터를 따라다니는 표시 (기본: "유닛 이동") */
  ghost?(id: number): HTMLElement;
  /** 드래그가 시작될 때 (판매 구역을 앞으로 꺼내는 등) */
  onDragStart?(id: number): void;
  onDragEnd?(): void;
  onSelect?(id: number): void;
}

/**
 * 소유 유닛 드래그: 벤치·목록 버튼 또는 캔버스 위 아군 유닛을 눌러 8px 이상 움직이면 드래그.
 * 놓은 곳이 캔버스면 보드 배치, `data-bench-index` 요소면 그 벤치 칸, `data-sell-zone` 요소면 판매.
 * 움직이지 않고 떼면 선택 (캔버스 클릭 선택은 Phaser 쪽에서 이미 처리한다).
 */
export class RosterDrag {
  private press: UnitPress | null = null;
  private ghostNode: HTMLElement | null = null;

  constructor(private readonly options: RosterDragOptions) {
    options.canvasHost?.addEventListener('pointerdown', this.onCanvasDown, true);
  }

  /** 버튼에 드래그·선택을 붙인다 */
  bind(node: HTMLElement, id: number, origin: 'board' | 'bench', enabled: boolean): void {
    node.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !enabled || !this.options.isActive()) return;
      this.begin(id, event, origin);
    });
    // 키보드(Enter/Space)로 누른 클릭은 detail이 0이다
    node.addEventListener('click', (event) => {
      if (event.detail === 0 && event.target === node && enabled && this.options.isActive()) this.select(id);
    });
  }

  /** 드래그 중인가 (툴팁 등을 숨길 때) */
  get dragging(): boolean {
    return this.press?.dragging === true;
  }

  private onCanvasDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.options.isActive()) return;
    if (event.pointerType === 'touch' && this.options.canvasHost?.closest('.bt-board-viewport.zoomed')) return;
    const point = this.stagePoint(event);
    if (!point) return;
    const id = this.options.controller.managedUnitAtStage(point.x, point.y);
    if (id !== null) this.begin(id, event, 'canvas');
  };

  private begin(id: number, event: PointerEvent, origin: Origin): void {
    this.end();
    this.press = { id, x: event.clientX, y: event.clientY, origin, dragging: false, pointerId: event.pointerId, pointerType: event.pointerType };
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.end);
    window.addEventListener('keydown', this.onKey);
  }

  private onMove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    if (!this.options.isActive()) return this.end();
    // Touch benches use native horizontal scrolling and tap-to-place.
    if (press.origin === 'bench' && press.pointerType === 'touch' && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) return this.end();
    if (!press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) {
      press.dragging = true;
      this.ghostNode = this.options.ghost?.(press.id) ?? defaultGhost();
      document.body.append(this.ghostNode);
      document.body.classList.add('roster-dragging');
      this.options.onDragStart?.(press.id);
    }
    if (this.ghostNode) {
      event.preventDefault();
      this.ghostNode.style.left = `${event.clientX}px`;
      this.ghostNode.style.top = `${event.clientY}px`;
    }
  };

  private onUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    // Resolve temporary drop zones before removing the dragging presentation.
    const under = press.dragging ? document.elementFromPoint(event.clientX, event.clientY) : null;
    this.end();
    if (!this.options.isActive()) return;
    const controller = this.options.controller;
    if (!press.dragging) {
      if (press.pointerType === 'touch' && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) return;
      if (press.origin !== 'canvas') this.select(press.id);
      return;
    }
    // 포인터 아래 요소 (드래그 표시는 pointer-events: none)
    const bench = under?.closest<HTMLElement>('[data-bench-index]');
    if (bench?.dataset.benchIndex !== undefined) return controller.moveManagedToBench(press.id, Number(bench.dataset.benchIndex));
    if (under?.closest('[data-sell-zone]')) return controller.sellManagedUnit(press.id);
    if (under?.closest('[data-bench-zone]')) {
      if (press.origin !== 'bench') controller.moveManagedToBench(press.id);
      return;
    }
    const point = this.stagePoint(event);
    if (point && under?.closest('canvas')) controller.dropManagedToBoard(press.id, point.x, point.y);
  };

  private select(id: number): void {
    if (this.options.onSelect) this.options.onSelect(id);
    else this.options.controller.selectManagedUnit(id);
  }

  private onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.end();
  };

  private stagePoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.options.canvasHost?.querySelector('canvas');
    return canvas ? clientToStage(event.clientX, event.clientY, canvas.getBoundingClientRect()) : null;
  }

  private end = (): void => {
    const wasDragging = this.press?.dragging;
    this.press = null;
    this.ghostNode?.remove();
    this.ghostNode = null;
    document.body.classList.remove('roster-dragging');
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.end);
    window.removeEventListener('keydown', this.onKey);
    if (wasDragging) this.options.onDragEnd?.();
  };
}

function defaultGhost(): HTMLElement {
  const node = document.createElement('div');
  node.className = 'management-unit-ghost';
  node.textContent = '유닛 이동';
  return node;
}
