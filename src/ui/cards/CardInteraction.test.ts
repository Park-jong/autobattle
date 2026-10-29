import { describe, expect, it } from 'vitest';
import type { UnitView } from '../replay/ReplayState';
import { CardInteraction } from './CardInteraction';

function unit(uid: number, side: 0 | 1, alive = true): UnitView {
  return {
    uid,
    unitId: 'x',
    side,
    star: 1,
    hp: 1,
    maxHp: 1,
    shield: 0,
    mana: 0,
    maxMana: 0,
    alive,
    deadAt: null,
    cell: { col: 0, row: 0 },
    moveFrom: { col: 0, row: 0 },
    moveTo: { col: 0, row: 0 },
    moveProgress: 0,
    pos: { col: 0, row: 0 },
    statuses: [],
    marked: false,
  };
}

// 아군 0, 1, 2(사망) / 적 3, 4
const VIEWS = [unit(0, 0), unit(1, 0), unit(2, 0, false), unit(3, 1), unit(4, 1)];
const make = () => new CardInteraction(() => VIEWS);
const onUnit = (uid: number) => ({ cell: { col: 0, row: 0 }, unitUid: uid });
const onCell = (col: number, row: number) => ({ cell: { col, row }, unitUid: null });

describe('CardInteraction 상태', () => {
  it('선택하면 active, 취소하면 idle로 돌아간다', () => {
    const i = make();
    expect(i.active).toBe(false);
    i.select({ instanceId: 5, kind: 'allyUnit', count: 1 }, 'click');
    expect(i.active).toBe(true);
    expect(i.selectedInstanceId).toBe(5);
    expect(i.cancel()).toEqual({ type: 'cancelled' });
    expect(i.active).toBe(false);
    expect(i.cancel()).toEqual({ type: 'pending' });
  });

  it('다른 카드를 고르면 선택이 교체되고 고른 대상은 초기화된다', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'allyUnits', count: 2 }, 'click');
    i.activate(onUnit(0));
    expect(i.pickedUnits).toEqual([0]);
    i.select({ instanceId: 2, kind: 'enemyUnit', count: 1 }, 'click');
    expect(i.selectedInstanceId).toBe(2);
    expect(i.pickedUnits).toEqual([]);
  });
});

