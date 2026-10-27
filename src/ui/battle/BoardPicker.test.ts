import { describe, expect, it } from 'vitest';
import type { UnitView } from '../replay/ReplayState';
import { BoardLayout } from './BoardLayout';
import { BoardPicker } from './BoardPicker';

const layout = new BoardLayout(224, 120, 104);
const picker = new BoardPicker(layout, 52);

function view(uid: number, col: number, row: number, extra: Partial<UnitView> = {}): UnitView {
  return {
    uid,
    unitId: 'x',
    side: 0,
    star: 1,
    hp: 10,
    maxHp: 10,
    shield: 0,
    mana: 0,
    maxMana: 0,
    alive: true,
    deadAt: null,
    cell: { col: Math.floor(col), row: Math.floor(row) },
    moveFrom: { col: 0, row: 0 },
    moveTo: { col: 0, row: 0 },
    moveProgress: 0,
    pos: { col, row },
    statuses: [],
    marked: false,
    ...extra,
  };
}

describe('BoardPicker', () => {
  it('칸 중심 근처를 누르면 그 유닛과 칸을 돌려준다', () => {
    const c = layout.center(2, 1);
    expect(picker.pick(c.x, c.y, [view(7, 2, 1)])).toEqual({ cell: { col: 2, row: 1 }, unitUid: 7 });
  });

  it('이동 중인 유닛은 보간된 위치 기준으로 판정한다', () => {
    // 논리 칸(1,1)에서 (2,1)로 이동 중, 절반 지점 -> 두 칸 사이
    const moving = view(3, 1.5, 1, { cell: { col: 1, row: 1 } });
    const between = layout.center(1.5, 1);
    expect(picker.pick(between.x, between.y, [moving]).unitUid).toBe(3);
    // 출발 칸 중심에서는 반경(52) 밖 (52 이상 떨어짐)이라 선택되지 않음
    const start = layout.center(1, 1);
    expect(picker.pick(start.x - 10, start.y, [moving]).unitUid).toBeNull();
  });

  it('겹치면 가장 가까운 유닛, 죽은 유닛은 무시, 보드 밖은 칸 null', () => {
    const near = view(1, 3, 2);
    const far = view(2, 3.4, 2);
    const dead = view(3, 3, 2, { alive: false });
    const p = layout.center(3, 2);
    expect(picker.pick(p.x + 2, p.y, [far, near]).unitUid).toBe(1);
    expect(picker.pick(p.x, p.y, [dead]).unitUid).toBeNull();
    expect(picker.pick(5, 5, [near]).cell).toBeNull();
  });
});
