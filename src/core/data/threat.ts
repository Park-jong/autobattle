/** 적 종류 (전투 보상 종류와 같은 이름: 일반 전투 / 정예 / 보스) */
export type ThreatEnemyKind = 'normal' | 'elite' | 'boss';
export const THREAT_ENEMY_KINDS: readonly ThreatEnemyKind[] = ['normal', 'elite', 'boss'];

/** 위협 레벨 패널티 효과. 종류별 필드는 data/README.md "threat.json" 절 */
export type ThreatEffect =
  /** 지정한 종류의 적 HP·ATK를 % 올린다 (층 보정에 곱해진다) */
  | { kind: 'enemyStatPct'; kinds: ThreatEnemyKind[]; hp?: number; atk?: number }
  /** 시작 골드 증감 (음수 = 감소, 0 밑으로는 내려가지 않는다) */
  | { kind: 'startGoldDelta'; amount: number }
  /** 시작 덱에 저주 카드 추가 */
  | { kind: 'startCurse'; cardId: string; count: number }
  /** 액트 전환 회복 비율 증감 (%p, 음수 = 회복 감소) */
  | { kind: 'actHealPct'; delta: number }
  /** 상점 노드의 카드·유물·카드 제거 가격 +% */
  | { kind: 'shopPricePct'; pct: number }
  /** 정예 변이 최소 개수 */
  | { kind: 'eliteMutationsMin'; count: number }
  /** 지휘관 최대 HP 증감 (%, 음수 = 감소) */
  | { kind: 'commanderMaxHpPct'; pct: number };

export type ThreatEffectKind = ThreatEffect['kind'];
export const THREAT_EFFECT_KINDS: readonly ThreatEffectKind[] = [
  'enemyStatPct', 'startGoldDelta', 'startCurse', 'actHealPct', 'shopPricePct', 'eliteMutationsMin', 'commanderMaxHpPct',
];

/** 위협 레벨 한 단계: 이름, 설명문, 이 단계에서 새로 더해지는 효과 (레벨 N은 1~N을 모두 적용) */
export interface ThreatLevelDef {
  level: number;
  name: string;
  text: string;
  effects: ThreatEffect[];
}

export interface ThreatFile {
  version: number;
  levels: ThreatLevelDef[];
}

/** 위협 레벨 상한 (threat.json은 레벨 1~MAX를 정확히 하나씩 가진다) */
export const MAX_THREAT_LEVEL = 10;
