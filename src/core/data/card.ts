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

/**
 * 저주 카드의 동작 (type이 curse인 카드만 가진다; 생략하면 "사용 불가, 다른 효과 없음").
 * - playable: true면 비용을 내고 전투 중에 쓸 수 있다 (소모 키워드 필수: 써서 없애는 저주). 생략·false면 사용 불가
 * - onDraw: 전투 중 이 카드를 뽑으면 자동으로 발동하는 효과. 전투 시작 때 손패에 있던 카드도 전투가 시작될 때 한 번 발동한다.
 *   selector randomAlly(아군 무작위 1명, sim Rng)를 쓸 수 있다
 * - goldLossAtEnd: 전투가 끝날 때 손패에 있으면 잃는 골드 (잔고 한도까지, 런이 정산)
 */
export interface CardCurse {
  playable?: boolean;
  onDraw?: CardEffect[];
  goldLossAtEnd?: number;
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
  /** 저주 카드 전용 동작 */
  curse?: CardCurse;
  text: string;
  /** 저주 카드는 비어 있을 수 있다 */
  effects: CardEffect[];
  upgrade?: CardUpgrade;
}

/**
 * 공용 보상 카드: 공용(neutral)이고 저주가 아니며 시작 전용(starter)이 아닌 것.
 * 이벤트 데이터 검증처럼 "지휘관과 무관한 공통 풀"이 필요한 곳에서 쓴다.
 */
export function isRewardCard(card: Card): boolean {
  return card.owner === 'neutral' && card.type !== 'curse' && card.rarity !== 'starter';
}

/**
 * 지휘관 commanderId의 런에서 보상·상점·이벤트·테스트 도구로 얻을 수 있는 카드: 공용 보상 카드 + 그 지휘관의 고유 카드.
 * 저주와 시작 전용(starter) 카드는 어느 쪽이든 제외한다. 다른 지휘관의 고유 카드는 나오지 않는다.
 */
export function isRewardCardFor(card: Card, commanderId: string): boolean {
  return card.type !== 'curse' && card.rarity !== 'starter' && (card.owner === 'neutral' || card.owner === commanderId);
}

/** 이 지휘관의 런에 존재할 수 있는 카드인가 (덱·제시 목록 검증용): 공용 카드 또는 자기 고유 카드 */
export function isCardAllowedFor(card: Card, commanderId: string): boolean {
  return card.owner === 'neutral' || card.owner === commanderId;
}

export interface CardFile {
  version: number;
  cards: Card[];
}
