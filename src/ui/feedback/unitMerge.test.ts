import { describe, expect, it } from 'vitest';
import type { OwnedUnit } from '../../core/management';
import { detectUnitMerges } from './unitMerge';

const unit = (id: number, star: 1 | 2 | 3 = 1, board = false, unitId = 'tank'): OwnedUnit => ({
  id, unitId, star, cell: board ? { col: 3, row: 1 } : null, benchIndex: board ? null : id - 1, equipment: [],
});
describe('committed unit merge presentation', () => {
  it('finds the survivor and actual consumed copies, preserving board/bench origins', () => {
    const before = [unit(1, 1, true), unit(2)];
    const result = detectUnitMerges(before, [unit(1, 2, true)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ unitId: 'tank', fromStar: 1, star: 2, origin: { col: 3, row: 1 }, sources: [{ star: 1, origin: { col: 3, row: 1 } }, { star: 1, benchIndex: 1 }] });
    expect(before[0]!.star).toBe(1);
  });
  it('reports a chained 1→3 merge and keeps the different source stars', () => {
    const result = detectUnitMerges([unit(1), unit(2), unit(3, 2), unit(4, 2)], [unit(1, 3)]);
    expect(result[0]).toMatchObject({ fromStar: 1, star: 3 });
    expect(result[0]!.sources.map((source) => source.star)).toEqual([1, 1, 2, 2]);
  });
  it('does not confuse purchases, movement, sales, or paid promotions with merging', () => {
    const before = [unit(1), unit(2)];
    expect(detectUnitMerges(before, [...before, unit(3, 1, false, 'healer')])).toEqual([]);
    expect(detectUnitMerges(before, [unit(1, 1, true), unit(2)])).toEqual([]);
    expect(detectUnitMerges(before, [unit(1)])).toEqual([]);
    expect(detectUnitMerges([unit(1)], [unit(1, 2)])).toEqual([]);
    expect(detectUnitMerges([], [unit(1, 3)])).toEqual([]);
  });
  it('recognizes a two-copy mirror purchase while keeping paid promotion excluded', () => {
    expect(detectUnitMerges([unit(1)], [unit(1, 2)], 'tank')[0]).toMatchObject({ star: 2, sources: [{ star: 1 }] });
    expect(detectUnitMerges([unit(1)], [unit(1, 2)], 'healer')).toEqual([]);
  });
});
