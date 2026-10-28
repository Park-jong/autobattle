/** 전투 시뮬 조정 상수. 밸런스 조정은 여기서 한다. */
export const COMBAT = {
  /** 초당 틱 수. 고정 틱 길이 = 1/TICKS_PER_SECOND = 0.1초 */
  TICKS_PER_SECOND: 10,
  TICK_SECONDS: 0.1,
  /** 시간 비교 허용 오차 */
  EPS: 1e-9,

  /** 1칸 이동 시간(초). 대각선도 동일 */
  MOVE_SECONDS_PER_CELL: 0.5,
  /** 경로가 막혔을 때 재탐색까지 대기(초) */
  BLOCKED_RETRY_SECONDS: 0.3,
  /** 완화 경로 탐색에서 다른 유닛이 있는 칸을 지나갈 때 추가 비용 */
  OCCUPIED_PATH_PENALTY: 3,

  /** 성급별 HP·ATK 배율 (인덱스 = 성급 - 1) */
  STAR_MULTIPLIER: [1, 1.8, 3.2] as readonly number[],

  /** 공격 1회당 마나 */
  MANA_PER_ATTACK: 10,
  /** 피격 시 받은 피해 대비 마나 비율 */
  MANA_PER_DAMAGE_RATIO: 0.01,
  /** 피격 1회당 마나 상한 */
  MANA_PER_HIT_CAP: 15,

  /** 화상 피해 간격(초) */
  BURN_INTERVAL_SECONDS: 1,
  /** 회복 오라 간격(초) */
  HEAL_AURA_INTERVAL_SECONDS: 1,

  /** 과열 시작 시각(초). 이후 받는 피해 배율 = 1 + OVERHEAT_RATE × (경과초 − 시작) */
  OVERHEAT_START_SECONDS: 30,
  OVERHEAT_RATE: 0.1,
  /** 안전 장치: 이 시각에 무승부로 강제 종료 */
  HARD_LIMIT_SECONDS: 90,
} as const;

/** 정예 변이 수치 (DESIGN 7-2). 적(side 1) 전체에 적용된다 */
export const MUTATION = {
  /** 장갑: 적 전원 ARM 고정 증가 */
  ARMORED_ARM: 50,
  /** 분노: HP가 이 비율(%) 이하가 되면 AS를 올린다 */
  RAGE_HP_PCT: 50,
  /** 분노: AS 증가율(%) — 100이면 ×2 */
  RAGE_AS_PCT: 100,
  /** 전파: 죽은 적 주변 이 칸 이내(체비쇼프)의 살아 있는 적을 회복 */
  CONTAGION_RADIUS: 1,
  /** 전파: 회복량 = 대상 최대 HP의 이 비율(%) */
  CONTAGION_HEAL_PCT: 20,
  /** 방해: 이 간격(초)마다 플레이어 손패 무작위 1장의 비용을 올린다 */
  DISRUPT_INTERVAL_SECONDS: 3,
  /** 방해: 한 번에 올리는 비용 */
  DISRUPT_COST: 1,
} as const;

/** 지휘관 궁극기 수치 (DESIGN 5장). 게이지는 전투마다 0에서 시작하고, 가득 차면 전투당 1회 쓴다 */
export const ULTIMATE = {
  /** 게이지 최대치 */
  GAUGE_MAX: 100,
  /** 카드를 한 장 쓸 때(준비 단계 작전 카드 포함) 충전량 */
  CARD_CHARGE: 15,
  /** 아군 유닛(소환 유닛 제외)이 죽을 때 충전량 */
  ALLY_DEATH_CHARGE: 25,
  /** 운석 낙하 지점 후보: 적이 가장 많이 겹치는 칸부터 이 개수 중에서 Rng로 고른다 */
  BARRAGE_POOL: 6,
  /** 운석끼리 이 칸(체비쇼프) 이상 떨어진 지점을 우선한다 */
  BARRAGE_MIN_SPACING: 2,
} as const;
