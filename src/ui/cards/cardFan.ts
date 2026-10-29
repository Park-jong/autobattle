/** 손패 카드를 호(부채꼴)로 펼칠 때 한 장의 위치. x·y는 가운데 카드 기준 px, rotate는 도 단위 */
export interface FanSlot {
  x: number;
  y: number;
  rotate: number;
  /** 겹칠 때의 쌓임 순서 (오른쪽 카드가 위) */
  z: number;
}

export interface FanOptions {
  cardWidth: number;
  /** 카드를 펼칠 수 있는 최대 폭 (px) */
  maxWidth: number;
  /** 카드 사이 기본 간격 (겹침 없이 펼칠 때, 카드 폭 대비 비율) */
  spacingRatio?: number;
  /** 이웃 카드 사이 회전 각 상한(도)과 전체 회전 폭 상한(도) */
  stepAngle?: number;
  maxSpread?: number;
  /** 양 끝 카드가 가운데보다 내려가는 높이 (px) */
  arcHeight?: number;
}

/**
 * 카드 n장의 부채꼴 배치. 장수가 많아 최대 폭을 넘으면 간격을 줄여 겹치게 하고,
 * 회전은 이웃 사이 각(stepAngle)과 전체 폭(maxSpread) 중 작은 쪽으로 맞춘다. 양 끝은 포물선으로 내려간다.
 */
export function fanLayout(count: number, options: FanOptions): FanSlot[] {
  if (count <= 0) return [];
  const { cardWidth, maxWidth } = options;
  const spacingRatio = options.spacingRatio ?? 0.86;
  const stepAngle = options.stepAngle ?? 5;
  const maxSpread = options.maxSpread ?? 34;
  const arcHeight = options.arcHeight ?? 18;
  const mid = (count - 1) / 2;
  const ideal = cardWidth * spacingRatio;
  const fit = count > 1 ? Math.max(0, (maxWidth - cardWidth) / (count - 1)) : ideal;
  const step = Math.min(ideal, fit);
  const angle = count > 1 ? Math.min(stepAngle, maxSpread / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => {
    const offset = i - mid;
    const t = mid > 0 ? offset / mid : 0;
    return { x: round(offset * step), y: round(t * t * arcHeight * Math.min(1, mid / 2)), rotate: round(offset * angle), z: i + 1 };
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
