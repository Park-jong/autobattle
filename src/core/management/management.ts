import type { Economy } from '../economy';
import type { FormationEntry, StarLevel } from '../combat/formation';
import { isInOwnHalf, sameCell, type Cell } from '../combat/board';
import type { UnitCatalog } from '../data/unitLoader';
import type { StartingUnit } from '../data/commander';
import { FieldReader } from '../data/fieldReader';
import { Rng } from '../rng';

export const MANAGEMENT = {
  SHOP_SIZE: 5,
  BENCH_SIZE: 9,
  START_LEVEL: 3,
  MAX_LEVEL: 9,
  REROLL_COST: 1,
  XP_COST: 4,
  XP_PER_PURCHASE: 4,
  /** 야영지 승급 기본 비용. 총 비용 = 기본 + 풀에서 추가로 가져오는 원본 수 × 유닛 등급 */
  PROMOTE_BASE_COST: 4,
  // 레벨 3→4부터 8→9까지 필요한 XP. 남은 XP는 다음 레벨로 이월한다.
  XP_TO_NEXT: { 3: 4, 4: 8, 5: 12, 6: 20, 7: 32, 8: 48 } as Record<number, number>,
  // 원본 1성 개수. 2·3성은 각각 3·9개의 재고를 차지한다.
  POOL_COPIES: { 1: 18, 2: 16, 3: 14, 4: 10, 5: 8 } as Record<number, number>,
  /**
   * M5-4(유닛 14종 → 30종)에서 추가된 유닛. 그 전에 만든 저장본의 유닛 풀(`pool`)에는 이 유닛들의 재고가 없으므로,
   * 복원할 때 빠져 있으면 등급별 기본 재고(`POOL_COPIES`)로 채운다. 저장본은 이 유닛을 소유하거나 진열한 적이 없다.
   * 이 목록에 없는 유닛의 재고가 빠져 있으면 여전히 손상된 저장으로 거부한다.
   */
  POOL_ADDED_IN_M54: [
    'bear_warrior', 'shadow_panther', 'battle_chaplain', 'ember_smith', 'ember_bladedancer', 'rift_stalker', 'void_sniper', 'wind_hunter',
    'legion_centurion', 'siege_bombardier', 'magma_champion', 'abyss_sentinel', 'void_hierophant', 'volcano_oracle', 'muhon', 'elder_treeking',
  ] as readonly string[],
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

/** 유물이 관리 규칙에 끼어드는 지점 (쌍둥이 거울·상인의 저울). 없으면 기본 규칙 그대로 */
export interface ManagementPerks {
  /** 이번 노드의 무료 리롤이 남았으면 하나 쓰고 true */
  consumeFreeReroll(): boolean;
  /** 같은 유닛 2기 합성 기회가 남았는가 */
  mirrorMergeAvailable(): boolean;
  /** 합성 기회를 하나 쓴다 */
  consumeMirrorMerge(): void;
}

export type ManagementResult = { ok: true } | { ok: false; reason: string };
export interface OwnedUnit {
  id: number;
  unitId: string;
  star: StarLevel;
  cell: Cell | null;
  benchIndex: number | null;
  equipment: string[];
}
export interface RosterPlacement {
  id: number;
  cell: Cell;
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

/** 저장용 상태. 소유 유닛·상점·유닛 풀 재고·레벨/XP를 모두 담는다 (골드는 Economy, RNG는 호출 측이 저장) */
export interface ManagementState {
  level: number;
  xp: number;
  locked: boolean;
  nextOwnedId: number;
  nextOfferId: number;
  owned: OwnedUnit[];
  offers: (ShopOffer | null)[];
  pool: Record<string, number>;
}

/** 승급 견적: 풀에서 추가로 가져올 원본 수와 골드 비용 */
export interface PromotionQuote {
  extraCopies: number;
  cost: number;
}

const OK: ManagementResult = { ok: true };
const fail = (reason: string): ManagementResult => ({ ok: false, reason });
const copiesAtStar = (star: StarLevel): number => 3 ** (star - 1);
const copyUnit = (unit: OwnedUnit): OwnedUnit => ({ ...unit, cell: unit.cell ? { ...unit.cell } : null, equipment: [...unit.equipment] });

/** 테스트 유닛을 보드에 둘 때 채우는 칸 순서 (전열부터) */
const BOARD_FILL_ORDER: readonly Cell[] = [3, 2, 1, 0].flatMap((col) => [2, 1, 3, 0, 4].map((row) => ({ col, row })));

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
    private readonly perks: ManagementPerks | null = null,
  ) {
    for (const unit of units.units) {
      if (unit.boss) continue; // 보스 전용 유닛은 상점 풀에 넣지 않는다
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

  /** 저장용 상태 복사본 */
  serializeState(): ManagementState {
    return {
      level: this.levelValue, xp: this.xpValue, locked: this.lockedValue,
      nextOwnedId: this.nextOwnedId, nextOfferId: this.nextOfferId,
      owned: this.owned.map(copyUnit),
      offers: this.offers.map((offer) => (offer ? { ...offer } : null)),
      pool: Object.fromEntries(this.pool),
    };
  }

  /**
   * 저장된 상태로 덮어쓴다. 모든 필드를 검증하며 잘못되면 위치가 담긴 DataValidationError를 던지고 상태는 바뀌지 않는다.
   * 상점 RNG는 호출 측이 따로 복원한다.
   */
  restoreState(data: unknown, path = 'management'): void {
    const r = FieldReader.of(data, path);
    r.onlyKeys(['level', 'xp', 'locked', 'nextOwnedId', 'nextOfferId', 'owned', 'offers', 'pool']);
    const level = r.int('level', MANAGEMENT.START_LEVEL);
    if (level > MANAGEMENT.MAX_LEVEL) r.fail('level', `${MANAGEMENT.MAX_LEVEL} 이하여야 함`);
    const xp = r.int('xp', 0);
    const locked = r.boolean('locked');
    const nextOwnedId = r.int('nextOwnedId', 1);
    const nextOfferId = r.int('nextOfferId', 1);

    const owned: OwnedUnit[] = [];
    const cells = new Set<string>();
    const benches = new Set<number>();
    r.array('owned').forEach((raw, i) => {
      const u = FieldReader.of(raw, `${path}.owned[${i}]`);
      u.onlyKeys(['id', 'unitId', 'star', 'cell', 'benchIndex', 'equipment']);
      const id = u.int('id', 1);
      if (owned.some((entry) => entry.id === id)) u.fail('id', `중복된 소유 ID ${id}`);
      if (id >= nextOwnedId) u.fail('id', 'nextOwnedId보다 작아야 함');
      const unitId = u.string('unitId');
      const def = this.units.get(unitId);
      if (!def || def.boss) u.fail('unitId', `소유할 수 없는 유닛 "${unitId}"`);
      const star = u.int('star', 1);
      if (star > 3) u.fail('star', '1~3이어야 함');
      let cell: Cell | null = null;
      if (u.rawValue('cell') !== null) {
        const c = u.object('cell');
        cell = { col: c.int('col', 0), row: c.int('row', 0) };
        if (!isInOwnHalf(0, cell)) u.fail('cell', '아군 보드 안의 칸이어야 함');
        const key = `${cell.col},${cell.row}`;
        if (cells.has(key)) u.fail('cell', `칸 (${key})이 중복됨`);
        cells.add(key);
      }
      let benchIndex: number | null = null;
      if (u.rawValue('benchIndex') !== null) {
        benchIndex = u.int('benchIndex', 0);
        if (benchIndex >= MANAGEMENT.BENCH_SIZE) u.fail('benchIndex', `${MANAGEMENT.BENCH_SIZE} 미만이어야 함`);
        if (benches.has(benchIndex)) u.fail('benchIndex', `벤치 칸 ${benchIndex}이 중복됨`);
        benches.add(benchIndex);
      }
      if ((cell === null) === (benchIndex === null)) u.fail('cell', '보드 칸과 벤치 중 정확히 하나에 있어야 함');
      const equipment = u.array('equipment').map((item, j) => {
        if (typeof item !== 'string' || item.trim() === '') u.fail(`equipment[${j}]`, '카드 ID 문자열이어야 함');
        return item as string;
      });
      owned.push({ id, unitId, star: star as StarLevel, cell, benchIndex, equipment });
    });
    if (cells.size > level) r.fail('owned', `보드 유닛 ${cells.size}기가 레벨 ${level}의 인구 한도를 넘음`);

    const offerList = r.array('offers');
    if (offerList.length !== MANAGEMENT.SHOP_SIZE) r.fail('offers', `길이 ${MANAGEMENT.SHOP_SIZE}여야 함`);
    const offers = offerList.map((raw, i) => {
      if (raw === null) return null;
      const o = FieldReader.of(raw, `${path}.offers[${i}]`);
      o.onlyKeys(['id', 'unitId', 'tier', 'cost']);
      const unitId = o.string('unitId');
      const def = this.units.get(unitId);
      if (!def || def.boss) o.fail('unitId', `상점에 나올 수 없는 유닛 "${unitId}"`);
      return { id: o.int('id', 1), unitId, tier: o.int('tier', 1), cost: o.int('cost', 0) } as ShopOffer;
    });

    const poolReader = r.object('pool');
    const poolKeys = [...this.pool.keys()];
    poolReader.onlyKeys(poolKeys);
    const pool = new Map<string, number>();
    for (const unitId of poolKeys) {
      if (!poolReader.has(unitId) && MANAGEMENT.POOL_ADDED_IN_M54.includes(unitId)) {
        // M5-4 이전 저장본: 새 유닛은 아직 아무도 가져가지 않았으니 기본 재고로 시작한다
        pool.set(unitId, MANAGEMENT.POOL_COPIES[this.units.get(unitId)?.tier ?? 0] ?? 0);
      } else {
        pool.set(unitId, poolReader.int(unitId, 0));
      }
    }

    this.levelValue = level;
    this.xpValue = xp;
    this.lockedValue = locked;
    this.nextOwnedId = nextOwnedId;
    this.nextOfferId = nextOfferId;
    this.owned = owned;
    this.offers = offers;
    for (const [unitId, count] of pool) this.pool.set(unitId, count);
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
    this.applyMirrorMerge();
    return OK;
  }

  /**
   * 골드 없이 1성 유닛 1기를 벤치/합성 규칙대로 받는다 (이벤트 보상). 풀에서 원본 1개를 가져가며,
   * 풀에 없거나 벤치가 가득 차면 실패하고 아무것도 바꾸지 않는다.
   */
  grantUnit(unitId: string): ManagementResult {
    const def = this.units.get(unitId);
    if (!def || def.boss) return fail('받을 수 없는 유닛입니다');
    const remaining = this.pool.get(unitId) ?? 0;
    if (remaining <= 0) return fail('유닛 풀에 남은 재고가 없습니다');
    const candidate: OwnedUnit = { id: this.nextOwnedId, unitId, star: 1, cell: null, benchIndex: -1, equipment: [] };
    const next = this.merge([...this.owned.map(copyUnit), candidate]);
    if (!this.placeUnassigned(next)) return fail('벤치가 가득 찼습니다');
    this.owned = next;
    this.nextOwnedId++;
    this.pool.set(unitId, remaining - 1);
    this.applyMirrorMerge();
    return OK;
  }

  /**
   * 테스트 런 전용: 레벨을 직접 정한다 (경험치는 0). 보드 인원이 새 레벨의 인구 한도를 넘으면 실패하고 상태는 그대로.
   */
  setLevel(level: number): ManagementResult {
    if (!Number.isInteger(level) || level < MANAGEMENT.START_LEVEL || level > MANAGEMENT.MAX_LEVEL) {
      return fail(`레벨은 ${MANAGEMENT.START_LEVEL}~${MANAGEMENT.MAX_LEVEL}의 정수여야 합니다`);
    }
    const onBoard = this.owned.filter((unit) => unit.cell !== null).length;
    if (onBoard > level) return fail(`보드 유닛 ${onBoard}기가 레벨 ${level}의 인구 한도를 넘습니다 (먼저 벤치로 옮기세요)`);
    this.levelValue = level;
    this.xpValue = 0;
    return OK;
  }

  /**
   * 테스트 런 전용: 골드 없이 원하는 성급의 유닛 1기를 보드 빈 칸 또는 벤치에 둔다. 풀에서는 성급 몫(1/3/9개)을 가져가되
   * 재고가 모자라면 있는 만큼만 가져간다 (0 아래로 내려가지 않음). 실패하면 아무것도 바꾸지 않는다.
   */
  addOwnedUnit(unitId: string, star: StarLevel, place: 'board' | 'bench'): ManagementResult {
    const def = this.units.get(unitId);
    if (!def || def.boss) return fail('받을 수 없는 유닛입니다');
    if (![1, 2, 3].includes(star)) return fail('성급은 1~3이어야 합니다');
    const onBoard = this.owned.filter((unit) => unit.cell !== null);
    let cell: Cell | null = null;
    if (place === 'board') {
      if (onBoard.length >= this.levelValue) return fail(`보드 인원이 레벨 ${this.levelValue}의 인구 한도에 도달했습니다`);
      cell = BOARD_FILL_ORDER.find((candidate) => !onBoard.some((unit) => sameCell(unit.cell as Cell, candidate))) ?? null;
      if (!cell) return fail('보드에 빈 칸이 없습니다');
    }
    const candidate: OwnedUnit = { id: this.nextOwnedId, unitId, star, cell, benchIndex: cell ? null : -1, equipment: [] };
    const next = this.merge([...this.owned.map(copyUnit), candidate]);
    if (!this.placeUnassigned(next)) return fail('벤치가 가득 찼습니다');
    this.owned = next;
    this.nextOwnedId++;
    this.pool.set(unitId, Math.max(0, (this.pool.get(unitId) ?? 0) - copiesAtStar(star)));
    this.applyMirrorMerge();
    return OK;
  }

  /**
   * 쌍둥이 거울: 같은 유닛 1성 2기를 2성으로 합친다 (런당 기회가 남았을 때 한 번).
   * 2성은 원본 3개 몫이므로 모자란 1개를 유닛 풀에서 가져온다(판매 시 3개를 돌려주는 규칙과 맞춘다). 풀에 없으면 합치지 않는다.
   * 보드에 있는 유닛과 낮은 id가 살아남고 장비는 모은다. 합쳐졌으면 true.
   */
  applyMirrorMerge(): boolean {
    if (!this.perks?.mirrorMergeAvailable()) return false;
    const unitIds = [...new Set(this.owned.filter((u) => u.star === 1).map((u) => u.unitId))].sort();
    for (const unitId of unitIds) {
      const group = this.owned.filter((u) => u.star === 1 && u.unitId === unitId)
        .sort((a, b) => Number(b.cell !== null) - Number(a.cell !== null) || a.id - b.id);
      const remaining = this.pool.get(unitId) ?? 0;
      if (group.length < 2 || remaining < 1) continue;
      const [survivor, consumed] = group as [OwnedUnit, OwnedUnit];
      survivor.star = 2;
      survivor.equipment = [...survivor.equipment, ...consumed.equipment];
      this.owned = this.owned.filter((u) => u !== consumed);
      this.pool.set(unitId, remaining - 1);
      this.perks.consumeMirrorMerge();
      this.owned = this.merge(this.owned);
      return true;
    }
    return false;
  }

  /** 벤치에 빈 칸이 있어 새 유닛을 받을 수 있는지 (합성으로 자리가 나는 경우는 고려하지 않는 보수적 판단) */
  hasBenchSpace(): boolean {
    return this.firstFreeBench(this.owned) >= 0;
  }

  /** 유닛 한 단계 승급 견적. 3성이거나 없는 유닛이면 null */
  promotionQuote(id: number): PromotionQuote | null {
    const unit = this.owned.find((entry) => entry.id === id);
    const def = unit ? this.units.get(unit.unitId) : undefined;
    if (!unit || !def || unit.star >= 3) return null;
    const extraCopies = copiesAtStar((unit.star + 1) as StarLevel) - copiesAtStar(unit.star);
    return { extraCopies, cost: MANAGEMENT.PROMOTE_BASE_COST + extraCopies * def.tier };
  }

  /**
   * 야영지 승급: 유닛 1기를 1→2성 또는 2→3성으로 올린다. 일반 합성과 같은 원본 수를 쓰도록
   * 승급에 필요한 추가 원본(2성 +2, 3성 +6)을 유닛 풀에서 가져온다 (재고가 모자라면 실패).
   * 판매 시 풀에 돌려주는 개수(성급별 1/3/9)와 모순이 없다. 장비·배치는 그대로이며 올라간 뒤 3기 합성 조건이 되면 자동 합성한다.
   */
  promote(id: number): ManagementResult {
    const quote = this.promotionQuote(id);
    const unit = this.owned.find((entry) => entry.id === id);
    if (!quote || !unit) return fail('승급할 수 없는 유닛입니다 (3성이거나 소유하지 않음)');
    if ((this.pool.get(unit.unitId) ?? 0) < quote.extraCopies) return fail('유닛 풀에 승급에 필요한 재고가 부족합니다');
    if (!this.economy.spend(quote.cost)) return fail('승급할 골드가 부족합니다');
    unit.star = (unit.star + 1) as StarLevel;
    this.pool.set(unit.unitId, (this.pool.get(unit.unitId) ?? 0) - quote.extraCopies);
    this.owned = this.merge(this.owned);
    return OK;
  }

  reroll(): ManagementResult {
    const free = this.perks?.consumeFreeReroll() === true;
    if (!free && !this.economy.spend(MANAGEMENT.REROLL_COST)) return fail('리롤할 골드가 부족합니다');
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
    this.gainXp(MANAGEMENT.XP_PER_PURCHASE);
    return OK;
  }

  /** 경험치를 얻는다 (구매·전투 승리 보상). 레벨업하고 남은 XP는 이월, 최고 레벨이면 얻지 않는다. 실제로 얻은 양을 돌려준다 */
  gainXp(amount: number): number {
    if (!Number.isSafeInteger(amount) || amount <= 0 || this.levelValue >= MANAGEMENT.MAX_LEVEL) return 0;
    this.xpValue += amount;
    while (this.levelValue < MANAGEMENT.MAX_LEVEL) {
      const needed = MANAGEMENT.XP_TO_NEXT[this.levelValue];
      if (needed === undefined || this.xpValue < needed) break;
      this.xpValue -= needed;
      this.levelValue++;
    }
    if (this.levelValue === MANAGEMENT.MAX_LEVEL) this.xpValue = 0;
    return amount;
  }

  /** Validate a whole team before moving anyone, including swaps with a full bench. */
  applyFormation(placements: readonly RosterPlacement[]): ManagementResult {
    if (placements.length > this.levelValue) return fail('배치 인원이 레벨 한도를 넘습니다');
    if (this.owned.length - placements.length > MANAGEMENT.BENCH_SIZE) return fail('벤치에 빈 자리가 없습니다');
    const owned = new Set(this.owned.map(unit => unit.id));
    const selected = new Map<number, Cell>();
    const taken = new Set<string>();
    for (const { id, cell } of placements) {
      if (!owned.has(id) || selected.has(id)) return fail('편성 유닛이 없거나 중복되었습니다');
      if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row) || !isInOwnHalf(0, cell)) return fail('아군 보드 안의 칸을 선택하세요');
      const key = `${cell.col}:${cell.row}`;
      if (taken.has(key)) return fail('같은 칸에 두 유닛을 배치할 수 없습니다');
      selected.set(id, { ...cell });
      taken.add(key);
    }
    const next = this.owned.map(copyUnit);
    const occupiedBench = new Set(next.filter(unit => !selected.has(unit.id) && unit.benchIndex !== null).map(unit => unit.benchIndex!));
    for (const unit of next) {
      const cell = selected.get(unit.id);
      if (cell) {
        unit.cell = cell; unit.benchIndex = null;
      } else {
        unit.cell = null;
        if (unit.benchIndex === null) {
          let index = 0;
          while (occupiedBench.has(index)) index++;
          unit.benchIndex = index;
          occupiedBench.add(index);
        }
      }
    }
    this.owned = next;
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
