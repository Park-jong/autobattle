/**
 * 유물 데이터 타입 (data/relics.json). 효과 종류와 의미는 data/README.md 기준.
 * 전투 효과(combatStart)는 카드·스킬·지휘관 패시브와 같은 공통 효과 형식을 재사용하고,
 * 그 밖의 효과는 전투·경제·덱·런 각 지점이 읽는 작은 파라미터 묶음이다.
 */
import type { EffectDef } from './effect';

export const RELIC_RARITIES = ['common', 'rare', 'boss'] as const;
export type RelicRarity = (typeof RELIC_RARITIES)[number];

export type RelicEffect =
  // ---- 전투 (CombatSimulator가 읽는다) ----
  /** 전투 시작 CP +amount */
  | { kind: 'startCp'; amount: number }
  /** 전투 시작 시 아군 기준으로 한 번 실행하는 공통 효과 (보호막 등). 시전자·지정 대상 없음 */
  | { kind: 'combatStart'; effects: EffectDef[] }
  /** 아군(side 0) 유닛이 죽으면 CP +amount (전투당 실제 획득 합계 maxPerCombat까지) */
  | { kind: 'allyDeathCp'; amount: number; maxPerCombat: number }
  /** 아군이 적을 처치하면 처치한 유닛의 마나 +amount */
  | { kind: 'killMana'; amount: number }
  /** 같은 특성을 가진 아군 유닛(중복 포함)이 minUnits기 이상이면 그 특성 단계 +1 (최대 3단계) */
  | { kind: 'traitTierBonus'; minUnits: number }
  /** 궁극기 게이지 충전량 +pct% */
  | { kind: 'ultimateCharge'; pct: number }
  /** 지휘관 HP를 소모하는 카드의 소모량 −amount (최소 0) */
  | { kind: 'hpCostReduction'; amount: number }
  /** 주문 카드 피해 +pct% */
  | { kind: 'spellDamage'; pct: number }
  // ---- 덱 ----
  /** 손패 상한 +amount */
  | { kind: 'handLimit'; amount: number }
  /** 전투 준비 때 카드 amount장 더 뽑기 */
  | { kind: 'openingDraw'; amount: number }
  /** 획득 즉시 덱의 강화 가능한 카드를 count장 무작위 강화 */
  | { kind: 'upgradeOnAcquire'; count: number }
  /** 전투 카드 보상 선택지 +amount장 */
  | { kind: 'rewardChoices'; amount: number }
  // ---- 경제 ----
  /** 노드마다 처음 count번의 상점 리롤이 무료 */
  | { kind: 'freeReroll'; count: number }
  /** 런당 count번, 같은 유닛 1성 2기를 2성으로 합성 */
  | { kind: 'mirrorMerge'; count: number }
  /** 이자 상한 +amount G */
  | { kind: 'interestMax'; amount: number }
  /** 전투 승리 골드 +amount */
  | { kind: 'winGold'; amount: number }
  /** 상점 카드·카드 제거 가격 −pct% (올림) */
  | { kind: 'cardDiscount'; pct: number }
  // ---- 맵/런 ----
  /** 야영지 휴식 회복량 +pct%p (최대 HP 비율) */
  | { kind: 'campHeal'; pct: number }
  /** 전투 승리 시 지휘관 HP +amount */
  | { kind: 'winHeal'; amount: number }
  /** 획득 즉시 지휘관 최대 HP +amount (같은 양 회복) */
  | { kind: 'maxHp'; amount: number };

export type RelicEffectKind = RelicEffect['kind'];

export interface RelicDef {
  id: string;
  name: string;
  rarity: RelicRarity;
  text: string;
  /** 해금 조건 설명 (메타 진행 M5-5에서 사용. 지금은 데이터로만 두고 모두 선택 가능) */
  unlock?: string;
  effects: RelicEffect[];
}

export interface RelicFile {
  version: number;
  relics: RelicDef[];
}
