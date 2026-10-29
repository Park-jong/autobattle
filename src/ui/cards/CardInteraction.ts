import { isInsideBoard, type Cell, type PlayTarget } from '../../core/combat';
import type { TargetKind } from '../../core/data/card';
import type { BoardPick } from '../battle/BoardPicker';
import type { UnitView } from '../replay/ReplayState';

/** 카드를 집는 방식: 클릭으로 선택 후 대상 클릭 / 손패에서 끌어다 놓기 */
export type CardInputMode = 'click' | 'drag';

/** 집은 카드의 대상 지정 요구 */
export interface CardTargetSpec {
  instanceId: number;
  kind: TargetKind;
  /** allyUnits에서 지정할 아군 수 (그 외에는 1) */
  count: number;
}

/** 입력 처리 결과 */
export type InteractionOutcome =
  /** 상태만 바뀌었거나 할 일이 없음 */
  | { type: 'pending' }
  /** 대상이 모두 정해졌다: 호출 쪽이 sim.playCard로 사용한다 */
  | { type: 'commit'; instanceId: number; target: PlayTarget }
  /** 대상이 올바르지 않다 (선택은 유지) */
  | { type: 'invalid'; reason: string }
  /** 선택이 해제되었다 (reason이 있으면 사용자에게 알린다) */
  | { type: 'cancelled'; reason?: string };

/**
 * 카드 선택·대상 지정 상태 머신 (Phaser·DOM 비의존).
 *
 *   idle → select() → selected → activate(칸/유닛) → (allyUnits면 count명이 찰 때까지 반복) → commit → idle
 *                              → cancel() → idle
 *
 * 카드를 집은 동안(active)은 호출 쪽이 슬로모션을 건다.
 * 드래그 방식은 놓는 순간이 activate다. 대상이 올바르지 않으면 취소되고, allyUnits는 첫 유닛에 놓으면
 * 그 유닛이 선택된 채 클릭 방식으로 이어진다. 클릭 방식은 잘못된 대상을 누르면 선택을 유지한 채 invalid를 돌려준다.
 */
export class CardInteraction {
  private spec: CardTargetSpec | null = null;
  private mode: CardInputMode = 'click';
  private picked: number[] = [];
  private hoverPick: BoardPick | null = null;

  constructor(private readonly units: () => readonly UnitView[]) {}

  get active(): boolean {
    return this.spec !== null;
  }

  get selectedInstanceId(): number | null {
    return this.spec?.instanceId ?? null;
  }

  get inputMode(): CardInputMode | null {
    return this.spec ? this.mode : null;
  }

  get targetKind(): TargetKind | null {
    return this.spec?.kind ?? null;
  }

  /** 지금까지 고른 아군 (allyUnits) */
  get pickedUnits(): readonly number[] {
    return this.picked;
  }

  select(spec: CardTargetSpec, mode: CardInputMode): void {
    this.spec = { ...spec, count: spec.kind === 'allyUnits' ? spec.count : 1 };
    this.mode = mode;
    this.picked = [];
  }

  cancel(): InteractionOutcome {
    if (!this.spec) return { type: 'pending' };
    this.reset();
    return { type: 'cancelled' };
  }

  hover(pick: BoardPick | null): void {
    this.hoverPick = pick;
  }

  /** 대상이 없는 카드(none)는 보드 위 어디에 놓아도 되므로 놓을 곳 안내가 필요하다 */
  get dropZone(): boolean {
    return this.spec?.kind === 'none';
  }

  /** 강조할 유효 대상 유닛 uid */
  validUnits(): number[] {
    const side = this.requiredSide();
    if (side === null) return [];
    return this.units()
      .filter((u) => u.alive && u.side === side)
      .map((u) => u.uid);
  }

