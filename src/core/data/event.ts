/**
 * 런 이벤트 데이터 타입 (data/events.json). 선택지의 효과는 데이터로 표현한다.
 * 효과 집합과 의미는 data/README.md 기준.
 */
import type { Rarity } from './card';

export const EVENT_CARD_MODES = ['random', 'choose', 'fixed'] as const;
export const EVENT_PICK_MODES = ['random', 'choose'] as const;
/** 이벤트로 얻는 카드 희귀도 (starter는 제외) */
export const EVENT_RARITIES = ['common', 'rare', 'epic'] as const;
export type EventRarity = Extract<Rarity, (typeof EVENT_RARITIES)[number]>;

export type EventEffect =
  /** 골드 증감 (음수 = 지불. 골드가 모자라면 그 선택지는 선택 불가) */
  | { kind: 'gold'; amount: number }
  /** 지휘관 HP 증감 (음수 = 피해. 이벤트 피해로는 사망하지 않으며 HP는 1 밑으로 내려가지 않는다. 피해 뒤 HP가 1 미만이 되는 선택지는 선택 불가) */
  | { kind: 'commanderHp'; amount: number }
  /** 카드 획득: random = 희귀도에서 무작위, choose = 희귀도에서 count장 중 1장 선택, fixed = 지정 카드 */
  | { kind: 'gainCard'; mode: 'random'; rarity: EventRarity }
  | { kind: 'gainCard'; mode: 'choose'; rarity: EventRarity; count: number }
  | { kind: 'gainCard'; mode: 'fixed'; cardId: string }
  /** 덱에서 카드 제거 (choose = 직접 선택, random = 무작위). 제거 가능한 카드가 없으면 선택 불가 */
  | { kind: 'removeCard'; mode: 'random' | 'choose' }
  /** 카드 강화 (이미 강화된 카드·강화 버전이 없는 카드·유닛 제공 카드 제외). 가능한 카드가 없으면 선택 불가 */
  | { kind: 'upgradeCard'; mode: 'random' | 'choose' }
  /** 무작위 tier등급 1성 유닛 1기를 벤치로 받는다. 벤치가 가득 차면 선택 불가 */
  | { kind: 'gainUnit'; tier: number };

export type EventEffectKind = EventEffect['kind'];

export interface EventChoice {
  text: string;
  /** 선택 뒤에 보여줄 결과 문장 */
  result: string;
  effects: EventEffect[];
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export interface EventFile {
  version: number;
  events: EventDef[];
}
