import { describe, expect, it } from 'vitest';
import { Economy } from '../economy';
import { UnitCatalog } from '../data/unitLoader';
import type { UnitDef } from '../data/unit';
import { Rng } from '../rng';
import { LEVEL_ODDS, MANAGEMENT, Management, rollShopTier } from './management';

function catalog(tiers = [1, 1, 1, 1, 1, 1, 1, 1]): UnitCatalog {
  const units: UnitDef[] = tiers.map((tier, index) => ({
    id: `unit_${index}`, name: `유닛 ${index}`, tier, origin: 'iron_legion', job: 'guardian',
    stats: { hp: 100, atk: 10, as: 1, rng: 1, arm: 0, res: 0, mana: 100 },
    skill: { name: '스킬', text: '스킬', targeting: 'self', effects: [{ kind: 'heal', selector: 'self', amount: 1 }] },
  }));
  return new UnitCatalog(units);
}

function slotOf(manager: Management, unitId: string): number {
  for (let attempt = 0; attempt < 100; attempt++) {
    const slot = manager.snapshot().offers.findIndex((offer) => offer?.unitId === unitId);
    if (slot >= 0) return slot;
    expect(manager.reroll().ok).toBe(true);
  }
  throw new Error(`상점에서 ${unitId}를 찾을 수 없음`);
}

function assertInventory(manager: Management, all: UnitCatalog): void {
  const state = manager.snapshot();
  for (const def of all.units) {
    const ownedCopies = [...state.board, ...state.bench.filter((u) => u !== null)]
      .filter((unit) => unit.unitId === def.id).reduce((sum, unit) => sum + 3 ** (unit.star - 1), 0);
    const displayed = state.offers.filter((offer) => offer?.unitId === def.id).length;
    expect((state.pool[def.id] ?? 0) + ownedCopies + displayed).toBe(MANAGEMENT.POOL_COPIES[def.tier]);
  }
}

