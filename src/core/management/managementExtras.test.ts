import { describe, expect, it } from 'vitest';
import { Economy } from '../economy';
import { Rng } from '../rng';
import { Management, MANAGEMENT } from './management';
import { units } from '../combat/testSupport';
import { FormationEntry } from '../combat';

function make(startingUnits: { unitId: string; count: number }[] = [{ unitId: 'iron_shieldbearer', count: 2 }], gold = 10) {
  const economy = new Economy(gold);
  const rng = new Rng(9);
  return { economy, rng, management: new Management(units, economy, rng, startingUnits) };
}

describe('유닛 풀: 보스 제외', () => {
  it('보스 유닛은 상점 풀에 없고 오래 리롤해도 진열되지 않는다', () => {
    const { management, economy } = make(undefined, 100000);
    expect(Object.keys(management.snapshot().pool)).not.toContain('gate_breaker');
    for (let i = 0; i < 300; i++) {
      management.reroll();
      expect(management.snapshot().offers.every((o) => o?.unitId !== 'gate_breaker')).toBe(true);
    }
    expect(economy.gold).toBeLessThan(100000);
  });

  it('grantUnit: 보스는 받을 수 없다', () => {
    const { management } = make();
    expect(management.grantUnit('gate_breaker')).toEqual({ ok: false, reason: '받을 수 없는 유닛입니다' });
  });
});

describe('grantUnit (이벤트 보상)', () => {
  it('골드 없이 1성 유닛을 벤치에 받고 풀에서 원본 1개를 가져간다', () => {
    const { management, economy } = make();
    const before = management.snapshot();
    expect(management.grantUnit('arena_recruit').ok).toBe(true);
    const after = management.snapshot();
    expect(economy.gold).toBe(10);
    expect(after.bench.filter((u) => u?.unitId === 'arena_recruit')).toHaveLength(1);
    expect(after.pool.arena_recruit).toBe((before.pool.arena_recruit as number) - 1);
  });

  it('벤치가 가득 차거나 풀이 비면 실패하고 상태를 바꾸지 않는다', () => {
    const { management } = make();
    for (let i = 0; i < MANAGEMENT.BENCH_SIZE; i++) expect(management.grantUnit(['arena_recruit', 'shade_dagger', 'moss_warden', 'grove_archer', 'ember_kindler', 'ember_slinger', 'abyss_whisperer', 'war_drummer', 'legion_spy'][i] as string).ok).toBe(true);
    expect(management.hasBenchSpace()).toBe(false);
    const state = JSON.stringify(management.serializeState());
    expect(management.grantUnit('legion_crossbow')).toEqual({ ok: false, reason: '벤치가 가득 찼습니다' });
    expect(JSON.stringify(management.serializeState())).toBe(state);
  });

  it('같은 유닛 3기가 되면 자동 합성한다', () => {
    const { management } = make([{ unitId: 'iron_shieldbearer', count: 2 }]);
    management.grantUnit('iron_shieldbearer');
    const snap = management.snapshot();
    expect([...snap.board, ...snap.bench].filter((u) => u?.unitId === 'iron_shieldbearer').map((u) => u?.star)).toEqual([2]);
  });
});

describe('승급 (야영지)', () => {
  it('견적: 1→2성은 풀 +2개, 비용 4 + 2×등급 / 2→3성은 풀 +6개, 비용 4 + 6×등급', () => {
    const { management } = make();
    const id = management.snapshot().board[0]!.id;
    expect(management.promotionQuote(id)).toEqual({ extraCopies: 2, cost: 6 });
    expect(management.promotionQuote(9999)).toBeNull();
    expect(management.promote(id).ok).toBe(true);
    expect(management.promotionQuote(id)).toEqual({ extraCopies: 6, cost: 10 });
  });

  it('골드와 풀 재고를 쓰고 성급이 오르며, 판매하면 성급에 맞는 개수가 풀로 돌아간다', () => {
    const { management, economy } = make(undefined, 30);
    const id = management.snapshot().board[0]!.id;
    const poolBefore = management.snapshot().pool.iron_shieldbearer as number;
    expect(management.promote(id).ok).toBe(true);
    expect(economy.gold).toBe(24);
    const snap = management.snapshot();
    expect(snap.board.find((u) => u.id === id)?.star).toBe(2);
    expect(snap.pool.iron_shieldbearer).toBe(poolBefore - 2);
    // 2성 판매 = 원본 3개 반환: 풀 총량(보드+풀)이 처음 상태로 보존된다
    management.sell(id);
    expect(management.snapshot().pool.iron_shieldbearer).toBe(poolBefore - 2 + 3);
    expect(management.snapshot().pool.iron_shieldbearer).toBe(18 - 1); // 남은 1기(1성) + 풀 = 원본 18
  });

  it('3성이거나 골드·풀 재고가 모자라면 실패하고 아무것도 바꾸지 않는다', () => {
    const { management, economy } = make(undefined, 30);
    const id = management.snapshot().board[0]!.id;
    management.promote(id);
    management.promote(id);
    expect(management.snapshot().board.find((u) => u.id === id)?.star).toBe(3);
    const before = JSON.stringify(management.serializeState());
    expect(management.promote(id).ok).toBe(false);
    expect(JSON.stringify(management.serializeState())).toBe(before);

    const poor = make(undefined, 5);
    const poorId = poor.management.snapshot().board[0]!.id;
    expect(poor.management.promote(poorId)).toEqual({ ok: false, reason: '승급할 골드가 부족합니다' });
    expect(poor.economy.gold).toBe(5);
    void economy;
  });

  it('올린 뒤 3기가 같은 성급이면 자동 합성 규칙이 이어진다', () => {
    const { management } = make(undefined, 100);
    const [a, b] = management.snapshot().board;
    // 둘을 2성으로 올리고 세 번째 2성을 만들면 3성으로 합쳐진다: 2성 두 기 + 1성 하나를 승급
    management.promote(a!.id);
    management.promote(b!.id);
    management.grantUnit('iron_shieldbearer');
    const extra = management.snapshot().bench.find((u) => u !== null)!;
    management.promote(extra.id);
    const stars = [...management.snapshot().board, ...management.snapshot().bench].filter((u) => u?.unitId === 'iron_shieldbearer').map((u) => u?.star);
    expect(stars).toEqual([3]);
  });
});

