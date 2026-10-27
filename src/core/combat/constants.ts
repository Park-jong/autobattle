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
