import type { EffectDef } from './effect';

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
}

export interface UnitFile {
  version: number;
  units: UnitDef[];
}
