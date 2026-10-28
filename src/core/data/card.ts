/** 카드 데이터 타입. 값 목록은 data/README.md 기준. 효과는 공통 효과 데이터(effect.ts)를 쓴다. */
import type { EffectDef } from './effect';

export const RARITIES = ['starter', 'common', 'rare', 'epic'] as const;
export const CARD_TYPES = ['operation', 'command', 'spell', 'equipment', 'curse'] as const;
export const KEYWORDS = ['exhaust', 'retain', 'chain', 'conscript'] as const;
export const TARGET_KINDS = ['none', 'allyUnit', 'enemyUnit', 'allyUnits', 'cell', 'area3x3'] as const;

export type Rarity = (typeof RARITIES)[number];
export type CardType = (typeof CARD_TYPES)[number];
export type Keyword = (typeof KEYWORDS)[number];
export type TargetKind = (typeof TARGET_KINDS)[number];

/** 카드 효과. 성급이 없으므로 수치는 숫자 하나만 (검증기가 배열을 거부한다) */
export type CardEffect = EffectDef;

export interface CardTarget {
  kind: TargetKind;
  /** allyUnits 전용: 지정할 아군 수 */
  count?: number;
}

export interface CardLimits {
  perCombat?: number;
}

/** 공명 [특성]: 해당 특성이 진영에서 활성(단계 1 이상)이면 기본 효과 뒤에 추가로 실행 */
export interface CardResonance {
  trait: string;
  effects: CardEffect[];
}

/** 연쇄: 이번 전투에서 앞서 카드를 사용했으면 기본 효과 뒤에 추가로 실행. 키워드 chain이 있는 카드만 가진다 */
export interface CardChain {
  effects: CardEffect[];
  /** 연쇄가 활성화되면 지불할 비용 (효과 실행 전 적용) */
  cost?: number;
}

export interface CardUpgrade {
  text: string;
  effects: CardEffect[];
  /** 있으면 비용 대체 */
  cost?: number;
  /** 있으면 공명 대체 (없으면 기본 카드의 것을 그대로 씀) */
  resonance?: CardResonance;
  /** 있으면 연쇄 대체 (없으면 기본 카드의 것을 그대로 씀) */
  chain?: CardChain;
}

/** 지휘관 HP 비용. waivedByTrait 특성이 아군 진영에서 활성(단계 1 이상)이면 면제된다 */
export interface CardHpCost {
  amount: number;
  waivedByTrait?: string;
}

export interface Card {
  id: string;
  name: string;
  owner: string;
  rarity: Rarity;
  type: CardType;
  cost: number;
  target: CardTarget;
  keywords: Keyword[];
  limits?: CardLimits;
  /** 사용 시 지휘관 HP를 잃는다 (런이 정산). 사용 후 HP가 1 이상 남아야 쓸 수 있다 */
  commanderHpCost?: CardHpCost;
  resonance?: CardResonance;
  chain?: CardChain;
  text: string;
  effects: CardEffect[];
  upgrade?: CardUpgrade;
}

/**
 * 카드 보상·상점·이벤트 획득 풀에 들어갈 수 있는 카드: 공용(neutral)이고 저주가 아니며 시작 전용(starter)이 아닌 것.
 * 지휘관 고유 카드는 시작 덱 전용이다 (지휘관별 보상 풀은 M5).
 */
export function isRewardCard(card: Card): boolean {
  return card.owner === 'neutral' && card.type !== 'curse' && card.rarity !== 'starter';
}

export interface CardFile {
  version: number;
  cards: Card[];
}
