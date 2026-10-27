import { resolveEffect, type CombatStat, type ResolvedEffect } from '../data/effect';
import type { UnitDef } from '../data/unit';
import type { Cell, Side } from './board';
import { COMBAT } from './constants';
import { StatusSet } from './statuses';

/** 진행 중인 1칸 이동 */
export interface MoveInProgress {
  from: Cell;
  to: Cell;
  arriveAt: number;
}

/** 전투 중인 유닛 인스턴스의 가변 상태 */
export class CombatUnit {
  maxHp: number;
  readonly equipment: string[] = [];
  temporary = false;
  rangeBonus = 0;
  volleyChance = 0;
  readonly statuses: StatusSet;
  /** 성급이 확정된 스킬 효과 */
  readonly skillEffects: readonly ResolvedEffect[];
  readonly startCell: Cell;

  hp: number;
  mana = 0;
  alive = true;
  /** 현재(논리) 칸. 이동 중에는 출발 칸이며 도착 시점에 바뀐다 */
  cell: Cell;
  moving: MoveInProgress | null = null;
  /** 다음 행동(공격/스킬)이 가능한 시각 */
  attackReadyAt = 0;
  /** 경로가 막혔을 때 재탐색 가능 시각 */
  retryAt = 0;

  private readonly baseStats: Record<CombatStat, number>;

  constructor(
    readonly uid: number,
    readonly side: Side,
    readonly def: UnitDef,
    readonly star: number,
    cell: Cell,
    clock: () => number,
  ) {
    const mult = COMBAT.STAR_MULTIPLIER[star - 1];
    if (mult === undefined) throw new Error(`잘못된 성급: ${star}`);
    this.maxHp = Math.round(def.stats.hp * mult);
    this.hp = this.maxHp;
    this.baseStats = {
      atk: Math.round(def.stats.atk * mult),
      as: def.stats.as,
      arm: def.stats.arm,
      res: def.stats.res,
    };
    this.cell = cell;
    this.startCell = cell;
    this.statuses = new StatusSet(clock);
    this.skillEffects = def.skill.effects.map((e) => resolveEffect(e, star - 1));
  }

  get maxMana(): number {
    return this.def.stats.mana;
  }

  /** 사거리 (칸) */
  get range(): number {
    return this.def.stats.rng + this.rangeBonus;
  }

  /** 버프를 반영한 현재 스탯 */
  stat(name: CombatStat): number {
    const { flat, pct } = this.statuses.statBonus(name);
    const value = (this.baseStats[name] + flat) * (1 + pct / 100);
    return name === 'as' ? Math.max(0.1, value) : Math.max(0, value);
  }
}
