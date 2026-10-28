import type { EnemyModifiers, FormationEntry, MutationId } from '../combat';
import { MUTATION_IDS, scaledHpAtk } from '../combat';
import type { EncounterCatalog } from '../data/encounterLoader';
import type { EncounterKind } from '../data/encounter';
import type { UnitCatalog } from '../data/unitLoader';
import { Rng } from '../rng';
import { RUN } from './constants';
import type { MapNode } from './runMap';
import { deriveSeed } from './seeds';

/** 미리보기에 보이는 적 유닛 한 기: 층 보정이 반영된 실제 전투 스탯 */
export interface PlannedUnit {
  unitId: string;
  name: string;
  tier: number;
  star: 1 | 2 | 3;
  cell: { col: number; row: number };
  /** 보정 후 최대 HP / ATK (전투 시작 시 spawn 이벤트의 maxHp와 같다) */
  hp: number;
  atk: number;
  as: number;
  range: number;
  arm: number;
  res: number;
  mana: number;
  skillName: string;
  boss: boolean;
}

/** 한 전투 노드의 적 구성. 미리보기와 실제 전투가 같은 계획을 쓴다 */
export interface EncounterPlan {
  nodeId: string;
  floor: number;
  kind: EncounterKind;
  encounterId: string;
  name: string;
  text: string;
  /** 층 보정 배율 (HP·ATK 공통) */
  scale: number;
  mutations: MutationId[];
  /** 시뮬에 넣는 적 편성 (side 1) */
  formation: FormationEntry[];
  /** 시뮬에 넣는 보정 */
  enemy: EnemyModifiers;
  units: PlannedUnit[];
}

/** 층 보정 배율 = 1 + 0.04 × (층 − 1) */
export function floorScale(floor: number): number {
  return 1 + RUN.FLOOR_SCALE_PER_FLOOR * (floor - 1);
}

/**
 * 맵 노드 → 적 편성 계획. 편성 선택·정예 변이는 (런 시드, 노드 id)만으로 결정되는 별도 Rng를 쓰므로
 * 어떤 순서로 방문하거나 미리 보아도 같은 결과이고, 다른 난수(상점·보상·전투)에 영향을 주지 않는다.
 */
export class EncounterPlanner {
  constructor(
    private readonly units: UnitCatalog,
    private readonly encounters: EncounterCatalog,
    private readonly runSeed: number,
  ) {}

  /** 전투·정예·보스 노드만 계획할 수 있다. 그 외 노드는 null */
  plan(node: MapNode): EncounterPlan | null {
    if (node.type !== 'combat' && node.type !== 'elite' && node.type !== 'boss') return null;
    const kind: EncounterKind = node.type === 'combat' ? 'normal' : node.type;
    const candidates = this.encounters.candidates(kind, node.floor);
    if (candidates.length === 0) throw new Error(`${node.floor}층에 쓸 ${kind} 적 편성이 없습니다`);
    const encounter = new Rng(deriveSeed(this.runSeed, 'encounter', node.id)).pick(candidates);

    const scale = floorScale(node.floor);
    const mutations = kind === 'elite' ? this.pickMutations(node) : [];
    const formation: FormationEntry[] = encounter.units.map((u) => ({ unitId: u.unitId, star: u.star, cell: { col: u.col, row: u.row } }));
    const units: PlannedUnit[] = formation.map((entry) => {
      const def = this.units.get(entry.unitId);
      if (!def) throw new Error(`알 수 없는 유닛 "${entry.unitId}"`);
      const scaled = scaledHpAtk(def, entry.star, { hp: scale, atk: scale });
      return {
        unitId: def.id, name: def.name, tier: def.tier, star: entry.star, cell: { ...entry.cell },
        hp: scaled.hp, atk: scaled.atk, as: def.stats.as, range: def.stats.rng, arm: def.stats.arm, res: def.stats.res,
        mana: def.stats.mana, skillName: def.skill.name, boss: def.boss === true,
      };
    });
    return {
      nodeId: node.id, floor: node.floor, kind, encounterId: encounter.id, name: encounter.name, text: encounter.text,
      scale, mutations, formation, units,
      enemy: { hpMult: scale, atkMult: scale, mutations },
    };
  }

  /** 정예 노드마다 결정적으로 1개(확률 ELITE_MUTATION_TWO_CHANCE로 2개), 서로 다른 변이 */
  private pickMutations(node: MapNode): MutationId[] {
    const rng = new Rng(deriveSeed(this.runSeed, 'mutation', node.id));
    const count = rng.next() < RUN.ELITE_MUTATION_TWO_CHANCE ? 2 : 1;
    return rng.shuffle(MUTATION_IDS).slice(0, count);
  }
}
