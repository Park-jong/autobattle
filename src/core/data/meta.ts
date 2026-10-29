/** 해금 달성 조건. 종류별 필드는 data/README.md "meta.json" 절 */
export type UnlockCondition =
  | { type: 'runsCompleted'; count: number }
  | { type: 'bossKilled'; act: number }
  | { type: 'eliteKills'; count: number }
  | { type: 'unitStar3' }
  | { type: 'runCompletedWithDeckSize'; minSize: number }
  | { type: 'ultimateUses'; count: number }
  | { type: 'reachBossWithGold'; gold: number }
  | { type: 'shopVisits'; count: number };

export type UnlockConditionType = UnlockCondition['type'];
export const UNLOCK_CONDITION_TYPES: readonly UnlockConditionType[] = [
  'runsCompleted', 'bossKilled', 'eliteKills', 'unitStar3', 'runCompletedWithDeckSize', 'ultimateUses', 'reachBossWithGold', 'shopVisits',
];

export type UnlockTarget = 'commander' | 'relic';
export const UNLOCK_TARGETS: readonly UnlockTarget[] = ['commander', 'relic'];

/** 해금 항목 하나: 대상(지휘관/유물) id, 전공 포인트 가격, 달성 조건 */
export interface UnlockEntry {
  target: UnlockTarget;
  id: string;
  price: number;
  condition: UnlockCondition;
}

/** 런 종료 때 받는 전공 포인트 공식 (모두 0 이상의 정수 계수) */
export interface PointsRule {
  /** 도달한 전체 층 1개당 */
  perFloor: number;
  /** 처치한 보스(액트) 1개당 */
  perBoss: number;
  /** 처치한 정예 1개당 */
  perElite: number;
  /** 최종 승리 보너스 */
  victoryBonus: number;
  /** 위협 레벨 1단계당 전공 포인트 추가 비율(%). 런 포인트 합계 × (100 + 이 값 × 레벨) / 100을 반올림한다 */
  threatBonusPctPerLevel: number;
}

export interface MetaFile {
  version: number;
  points: PointsRule;
  unlocks: UnlockEntry[];
}
