import type { Economy } from '../economy';
import type { FormationEntry, StarLevel } from '../combat/formation';
import { isInOwnHalf, sameCell, type Cell } from '../combat/board';
import type { UnitCatalog } from '../data/unitLoader';
import type { StartingUnit } from '../data/commander';
import { Rng } from '../rng';

export const MANAGEMENT = {
  SHOP_SIZE: 5,
  BENCH_SIZE: 6,
  START_LEVEL: 3,
  MAX_LEVEL: 9,
  REROLL_COST: 1,
  XP_COST: 4,
  XP_PER_PURCHASE: 4,
  // 레벨 3→4부터 8→9까지 필요한 XP. 남은 XP는 다음 레벨로 이월한다.
  XP_TO_NEXT: { 3: 4, 4: 8, 5: 12, 6: 20, 7: 32, 8: 48 } as Record<number, number>,
  // 원본 1성 개수. 2·3성은 각각 3·9개의 재고를 차지한다.
  POOL_COPIES: { 1: 18, 2: 16, 3: 14, 4: 10, 5: 8 } as Record<number, number>,
} as const;

/** 레벨별 1~5등급 확률(%), DESIGN 3-3. */
export const LEVEL_ODDS: Readonly<Record<number, readonly number[]>> = {
  3: [75, 25, 0, 0, 0],
  4: [55, 35, 10, 0, 0],
  5: [40, 35, 22, 3, 0],
  6: [25, 35, 30, 10, 0],
  7: [15, 25, 35, 22, 3],
  8: [10, 15, 30, 33, 12],
  9: [5, 10, 20, 35, 30],
};

export type ManagementResult = { ok: true } | { ok: false; reason: string };
export interface OwnedUnit {
  id: number;
  unitId: string;
  star: StarLevel;
  cell: Cell | null;
  benchIndex: number | null;
  equipment: string[];
}
export interface ShopOffer {
  id: number;
  unitId: string;
  tier: number;
  cost: number;
}
export interface ManagementSnapshot {
  gold: number;
  level: number;
  xp: number;
  xpToNext: number | null;
  population: number;
  board: OwnedUnit[];
  bench: (OwnedUnit | null)[];
  offers: (ShopOffer | null)[];
  locked: boolean;
  pool: Record<string, number>;
}

const OK: ManagementResult = { ok: true };
const fail = (reason: string): ManagementResult => ({ ok: false, reason });
const copiesAtStar = (star: StarLevel): number => 3 ** (star - 1);
const copyUnit = (unit: OwnedUnit): OwnedUnit => ({ ...unit, cell: unit.cell ? { ...unit.cell } : null, equipment: [...unit.equipment] });

/** 빈 등급은 제외한 뒤 확률을 다시 정규화한다. 모든 후보가 없으면 null. */
export function rollShopTier(level: number, rng: Rng, availableTiers: readonly number[] = [1, 2, 3, 4, 5]): number | null {
  const odds = LEVEL_ODDS[level];
  if (!odds) throw new Error('상점 레벨은 3~9여야 합니다');
  const weighted = odds.map((weight, index) => ({ tier: index + 1, weight: availableTiers.includes(index + 1) ? weight : 0 }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total === 0) return null;
  let roll = rng.next() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.tier;
  }
  return weighted.filter((entry) => entry.weight > 0).at(-1)?.tier ?? null;
}

/** 상점 예약·소유 유닛·합성·레벨의 단일 준비 상태. 돈은 주입된 Economy와 공유한다. */
export class Management {
  private levelValue: number = MANAGEMENT.START_LEVEL;
  private xpValue = 0;
  private lockedValue = false;
  private nextOwnedId = 1;
  private nextOfferId = 1;
  private owned: OwnedUnit[] = [];
  private offers: (ShopOffer | null)[] = Array<ShopOffer | null>(MANAGEMENT.SHOP_SIZE).fill(null);
  private readonly pool = new Map<string, number>();

  constructor(
    private readonly units: UnitCatalog,
    private readonly economy: Economy,
    private readonly rng: Rng,
    startingUnits: readonly StartingUnit[] = [],
  ) {
    for (const unit of units.units) {
      const copies = MANAGEMENT.POOL_COPIES[unit.tier];
      if (copies === undefined) throw new Error(`지원하지 않는 유닛 등급: ${unit.tier}`);
      this.pool.set(unit.id, copies);
    }
    for (const entry of startingUnits) {
      if (!units.get(entry.unitId) || !Number.isSafeInteger(entry.count) || entry.count < 0) throw new Error('시작 유닛 구성이 올바르지 않습니다');
      for (let i = 0; i < entry.count; i++) this.addStartingUnit(entry.unitId);
    }
    this.refreshOffers();
  }