  /** 마우스가 가리키는 칸 기준 범위 미리보기 (cell: 1칸, area3x3: 3×3, 보드 밖은 제외) */
  previewCells(): Cell[] {
    const kind = this.spec?.kind;
    const cell = this.hoverPick?.cell;
    if (!cell || (kind !== 'cell' && kind !== 'area3x3')) return [];
    const radius = kind === 'area3x3' ? 1 : 0;
    const cells: Cell[] = [];
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const c = { col: cell.col + dc, row: cell.row + dr };
        if (isInsideBoard(c)) cells.push(c);
      }
    }
    return cells;
  }

  /** 범위 카드(cell/area3x3)가 가리키는 중심 칸. 범위 카드가 아니거나 보드 밖이면 null */
  previewCenter(): Cell | null {
    const kind = this.spec?.kind;
    const cell = this.hoverPick?.cell;
    if (!cell || (kind !== 'cell' && kind !== 'area3x3')) return null;
    return cell;
  }

  /** 범위 미리보기 안에 들어오는 살아 있는 유닛 uid (양 진영) */
  previewUnits(): number[] {
    const cells = this.previewCells();
    if (cells.length === 0) return [];
    return this.units()
      .filter((u) => u.alive && cells.some((c) => c.col === u.pos.col && c.row === u.pos.row))
      .map((u) => u.uid);
  }

  /** 유닛 대상 카드인데 유효하지 않은 유닛(반대 진영 등)을 가리키는 중이면 그 uid */
  invalidHoverUnit(): number | null {
    if (this.requiredSide() === null) return null;
    const uid = this.hoverPick?.unitUid ?? null;
    return uid !== null && !this.validUnits().includes(uid) ? uid : null;
  }

  /** 현재 가리키는 유닛 중 유효한 대상 (없으면 null) */
  hoverUnit(): number | null {
    const uid = this.hoverPick?.unitUid ?? null;
    return uid !== null && this.validUnits().includes(uid) ? uid : null;
  }

  /** 안내 문구 */
  hint(): string {
    const spec = this.spec;
    if (!spec) return '';
    const cancel = '(우클릭/ESC: 취소)';
    switch (spec.kind) {
      case 'none':
        return `보드 위에 놓거나 클릭해서 사용 ${cancel}`;
      case 'allyUnit':
        return `대상 아군을 선택하세요 ${cancel}`;
      case 'enemyUnit':
        return `대상 적을 선택하세요 ${cancel}`;
      case 'allyUnits':
        return `아군을 선택하세요 ${this.picked.length}/${spec.count} ${cancel}`;
      case 'cell':
        return `대상 칸을 선택하세요 ${cancel}`;
      case 'area3x3':
        return `범위 중심 칸을 선택하세요 ${cancel}`;
    }
  }

  /** 클릭 방식에서는 보드 클릭, 드래그 방식에서는 놓기. pick이 null이면 캔버스 밖 */
  activate(pick: BoardPick | null): InteractionOutcome {
    const spec = this.spec;
    if (!spec) return { type: 'pending' };
    if (pick === null || (pick.cell === null && pick.unitUid === null)) {
      // 캔버스 밖/보드 밖: 드래그는 취소, 클릭은 무시
      return this.mode === 'drag' ? this.cancelWith() : { type: 'pending' };
    }
    const outcome = this.resolve(spec, pick);
    if (this.mode === 'drag' && outcome.type === 'invalid') return this.cancelWith(outcome.reason);
    return outcome;
  }

  // ---- 내부 ----

  private resolve(spec: CardTargetSpec, pick: BoardPick): InteractionOutcome {
    switch (spec.kind) {
      case 'none':
        return this.commit(spec, { kind: 'none' });

      case 'allyUnit':
      case 'enemyUnit': {
        const uid = this.validPick(pick);
        if (uid === null) {
          return { type: 'invalid', reason: spec.kind === 'allyUnit' ? '아군 유닛을 선택하세요' : '적 유닛을 선택하세요' };
        }
        return this.commit(spec, { kind: 'unit', uid });
      }

      case 'allyUnits': {
        const uid = this.validPick(pick);
        if (uid === null) return { type: 'invalid', reason: `아군 유닛을 선택하세요 (${this.picked.length}/${spec.count})` };
        const at = this.picked.indexOf(uid);
        if (at >= 0) {
          this.picked.splice(at, 1); // 다시 누르면 선택 해제
          return { type: 'pending' };
        }
        this.picked.push(uid);
        if (this.picked.length < spec.count) {
          this.mode = 'click'; // 드래그로 시작했어도 나머지는 클릭으로 고른다
          return { type: 'pending' };
        }
        return this.commit(spec, { kind: 'units', uids: [...this.picked] });
      }

      case 'cell':
      case 'area3x3': {
        if (!pick.cell) return { type: 'invalid', reason: '보드 위의 칸을 선택하세요' };
        return this.commit(spec, { kind: 'cell', cell: pick.cell });
      }
    }
  }

  private commit(spec: CardTargetSpec, target: PlayTarget): InteractionOutcome {
    this.reset();
    return { type: 'commit', instanceId: spec.instanceId, target };
  }

  private cancelWith(reason?: string): InteractionOutcome {
    this.reset();
    return reason === undefined ? { type: 'cancelled' } : { type: 'cancelled', reason };
  }

  private reset(): void {
    this.spec = null;
    this.picked = [];
    this.hoverPick = null;
  }

  private validPick(pick: BoardPick): number | null {
    return pick.unitUid !== null && this.validUnits().includes(pick.unitUid) ? pick.unitUid : null;
  }

  private requiredSide(): 0 | 1 | null {
    switch (this.spec?.kind) {
      case 'allyUnit':
      case 'allyUnits':
        return 0;
      case 'enemyUnit':
        return 1;
      default:
        return null;
    }
  }
}
