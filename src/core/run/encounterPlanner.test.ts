import { describe, expect, it } from 'vitest';
import { MUTATION_IDS } from '../combat';
import { RUN } from './constants';
import { EncounterPlanner, floorScale } from './encounterPlanner';
import { MapGenerator } from './mapGenerator';
import { runDeps } from './testSupport';

const map = new MapGenerator().generate(4);
const planner = new EncounterPlanner(runDeps.units, runDeps.encounters, 4);
const battleNodes = map.allNodes().filter((n) => n.type === 'combat' || n.type === 'elite' || n.type === 'boss');

describe('층 보정', () => {
  it('배율 = 1 + 0.04 × (층 − 1)', () => {
    expect(floorScale(1)).toBe(1);
    expect(floorScale(6)).toBeCloseTo(1.2);
    expect(floorScale(13)).toBeCloseTo(1.48);
    expect(RUN.FLOOR_SCALE_PER_FLOOR).toBe(0.04);
  });

  it('미리보기 스탯은 보정 후 HP·ATK이고 시뮬 보정 옵션과 같은 값이다', () => {
    const node = battleNodes.find((n) => n.floor >= 8 && n.type === 'combat')!;
    const plan = planner.plan(node)!;
    const scale = floorScale(node.floor);
    expect(plan.scale).toBe(scale);
    expect(plan.enemy).toEqual({ hpMult: scale, atkMult: scale, mutations: [] });
    for (const unit of plan.units) {
      const def = runDeps.units.get(unit.unitId)!;
      const star = [1, 1.8, 3.2][unit.star - 1] as number;
      expect(unit.hp).toBe(Math.round(def.stats.hp * star * scale));
      expect(unit.atk).toBe(Math.round(def.stats.atk * star * scale));
      expect(unit.arm).toBe(def.stats.arm);
    }
  });
});

describe('적 편성 선택', () => {
  it('전투/정예/보스 노드만 계획하고 그 층 범위·종류에 맞는 편성을 고른다', () => {
    for (const node of map.allNodes()) {
      const plan = planner.plan(node);
      if (!battleNodes.includes(node)) {
        expect(plan).toBeNull();
        continue;
      }
      const def = runDeps.encounters.get(plan!.encounterId)!;
      expect(def.kind).toBe(node.type === 'combat' ? 'normal' : node.type);
      expect(node.floor).toBeGreaterThanOrEqual(def.minFloor);
      expect(node.floor).toBeLessThanOrEqual(def.maxFloor);
      expect(plan!.formation.length).toBe(def.units.length);
      expect(plan!.formation.every((e) => e.cell.col >= 4)).toBe(true);
    }
  });

  it('같은 시드·노드면 방문/미리보기 순서와 상관없이 같은 계획이다', () => {
    const forward = battleNodes.map((n) => JSON.stringify(planner.plan(n)));
    const other = new EncounterPlanner(runDeps.units, runDeps.encounters, 4);
    const backward = [...battleNodes].reverse().map((n) => JSON.stringify(other.plan(n))).reverse();
    expect(backward).toEqual(forward);
    const differentSeed = new EncounterPlanner(runDeps.units, runDeps.encounters, 5);
    const changed = battleNodes.some((n) => JSON.stringify(differentSeed.plan(n)) !== JSON.stringify(planner.plan(n)));
    expect(changed).toBe(true);
  });

  it('보스 노드는 성문 파괴자와 호위 1~2기다', () => {
    const plan = planner.plan(map.bossNode)!;
    expect(plan.kind).toBe('boss');
    expect(plan.name).toBe('성문 파괴자');
    expect(plan.units.filter((u) => u.boss)).toHaveLength(1);
    expect(plan.units.length - 1).toBeGreaterThanOrEqual(1);
    expect(plan.units.length - 1).toBeLessThanOrEqual(2);
    expect(plan.mutations).toEqual([]);
  });
});

describe('정예 변이 선택', () => {
  it('정예 노드마다 서로 다른 변이 1~2개를 결정적으로 고르고 일반 노드는 없다', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const m = new MapGenerator().generate(seed);
      const p = new EncounterPlanner(runDeps.units, runDeps.encounters, seed);
      for (const node of m.allNodes()) {
        const plan = p.plan(node);
        if (!plan) continue;
        if (node.type !== 'elite') {
          expect(plan.mutations).toEqual([]);
          continue;
        }
        counts.add(plan.mutations.length);
        expect(plan.mutations.length).toBeGreaterThanOrEqual(1);
        expect(plan.mutations.length).toBeLessThanOrEqual(2);
        expect(new Set(plan.mutations).size).toBe(plan.mutations.length);
        for (const id of plan.mutations) expect(MUTATION_IDS).toContain(id);
        expect(p.plan(node)!.mutations).toEqual(plan.mutations);
        expect(plan.enemy.mutations).toEqual(plan.mutations);
      }
    }
    expect([...counts].sort()).toEqual([1, 2]);
  });
});
