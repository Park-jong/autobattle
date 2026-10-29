/**
 * 런 하나의 메타 정산 입력. 런 코어(`RunController.runSummary()`)가 만들고 `MetaProgress.settleRun`이 받는다.
 * meta는 run에 의존하지 않도록 형태만 여기서 정한다.
 */
export interface RunSummary {
  /** 정산 중복 방지용 런 식별자 (런을 만들 때 호출자가 정한다). 없으면 정산할 수 없다 */
  runId: string | null;
  /** 플레이 테스트 런이면 true — 메타 정산에서 제외된다 */
  test: boolean;
  commanderId: string;
  /** 끝난 런의 결과. 아직 진행 중이면 null (정산 불가) */
  outcome: 'victory' | 'dead' | null;
  /** 도달한 전체 층 (= 입장한 노드의 (액트−1)×13+층 중 최대) */
  floorsReached: number;
  /** 처치한 보스의 액트 번호들 (중복 없음, 오름차순) */
  bossActsKilled: number[];
  /** 처치한 정예 수 (정예 노드당 1) */
  eliteKills: number;
  /** 궁극기를 쓴 횟수 (전투 합계) */
  ultimateUses: number;
  /** 입장한 상점 노드 수 */
  shopVisits: number;
  /** 유닛 3성을 달성한 적이 있는가 */
  unitStar3: boolean;
  /** 보스 노드에 입장했을 때 보유한 골드의 최댓값 (보스에 도달한 적이 없으면 0) */
  bossEntryGold: number;
  /** 런이 끝났을 때의 덱 장수 */
  deckSize: number;
}

/** 일반 런을 만들 때 허용할 지휘관·유물 (메타 해금 결과). 옵션을 주지 않으면 모두 허용 */
export interface RunUnlocks {
  commanders: readonly string[];
  relics: readonly string[];
}
