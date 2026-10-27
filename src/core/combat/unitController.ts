import { chebyshev } from './board';
import { COMBAT } from './constants';
import type { EffectExecutor } from './effects';
import { findPath } from './pathfinding';
import { SKILL_TARGET_RESOLVERS, TargetSelector } from './targeting';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/**
 * 유닛 한 틱의 행동 결정: (이동 도착 처리) → 기절이면 정지 → 타겟 선택 →
 * 마나가 가득이고 침묵이 아니면 스킬 → 사거리 안이면 공격 → 아니면 이동.
 */
export class UnitController {
  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
    private readonly targeting: TargetSelector = new TargetSelector(),
  ) {}

  act(unit: CombatUnit): void {
    if (!unit.alive) return;
    this.finishMoveIfArrived(unit);
    if (unit.moving) return;
    if (unit.statuses.isStunned()) return;

    const target = this.targeting.pick(unit, this.world);
    if (!target) return;

    const ready = this.world.now >= unit.attackReadyAt - COMBAT.EPS;
    if (ready && unit.mana >= unit.maxMana && !unit.statuses.isSilenced() && this.tryCastSkill(unit, target)) return;

    if (chebyshev(unit.cell, target.cell) <= unit.range) {
      if (ready) this.attack(unit, target);
      return;
    }
    this.advance(unit, target);
  }

  // ---- 이동 ----

  /** 이동 중에 기절해도 이미 시작한 1칸 이동은 끝낸다. */
  private finishMoveIfArrived(unit: CombatUnit): void {
    const move = unit.moving;
    if (!move || this.world.now < move.arriveAt - COMBAT.EPS) return;
    this.world.board.completeMove(unit.uid, move.from, move.to);
    unit.cell = move.to;
    unit.moving = null;
    this.world.emit({ type: 'moveEnd', unit: unit.uid, cell: move.to });
  }

  /** 대상을 향해 1칸 이동 시작. 경로가 막혀 있으면 잠시 대기 후 재탐색한다. */
  private advance(unit: CombatUnit, target: CombatUnit): void {
    const world = this.world;
    if (world.now < unit.retryAt - COMBAT.EPS) return;

    const board = world.board;
    // 1차: 빈 칸만 통과. 2차(완화): 다른 유닛이 있는 칸도 비용을 더해 통과 (줄 선 동료 뒤에서 길을 찾기 위함)
    const path =
      findPath(unit.cell, target.cell, unit.range, (c) => (board.isFree(c) ? 1 : null)) ??
      findPath(unit.cell, target.cell, unit.range, (c) => (board.isFree(c) ? 1 : 1 + COMBAT.OCCUPIED_PATH_PENALTY));

    const next = path?.[0];
    if (!next || !board.isFree(next)) {
      unit.retryAt = world.now + COMBAT.BLOCKED_RETRY_SECONDS;
      return;
    }

    board.reserve(unit.uid, next);
    unit.moving = { from: unit.cell, to: next, arriveAt: world.now + COMBAT.MOVE_SECONDS_PER_CELL };
    world.emit({
      type: 'moveStart',
      unit: unit.uid,
      from: unit.cell,
      to: next,
      duration: COMBAT.MOVE_SECONDS_PER_CELL,
    });
  }

  // ---- 공격 ----

  private attack(unit: CombatUnit, target: CombatUnit): void {
    const world = this.world;
    const shots = unit.statuses.consumeExtraShot() ? 2 : 1;
    if (shots === 2 && unit.statuses.extraShots === 0) {
      world.emit({ type: 'statusRemoved', unit: unit.uid, status: 'extraShots' });
    }
    world.emit({ type: 'attack', unit: unit.uid, target: target.uid, shots });
    world.bus.emit('onAttack', { attacker: unit, target, shots });
    for (let i = 0; i < shots; i++) {
      world.dealDamage({ source: unit, target, raw: unit.stat('atk'), type: 'physical' });
    }
    this.scheduleNextAction(unit);
  }

  // ---- 스킬 ----

  /** 시전했으면 true. 대상이 없거나 사거리 밖이거나 순간이동 목적지가 없으면 false */
  private tryCastSkill(unit: CombatUnit, attackTarget: CombatUnit): boolean {
    const world = this.world;
    const skill = unit.def.skill;
    const resolver = SKILL_TARGET_RESOLVERS[skill.targeting];
    const targets = resolver.resolve(unit, attackTarget, world);
    const primary = targets[0];
    if (!primary) return false;
    if (resolver.requiresRange && chebyshev(unit.cell, primary.cell) > unit.range) return false;

    // 시전 전 조건(순간이동 목적지 등)이 안 맞으면 시전하지 않는다: 마나 유지, 다음 틱에 재판정
    const ctx = { side: unit.side, caster: unit, targets };
    if (!this.executor.canExecute(unit.skillEffects, ctx)) return false;

    world.emit({ type: 'skillCast', unit: unit.uid, skill: skill.name, targets: targets.map((t) => t.uid) });
    world.setMana(unit, 0);
    world.bus.emit('onSkillCast', { caster: unit, skillName: skill.name, targets });
    this.executor.execute(unit.skillEffects, ctx);
    this.scheduleNextAction(unit);
    return true;
  }

  /** 다음 행동 시각 = 이전 예정 시각(오차 이월) 또는 지금 + 1/AS */
  private scheduleNextAction(unit: CombatUnit): void {
    const now = this.world.now;
    const interval = 1 / unit.stat('as');
    const base = now - unit.attackReadyAt < COMBAT.TICK_SECONDS - COMBAT.EPS ? unit.attackReadyAt : now;
    unit.attackReadyAt = base + interval;
  }
}
