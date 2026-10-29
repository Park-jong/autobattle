import type { ThreatEffect, ThreatEnemyKind, ThreatLevelDef } from '../data/threat';
import type { ThreatCatalog } from '../data/threatLoader';
import { RUN } from './constants';

/** 위협 레벨이 시작 덱에 섞는 저주 카드 */
export interface StartCurse {
  cardId: string;
  count: number;
}

/** 레벨 값이 올바른 정수 범위(0~최고 레벨)인지 확인한다. 아니면 한국어 Error */
export function assertThreatLevel(level: number, max: number): void {
  if (!Number.isInteger(level) || level < 0 || level > max) {
    throw new Error(`위협 레벨은 0~${max}의 정수여야 합니다 (실제: ${level})`);
  }
}

/**
 * 위협 레벨 N의 누적 패널티(레벨 1~N의 모든 효과)를 효과 종류별로 합산해 주는 읽기 전용 규칙.
 * 런 코어가 해당 지점(시작 골드·덱·최대 HP·적 보정·상점 가격·액트 회복·정예 변이)에서 질의한다.
 * 레벨 0은 모든 질의가 "변화 없음"(배율 1, 증감 0)을 돌려준다. 난수·상태가 없다.
 */
export class ThreatRules {
  readonly level: number;
  private readonly effects: ThreatEffect[];

  constructor(catalog: ThreatCatalog, level: number) {
    assertThreatLevel(level, catalog.maxLevel);
    this.level = level;
    this.effects = catalog.upTo(level).flatMap((def) => def.effects);
  }

  /** 1~N 레벨의 정의 (표시용) */
  static defsUpTo(catalog: ThreatCatalog, level: number): ThreatLevelDef[] {
    return catalog.upTo(level);
  }

  private sum<K extends ThreatEffect['kind'], T>(kind: K, pick: (e: Extract<ThreatEffect, { kind: K }>) => number): number {
    return this.effects.reduce((total, e) => (e.kind === kind ? total + pick(e as Extract<ThreatEffect, { kind: K }>) : total), 0);
  }

  /** 적 종류별 HP·ATK 배율 (층 보정에 곱한다). 효과가 없으면 정확히 1 */
  enemyMult(kind: ThreatEnemyKind): { hp: number; atk: number } {
    let hp = 0;
    let atk = 0;
    for (const e of this.effects) {
      if (e.kind !== 'enemyStatPct' || !e.kinds.includes(kind)) continue;
      hp += e.hp ?? 0;
      atk += e.atk ?? 0;
    }
    return { hp: 1 + hp / 100, atk: 1 + atk / 100 };
  }

  /** 시작 골드 증감 (음수 = 감소) */
  get startGoldDelta(): number {
    return this.sum('startGoldDelta', (e) => e.amount);
  }

  /** 시작 덱에 섞는 저주 (카드 id별로 합산, 데이터 순서) */
  startCurses(): StartCurse[] {
    const byCard = new Map<string, number>();
    for (const e of this.effects) if (e.kind === 'startCurse') byCard.set(e.cardId, (byCard.get(e.cardId) ?? 0) + e.count);
    return [...byCard].map(([cardId, count]) => ({ cardId, count }));
  }

  /** 액트 전환 회복 비율(%): 기본값에 증감을 더하고 0~100으로 자른다 */
  actHealPct(): number {
    return Math.min(100, Math.max(0, RUN.ACTS.TRANSITION_HEAL_PCT + this.sum('actHealPct', (e) => e.delta)));
  }

  /** 상점 가격 인상 % (카드·유물·카드 제거) */
  get shopPricePct(): number {
    return this.sum('shopPricePct', (e) => e.pct);
  }

  /** 상점 가격에 인상을 적용한다 (올림). 인상이 없으면 그대로 */
  shopPrice(price: number): number {
    const pct = this.shopPricePct;
    return pct <= 0 ? price : Math.ceil((price * (100 + pct)) / 100);
  }

  /** 정예 변이 최소 개수 (효과가 없으면 0 = 기존 규칙 그대로) */
  get eliteMutationsMin(): number {
    return this.effects.reduce((max, e) => (e.kind === 'eliteMutationsMin' ? Math.max(max, e.count) : max), 0);
  }

  /** 지휘관 기본 최대 HP에 증감을 적용한다 (내림, 최소 1). 효과가 없으면 그대로 */
  maxHp(base: number): number {
    const pct = this.sum('commanderMaxHpPct', (e) => e.pct);
    return pct === 0 ? base : Math.max(1, Math.floor((base * (100 + pct)) / 100));
  }
}
