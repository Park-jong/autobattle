import type { ResolvedEffect } from '../data/effect';
import { chebyshev, frontCol, rayCells, sameCell, type Cell, type Side } from './board';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/** 효과 실행 문맥: 누가(caster), 어느 진영 기준으로(side), 어떤 대상들에게(targets) */
export interface EffectContext {
  side: Side;
  /** 스킬 시전자. 카드·특성처럼 시전자가 없으면 null (damage/burn은 시전자가 필요) */
  caster: CombatUnit | null;
  /** selector "target"이 가리키는 유닛들 (스킬 대상 선택 결과 또는 카드 지정 대상) */
  targets: readonly CombatUnit[];
  /** 칸·범위를 지정하는 카드의 대상 영역 (selector enemiesInTargetArea / alliesInTargetArea). radius 0 = 그 칸만, 1 = 3×3 */
  area?: { cell: Cell; radius: number } | null;
}

/** CP 수급 창구. 심연 같은 CP 획득 효과(cpOnKill)가 사용한다. 카드 시스템이 없는 전투에서는 주지 않는다 */
export interface CpGainSink {
  /** CP를 얻고 상한 때문에 깎인 뒤 실제로 늘어난 양을 반환 */
  gainCp(amount: number, reason: 'abyss'): number;
}

const durationToSeconds = (d: number | 'combat'): number => (d === 'combat' ? Infinity : d);
const statusDuration = (seconds: number): number | 'combat' => (Number.isFinite(seconds) ? seconds : 'combat');

/**
 * 효과 실행기. 카드·스킬·특성이 같은 효과 데이터를 이 클래스로 실행한다.
 * 효과는 목록 순서대로 적용되며, 선택자(selector)는 효과마다 그 시점의 상태로 다시 평가한다.
 */
export class EffectExecutor {
  /** cp: 아군(side 0)의 CP 수급 창구. null이면 cpOnKill 효과는 아무것도 하지 않는다 */
  constructor(
    private readonly world: CombatWorld,
    private readonly cp: CpGainSink | null = null,
  ) {}

  execute(effects: readonly ResolvedEffect[], ctx: EffectContext): void {
    for (const effect of effects) this.apply(effect, ctx);
  }

  /**
   * 시전 전 조건 검사. 통과하면 true.
   * - 순간이동: 대상이 존재하고 이동자마다 목적지가 있어야 함
   * - 위치 교환: 교환할 유닛이 정확히 2명이고 둘 다 이동 중이 아니어야 함
   */
  canExecute(effects: readonly ResolvedEffect[], ctx: EffectContext): boolean {
    return this.checkExecutable(effects, ctx) === null;
  }

  /** canExecute와 같은 검사. 실패하면 한국어 사유, 통과하면 null */
  checkExecutable(effects: readonly ResolvedEffect[], ctx: EffectContext): string | null {
    for (const effect of effects) {
      if (effect.kind === 'teleport') {
        const primary = ctx.targets[0];
        if (!primary || !primary.alive) return '순간이동의 기준이 될 대상이 없습니다';
        for (const mover of this.select(effect.selector, ctx)) {
          if (!this.teleportDestination(mover, primary)) return '순간이동할 빈 칸이 없습니다';
        }
      } else if (effect.kind === 'swapPositions') {
        const units = this.select(effect.selector, ctx);
        if (units.length !== 2) return '위치를 바꿀 유닛이 2명 필요합니다';
        if (units.some((u) => u.moving)) return '이동 중인 유닛은 위치를 바꿀 수 없습니다';
      }
    }
    return null;
  }

  /** 선택자를 유닛 목록으로 변환 (살아 있는 유닛만) */
  select(selector: ResolvedEffect['selector'], ctx: EffectContext): CombatUnit[] {
    const world = this.world;
    switch (selector) {
      case 'target':
        return ctx.targets.filter((u) => u.alive);
      case 'self':
        return ctx.caster && ctx.caster.alive ? [ctx.caster] : [];
      case 'allAllies':
        return world.alliesOf(ctx.side);
      case 'alliesFrontRow':
        return world.alliesOf(ctx.side).filter((u) => u.cell.col === frontCol(ctx.side));
      case 'alliesMelee':
        return world.alliesOf(ctx.side).filter((u) => u.range <= 1);
      case 'lineThroughTarget':
        return this.unitsOnLine(ctx);
      case 'targetAndAdjacent':
        return this.targetAndAdjacent(ctx);
      case 'enemiesInTargetArea':
        return this.unitsInArea(ctx, (u) => u.side !== ctx.side);
      case 'alliesInTargetArea':
        return this.unitsInArea(ctx, (u) => u.side === ctx.side);
    }
  }

