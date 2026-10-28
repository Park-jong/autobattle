import { describe, expect, it } from 'vitest';
import { RUN } from './constants';
import { MapGenerator } from './mapGenerator';
import { isRestType, RunMap, type NodeType } from './runMap';

const generator = new MapGenerator();
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

/** 시작 노드들에서 앞으로 도달 가능한 노드 id */
function reachableFromStart(map: RunMap): Set<string> {
  const seen = new Set<string>(map.startNodes().map((n) => n.id));
  const queue = [...seen];
  while (queue.length > 0) {
    for (const next of map.nextNodes(queue.shift() as string)) {
      if (!seen.has(next.id)) {
        seen.add(next.id);
        queue.push(next.id);
      }
    }
  }
  return seen;
}

/** 보스에서 거꾸로 도달 가능한 노드 id (= 보스까지 경로가 있는 노드) */
function canReachBoss(map: RunMap): Set<string> {
  const reverse = new Map<string, string[]>();
  for (const node of map.allNodes()) for (const next of node.next) reverse.set(next, [...(reverse.get(next) ?? []), node.id]);
  const seen = new Set<string>([map.bossNode.id]);
  const queue = [map.bossNode.id];
  while (queue.length > 0) {
    for (const prev of reverse.get(queue.shift() as string) ?? []) {
      if (!seen.has(prev)) {
        seen.add(prev);
        queue.push(prev);
      }
    }
  }
  return seen;
}

describe('맵 생성: 구조 불변식 (여러 시드)', () => {
  it('13층, 층당 노드 2~4개(보스 층 1개), 노드당 다음 노드 1~2개, 간선 교차 없음', () => {
    for (const seed of SEEDS) {
      const map = generator.generate(seed);
      expect(map.floorCount).toBe(13);
      map.floors.forEach((floor, f) => {
        if (f === 12) expect(floor).toHaveLength(1);
        else {
          expect(floor.length).toBeGreaterThanOrEqual(2);
          expect(floor.length).toBeLessThanOrEqual(4);
        }
        for (const node of floor) {
          if (f === 12) expect(node.next).toHaveLength(0);
          else {
            expect(node.next.length).toBeGreaterThanOrEqual(1);
            expect(node.next.length).toBeLessThanOrEqual(2);
            for (const id of node.next) expect(map.node(id)?.floor).toBe(node.floor + 1);
          }
        }
      });
      expect(map.countCrossings()).toBe(0);
    }
  });

  it('모든 노드가 시작에서 도달 가능하고 모든 노드에서 보스까지 경로가 있다', () => {
    for (const seed of SEEDS) {
      const map = generator.generate(seed);
      const all = map.allNodes().map((n) => n.id);
      expect([...reachableFromStart(map)].sort()).toEqual([...all].sort());
      expect([...canReachBoss(map)].sort()).toEqual([...all].sort());
    }
  });

  it('고정 층: 1층 전투만, 12층 야영지 전부, 13층 보스 1개, 정예는 4층 이상', () => {
    for (const seed of SEEDS) {
      const map = generator.generate(seed);
      expect(map.floor(1).every((n) => n.type === 'combat')).toBe(true);
      expect(map.floor(12).every((n) => n.type === 'camp')).toBe(true);
      expect(map.floor(13)).toHaveLength(1);
      expect(map.floor(13)[0]?.type).toBe('boss');
      for (const node of map.allNodes()) {
        if (node.type === 'elite') expect(node.floor).toBeGreaterThanOrEqual(RUN.MAP.ELITE_MIN_FLOOR);
        if (node.floor !== 13) expect(node.type).not.toBe('boss');
      }
    }
  });

  it('상점·야영지는 같은 경로에서 연속하지 않는다', () => {
    for (const seed of SEEDS) {
      const map = generator.generate(seed);
      for (const node of map.allNodes()) {
        if (!isRestType(node.type)) continue;
        for (const next of map.nextNodes(node.id)) expect(isRestType(next.type)).toBe(false);
      }
    }
  });

  it('노드 종류 비율이 목표(전투 45 / 정예 10 / 상점 12 / 이벤트 20 / 야영지 13)에 근사한다', () => {
    const totals: Record<NodeType, number> = { combat: 0, elite: 0, shop: 0, event: 0, camp: 0, boss: 0 };
    for (const seed of SEEDS) {
      const counts = generator.generate(seed).countByType();
      for (const type of Object.keys(totals) as NodeType[]) totals[type] += counts[type];
    }
    const nonBoss = totals.combat + totals.elite + totals.shop + totals.event + totals.camp;
    const pct = (type: NodeType) => (totals[type] / nonBoss) * 100;
    expect(Math.abs(pct('combat') - 45)).toBeLessThan(6);
    expect(Math.abs(pct('elite') - 10)).toBeLessThan(3);
    expect(Math.abs(pct('shop') - 12)).toBeLessThan(4);
    expect(Math.abs(pct('event') - 20)).toBeLessThan(5);
    expect(Math.abs(pct('camp') - 13)).toBeLessThan(5);
    expect(totals.boss).toBe(SEEDS.length);
  });
});

describe('맵 생성: 결정론', () => {
  it('같은 시드는 같은 맵, 다른 시드는 (대부분) 다른 맵', () => {
    expect(JSON.stringify(generator.generate(7))).toBe(JSON.stringify(new MapGenerator().generate(7)));
    const distinct = new Set(SEEDS.slice(0, 50).map((seed) => JSON.stringify(generator.generate(seed))));
    expect(distinct.size).toBeGreaterThan(45);
  });
});

describe('맵 직렬화/검증', () => {
  it('JSON 왕복: 저장한 맵을 읽어도 같다', () => {
    const map = generator.generate(11);
    const restored = RunMap.parse(JSON.parse(JSON.stringify(map)));
    expect(JSON.stringify(restored)).toBe(JSON.stringify(map));
  });

  it('불변식이 깨진 맵은 이유와 함께 거부한다', () => {
    const base = JSON.parse(JSON.stringify(generator.generate(11))) as { floors: { id: string; type: string; next: string[] }[][] };
    const mutate = (change: (m: typeof base) => void) => {
      const copy = structuredClone(base);
      change(copy);
      return () => RunMap.parse(copy);
    };
    expect(mutate((m) => { m.floors[0]![0]!.type = 'shop'; })).toThrow(/1층은 전투만/);
    expect(mutate((m) => { m.floors[11]![0]!.type = 'event'; })).toThrow(/12층은 야영지 고정/);
    expect(mutate((m) => { m.floors[2]![0]!.type = 'elite'; })).toThrow(/정예는 4층 이상/);
    expect(mutate((m) => { m.floors[5]![0]!.next = []; })).toThrow(/다음 노드는 1~2개/);
    expect(mutate((m) => { m.floors[5]![0]!.next = ['9-0']; })).toThrow(/다음 층 노드가 아님/);
    expect(mutate((m) => { m.floors.pop(); })).toThrow(/층 수는 13/);
    expect(mutate((m) => { m.floors[3]![0]!.type = 'boss'; })).toThrow(/보스는 13층에만/);
    expect(mutate((m) => { m.floors[0]![0]!.type = 'unknown'; })).toThrow(/type/);
  });
});