describe('Management 직렬화', () => {
  it('상태를 저장/복원하면 이후 구매·리롤 결과가 같다', () => {
    const first = make();
    first.management.reroll();
    first.management.buyXp();
    const saved = JSON.parse(JSON.stringify({ state: first.management.serializeState(), rng: first.rng.getState(), economy: first.economy.serialize() }));

    const economy = Economy.restore(saved.economy);
    const rng = new Rng(0);
    const restored = new Management(units, economy, rng, []);
    restored.restoreState(saved.state);
    rng.setState(saved.rng);

    for (const m of [first.management, restored]) {
      m.reroll();
      m.buy(0);
      m.reroll();
    }
    expect(JSON.stringify(restored.serializeState())).toBe(JSON.stringify(first.management.serializeState()));
    expect(economy.gold).toBe(first.economy.gold);
  });

  it('잘못된 상태는 위치가 담긴 오류로 거부하고 기존 상태를 건드리지 않는다', () => {
    const { management } = make();
    const good = management.serializeState();
    const before = JSON.stringify(management.serializeState());
    const bad = (mutate: (s: any) => void) => {
      const copy = structuredClone(good) as any;
      mutate(copy);
      return () => management.restoreState(copy, 'm');
    };
    expect(bad((s) => { s.owned[0].unitId = 'ghost'; })).toThrow(/m\.owned\[0\]\.unitId/);
    expect(bad((s) => { s.owned[1].cell = s.owned[0].cell; })).toThrow(/칸 .* 중복/);
    expect(bad((s) => { s.owned[0].cell = { col: 5, row: 0 }; })).toThrow(/아군 보드 안의 칸/);
    expect(bad((s) => { s.owned[0].benchIndex = 2; })).toThrow(/정확히 하나/);
    expect(bad((s) => { s.owned[0].unitId = 'gate_breaker'; })).toThrow(/소유할 수 없는 유닛/);
    expect(bad((s) => { s.level = 12; })).toThrow(/m\.level/);
    expect(bad((s) => { s.offers.pop(); })).toThrow(/m\.offers/);
    expect(bad((s) => { s.pool.ghost = 1; })).toThrow(/알 수 없는 필드/);
    expect(bad((s) => { s.owned[0].star = 4; })).toThrow(/1~3/);
    expect(JSON.stringify(management.serializeState())).toBe(before);
    void ({} as FormationEntry);
  });
});

describe('Economy 직렬화', () => {
  it('영수증까지 복원해 같은 전투를 다시 정산해도 지급되지 않는다', () => {
    const economy = new Economy(10);
    const receipt = economy.settleBattle('a#0', 'normal', 'win');
    const restored = Economy.restore(JSON.parse(JSON.stringify(economy.serialize())));
    expect(restored.gold).toBe(economy.gold);
    expect(restored.snapshot().lastReward).toEqual(receipt);
    expect(restored.settleBattle('a#0', 'normal', 'loss')).toEqual(receipt);
    expect(restored.gold).toBe(economy.gold);
  });

  it('잘못된 상태는 거부한다', () => {
    expect(() => Economy.restore({ balance: -1, rewards: [], latestId: null })).toThrow(/economy\.balance/);
    expect(() => Economy.restore({ balance: 1, rewards: [], latestId: 'x' })).toThrow(/latestId/);
    expect(() => Economy.restore({ balance: 1, rewards: [], latestId: null, extra: 1 })).toThrow(/알 수 없는 필드/);
  });
});
