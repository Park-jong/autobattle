import type { DamageType, EffectDef } from './effect';

export const PATTERN_KINDS = ['columnStrike'] as const;
export const SKILL_TARGETINGS = ['self', 'currentTarget', 'lowestHpEnemy', 'randomEnemies'] as const;
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
 * 보스 전용 주기 패턴. 열 강타: 주기마다 telegraphSeconds 전에 대상 열을 예고하고,
 * 발동 시점에 그 열의 상대 진영 유닛 전체에게 고정 피해를 준다 (공통 효과 flatDamage 사용).
 */
export interface UnitPattern {
  kind: 'columnStrike';
  /** 발동 간격(초). 첫 발동도 전투 시작 후 이 시각 */
  intervalSeconds: number;
  /** 발동 몇 초 전에 예고하는지 */
  telegraphSeconds: number;
  damage: number;
  dmgType: DamageType;
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
