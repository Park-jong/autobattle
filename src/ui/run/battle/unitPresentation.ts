import type { OwnedUnit } from '../../../core/management';

export const TIER_COLORS = [0x9aa3b5, 0x4fbf6a, 0x3f8fe0, 0xb15ce0, 0xf0b43c] as const;

/** Count units, rather than equivalent copies: two 2★ units cannot merge with a new 1★. */
export function purchaseHint(unitId: string, owned: readonly Pick<OwnedUnit, 'unitId' | 'star'>[]): string {
  const matching = owned.filter((unit) => unit.unitId === unitId);
  const ones = matching.filter((unit) => unit.star === 1).length;
  const twos = matching.filter((unit) => unit.star === 2).length;
  if (ones >= 2) return `구매 시 ${twos >= 2 ? '★★★' : '★★'} 합성`;
  if (matching.length > 0) return `보유 ${matching.length}기 · ★ ${ones}/3`;
  return '미보유';
}
