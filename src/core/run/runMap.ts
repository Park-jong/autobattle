import { FieldReader } from '../data/fieldReader';
import { RUN } from './constants';

export const NODE_TYPES = ['combat', 'elite', 'shop', 'event', 'camp', 'boss'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** 맵의 노드 한 칸. x는 층 안의 가로 위치(0~1, 표시용), next는 다음 층 노드 id (1~2개) */
export interface MapNode {
  id: string;
  floor: number;
  index: number;
  x: number;
  type: NodeType;
  next: string[];
}

export interface SerializedMap {
  floors: MapNode[][];
}

/** 노드 id. 액트 1은 `층-인덱스`(예: 3-1), 액트 2부터는 액트 접두사가 붙는다(예: a2-3-1) — 액트가 달라도 id가 겹치지 않는다 */
export const nodeId = (floor: number, index: number, act = 1): string => (act === 1 ? `${floor}-${index}` : `a${act}-${floor}-${index}`);

/** 액트와 액트 안 층(1~13)에서 만든 전체 층 번호 (층 보정·패배 피해·적 편성 층 범위의 기준). 액트 1은 층과 같다 */
export const globalFloor = (act: number, floor: number): number => (act - 1) * RUN.MAP.FLOORS + floor;

/** 상점·야영지처럼 연속하면 안 되는 "휴식형" 노드 */
export const isRestType = (type: NodeType): boolean => type === 'shop' || type === 'camp';

/**
 * 한 액트의 13층 분기 맵 (읽기 전용 구조). 구조 불변식은 assertValid가 검사한다:
 * 층 수·층당 노드 수, 고정 층(1층 전투, 12층 야영지, 13층 보스 1개), 정예 층 제한,
 * 간선(다음 층으로만, 노드당 1~2개)·도달 가능성, 상점/야영지 연속 금지.
 */
export class RunMap {
  private readonly byId = new Map<string, MapNode>();

  constructor(readonly floors: readonly (readonly MapNode[])[], readonly act = 1) {
    for (const floor of floors) for (const node of floor) this.byId.set(node.id, node);
  }

  get floorCount(): number {
    return this.floors.length;
  }

  node(id: string): MapNode | undefined {
    return this.byId.get(id);
  }

  /** 1-기반 층 번호 */
  floor(floor: number): readonly MapNode[] {
    return this.floors[floor - 1] ?? [];
  }

  startNodes(): readonly MapNode[] {
    return this.floor(1);
  }

  nextNodes(id: string): MapNode[] {
    const node = this.byId.get(id);
    return node ? node.next.map((nextId) => this.byId.get(nextId)).filter((n): n is MapNode => n !== undefined) : [];
  }

  get bossNode(): MapNode {
    const boss = this.floor(this.floorCount)[0];
    if (!boss) throw new Error('맵에 보스 노드가 없습니다');
    return boss;
  }

  allNodes(): MapNode[] {
    return this.floors.flat();
  }

  /** 노드 종류별 개수 (보스 포함) */
  countByType(): Record<NodeType, number> {
    const counts: Record<NodeType, number> = { combat: 0, elite: 0, shop: 0, event: 0, camp: 0, boss: 0 };
    for (const node of this.allNodes()) counts[node.type]++;
    return counts;
  }

  /** 서로 교차하는 간선 쌍의 수 (같은 층 사이에서 가로 순서가 뒤집히는 경우). 생성기는 0을 보장한다 */
  countCrossings(): number {
    let crossings = 0;
    for (const floor of this.floors) {
      const edges: [number, number][] = [];
      for (const node of floor) for (const nextId of node.next) {
        const target = this.byId.get(nextId);
        if (target) edges.push([node.index, target.index]);
      }
      for (let a = 0; a < edges.length; a++) for (let b = a + 1; b < edges.length; b++) {
        const [ai, aj] = edges[a] as [number, number];
        const [bi, bj] = edges[b] as [number, number];
        if ((ai - bi) * (aj - bj) < 0) crossings++;
      }
    }
    return crossings;
  }

  toJSON(): SerializedMap {
    return { floors: this.floors.map((floor) => floor.map((node) => ({ ...node, next: [...node.next] }))) };
  }

  /** 구조 불변식 검사. 위반하면 한국어 Error */
  assertValid(path = 'map'): void {
    const fail = (message: string): never => {
      throw new Error(`${path}: ${message}`);
    };
    const { FLOORS, MIN_NODES, MAX_NODES, ELITE_MIN_FLOOR, CAMP_FLOOR, BOSS_FLOOR } = RUN.MAP;
    if (this.floors.length !== FLOORS) fail(`층 수는 ${FLOORS}여야 함 (실제: ${this.floors.length})`);

    const incoming = new Map<string, number>();
    this.floors.forEach((nodes, f) => {
      const floor = f + 1;
      if (floor === BOSS_FLOOR) {
        if (nodes.length !== 1 || nodes[0]?.type !== 'boss') fail(`${floor}층은 보스 노드 1개여야 함`);
      } else if (nodes.length < MIN_NODES || nodes.length > MAX_NODES) {
        fail(`${floor}층 노드 수는 ${MIN_NODES}~${MAX_NODES}여야 함 (실제: ${nodes.length})`);
      }
      nodes.forEach((node, index) => {
        if (node.floor !== floor || node.index !== index || node.id !== nodeId(floor, index, this.act)) fail(`노드 ${node.id}의 id/floor/index가 위치와 맞지 않음`);
        if (!NODE_TYPES.includes(node.type)) fail(`노드 ${node.id}의 종류 "${node.type}"를 알 수 없음`);
        if (node.type === 'boss' && floor !== BOSS_FLOOR) fail(`보스는 ${BOSS_FLOOR}층에만 있어야 함 (${node.id})`);
        if (floor === 1 && node.type !== 'combat') fail(`1층은 전투만 허용됨 (${node.id}: ${node.type})`);
        if (node.type === 'elite' && floor < ELITE_MIN_FLOOR) fail(`정예는 ${ELITE_MIN_FLOOR}층 이상에만 허용됨 (${node.id})`);
        if (floor === CAMP_FLOOR && node.type !== 'camp') fail(`${CAMP_FLOOR}층은 야영지 고정 (${node.id}: ${node.type})`);
        if (floor === BOSS_FLOOR) {
          if (node.next.length !== 0) fail('보스 노드는 다음 노드가 없어야 함');
          return;
        }
        if (node.next.length < 1 || node.next.length > 2) fail(`노드 ${node.id}의 다음 노드는 1~2개여야 함 (실제: ${node.next.length})`);
        if (new Set(node.next).size !== node.next.length) fail(`노드 ${node.id}의 다음 노드가 중복됨`);
        for (const nextId of node.next) {
          const target = this.byId.get(nextId);
          if (!target || target.floor !== floor + 1) fail(`노드 ${node.id}의 간선 ${nextId}가 다음 층 노드가 아님`);
          incoming.set(nextId, (incoming.get(nextId) ?? 0) + 1);
          if (isRestType(node.type) && isRestType((target as MapNode).type)) fail(`상점/야영지가 연속됨: ${node.id} → ${nextId}`);
        }
      });
    });
    for (const node of this.allNodes()) {
      if (node.floor > 1 && (incoming.get(node.id) ?? 0) === 0) fail(`노드 ${node.id}에 도달할 수 없음 (들어오는 간선 없음)`);
    }
  }

  /** 저장된 맵을 읽어 검증한다. 형식이 틀리면 위치가 담긴 DataValidationError, 불변식이 깨지면 Error */
  static parse(data: unknown, path = 'map', act = 1): RunMap {
    const root = FieldReader.of(data, path);
    root.onlyKeys(['floors']);
    const floors = root.array('floors').map((rawFloor, f) => {
      if (!Array.isArray(rawFloor)) root.fail(`floors[${f}]`, '노드 배열이어야 함');
      return (rawFloor as unknown[]).map((raw, i) => {
        const r = FieldReader.of(raw, `${path}.floors[${f}][${i}]`);
        r.onlyKeys(['id', 'floor', 'index', 'x', 'type', 'next']);
        const next = r.array('next').map((id, j) => {
          if (typeof id !== 'string') r.fail(`next[${j}]`, '노드 id 문자열이어야 함');
          return id as string;
        });
        return {
          id: r.string('id'), floor: r.int('floor', 1), index: r.int('index', 0), x: r.number('x', 0),
          type: r.enum('type', NODE_TYPES), next,
        } satisfies MapNode;
      });
    });
    const map = new RunMap(floors, act);
    map.assertValid(path);
    return map;
  }
}