  /** 첫 대상과 같은 진영에서 대상 칸에 인접(8방향)한 살아 있는 유닛 + 대상 자신(살아 있으면). 대상이 방금 죽었어도 그 칸 기준으로 계산 */
  private targetAndAdjacent(ctx: EffectContext): CombatUnit[] {
    const primary = ctx.targets[0];
    if (!primary) return [];
    return this.world.units.filter(
      (u) => u.alive && u.side === primary.side && chebyshev(u.cell, primary.cell) <= 1,
    );
  }

  private unitsInArea(ctx: EffectContext, include: (u: CombatUnit) => boolean): CombatUnit[] {
    const area = ctx.area;
    if (!area) return [];
    return this.world.units.filter((u) => u.alive && include(u) && chebyshev(u.cell, area.cell) <= area.radius);
  }

  /** 시전자에서 첫 대상 방향으로 보드 끝까지 뻗는 직선 위의 적 (가까운 순) */
  private unitsOnLine(ctx: EffectContext): CombatUnit[] {
    const primary = ctx.targets[0];
    if (!ctx.caster || !primary) return [];
    const enemies = this.world.enemiesOf(ctx.side);
    const result: CombatUnit[] = [];
    for (const cell of rayCells(ctx.caster.cell, primary.cell)) {
      const hit = enemies.find((e) => sameCell(e.cell, cell));
      if (hit) result.push(hit);
    }
    return result;
  }

  private apply(effect: ResolvedEffect, ctx: EffectContext): void {
    const world = this.world;
    const units = this.select(effect.selector, ctx);
    const sourceUid = ctx.caster ? ctx.caster.uid : null;
    // value가 없는 상태는 value 키 자체를 넣지 않는다 (JSON 비교 안정성)
    const applied = (unit: CombatUnit, status: string, seconds: number, value?: number) =>
      world.emit({
        type: 'statusApplied',
        unit: unit.uid,
        status,
        duration: statusDuration(seconds),
        source: sourceUid,
        ...(value === undefined ? {} : { value }),
      });

    switch (effect.kind) {
      case 'shield':
        for (const u of units) {
          world.addShield(u, Math.round((u.maxHp * effect.pctMaxHp) / 100), durationToSeconds(effect.duration));
        }
        break;

      case 'damageTakenMult': {
        const seconds = durationToSeconds(effect.duration);
        for (const u of units) {
          u.statuses.addTakenMult(effect.mult, world.now + seconds);
          applied(u, 'damageTakenMult', seconds, effect.mult);
        }
        break;
      }

      case 'statMod':
      case 'statAdd': {
        const seconds = durationToSeconds(effect.duration);
        for (const u of units) {
          u.statuses.addStatMod({
            stat: effect.stat,
            pct: effect.kind === 'statMod' ? effect.pct : 0,
            flat: effect.kind === 'statAdd' ? effect.amount : 0,
            until: world.now + seconds,
            duration: seconds,
            refreshOnKill: effect.kind === 'statMod' && effect.refreshOnKill === true,
          });
          applied(u, `statMod:${effect.stat}`, seconds, effect.kind === 'statMod' ? effect.pct : effect.amount);
        }
        break;
      }

      case 'forceTarget': {
        const forced = ctx.targets[0];
        if (!forced) break;
        for (const u of units) {
          u.statuses.setForcedTarget(forced.uid, world.now + effect.duration);
          applied(u, 'forceTarget', effect.duration);
        }
        break;
      }

      case 'undying':
        for (const u of units) {
          u.statuses.addUndying(world.now + effect.duration);
          applied(u, 'undying', effect.duration);
        }
        break;

      case 'swapPositions': {
        const [a, b] = units;
        if (a && b) world.swap(a, b);
        break;
      }

      case 'damage': {
        const caster = this.requireCaster(ctx, 'damage');
        for (const u of units) {
          world.dealDamage({
            source: caster,
            target: u,
            raw: (caster.stat('atk') * effect.pctAtk) / 100,
            type: effect.dmgType,
            ignoreArmorPct: effect.ignoreArmorPct ?? 0,
          });
        }
        break;
      }

      case 'stun':
        for (const u of units) {
          u.statuses.addStun(world.now + effect.duration);
          applied(u, 'stun', effect.duration);
        }
        break;

      case 'heal':
        for (const u of units) world.heal(ctx.caster, u, effect.amount);
        break;

      case 'healAura':
        for (const u of units) {
          u.statuses.addHealAura(effect.perSecond, effect.radius, world.now + effect.duration);
          applied(u, 'healAura', effect.duration, effect.perSecond);
        }
        break;

      case 'burn': {
        // dps(고정값)가 없으면 시전자 ATK 비례. 검증기가 둘 중 정확히 하나를 보장한다
        const caster = effect.dps === undefined ? this.requireCaster(ctx, 'burn') : ctx.caster;
        const dps = effect.dps ?? ((caster as CombatUnit).stat('atk') * (effect.dpsPctAtk ?? 0)) / 100;
        for (const u of units) {
          u.statuses.addBurn(dps, world.now + effect.duration, caster ? caster.uid : null);
          applied(u, 'burn', effect.duration, dps);
        }
        break;
      }

      case 'teleport': {
        const primary = ctx.targets[0];
        if (!primary) break;
        for (const u of units) {
          const cell = this.teleportDestination(u, primary);
          if (cell) world.relocate(u, cell);
        }
        break;
      }

      case 'extraShots':
        for (const u of units) {
          u.statuses.addExtraShots(effect.count);
          applied(u, 'extraShots', Infinity);
        }
        break;

      case 'flatDamage':
        for (const u of units) {
          world.dealDamage({
            source: ctx.caster,
            target: u,
            raw: effect.amount,
            type: effect.dmgType,
            ignoreArmorPct: effect.ignoreArmorPct ?? 0,
          });
        }
        break;

      case 'silence':
        for (const u of units) {
          u.statuses.addSilence(world.now + effect.duration);
          applied(u, 'silence', effect.duration);
        }
        break;

      case 'manaDrain':
        for (const u of units) world.addMana(u, -effect.amount);
        break;

      case 'cpOnKill':
        this.registerCpOnKill(effect.amount, effect.maxPerCombat, ctx.side);
        break;
    }
  }

