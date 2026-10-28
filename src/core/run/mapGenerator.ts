import { Rng } from '../rng';
import { RUN } from './constants';
import { isRestType, nodeId, RunMap, type MapNode, type NodeType } from './runMap';
import { deriveSeed } from './seeds';

type FreeType = Exclude<NodeType, 'boss'>;
const FREE_TYPES: readonly FreeType[] = ['combat', 'elite', 'shop', 'event', 'camp'];

/**
 * 한 액트의 13층 분기 맵 생성기. 같은 (시드, 액트)면 같은 맵이다 (맵 전용 Rng 사용).
 *
 * 구조: 층 1~12는 노드 2~4개, 13층은 보스 1개. 인접한 두 층은 가로 순서를 유지하는(교차 없는) 간선으로 잇는다.
 * 노드 수가 많은 쪽의 노드마다 반대쪽 노드 하나에 연결하는 단조 전사(全射)로 모든 노드의 연결을 보장하고
 * (노드당 다음 노드 1~2개), 간선이 1개뿐인 노드는 확률적으로 인접 노드 쪽으로 교차하지 않는 간선을 하나 더 이는다.
 *
 * 종류: 1층 전투만, 12층 야영지 전부, 13층 보스. 나머지(2~11층)는 목표 비율(RUN.MAP.RATIOS)을
 * 보스 제외 전체 노드 수에 맞춘 "개수 할당"으로 채우므로 시드마다 비율이 거의 같다. 규칙:
 * 정예는 4층 이상, 간선으로 이어진 두 노드가 모두 상점/야영지인 경우 금지 (할당이 막히면 규칙을 지키는 다른 종류로 대체).
 */
export class MapGenerator {
  /** act 1은 기존과 같은 시드 파생(deriveSeed(seed, 'map')), 액트 2부터는 액트 번호를 더해 파생한다 */
  generate(seed: number, act = 1): RunMap {
    const rng = new Rng(act === 1 ? deriveSeed(seed, 'map') : deriveSeed(seed, 'map', act));
    const { FLOORS, MIN_NODES, MAX_NODES, CAMP_FLOOR, BOSS_FLOOR } = RUN.MAP;

    const counts = Array.from({ length: FLOORS }, (_, f) => (f + 1 === BOSS_FLOOR ? 1 : rng.int(MIN_NODES, MAX_NODES)));
    // edges[f][i] = (f+1)층에서 (f+2)층 노드 인덱스들
    const edges: number[][][] = [];
    for (let f = 0; f < FLOORS - 1; f++) edges.push(this.connect(counts[f] as number, counts[f + 1] as number, rng));

    const types: (NodeType | null)[][] = counts.map((count) => Array<NodeType | null>(count).fill(null));
    (types[0] as (NodeType | null)[]).fill('combat');
    (types[CAMP_FLOOR - 1] as (NodeType | null)[]).fill('camp');
    (types[BOSS_FLOOR - 1] as (NodeType | null)[]).fill('boss');
    this.assignTypes(counts, edges, types, rng);

    const floors: MapNode[][] = counts.map((count, f) =>
      Array.from({ length: count }, (_, i) => ({
        id: nodeId(f + 1, i, act),
        floor: f + 1,
        index: i,
        x: (i + 0.5) / count,
        type: types[f]?.[i] as NodeType,
        next: (edges[f]?.[i] ?? []).map((j) => nodeId(f + 2, j, act)),
      })),
    );
    const map = new RunMap(floors, act);
    map.assertValid();
    return map;
  }

  // ---- 간선 ----

  /** a개 노드 층과 b개 노드 층을 교차 없이 잇는다. 반환: 아래 층 노드 i가 잇는 위 층 노드 인덱스 목록 */
  private connect(a: number, b: number, rng: Rng): number[][] {
    let out: number[][];
    if (b === 1) {
      out = Array.from({ length: a }, () => [0]);
    } else if (a >= b) {
      // 아래 층 노드를 b개의 연속 묶음으로 나눠 각 묶음이 위 층 노드 하나에 연결
      const sizes = this.composition(a, b, Infinity, rng);
      out = [];
      sizes.forEach((size, j) => {
        for (let k = 0; k < size; k++) out.push([j]);
      });
    } else {
      // 위 층 노드를 a개의 연속 묶음(최대 2개)으로 나눠 각 아래 노드가 한 묶음에 연결
      const sizes = this.composition(b, a, 2, rng);
      let j = 0;
      out = sizes.map((size) => Array.from({ length: size }, () => j++));
    }
    for (let i = 0; i < a; i++) {
      const list = out[i] as number[];
      if (list.length !== 1 || rng.next() >= RUN.MAP.EXTRA_EDGE_CHANCE) continue;
      const only = list[0] as number;
      const candidates = [only - 1, only + 1].filter((j) => j >= 0 && j < b && !this.crosses(out, i, j));
      if (candidates.length === 0) continue;
      list.push(rng.pick(candidates));
      list.sort((x, y) => x - y);
    }
    return out;
  }

