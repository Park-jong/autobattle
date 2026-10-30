import type { OwnedUnit } from '../../core/management';

export interface MergeSource { star: number; origin?: { col: number; row: number }; benchIndex?: number | null; shopSlot?: number; }
export interface UnitMerge { unitId: string; star: number; fromStar: number; origin?: { col: number; row: number }; benchIndex: number | null; sources: MergeSource[]; }

/** Compare only committed snapshots, so rejected purchases and ordinary moves cannot animate. */
export function detectUnitMerges(before: readonly OwnedUnit[], after: readonly OwnedUnit[], incomingUnitId?: string): UnitMerge[] {
  const afterIds = new Set(after.map((unit) => unit.id));
  return after.flatMap((unit) => {
    const old = before.find((entry) => entry.id === unit.id && entry.unitId === unit.unitId);
    if (!old || unit.star <= old.star) return [];
    const consumed = before.filter((entry) => entry.unitId === unit.unitId && !afterIds.has(entry.id));
    if (consumed.length === 0 && incomingUnitId !== unit.unitId) return []; // Paid promotions are separate; a mirror purchase can consume only the new copy.
    return [{ unitId: unit.unitId, star: unit.star, fromStar: old.star, origin: unit.cell ? { ...unit.cell } : undefined,
      benchIndex: unit.benchIndex, sources: [old, ...consumed].map((source) => ({
        star: source.star, origin: source.cell ? { ...source.cell } : undefined, benchIndex: source.benchIndex,
      })) }];
  });
}