  /**
   * 심연 같은 "처치 시 CP" 트리거 등록. 해당 진영 유닛이 적을 처치할 때마다 amount만큼 얻고,
   * 실제로 얻은 합계가 limit에 닿으면 멈춘다 (CP 상한 때문에 못 얻은 양은 한도를 소모하지 않음).
   * CP 창구가 없거나 플레이어(side 0)가 아닌 진영이면 등록하지 않는다.
   */
  private registerCpOnKill(amount: number, limit: number, side: Side): void {
    const cp = this.cp;
    if (!cp || side !== 0) return;
    let gained = 0;
    this.world.bus.on('onKill', ({ killer }) => {
      if (!killer || killer.side !== side || gained >= limit) return;
      gained += cp.gainCp(Math.min(amount, limit - gained), 'abyss');
    });
  }

  private requireCaster(ctx: EffectContext, kind: string): CombatUnit {
    if (!ctx.caster) throw new Error(`${kind} 효과는 시전자가 필요함`);
    return ctx.caster;
  }

  /**
   * target의 "뒤" 칸: target에 인접한 빈 칸 중 mover에서 가장 먼 칸.
   * 동률이면 target과 같은 행, 그다음 (열, 행) 오름차순. 빈 칸이 없으면 null.
   */
  teleportDestination(mover: CombatUnit, target: CombatUnit): Cell | null {
    const candidates: Cell[] = [];
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const cell = { col: target.cell.col + dc, row: target.cell.row + dr };
        if (this.world.board.isFree(cell)) candidates.push(cell);
      }
    }
    candidates.sort(
      (a, b) =>
        chebyshev(b, mover.cell) - chebyshev(a, mover.cell) ||
        Math.abs(a.row - target.cell.row) - Math.abs(b.row - target.cell.row) ||
        a.col - b.col ||
        a.row - b.row,
    );
    return candidates[0] ?? null;
  }
}
