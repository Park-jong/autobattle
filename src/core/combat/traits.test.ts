import { describe, expect, it } from 'vitest';
import { UnitCatalog } from '../data';
import type { UnitDef } from '../data/unit';
import { makeSim, traits, units, unitOf } from './testSupport';
import { TraitEngine } from './traits';

const engine = new TraitEngine(traits);
const def = (id: string): UnitDef => {
  const found = units.get(id);
  if (!found) throw new Error(id);
  return found;
};
/** 같은 기원·직업을 가진 가짜 유닛 종류 */
const clone = (id: string, newId: string): UnitDef => ({ ...def(id), id: newId });
const tierOf = (defs: UnitDef[], traitId: string) => engine.compute(defs).find((t) => t.traitId === traitId);

describe('특성 단계 계산', () => {
  it('서로 다른 유닛 종류 수로 센다', () => {
    const active = tierOf([def('iron_shieldbearer'), def('arena_recruit')], 'iron_legion');
    expect(active).toEqual({ traitId: 'iron_legion', count: 2, tier: 1 });
  });

  it('같은 유닛 여러 기는 1로 센다', () => {
    const three = [def('iron_shieldbearer'), def('iron_shieldbearer'), def('iron_shieldbearer')];
    expect(tierOf(three, 'iron_legion')).toEqual({ traitId: 'iron_legion', count: 1, tier: 0 });
    expect(tierOf(three, 'guardian')?.count).toBe(1);
  });

  it('2 / 4 / 6 단계 경계', () => {
    const base = def('arena_recruit');
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...base, id: `iron_${i}` }));
    expect(tierOf(many(1), 'iron_legion')?.tier).toBe(0);
    expect(tierOf(many(2), 'iron_legion')?.tier).toBe(1);
    expect(tierOf(many(3), 'iron_legion')?.tier).toBe(1);
    expect(tierOf(many(4), 'iron_legion')?.tier).toBe(2);
    expect(tierOf(many(5), 'iron_legion')?.tier).toBe(2);
    expect(tierOf(many(6), 'iron_legion')?.tier).toBe(3);
  });

  it('유닛이 없는 특성은 결과에 없다', () => {
    expect(tierOf([def('iron_shieldbearer')], 'ember')).toBeUndefined();
  });

  it('유닛 14종의 기원·직업 종류 수를 계산한다', () => {
    const all = units.units.map((u) => u);
    const byId = Object.fromEntries(engine.compute(all).map((t) => [t.traitId, t.count]));
    expect(byId).toMatchObject({ iron_legion: 5, guardian: 3, forest_pact: 3, marksman: 3, abyss: 3, assassin: 2, ember: 3, mystic: 3, gladiator: 3 });
  });
});

describe('특성 효과 적용', () => {
  it('강철군단 2단계: 아군 전체 ARM +15 (적에게는 적용 안 됨)', () => {
    const sim = makeSim(
      [['iron_shieldbearer', 1, 3, 2], ['arena_recruit', 1, 2, 2]],
      [['moss_warden', 1, 4, 2]],
    );
    expect(unitOf(sim, 0).stat('arm')).toBe(40 + 15);
    expect(unitOf(sim, 1).stat('arm')).toBe(25 + 15);
    expect(unitOf(sim, 2).stat('arm')).toBe(30);
    expect(sim.activeTraits[0].find((t) => t.traitId === 'iron_legion')?.tier).toBe(1);
  });

  it('강철군단 4단계: +35 (가짜 유닛 종류로 4종 구성)', () => {
    const fakes = ['f1', 'f2', 'f3', 'f4'].map((id) => clone('arena_recruit', id));
    const catalog = new UnitCatalog([...fakes, def('moss_warden')]);
    const sim = makeSim(
      [['f1', 1, 3, 0], ['f2', 1, 3, 1], ['f3', 1, 3, 2], ['f4', 1, 3, 3]],
      [['moss_warden', 1, 4, 2]],
      1,
      catalog,
    );
    expect(unitOf(sim, 0).stat('arm')).toBe(25 + 35);
  });

  it('양측 모두 적용', () => {
    const sim = makeSim(
      [['iron_shieldbearer', 1, 3, 2], ['arena_recruit', 1, 2, 2]],
      [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 5, 2]],
    );
    expect(unitOf(sim, 2).stat('arm')).toBe(40 + 15);
    expect(unitOf(sim, 3).stat('arm')).toBe(15 + 15);
  });

  it('수호자 2단계: 전열 아군만 받는 피해 -15%', () => {
    const sim = makeSim(
      [['iron_shieldbearer', 1, 3, 2], ['moss_warden', 1, 2, 2], ['grove_archer', 1, 3, 4]],
      [['arena_recruit', 1, 4, 2]],
    );
    expect(unitOf(sim, 0).statuses.takenMultiplier()).toBeCloseTo(0.85); // 전열(열 3)
    expect(unitOf(sim, 1).statuses.takenMultiplier()).toBe(1); // 열 2
    expect(unitOf(sim, 2).statuses.takenMultiplier()).toBeCloseTo(0.85); // 궁수도 열 3이면 전열
  });

  it('수호자: 적 진영의 전열은 열 4', () => {
    const sim = makeSim(
      [['arena_recruit', 1, 3, 2]],
      [['iron_shieldbearer', 1, 4, 2], ['moss_warden', 1, 5, 2]],
    );
    expect(unitOf(sim, 1).statuses.takenMultiplier()).toBeCloseTo(0.85);
    expect(unitOf(sim, 2).statuses.takenMultiplier()).toBe(1);
  });

  it('효과 없는 특성(잿불 등)은 아무 일도 하지 않음', () => {
    const sim = makeSim([['shade_dagger', 1, 3, 2]], [['arena_recruit', 1, 4, 2]]);
    expect(sim.world.events.some((e) => e.type === 'statusApplied')).toBe(false);
  });
});
