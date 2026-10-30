import type { EnemyModifiers, FormationEntry, MutationId } from '../combat';
import { describeBossPattern, MUTATION_IDS, scaledHpAtk, type BossPatternInfo } from '../combat';
import type { EncounterCatalog } from '../data/encounterLoader';
import type { EncounterKind } from '../data/encounter';
import type { UnitCatalog } from '../data/unitLoader';
import { Rng } from '../rng';
import { RUN } from './constants';
import { globalFloor, type MapNode } from './runMap';
import { deriveSeed } from './seeds';
import type { ThreatRules } from './threatRules';

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
  /** 액트 (1부터) */
  act: number;
  /** 액트 안의 층 (1~13) */
  floor: number;
  /** 전체 층 = (액트 − 1) × 13 + 층. 층 보정·편성 층 범위의 기준 */
  globalFloor: number;
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
  /** 보스 패턴 설명 (보스 유닛이 있을 때만, 편성 순서대로) */
  bossPatterns: BossPatternInfo[];
}

/** 층 보정 배율 = 1 + 0.03 × (전체 층 − 1). 액트 1은 층 번호 그대로다 */
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
    /** 위협 레벨 패널티 (적 스탯·정예 변이 수). 생략하면 레벨 0과 같다 */
    private readonly threat?: ThreatRules,
  ) {}

  /** 전투·정예·보스 노드만 계획할 수 있다. 그 외 노드는 null */
  plan(node: MapNode, act = 1): EncounterPlan | null {
    if (node.type !== 'combat' && node.type !== 'elite' && node.type !== 'boss') return null;
    const kind: EncounterKind = node.type === 'combat' ? 'normal' : node.type;
    const total = globalFloor(act, node.floor);
    const candidates = this.encounters.candidates(kind, total);
    if (candidates.length === 0) throw new Error(`액트 ${act} ${node.floor}층(전체 ${total}층)에 쓸 ${kind} 적 편성이 없습니다`);
    const encounter = new Rng(deriveSeed(this.runSeed, 'encounter', node.id)).pick(candidates);

    const scale = floorScale(total);
    // 위협 레벨: 층 보정에 종류별 HP·ATK 배율을 곱한다 (레벨 0이면 둘 다 정확히 층 보정 그대로)
    const threatMult = this.threat?.enemyMult(kind) ?? { hp: 1, atk: 1 };
    const hpMult = scale * threatMult.hp;
    const atkMult = scale * threatMult.atk;
    const mutations = kind === 'elite' ? this.pickMutations(node) : [];
    const formation: FormationEntry[] = encounter.units.map((u) => ({ unitId: u.unitId, star: u.star, cell: { col: u.col, row: u.row } }));
    const units: PlannedUnit[] = formation.map((entry) => {
      const def = this.units.get(entry.unitId);
      if (!def) throw new Error(`알 수 없는 유닛 "${entry.unitId}"`);
      const scaled = scaledHpAtk(def, entry.star, { hp: hpMult, atk: atkMult });
      return {
        unitId: def.id, name: def.name, tier: def.tier, star: entry.star, cell: { ...entry.cell },
        hp: scaled.hp, atk: scaled.atk, as: def.stats.as, range: def.stats.rng, arm: def.stats.arm, res: def.stats.res,
        mana: def.stats.mana, skillName: def.skill.name, boss: def.boss === true,
      };
    });
    // 보스 패턴 설명: 같은 패턴은 한 번만 (쌍둥이는 한 쌍에 하나)
    const described = new Set<string>();
    const bossPatterns = formation.flatMap((entry) => {
      const def = this.units.get(entry.unitId);
      if (!def?.boss || !def.pattern) return [];
      const key = def.pattern.kind === 'twinRevive' ? [def.id, def.pattern.partner].sort().join('|') : def.id;
      if (described.has(key)) return [];
      described.add(key);
      const info = describeBossPattern(def, this.units);
      return info ? [info] : [];
    });
    return {
      nodeId: node.id, act, floor: node.floor, globalFloor: total, kind, encounterId: encounter.id, name: encounter.name, text: encounter.text,
      scale, mutations, formation, units, bossPatterns,
      enemy: { hpMult, atkMult, mutations },
    };
  }

  /**
   * 정예 노드마다 결정적으로 ELITE_MUTATION_COUNT개(1개), 서로 다른 변이.
   * 위협 레벨의 최소 변이 수가 더 크면 그 수로 올린다 (난수 사용은 그대로라 같은 노드의 변이 종류 순서는 변하지 않는다)
   */
  private pickMutations(node: MapNode): MutationId[] {
    const rng = new Rng(deriveSeed(this.runSeed, 'mutation', node.id));
    rng.next(); // 예전 "2개 확률" 판정 자리: 소비를 유지해 기존 시드·저장본의 첫 변이 종류가 그대로다
    const count = Math.max(RUN.ELITE_MUTATION_COUNT, this.threat?.eliteMutationsMin ?? 0);
    return rng.shuffle(MUTATION_IDS).slice(0, count);
  }
}
