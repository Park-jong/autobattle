/** 런(1액트) 조정 상수. 밸런스 조정은 여기서 한다. (전투는 combat/constants.ts, 경제는 economy.ts, 상점·로스터는 management.ts) */
export const RUN = {
  /** 저장 형식 버전. 형식이 바뀌면 올린다 */
  FORMAT_VERSION: 2,
  /** 지원하는 가장 오래된 저장 버전 (v1은 하르텐·유물 없음으로 읽는다) */
  MIN_FORMAT_VERSION: 1,

  /** 런 시작 지휘관을 고르지 않았을 때의 기본값 */
  DEFAULT_COMMANDER_ID: 'cmd_harten',

  /** 지휘관 데이터에 maxHp가 없을 때의 시작·최대 HP */
  START_HP: 80,

  MAP: {
    FLOORS: 13,
    /** 일반 층의 노드 수 범위 */
    MIN_NODES: 2,
    MAX_NODES: 4,
    /** 정예는 이 층부터 */
    ELITE_MIN_FLOOR: 4,
    /** 이 층은 모두 야영지 (보스 직전) */
    CAMP_FLOOR: 12,
    /** 보스 층 (노드 1개) */
    BOSS_FLOOR: 13,
    /** 노드가 1개의 간선만 가질 때 인접 노드로 한 간선을 더 이을 확률 */
    EXTRA_EDGE_CHANCE: 0.3,
    /** 노드 종류 비율(%) — 보스 제외 전체 노드에 대한 목표. 합 100 */
    RATIOS: { combat: 45, elite: 10, shop: 12, event: 20, camp: 13 },
  },

  /** 층 보정: 적 편성 HP·ATK 배율 = 1 + PER_FLOOR × (층 − 1) */
  FLOOR_SCALE_PER_FLOOR: 0.04,

  /** 정예 변이 개수: 1개, 확률 TWO_CHANCE로 2개 */
  ELITE_MUTATION_TWO_CHANCE: 0.5,

  /** 패배(무승부 포함) 지휘관 피해 = ceil((BASE + 생존 적 유닛 등급 합 + floor(층 / FLOOR_DIVISOR)) × 종류 배율) */
  DEFEAT: {
    BASE: 2,
    FLOOR_DIVISOR: 3,
    ELITE_MULT: 1.5,
    BOSS_MULT: 2,
  },

  /** 카드 보상: 제시 장수와 종류별 희귀도 가중치. 보스는 첫 장을 희귀 이상에서 보장 */
  REWARD: {
    CHOICES: 3,
    WEIGHTS: {
      normal: { common: 70, rare: 27, epic: 3 },
      elite: { common: 40, rare: 50, epic: 10 },
      boss: { common: 40, rare: 50, epic: 10 },
    },
  },

  /** 상점 노드: 카드 3종 진열, 희귀도별 가격, 카드 제거 가격 */
  SHOP: {
    CARD_SLOTS: 3,
    CARD_PRICES: { common: 8, rare: 15, epic: 25 },
    /** 첫 제거 가격, 제거할 때마다(런 누적) 더해지는 값 */
    REMOVE_BASE: 75,
    REMOVE_STEP: 25,
  },

  /** 유물 획득 경로: 정예 보상 1개, 상점 진열, 이벤트, 보스(선택). 희귀도 가중치와 상점 가격 */
  RELIC: {
    ELITE_WEIGHTS: { common: 65, rare: 35 },
    SHOP_SLOTS: 2,
    SHOP_WEIGHTS: { common: 60, rare: 40 },
    PRICES: { common: 18, rare: 30 },
    /** 보스 처치 시 제시하는 보스 유물 후보 수 (액트 1 보스 이후 런이 끝나므로 지금은 종료 화면에 표시만 한다) */
    BOSS_CHOICES: 3,
  },

  CAMP: {
    /** 휴식: 최대 HP의 이 비율(%)을 회복 (올림) */
    HEAL_PCT: 30,
  },
} as const;