describe('상점 확률과 재고', () => {
  it('모든 레벨의 등급 추첨이 문서 확률에 근접한다', () => {
    for (let level = 3; level <= 9; level++) {
      const rng = new Rng(731 + level);
      const counts = [0, 0, 0, 0, 0];
      const n = 60_000;
      for (let i = 0; i < n; i++) {
        const tier = rollShopTier(level, rng);
        if (tier === null) throw new Error('등급이 필요함');
        counts[tier - 1] = (counts[tier - 1] ?? 0) + 1;
      }
      const odds = LEVEL_ODDS[level] ?? [];
      counts.forEach((count, i) => expect(Math.abs(count / n * 100 - (odds[i] ?? 0))).toBeLessThan(0.7));
    }
  });

  it('존재하지 않거나 소진한 등급은 재정규화하고 후보가 없으면 빈 슬롯이다', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 100; i++) expect(rollShopTier(3, rng, [2])).toBe(2);
    expect(rollShopTier(3, rng, [3, 4, 5])).toBeNull();
    const manager = new Management(catalog([1]), new Economy(100), new Rng(3), [{ unitId: 'unit_0', count: 18 }]);
    expect(manager.snapshot().offers).toEqual([null, null, null, null, null]);
    expect(manager.snapshot().board.map((u) => u.star)).toEqual([3, 3]);
    expect(manager.snapshot().pool.unit_0).toBe(0);
  });

  it('유닛 진열을 예약하고 구매·리롤·판매 후에도 원본 재고가 보존된다', () => {
    const all = catalog([1, 2, 3, 4, 5]);
    const economy = new Economy(1000);
    const manager = new Management(all, economy, new Rng(3), [{ unitId: 'unit_0', count: 2 }]);
    assertInventory(manager, all);
    for (let i = 0; i < 5; i++) {
      const offer = manager.snapshot().offers[i];
      if (offer) manager.buy(i);
      assertInventory(manager, all);
    }
    manager.reroll();
    assertInventory(manager, all);
    for (const unit of [...manager.snapshot().board, ...manager.snapshot().bench.filter((u) => u !== null)]) {
      expect(manager.sell(unit.id).ok).toBe(true);
      assertInventory(manager, all);
    }
  });

  it('잠금은 다음 무료 갱신을 한 번 막고, 리롤은 잠금 중에도 1G를 사용한다', () => {
    const economy = new Economy(10);
    const manager = new Management(catalog(), economy, new Rng(9));
    const offers = manager.snapshot().offers;
    manager.toggleLock();
    manager.advanceBattle();
    expect(manager.snapshot().offers).toEqual(offers);
    expect(manager.snapshot().locked).toBe(false);
    expect(economy.gold).toBe(10);
    manager.advanceBattle();
    expect(manager.snapshot().offers).not.toEqual(offers);
    manager.toggleLock();
    manager.reroll();
    expect(economy.gold).toBe(9);
    expect(manager.snapshot().locked).toBe(true);
  });

  it('같은 시드·명령은 같은 진열·재고를 만들고 실패는 RNG를 소비하지 않는다', () => {
    const a = new Management(catalog(), new Economy(10), new Rng(123));
    const b = new Management(catalog(), new Economy(10), new Rng(123));
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.buy(99).ok).toBe(false);
    a.reroll(); b.reroll();
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe('구매·자동 합성·장비 승계', () => {
  it('3기 합성은 보드 유닛을 유지하고 장비를 모두 승계한다', () => {
    const manager = new Management(catalog([1]), new Economy(100), new Rng(1));
    manager.buy(0);
    const first = manager.snapshot().bench[0];
    if (!first) throw new Error('유닛 없음');
    manager.moveToBoard(first.id, { col: 3, row: 2 });
    manager.setEquipment(first.id, ['blade']);
    manager.buy(1);
    const second = manager.snapshot().bench[0];
    if (!second) throw new Error('유닛 없음');
    manager.setEquipment(second.id, ['blade', 'shield']);
    manager.buy(2);
    const state = manager.snapshot();
    expect(state.board).toHaveLength(1);
    expect(state.board[0]).toMatchObject({ id: first.id, star: 2, cell: { col: 3, row: 2 }, equipment: ['blade', 'blade', 'shield'] });
    expect(state.bench.every((u) => u === null)).toBe(true);
    expect(manager.formation()[0]).toMatchObject({ equipment: ['blade', 'blade', 'shield'], star: 2 });
  });

  it('9기 구매는 3성까지 연쇄 합성하며 판매하면 9개의 재고를 반환한다', () => {
    const all = catalog([1]);
    const economy = new Economy(100);
    const manager = new Management(all, economy, new Rng(1));
    for (let slot = 0; slot < 5; slot++) manager.buy(slot);
    manager.reroll();
    for (let slot = 0; slot < 4; slot++) manager.buy(slot);
    const owned = manager.snapshot().bench.filter((u) => u !== null);
    expect(owned).toHaveLength(1);
    const unit = owned[0];
    if (!unit) throw new Error('유닛 없음');
    expect(unit.star).toBe(3);
    expect(economy.gold).toBe(90);
    assertInventory(manager, all);
    manager.sell(unit.id);
    expect(economy.gold).toBe(98);
    expect(manager.snapshot().bench.every((u) => u === null)).toBe(true);
    assertInventory(manager, all);
  });

  it('벤치가 가득 차도 구매 즉시 합성할 수 있으면 허용한다', () => {
    // 보드 3기(레벨 3) + 벤치 가득: unit_0 2기 + 서로 다른 유닛 BENCH_SIZE + 1기
    const others = MANAGEMENT.BENCH_SIZE + 1;
    const starts = [{ unitId: 'unit_0', count: 2 }, ...Array.from({ length: others }, (_, i) => ({ unitId: `unit_${i + 1}`, count: 1 }))];
    const manager = new Management(catalog(Array<number>(others + 1).fill(1)), new Economy(1000), new Rng(1), starts);
    expect(manager.snapshot().bench.every((u) => u !== null)).toBe(true);
    const slot = slotOf(manager, 'unit_0');
    expect(manager.buy(slot).ok).toBe(true);
    expect(manager.snapshot().board.find((u) => u.unitId === 'unit_0')?.star).toBe(2);
  });

  it('빈 벤치가 없고 합성되지 않으면 돈·진열·유닛을 바꾸지 않는다', () => {
    // 보드 3기(레벨 3) + 벤치 가득: unit_0 2기 + 서로 다른 유닛 BENCH_SIZE + 1기
    const others = MANAGEMENT.BENCH_SIZE + 1;
    const starts = [{ unitId: 'unit_0', count: 2 }, ...Array.from({ length: others }, (_, i) => ({ unitId: `unit_${i + 1}`, count: 1 }))];
    const manager = new Management(catalog(Array<number>(others + 1).fill(1)), new Economy(1000), new Rng(1), starts);
    const slot = slotOf(manager, 'unit_1');
    const before = manager.snapshot();
    expect(manager.buy(slot)).toEqual({ ok: false, reason: '벤치가 가득 찼습니다' });
    expect(manager.snapshot()).toEqual(before);
  });

  it('구매·리롤·XP의 골드 부족 실패는 상태를 바꾸지 않는다', () => {
    const manager = new Management(catalog([2]), new Economy(0), new Rng(1));
    const before = manager.snapshot();
    expect(manager.buy(0).ok).toBe(false);
    expect(manager.reroll().ok).toBe(false);
    expect(manager.buyXp().ok).toBe(false);
    expect(manager.snapshot()).toEqual(before);
  });

  it.each([[1, 1, 1], [2, 3, 5], [2, 9, 17]] as const)('등급 %s·원본 %s기 판매 가격은 %sG', (tier, count, refund) => {
    const economy = new Economy(10);
    const manager = new Management(catalog([tier]), economy, new Rng(1), [{ unitId: 'unit_0', count }]);
    const unit = manager.snapshot().board[0];
    if (!unit) throw new Error('유닛 없음');
    expect(manager.sell(unit.id).ok).toBe(true);
    expect(economy.gold).toBe(10 + refund);
  });
});

describe('레벨·인구·벤치 이동', () => {
  it('XP 구매는 4G/4XP이고 최고 레벨에서는 돈을 쓰지 않는다', () => {
    const economy = new Economy(1000);
    const manager = new Management(catalog(), economy, new Rng(1));
    expect(manager.snapshot()).toMatchObject({ level: 3, xp: 0, xpToNext: 4 });
    manager.buyXp();
    expect(manager.snapshot()).toMatchObject({ level: 4, xp: 0, xpToNext: 8, gold: 996 });
    manager.buyXp();
    expect(manager.snapshot()).toMatchObject({ level: 4, xp: 4, gold: 992 });
    for (let i = 0; i < 50 && manager.snapshot().level < 9; i++) manager.buyXp();
    const before = manager.snapshot();
    expect(before).toMatchObject({ level: 9, xp: 0, xpToNext: null });
    expect(manager.buyXp().ok).toBe(false);
    expect(manager.snapshot()).toEqual(before);
  });

  it('인구 초과 배치는 거부하고 레벨업 후 허용한다', () => {
    const manager = new Management(catalog(), new Economy(100), new Rng(1), Array.from({ length: 4 }, (_, i) => ({ unitId: `unit_${i}`, count: 1 })));
    const benched = manager.snapshot().bench[0];
    if (!benched) throw new Error('유닛 없음');
    const before = manager.snapshot();
    expect(manager.moveToBoard(benched.id, { col: 0, row: 0 }).ok).toBe(false);
    expect(manager.snapshot()).toEqual(before);
    manager.buyXp();
    expect(manager.moveToBoard(benched.id, { col: 0, row: 0 }).ok).toBe(true);
    expect(manager.snapshot().population).toBe(4);
  });

  it('보드↔벤치·보드↔보드 교환은 인구를 유지하며 서로의 위치를 교환한다', () => {
    const manager = new Management(catalog(), new Economy(100), new Rng(1), Array.from({ length: 4 }, (_, i) => ({ unitId: `unit_${i}`, count: 1 })));
    const state = manager.snapshot();
    const board = state.board[0];
    const second = state.board[1];
    const bench = state.bench[0];
    if (!board?.cell || !second?.cell || !bench) throw new Error('유닛 없음');
    manager.moveToBoard(bench.id, board.cell);
    expect(manager.snapshot().bench[0]?.id).toBe(board.id);
    expect(manager.snapshot().population).toBe(3);
    manager.moveToBoard(bench.id, second.cell);
    expect(manager.snapshot().board.find((u) => u.id === second.id)?.cell).toEqual(board.cell);
    manager.moveToBench(bench.id, 0);
    expect(manager.snapshot().bench[0]?.id).toBe(bench.id);
    expect(manager.snapshot().population).toBe(3);
  });

  it('잘못된 이동·장비 동기화·판매는 상태를 변경하지 않는다', () => {
    const manager = new Management(catalog(), new Economy(10), new Rng(1), [{ unitId: 'unit_0', count: 1 }]);
    const id = manager.snapshot().board[0]?.id ?? 0;
    const before = manager.snapshot();
    expect(manager.moveToBoard(id, { col: 4, row: 0 }).ok).toBe(false);
    expect(manager.moveToBoard(id, { col: 0.5, row: 0 }).ok).toBe(false);
    expect(manager.moveToBench(id, MANAGEMENT.BENCH_SIZE).ok).toBe(false);
    expect(manager.moveToBench(999).ok).toBe(false);
    expect(manager.sell(999).ok).toBe(false);
    expect(manager.setEquipment(id, ['']).ok).toBe(false);
    expect(manager.snapshot()).toEqual(before);
  });

  it('스냅샷과 편성은 내부 유닛·장비·진열을 노출하지 않는다', () => {
    const manager = new Management(catalog(), new Economy(10), new Rng(1), [{ unitId: 'unit_0', count: 1 }]);
    const first = manager.snapshot();
    const unit = first.board[0];
    if (!unit) throw new Error('유닛 없음');
    unit.equipment.push('fake');
    if (unit.cell) (unit.cell as { col: number }).col = 7;
    const offer = first.offers.find((entry) => entry !== null);
    if (offer) offer.cost = 99;
    expect(manager.snapshot().board[0]?.equipment).toEqual([]);
    expect(manager.snapshot().board[0]?.cell).toEqual({ col: 3, row: 1 });
    expect(manager.snapshot().offers.some((entry) => entry?.cost === 99)).toBe(false);
  });
});
