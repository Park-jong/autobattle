import type { EffectDef } from './effect';

/** 시작 덱 한 항목: 카드 id와 장 수 */
export interface StartingCard {
  cardId: string;
  count: number;
}

/** 시작 유닛 한 항목: 유닛 id와 기 수 */
export interface StartingUnit {
  unitId: string;
  count: number;
}

/** 지휘관 패시브. 효과는 전투 시작 시 아군(side 0) 기준으로 한 번 적용된다 (시전자·대상 없음). */
export interface CommanderPassive {
  name: string;
  text: string;
  effects: EffectDef[];
}

/** 궁극기 (M5 구현 전까지 표시용 데이터만) */
export interface CommanderUltimate {
  name: string;
  text: string;
}

export interface CommanderDef {
  id: string;
  name: string;
  passive: CommanderPassive;
  startingDeck: StartingCard[];
  startingUnits: StartingUnit[];
  /** 전투 시작 CP 보정 (기본 2에 더함) */
  startCpBonus: number;
  /** 런 시작 지휘관 최대 HP (생략하면 RUN.START_HP) */
  maxHp?: number;
  ultimate?: CommanderUltimate;
}

export interface CommanderFile {
  version: number;
  commanders: CommanderDef[];
}