describe('CardInteraction 대상 종류별 판정', () => {
  it('none: 보드 위 어디든 놓으면 사용, 보드 밖 드롭은 취소', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'none', count: 1 }, 'drag');
    expect(i.dropZone).toBe(true);
    expect(i.activate(null)).toEqual({ type: 'cancelled' });
    i.select({ instanceId: 1, kind: 'none', count: 1 }, 'drag');
    expect(i.activate(onCell(5, 3))).toEqual({ type: 'commit', instanceId: 1, target: { kind: 'none' } });
    expect(i.active).toBe(false);
  });

  it('allyUnit: 살아 있는 아군만 유효, 클릭 방식은 잘못 눌러도 선택 유지', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'allyUnit', count: 1 }, 'click');
    expect(i.validUnits()).toEqual([0, 1]);
    expect(i.activate(onUnit(3))).toMatchObject({ type: 'invalid' });
    expect(i.activate(onUnit(2))).toMatchObject({ type: 'invalid' });
    expect(i.activate(onCell(1, 1))).toMatchObject({ type: 'invalid' });
    expect(i.active).toBe(true);
    expect(i.activate(onUnit(1))).toEqual({ type: 'commit', instanceId: 1, target: { kind: 'unit', uid: 1 } });
  });

  it('enemyUnit: 적만 유효. 드래그로 잘못 놓으면 사유와 함께 취소', () => {
    const i = make();
    i.select({ instanceId: 2, kind: 'enemyUnit', count: 1 }, 'drag');
    expect(i.validUnits()).toEqual([3, 4]);
    expect(i.activate(onUnit(0))).toEqual({ type: 'cancelled', reason: '적 유닛을 선택하세요' });
    expect(i.active).toBe(false);
    i.select({ instanceId: 2, kind: 'enemyUnit', count: 1 }, 'drag');
    expect(i.activate(onUnit(4))).toMatchObject({ type: 'commit', target: { kind: 'unit', uid: 4 } });
  });

  it('allyUnits: count명을 차례로 고르고 같은 유닛을 다시 누르면 해제된다', () => {
    const i = make();
    i.select({ instanceId: 3, kind: 'allyUnits', count: 2 }, 'click');
    expect(i.activate(onUnit(0))).toEqual({ type: 'pending' });
    expect(i.pickedUnits).toEqual([0]);
    expect(i.hint()).toContain('1/2');
    expect(i.activate(onUnit(0))).toEqual({ type: 'pending' });
    expect(i.pickedUnits).toEqual([]);
    i.activate(onUnit(1));
    expect(i.activate(onUnit(0))).toEqual({ type: 'commit', instanceId: 3, target: { kind: 'units', uids: [1, 0] } });
  });

  it('allyUnits를 드래그로 시작하면 첫 유닛 선택 후 클릭 방식으로 이어진다', () => {
    const i = make();
    i.select({ instanceId: 3, kind: 'allyUnits', count: 2 }, 'drag');
    expect(i.activate(onUnit(1))).toEqual({ type: 'pending' });
    expect(i.active).toBe(true);
    expect(i.inputMode).toBe('click');
    expect(i.activate(onUnit(4))).toMatchObject({ type: 'invalid' });
    expect(i.activate(onUnit(0))).toMatchObject({ type: 'commit' });
  });

  it('cell / area3x3: 칸을 지정하고 미리보기는 보드 안 칸만 포함한다', () => {
    const i = make();
    i.select({ instanceId: 4, kind: 'area3x3', count: 1 }, 'click');
    i.hover(onCell(0, 0));
    expect(i.previewCells()).toHaveLength(4);
    i.hover(onCell(4, 2));
    expect(i.previewCells()).toHaveLength(9);
    i.hover(null);
    expect(i.previewCells()).toEqual([]);
    expect(i.activate(onCell(4, 2))).toEqual({
      type: 'commit',
      instanceId: 4,
      target: { kind: 'cell', cell: { col: 4, row: 2 } },
    });

    i.select({ instanceId: 5, kind: 'cell', count: 1 }, 'click');
    i.hover(onCell(7, 4));
    expect(i.previewCells()).toEqual([{ col: 7, row: 4 }]);
  });

  it('클릭 방식에서 보드 밖 클릭은 무시한다', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'enemyUnit', count: 1 }, 'click');
    expect(i.activate({ cell: null, unitUid: null })).toEqual({ type: 'pending' });
    expect(i.active).toBe(true);
  });

  it('가리키는 유닛이 유효할 때만 hoverUnit이 값을 돌려준다', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'allyUnit', count: 1 }, 'click');
    i.hover(onUnit(0));
    expect(i.hoverUnit()).toBe(0);
    i.hover(onUnit(3));
    expect(i.hoverUnit()).toBeNull();
  });

  it('유효하지 않은 유닛을 가리키면 invalidHoverUnit이 uid를 준다 (범위·대상 없는 카드는 null)', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'allyUnit', count: 1 }, 'drag');
    i.hover(onUnit(3));
    expect(i.invalidHoverUnit()).toBe(3);
    i.hover(onUnit(0));
    expect(i.invalidHoverUnit()).toBeNull();
    i.select({ instanceId: 2, kind: 'area3x3', count: 1 }, 'drag');
    i.hover(onUnit(3));
    expect(i.invalidHoverUnit()).toBeNull();
  });

  it('범위 카드는 중심 칸과 범위 안 살아 있는 유닛을 알려준다', () => {
    const i = make();
    i.select({ instanceId: 1, kind: 'area3x3', count: 1 }, 'drag');
    expect(i.previewCenter()).toBeNull();
    i.hover(onCell(1, 1)); // 유닛은 모두 (0,0) → 3×3 안, 사망한 2번은 제외
    expect(i.previewCenter()).toEqual({ col: 1, row: 1 });
    expect(i.previewUnits()).toEqual([0, 1, 3, 4]);
    i.hover(onCell(5, 3));
    expect(i.previewUnits()).toEqual([]);
    i.select({ instanceId: 2, kind: 'enemyUnit', count: 1 }, 'drag');
    i.hover(onCell(0, 0));
    expect(i.previewCenter()).toBeNull();
    expect(i.previewUnits()).toEqual([]);
  });
});