  snapshot(): ManagementSnapshot {
    const bench: (OwnedUnit | null)[] = Array<OwnedUnit | null>(MANAGEMENT.BENCH_SIZE).fill(null);
    const board: OwnedUnit[] = [];
    for (const unit of this.owned) {
      if (unit.cell) board.push(copyUnit(unit));
      else if (unit.benchIndex !== null) bench[unit.benchIndex] = copyUnit(unit);
    }
    return {
      gold: this.economy.gold,
      level: this.levelValue,
      xp: this.xpValue,
      xpToNext: MANAGEMENT.XP_TO_NEXT[this.levelValue] ?? null,
      population: board.length,
      board,
      bench,
      offers: this.offers.map((offer) => offer ? { ...offer } : null),
      locked: this.lockedValue,
      pool: Object.fromEntries(this.pool),
    };
  }

  formation(): FormationEntry[] {
    return this.owned.filter((unit) => unit.cell !== null).map((unit) => ({
      unitId: unit.unitId, star: unit.star, cell: { ...(unit.cell as Cell) },
      ...(unit.equipment.length > 0 ? { equipment: [...unit.equipment] } : {}),
    }));
  }

  buy(slot: number): ManagementResult {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MANAGEMENT.SHOP_SIZE) return fail('올바른 상점 슬롯을 선택하세요');
    const offer = this.offers[slot];
    if (!offer) return fail('비어 있는 상점 슬롯입니다');
    if (this.economy.gold < offer.cost) return fail('유닛을 구매할 골드가 부족합니다');
    const candidate: OwnedUnit = { id: this.nextOwnedId, unitId: offer.unitId, star: 1, cell: null, benchIndex: -1, equipment: [] };
    const next = this.merge([...this.owned.map(copyUnit), candidate]);
    if (!this.placeUnassigned(next)) return fail('벤치가 가득 찼습니다');
    if (!this.economy.spend(offer.cost)) return fail('유닛을 구매할 골드가 부족합니다');
    this.owned = next;
    this.nextOwnedId++;
    this.offers[slot] = null;
    return OK;
  }

  reroll(): ManagementResult {
    if (!this.economy.spend(MANAGEMENT.REROLL_COST)) return fail('리롤할 골드가 부족합니다');
    this.refreshOffers();
    return OK;
  }

  toggleLock(): ManagementResult {
    this.lockedValue = !this.lockedValue;
    return OK;
  }

  /** 잠금은 다음 무료 상점 갱신 한 번을 막은 뒤 자동 해제된다. */
  advanceBattle(): ManagementResult {
    if (this.lockedValue) this.lockedValue = false;
    else this.refreshOffers();
    return OK;
  }

  buyXp(): ManagementResult {
    if (this.levelValue >= MANAGEMENT.MAX_LEVEL) return fail('이미 최고 레벨입니다');
    if (!this.economy.spend(MANAGEMENT.XP_COST)) return fail('경험치를 구매할 골드가 부족합니다');
    this.xpValue += MANAGEMENT.XP_PER_PURCHASE;
    while (this.levelValue < MANAGEMENT.MAX_LEVEL) {
      const needed = MANAGEMENT.XP_TO_NEXT[this.levelValue];
      if (needed === undefined || this.xpValue < needed) break;
      this.xpValue -= needed;
      this.levelValue++;
    }
    if (this.levelValue === MANAGEMENT.MAX_LEVEL) this.xpValue = 0;
    return OK;
  }

  moveToBoard(id: number, cell: Cell): ManagementResult {
    const unit = this.owned.find((entry) => entry.id === id);
    if (!unit) return fail('소유하지 않은 유닛입니다');
    if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row) || !isInOwnHalf(0, cell)) return fail('아군 보드 안의 칸을 선택하세요');
    if (unit.cell && sameCell(unit.cell, cell)) return OK;
    const occupant = this.owned.find((entry) => entry.cell !== null && sameCell(entry.cell, cell));
    if (!unit.cell && !occupant && this.owned.filter((entry) => entry.cell !== null).length >= this.levelValue) return fail('배치 인원이 레벨 한도에 도달했습니다');
    if (occupant) {
      occupant.cell = unit.cell ? { ...unit.cell } : null;
      occupant.benchIndex = unit.benchIndex;
    }
    unit.cell = { ...cell };
    unit.benchIndex = null;
    return OK;
  }

  moveToBench(id: number, index?: number): ManagementResult {
    const unit = this.owned.find((entry) => entry.id === id);
    if (!unit) return fail('소유하지 않은 유닛입니다');
    const destination = index ?? (unit.benchIndex ?? this.firstFreeBench(this.owned));
    if (!Number.isInteger(destination) || destination < 0 || destination >= MANAGEMENT.BENCH_SIZE) return fail('빈 벤치가 없습니다');
    if (unit.benchIndex === destination) return OK;
    const occupant = this.owned.find((entry) => entry.benchIndex === destination);
    if (occupant) {
      occupant.cell = unit.cell ? { ...unit.cell } : null;
      occupant.benchIndex = unit.benchIndex;
    }
    unit.cell = null;
    unit.benchIndex = destination;
    return OK;
  }

  sell(id: number): ManagementResult {
    const unit = this.owned.find((entry) => entry.id === id);
    if (!unit) return fail('소유하지 않은 유닛입니다');
    const def = this.units.get(unit.unitId);
    if (!def) return fail('유닛 데이터를 찾을 수 없습니다');
    const copies = copiesAtStar(unit.star);
    const refund = def.tier * copies - (unit.star === 1 ? 0 : 1);
    this.economy.gain(refund);
    this.owned = this.owned.filter((entry) => entry !== unit);
    this.pool.set(unit.unitId, (this.pool.get(unit.unitId) ?? 0) + copies);
    return OK;
  }

  /** 장비 카드 검증은 호출 측 카드 카탈로그가 담당하며, 합성 시 모두 승계한다. */
  setEquipment(id: number, cardIds: readonly string[]): ManagementResult {
    const unit = this.owned.find((entry) => entry.id === id);
    if (!unit) return fail('소유하지 않은 유닛입니다');
    if (cardIds.some((cardId) => typeof cardId !== 'string' || cardId.trim() === '')) return fail('장비 카드 ID가 올바르지 않습니다');
    unit.equipment = [...cardIds];
    return OK;
  }

  syncEquipment(id: number, cardIds: readonly string[]): ManagementResult {
    return this.setEquipment(id, cardIds);
  }

  private addStartingUnit(unitId: string): void {
    const remaining = this.pool.get(unitId) ?? 0;
    if (remaining === 0) throw new Error('시작 유닛이 유닛 풀을 초과했습니다');
    const initialCells: Cell[] = [{ col: 3, row: 1 }, { col: 3, row: 3 }, { col: 2, row: 2 }];
    const cell = initialCells.find((candidate) => !this.owned.some((unit) => unit.cell && sameCell(unit.cell, candidate))) ?? null;
    const candidate: OwnedUnit = { id: this.nextOwnedId++, unitId, star: 1, cell, benchIndex: cell ? null : -1, equipment: [] };
    const next = this.merge([...this.owned, candidate]);
    if (!this.placeUnassigned(next)) throw new Error('시작 유닛을 보드와 벤치에 배치할 수 없습니다');
    this.owned = next;
    this.pool.set(unitId, remaining - 1);
  }

  private firstFreeBench(units: readonly OwnedUnit[]): number {
    for (let index = 0; index < MANAGEMENT.BENCH_SIZE; index++) {
      if (!units.some((unit) => unit.benchIndex === index)) return index;
    }
    return -1;
  }

  private placeUnassigned(units: OwnedUnit[]): boolean {
    for (const unit of units) {
      if (unit.cell || (unit.benchIndex !== null && unit.benchIndex >= 0)) continue;
      const index = this.firstFreeBench(units);
      if (index < 0) return false;
      unit.benchIndex = index;
    }
    return true;
  }

  /** 보드의 가장 오래된 유닛을 우선 생존시켜 배치와 장비를 유지한다. */
  private merge(input: OwnedUnit[]): OwnedUnit[] {
    let units = input;
    let changed = true;
    while (changed) {
      changed = false;
      for (const star of [1, 2] as const) {
        const ids = [...new Set(units.filter((unit) => unit.star === star).map((unit) => unit.unitId))];
        for (const unitId of ids) {
          const group = units.filter((unit) => unit.unitId === unitId && unit.star === star)
            .sort((a, b) => Number(b.cell !== null) - Number(a.cell !== null) || a.id - b.id).slice(0, 3);
          if (group.length < 3) continue;
          const survivor = group[0] as OwnedUnit;
          survivor.star = (star + 1) as StarLevel;
          survivor.equipment = group.flatMap((unit) => unit.equipment);
          const consumed = new Set(group.slice(1).map((unit) => unit.id));
          units = units.filter((unit) => !consumed.has(unit.id));
          changed = true;
        }
      }
    }
    return units;
  }

  private refreshOffers(): void {
    for (const offer of this.offers) {
      if (offer) this.pool.set(offer.unitId, (this.pool.get(offer.unitId) ?? 0) + 1);
    }
    this.offers = Array.from({ length: MANAGEMENT.SHOP_SIZE }, () => this.drawOffer());
  }

  private drawOffer(): ShopOffer | null {
    const available = this.units.units.filter((unit) => (this.pool.get(unit.id) ?? 0) > 0);
    const tier = rollShopTier(this.levelValue, this.rng, [...new Set(available.map((unit) => unit.tier))]);
    if (tier === null) return null;
    const candidates = available.filter((unit) => unit.tier === tier);
    const total = candidates.reduce((sum, unit) => sum + (this.pool.get(unit.id) ?? 0), 0);
    let roll = this.rng.int(1, total);
    for (const unit of candidates) {
      roll -= this.pool.get(unit.id) ?? 0;
      if (roll > 0) continue;
      this.pool.set(unit.id, (this.pool.get(unit.id) ?? 0) - 1);
      return { id: this.nextOfferId++, unitId: unit.id, tier, cost: tier };
    }
    return null;
  }
}
