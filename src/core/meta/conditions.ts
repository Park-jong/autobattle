import type { UnlockCondition, UnlockConditionType } from '../data/meta';

/** 해금 조건 판정에 쓰는 누적 통계 (MetaProgress가 정산 때마다 갱신) */
export interface MetaStats {
  /** 끝난 런 수 (승패 무관) */
  runsCompleted: number;
  /** 정예 처치 누적 */
  eliteKills: number;
  /** 궁극기 사용 누적 */
  ultimateUses: number;
  /** 상점 방문 누적 */
  shopVisits: number;
  /** 지금까지 처치한 적이 있는 보스의 액트 (오름차순, 중복 없음) */
  bossActsKilled: number[];
  /** 유닛 3성을 달성한 적이 있는가 */
  unitStar3: boolean;
  /** 끝난 런 중 가장 큰 덱 장수 */
  bestCompletedDeckSize: number;
  /** 보스 입장 시 보유 골드의 최고 기록 */
  bestBossEntryGold: number;
}

export function emptyStats(): MetaStats {
  return {
    runsCompleted: 0, eliteKills: 0, ultimateUses: 0, shopVisits: 0,
    bossActsKilled: [], unitStar3: false, bestCompletedDeckSize: 0, bestBossEntryGold: 0,
  };
}

/** 조건 진행도: UI가 "현재/목표"로 표시한다. 달성 여부는 met */
export interface ConditionProgress {
  current: number;
  target: number;
  met: boolean;
}

const progress = (current: number, target: number): ConditionProgress => {
  const shown = Math.min(current, target);
  return { current: shown, target, met: current >= target };
};

type Evaluator<T extends UnlockConditionType> = (condition: Extract<UnlockCondition, { type: T }>, stats: MetaStats) => ConditionProgress;

/** 조건 종류별 판정기. 새 조건은 여기에 한 줄 추가한다 (종류 목록과 타입이 맞지 않으면 컴파일 오류) */
const EVALUATORS: { [T in UnlockConditionType]: Evaluator<T> } = {
  runsCompleted: (c, s) => progress(s.runsCompleted, c.count),
  bossKilled: (c, s) => progress(s.bossActsKilled.includes(c.act) ? 1 : 0, 1),
  eliteKills: (c, s) => progress(s.eliteKills, c.count),
  unitStar3: (_c, s) => progress(s.unitStar3 ? 1 : 0, 1),
  runCompletedWithDeckSize: (c, s) => progress(s.bestCompletedDeckSize, c.minSize),
  ultimateUses: (c, s) => progress(s.ultimateUses, c.count),
  reachBossWithGold: (c, s) => progress(s.bestBossEntryGold, c.gold),
  shopVisits: (c, s) => progress(s.shopVisits, c.count),
};

/** 조건의 현재 진행도를 계산한다 */
export function conditionProgress(condition: UnlockCondition, stats: MetaStats): ConditionProgress {
  const evaluate = EVALUATORS[condition.type] as (c: UnlockCondition, s: MetaStats) => ConditionProgress;
  return evaluate(condition, stats);
}

/** 조건을 한국어 문장으로 (UI 표시·데이터 문구 점검용) */
export function describeCondition(condition: UnlockCondition): string {
  switch (condition.type) {
    case 'runsCompleted': return `런 ${condition.count}회 완료 (승패 무관)`;
    case 'bossKilled': return `액트 ${condition.act} 보스 처치`;
    case 'eliteKills': return `정예 ${condition.count}회 처치`;
    case 'unitStar3': return '유닛 3성 달성';
    case 'runCompletedWithDeckSize': return `덱 ${condition.minSize}장 이상으로 런 완료`;
    case 'ultimateUses': return `궁극기 ${condition.count}회 사용`;
    case 'reachBossWithGold': return `골드 ${condition.gold}G 이상 보유한 채 보스 도달`;
    case 'shopVisits': return `상점 ${condition.count}회 방문`;
  }
}
