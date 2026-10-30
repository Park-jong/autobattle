import { describe, expect, it } from 'vitest';
import { Economy } from '../economy';
import { Rng } from '../rng';
import { UnitCatalog } from '../data/unitLoader';
import { runDeps } from '../run/testSupport';
import { TraitEngine } from '../combat/traits';
import { RunRoster } from '../run/runRoster';
import { Management } from './management';
import { buildAutoFormation } from './autoFormation';

const base = runDeps.units.get('iron_shieldbearer')!;
const units = new UnitCatalog([
  { ...base, id: 'guard', tier: 1, origin: 'iron_legion', job: 'guardian', stats: { ...base.stats, hp: 500, atk: 50, as: 1, arm: 0, res: 0, rng: 1 } },
  { ...base, id: 'archer', tier: 1, origin: 'iron_legion', job: 'marksman', stats: { ...base.stats, hp: 500, atk: 50, as: 1, arm: 0, res: 0, rng: 4 } },
  { ...base, id: 'tree', tier: 1, origin: 'forest_pact', job: 'guardian', stats: { ...base.stats, hp: 500, atk: 50, as: 1, arm: 0, res: 0, rng: 1 } },
  { ...base, id: 'mage', tier: 1, origin: 'ember', job: 'mystic', stats: { ...base.stats, hp: 500, atk: 50, as: 1, arm: 0, res: 0, rng: 4 } },
]);
const traits = runDeps.traits;

function roster(mageStar: 1 | 3 = 1) {
  const management = new Management(units, new Economy(100), new Rng(7));
  for (const id of ['guard', 'guard', 'archer', 'tree', 'mage']) {
    expect(management.addOwnedUnit(id, id === 'mage' ? mageStar : 1, id === 'guard' ? 'board' : 'bench').ok).toBe(true);
  }
  return management;
}

describe('자동 출전 유닛 추천', () => {
  it('중복 유닛은 시너지를 중복 계산하지 않고 서로 다른 소속·직업 시너지를 완성한다', () => {
    const management = roster();
    const before = management.snapshot();
    const plan = buildAutoFormation(before, units, traits);
    expect(management.snapshot()).toEqual(before);
    expect(management.applyFormation(plan)).toEqual({ ok: true });
    const state = management.snapshot();
    expect(state.board.map(unit => unit.unitId).sort()).toEqual(['archer', 'guard', 'tree']);
    const active = new TraitEngine(traits).compute(state.board.map(unit => units.get(unit.unitId)!));
    expect(active.filter(trait => trait.tier > 0).map(trait => trait.traitId).sort()).toEqual(['guardian', 'iron_legion']);
    expect(state.board.find(unit => unit.unitId === 'archer')!.cell!.col).toBe(1);
    expect(state.board.filter(unit => unit.unitId !== 'archer').every(unit => unit.cell!.col === 3)).toBe(true);
    expect(buildAutoFormation(state, units, traits)).toEqual(plan);
  });

  it('성급이 높은 주력 유닛의 전투력도 고려한다', () => {
    const management = roster(3);
    management.applyFormation(buildAutoFormation(management.snapshot(), units, traits));
    expect(management.snapshot().board.some(unit => unit.unitId === 'mage' && unit.star === 3)).toBe(true);
  });

  it('보유 유닛만 사용하고 레벨·보드 범위를 지키며 빈 목록도 처리한다', () => {
    const management = new Management(units, new Economy(), new Rng(1));
    expect(buildAutoFormation(management.snapshot(), units, traits)).toEqual([]);
    management.addOwnedUnit('archer', 1, 'bench');
    const plan = buildAutoFormation(management.snapshot(), units, traits);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.cell).toEqual({ col: 1, row: 1 });
  });
});

function fullRoster() {
  const rng = new Rng(1);
  const management = new Management(runDeps.units, new Economy(123), rng);
  management.setLevel(9);
  const ids = runDeps.units.units.filter(unit => !unit.boss).slice(0, 18).map(unit => unit.id);
  ids.forEach((id, index) => expect(management.addOwnedUnit(id, 1, index < 9 ? 'board' : 'bench').ok).toBe(true));
  management.setEquipment(management.snapshot().board[0]!.id, ['forged_blade+']);
  return { management, rng };
}

describe('원자적 편성 적용', () => {
  it('벤치가 꽉 차 있어도 전원 교체하며 장비·골드·상점·재고·난수를 유지한다', () => {
    const { management, rng } = fullRoster();
    const before = management.snapshot(), random = rng.getState();
    const plan = before.bench.map((unit, index) => ({ id: unit!.id, cell: { col: 3 - Math.floor(index / 5), row: index % 5 } }));
    expect(management.applyFormation(plan)).toEqual({ ok: true });
    const after = management.snapshot();
    expect(after.board.map(unit => unit.id).sort()).toEqual(before.bench.map(unit => unit!.id).sort());
    expect(after.bench.filter(Boolean)).toHaveLength(9);
    expect(new Set(after.bench.map(unit => unit!.benchIndex)).size).toBe(9);
    const inventory = (state: typeof before) => [...state.board, ...state.bench.filter(unit => unit !== null)]
      .map(({ cell, benchIndex, ...unit }) => unit).sort((a, b) => a.id - b.id);
    expect(inventory(after)).toEqual(inventory(before));
    expect(after.gold).toBe(before.gold);
    expect(after.pool).toEqual(before.pool);
    expect(after.offers).toEqual(before.offers);
    expect(rng.getState()).toBe(random);
  });

  it('최대 보유 18기에서도 추천 결과가 결정적이며 배치 칸이 겹치지 않는다', () => {
    const { management } = fullRoster();
    const plan = buildAutoFormation(management.snapshot(), runDeps.units, traits);
    expect(plan).toHaveLength(9);
    expect(new Set(plan.map(unit => `${unit.cell.col}:${unit.cell.row}`)).size).toBe(9);
    expect(management.applyFormation(plan).ok).toBe(true);
    expect(buildAutoFormation(management.snapshot(), runDeps.units, traits)).toEqual(plan);
  });

  it.each(['enemy', 'fraction', 'unknown', 'duplicate-id', 'duplicate-cell', 'overflow'])('잘못된 편성 %s는 상태를 일부만 바꾸지 않는다', problem => {
    const management = roster();
    const before = management.serializeState();
    const ids = [...management.snapshot().board, ...management.snapshot().bench.filter(unit => unit !== null)].map(unit => unit.id);
    const plan = problem === 'overflow'
      ? ids.slice(0, 4).map((id, row) => ({ id, cell: { col: 3, row } }))
      : [{ id: ids[0]!, cell: { col: problem === 'enemy' ? 4 : problem === 'fraction' ? .5 : 3, row: 2 } }];
    if (problem === 'unknown') plan[0]!.id = 999;
    if (problem === 'duplicate-id') plan.push({ id: ids[0]!, cell: { col: 2, row: 2 } });
    if (problem === 'duplicate-cell') plan.push({ id: ids[1]!, cell: { col: 3, row: 2 } });
    expect(management.applyFormation(plan).ok).toBe(false);
    expect(management.serializeState()).toEqual(before);
  });

  it('벤치 용량을 넘는 축소 편성과 전투 중 적용을 거부한다', () => {
    const { management } = fullRoster();
    const before = management.serializeState();
    expect(management.applyFormation([]).ok).toBe(false);
    const gated = new RunRoster(management, { canEdit: () => false, canShop: () => false });
    expect(gated.applyFormation(buildAutoFormation(management.snapshot(), runDeps.units, traits)).ok).toBe(false);
    expect(management.serializeState()).toEqual(before);
  });
});
