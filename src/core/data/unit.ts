import type { DamageType, EffectDef } from './effect';

export const PATTERN_KINDS = ['columnStrike', 'twinRevive', 'phaseSummon'] as const;
/**
 * 스킬 대상 선택 방식.
 * - self / currentTarget(현재 공격 대상, 사거리 안) / lowestHpEnemy / highestHpEnemy(현재 HP 기준, 사거리 무관) / randomEnemies
 * - farthestEnemy: 시전자에서 가장 먼 적 (동률은 uid 작은 쪽, 사거리 무관)
 * - lowestHpRatioAllies: HP 비율이 가장 낮은 아군 targetCount명 (시전자 포함, 동률은 uid 작은 쪽)
 */
export const SKILL_TARGETINGS = [
  'self', 'currentTarget', 'lowestHpEnemy', 'randomEnemies', 'highestHpEnemy', 'farthestEnemy', 'lowestHpRatioAllies',
] as const;
export type SkillTargeting = (typeof SKILL_TARGETINGS)[number];

/** 1성 기준 능력치 */
export interface UnitStats {
  hp: number;
  atk: number;
  /** 초당 공격 횟수 */
  as: number;
  /** 사거리 (칸) */
  rng: number;
  arm: number;
  res: number;
  /** 최대 마나 */
  mana: number;
}

export interface SkillDef {
  name: string;
  text: string;
  /** 시전 대상 선택 방식. 효과의 selector "target"이 이 결과를 가리킨다 */
  targeting: SkillTargeting;
  targetCount?: number | readonly [number, number, number];
  /** 수치 배열은 [1성, 2성, 3성] */
  effects: EffectDef[];
}

/**
 * 보스 전용 패턴 (units.json의 `pattern`). 종류마다 필드가 다르다.
 * - columnStrike: 주기 열 강타 (성문 파괴자)
 * - twinRevive: 짝 유닛과 서로 부활시킴 (쌍둥이 주술사)
 * - phaseSummon: HP 임계치마다 증원 소환 + 아군 버프 해제 (군단의 군주)
 */
export type UnitPattern = ColumnStrikePattern | TwinRevivePattern | PhaseSummonPattern;

/**
 * 열 강타: 주기마다 telegraphSeconds 전에 대상 열을 예고하고,
 * 발동 시점에 그 열의 상대 진영 유닛 전체에게 고정 피해를 준다 (공통 효과 flatDamage 사용).
 */
export interface ColumnStrikePattern {
  kind: 'columnStrike';
  /** 발동 간격(초). 첫 발동도 전투 시작 후 이 시각 */
  intervalSeconds: number;
  /** 발동 몇 초 전에 예고하는지 */
  telegraphSeconds: number;
  damage: number;
  dmgType: DamageType;
}

/**
 * 쌍둥이 부활: 이 유닛과 `partner`(같은 진영의 유닛 id)가 한 쌍이다. 한쪽이 죽으면 windowSeconds 안에
 * 짝도 죽지 않는 한 죽은 쪽이 최대 HP의 reviveHpPct%로 부활한다. 둘 다 그 안에 죽어야 처치다.
 */
export interface TwinRevivePattern {
  kind: 'twinRevive';
  partner: string;
  windowSeconds: number;
  reviveHpPct: number;
}

/** 증원 한 기: 적 진영 칸에 소환된다 (칸이 차 있으면 가까운 빈 칸) */
export interface PhaseSummonUnit {
  unitId: string;
  star: 1 | 2 | 3;
  col: number;
  row: number;
}

/** 보스 HP가 최대 HP의 hpPct% 이하가 되면 전환: 증원 소환 + 상대 진영의 버프 해제 */
export interface BossPhase {
  hpPct: number;
  summon: PhaseSummonUnit[];
}

/** 페이즈 소환: phases는 hpPct 내림차순. 전투 시작이 1페이즈, 첫 임계치를 넘으면 2페이즈 … */
export interface PhaseSummonPattern {
  kind: 'phaseSummon';
  phases: BossPhase[];
}

export interface UnitDef {
  id: string;
  name: string;
  tier: number;
  /** 기원 특성 id */
  origin: string;
  /** 직업 특성 id */
  job: string;
  stats: UnitStats;
  skill: SkillDef;
  /** 이 유닛을 보드에 배치한 동안 제공하는 카드 */
  grantedCard?: string;
  /** true면 보스 전용 유닛: 상점 유닛 풀·징집 후보에 나오지 않는다 */
  boss?: true;
  /** 주기 패턴 (보스) */
  pattern?: UnitPattern;
}

export interface UnitFile {
  version: number;
  units: UnitDef[];
}
