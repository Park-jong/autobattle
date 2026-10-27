import { COMBAT } from './constants';

/**
 * 최종 피해 계산. 순서: (배율) → (방어) 까지만 담당하고, 보호막 흡수는 호출 쪽에서 한다.
 *   1. 받는 피해 배율(damageTakenMult 곱 × 과열 배율)을 raw에 곱한다.
 *   2. 방어 공식 × 100/(100+방어력). ignoreArmorPct(%)만큼 방어력을 무시한다.
 *   3. 반올림, 최소 1.
 */
export function computeDamage(raw: number, takenMult: number, defense: number, ignoreDefensePct = 0): number {
  const effectiveDefense = defense * (1 - ignoreDefensePct / 100);
  const denominator = Math.max(10, 100 + effectiveDefense);
  return Math.max(1, Math.round((raw * takenMult * 100) / denominator));
}

/** 과열 배율: 30초까지 1, 이후 1 + 0.1 × (경과초 − 30) */
export function overheatMultiplier(elapsedSeconds: number): number {
  const over = elapsedSeconds - COMBAT.OVERHEAT_START_SECONDS;
  return over <= 0 ? 1 : 1 + COMBAT.OVERHEAT_RATE * over;
}