  /** total을 parts개의 양의 정수(각 최대 max)로 무작위 분할 */
  private composition(total: number, parts: number, max: number, rng: Rng): number[] {
    const sizes = Array<number>(parts).fill(1);
    let remaining = total - parts;
    while (remaining > 0) {
      const index = rng.int(0, parts - 1);
      if ((sizes[index] as number) >= max) continue;
      sizes[index] = (sizes[index] as number) + 1;
      remaining--;
    }
    return sizes;
  }

  /** (i → j) 간선을 추가하면 기존 간선과 교차하는가 */
  private crosses(out: readonly number[][], i: number, j: number): boolean {
    return out.some((targets, other) => other !== i && targets.some((t) => (other - i) * (t - j) < 0));
  }

  // ---- 노드 종류 ----

  private assignTypes(counts: readonly number[], edges: readonly number[][][], types: (NodeType | null)[][], rng: Rng): void {
    const { ELITE_MIN_FLOOR, CAMP_FLOOR, FLOORS } = RUN.MAP;
    const quota = this.freeQuota(counts);

    // 인접 노드 조회 (부모 = 이전 층에서 이 노드로 오는 노드)
    const parents = (f: number, i: number): number[] =>
      (edges[f - 1] ?? []).flatMap((targets, from) => (targets.includes(i) ? [from] : []));
    const touchesRest = (f: number, i: number): boolean => {
      const upper = (edges[f]?.[i] ?? []).some((j) => isRestType((types[f + 1]?.[j] ?? 'combat') as NodeType));
      const lower = f > 0 && parents(f, i).some((from) => isRestType((types[f - 1]?.[from] ?? 'combat') as NodeType));
      return upper || lower;
    };
    const canPlace = (type: FreeType, f: number, i: number): boolean => {
      if (type === 'elite' && f + 1 < ELITE_MIN_FLOOR) return false;
      if (isRestType(type) && touchesRest(f, i)) return false;
      return true;
    };

    const slots: { f: number; i: number }[] = [];
    for (let f = 1; f < CAMP_FLOOR - 1 && f < FLOORS; f++) {
      for (let i = 0; i < (counts[f] as number); i++) slots.push({ f, i });
    }
    for (const { f, i } of rng.shuffle(slots)) {
      let options = FREE_TYPES.filter((t) => quota[t] > 0 && canPlace(t, f, i));
      let weights = options.map((t) => quota[t]);
      if (options.length === 0) {
        // 할당이 막힌 자리: 규칙을 지키는 종류를 목표 비율로 고른다
        options = FREE_TYPES.filter((t) => canPlace(t, f, i));
        weights = options.map((t) => RUN.MAP.RATIOS[t]);
      }
      const type = this.weighted(options, weights, rng);
      (types[f] as (NodeType | null)[])[i] = type;
      if (quota[type] > 0) quota[type]--;
    }
  }

  /** 2~11층 자리에 채울 종류별 개수: 전체(보스 제외) 목표 비율에서 고정 층(1층 전투, 12층 야영지) 몫을 뺀 값 */
  private freeQuota(counts: readonly number[]): Record<FreeType, number> {
    const { CAMP_FLOOR, BOSS_FLOOR } = RUN.MAP;
    const nonBoss = counts.slice(0, BOSS_FLOOR - 1).reduce((sum, n) => sum + n, 0);
    const target = {} as Record<FreeType, number>;
    const fractions: { type: FreeType; frac: number }[] = [];
    let assigned = 0;
    for (const type of FREE_TYPES) {
      const exact = (nonBoss * RUN.MAP.RATIOS[type]) / 100;
      target[type] = Math.floor(exact);
      assigned += target[type];
      fractions.push({ type, frac: exact - Math.floor(exact) });
    }
    fractions.sort((x, y) => y.frac - x.frac);
    for (let k = 0; assigned < nonBoss; k++, assigned++) target[(fractions[k % fractions.length] as { type: FreeType }).type]++;

    const quota = { ...target };
    quota.combat = Math.max(0, quota.combat - (counts[0] as number));
    quota.camp = Math.max(0, quota.camp - (counts[CAMP_FLOOR - 1] as number));
    const freeCount = counts.slice(1, CAMP_FLOOR - 1).reduce((sum, n) => sum + n, 0);
    let total = FREE_TYPES.reduce((sum, t) => sum + quota[t], 0);
    while (total > freeCount) {
      const largest = FREE_TYPES.reduce((best, t) => (quota[t] > quota[best] ? t : best), 'combat' as FreeType);
      quota[largest]--;
      total--;
    }
    quota.combat += freeCount - total;
    return quota;
  }

  private weighted<T>(options: readonly T[], weights: readonly number[], rng: Rng): T {
    const sum = weights.reduce((s, w) => s + w, 0);
    let roll = rng.next() * sum;
    for (let k = 0; k < options.length; k++) {
      roll -= weights[k] as number;
      if (roll < 0) return options[k] as T;
    }
    return options[options.length - 1] as T;
  }
}
