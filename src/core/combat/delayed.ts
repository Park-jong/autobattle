import type { ResolvedEffect } from '../data/effect';
import { BOARD_COLS, BOARD_ROWS, HALF_COLS, chebyshev, type Cell, type Side } from './board';
import { COMBAT } from './constants';
import type { EffectExecutor } from './effects';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

type DelayedStrikeEffect = Extract<ResolvedEffect, { kind: 'delayedStrike' }>;

/** 스킬 예고 id는 보스 패턴(1부터)과 겹치지 않게 이 값부터 매긴다 (ReplayState가 id로 예고와 발동을 짝짓는다) */
const SKILL_TELEGRAPH_ID_BASE = 1000;

/** 카드가 만든 지연 타격의 telegraph/strike source 값 (유닛 uid가 아님) */
export const CARD_STRIKE_SOURCE = -1;

interface PendingStrike {
  id: number;
  fireTick: number;
  /** 스킬이면 시전자(죽으면 취소), 카드면 null */
  caster: CombatUnit | null;
  side: Side;
  cells: Cell[];
  area: { cell: Cell; radius: number } | null;
  effects: readonly ResolvedEffect[];
}

/**
 * 지연 타격 스킬(공성 포병 포격, 화산 예언자 대분화의 예언)의 예약과 발동.
 * 시전 시점에 범위를 정하고 `telegraph` 이벤트로 예고하며, fireTick의 onTick에서 `strike` 이벤트 뒤에 중첩 효과를
 * 시전자 기준으로 실행한다. 시전자가 그 전에 죽으면 `strike`(cancelled)만 남기고 취소한다. Rng를 쓰지 않는다.
 */
export class DelayedStrikes {
  private pending: PendingStrike[] = [];
  private nextId = SKILL_TELEGRAPH_ID_BASE;

  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
  ) {
    world.bus.on('onTick', ({ tick }) => this.onTick(tick));
  }

  schedule(caster: CombatUnit, effect: DelayedStrikeEffect): void {
    const target = effect.area === 'allEnemies' ? this.enemyHalf(caster) : this.densestArea(caster);
    if (!target) return;
    const delayTicks = Math.max(1, Math.round(effect.delay * COMBAT.TICKS_PER_SECOND));
    const strike: PendingStrike = {
      id: this.nextId++,
      fireTick: this.world.tick + delayTicks,
      caster,
      side: caster.side,
      cells: target.cells,
      area: target.area,
      effects: effect.effects,
    };
    this.pending.push(strike);
    this.world.emit({
      type: 'telegraph',
      id: strike.id,
      source: caster.uid,
      pattern: 'skill',
      label: caster.def.skill.name,
      cells: strike.cells,
      fireAt: strike.fireTick / COMBAT.TICKS_PER_SECOND,
    });
  }

  /**
   * 카드용: 카드가 지정한 3×3(또는 한 칸) 범위를 delay초 뒤 친다. 시전자가 없어 취소되지 않으며, 중첩 효과는 카드 진영 기준
   * (selector enemiesInTargetArea)으로 실행된다. 범위 칸은 보드 안의 칸만 예고한다. Rng를 쓰지 않는다.
   */
  scheduleArea(side: Side, area: { cell: Cell; radius: number }, effect: DelayedStrikeEffect, label?: string): void {
    const delayTicks = Math.max(1, Math.round(effect.delay * COMBAT.TICKS_PER_SECOND));
    const cells: Cell[] = [];
    for (let col = area.cell.col - area.radius; col <= area.cell.col + area.radius; col++) {
      for (let row = area.cell.row - area.radius; row <= area.cell.row + area.radius; row++) {
        if (col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS) cells.push({ col, row });
      }
    }
    const strike: PendingStrike = { id: this.nextId++, fireTick: this.world.tick + delayTicks, caster: null, side, cells, area, effects: effect.effects };
    this.pending.push(strike);
    this.world.emit({
      type: 'telegraph',
      id: strike.id,
      source: CARD_STRIKE_SOURCE,
      pattern: 'card',
      ...(label === undefined ? {} : { label }),
      cells,
      fireAt: strike.fireTick / COMBAT.TICKS_PER_SECOND,
    });
  }

  private onTick(tick: number): void {
    if (this.pending.length === 0) return;
    const due = this.pending.filter((p) => p.fireTick <= tick);
    if (due.length === 0) return;
    this.pending = this.pending.filter((p) => p.fireTick > tick);
    for (const strike of due) {
      const source = strike.caster ? strike.caster.uid : CARD_STRIKE_SOURCE;
      if (strike.caster && !strike.caster.alive) {
        this.world.emit({ type: 'strike', id: strike.id, source, cells: strike.cells, cancelled: true });
        continue;
      }
      this.world.emit({ type: 'strike', id: strike.id, source, cells: strike.cells });
      this.executor.execute(strike.effects, { side: strike.side, caster: strike.caster, targets: [], area: strike.area });
    }
  }

  /** 상대 진영 전체 칸 */
  private enemyHalf(caster: CombatUnit): { cells: Cell[]; area: null } | null {
    if (this.world.enemiesOf(caster.side).length === 0) return null;
    const first = caster.side === 0 ? HALF_COLS : 0;
    const cells: Cell[] = [];
    for (let col = first; col < first + HALF_COLS; col++) for (let row = 0; row < BOARD_ROWS; row++) cells.push({ col, row });
    return { cells, area: null };
  }

  /**
   * 적이 가장 많이 들어오는 3×3 범위. 보드 모든 칸을 중심 후보로 세어 가장 많은 쪽, 같으면 시전자에 가까운 쪽,
   * 그래도 같으면 (열, 행) 오름차순. 적이 없으면 null.
   */
  private densestArea(caster: CombatUnit): { cells: Cell[]; area: { cell: Cell; radius: number } } | null {
    const enemies = this.world.enemiesOf(caster.side);
    let best: { cell: Cell; hits: number; distance: number } | null = null;
    for (let col = 0; col < BOARD_COLS; col++) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        const cell = { col, row };
        const hits = enemies.filter((e) => chebyshev(e.cell, cell) <= 1).length;
        if (hits === 0) continue;
        const distance = chebyshev(cell, caster.cell);
        if (!best || hits > best.hits || (hits === best.hits && distance < best.distance)) best = { cell, hits, distance };
      }
    }
    if (!best) return null;
    const center = best.cell;
    const cells: Cell[] = [];
    for (let col = center.col - 1; col <= center.col + 1; col++) {
      for (let row = center.row - 1; row <= center.row + 1; row++) {
        if (col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS) cells.push({ col, row });
      }
    }
    return { cells, area: { cell: center, radius: 1 } };
  }
}
