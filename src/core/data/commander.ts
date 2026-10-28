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
  /** 비어 있어도 된다 (효과 없이 아래 보정만 쓰는 지휘관) */
  effects: EffectDef[];
  /** 주문 카드 피해 +N% (카드 시스템이 켜진 전투) */
  spellDamagePct?: number;
  /** 전투 승리 시 남은 전투 CP 1당 받는 골드 (런 정산) */
  goldPerLeftoverCp?: number;
}

/** 궁극기의 운석 연타: 무작위 적 밀집 지점을 count곳 골라 intervalSeconds 간격으로 낙하 */
export interface UltimateBarrage {
  count: number;
  intervalSeconds: number;
  /** 착탄 범위 반경(체비쇼프). 1 = 3×3 */
  radius: number;
  /** 착탄 때마다 그 범위 기준으로 실행하는 효과 (selector enemiesInTargetArea) */
  effects: EffectDef[];
}

/** 궁극기: 게이지가 가득 차면 전투당 1회 사용 */
export interface CommanderUltimate {
  name: string;
  text: string;
  /** 사용 시 지휘관의 현재 HP(런 장부의 남은 HP)의 이 비율(%)을 올림해 소모 */
  hpCostPct?: number;
  /** 사용 즉시 아군(side 0) 기준으로 실행하는 효과 */
  effects?: EffectDef[];
  /** 이 시간(초) 동안 CP 자연 증가 속도 2배 */
  cpRegenBoostSeconds?: number;
  barrage?: UltimateBarrage;
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
  /** 해금 조건 설명 (메타 진행 M5-5에서 사용. 지금은 데이터로만 두고 모두 선택 가능) */
  unlock?: string;
}

export interface CommanderFile {
  version: number;
  commanders: CommanderDef[];
}
