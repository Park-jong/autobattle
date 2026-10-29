import type { ResolvedEffect, SummonPlacement, TeleportDestination } from '../data/effect';
import type { Deck } from '../cards/deck';
import { backCol, BOARD_ROWS, chebyshev, fanRays, frontCol, HALF_COLS, rayCells, sameCell, type Cell, type Side } from './board';
import { COMBAT } from './constants';
import { DelayedStrikes } from './delayed';
import { GroundZones } from './zones';
import type { UnitCatalog } from '../data/unitLoader';
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
  /** 이 효과를 실행하는 카드 (카드 사용일 때만). 카드 전용 효과가 이벤트에 카드를 밝히거나 CP 이유를 정할 때 쓴다 */
  card?: { cardId: string; instanceId: number; name: string };
}

/** CP 수급 창구. 심연 같은 CP 획득 효과(cpOnKill)가 사용한다. 카드 시스템이 없는 전투에서는 주지 않는다 */
export interface CpGainSink {
  /** CP를 얻고 상한 때문에 깎인 뒤 실제로 늘어난 양을 반환 */
  gainCp(amount: number, reason: 'abyss' | 'effect'): number;
  /** 이번 전투의 시작 CP 보정을 늘린다 (준비 단계 작전 카드). 전투 CP는 전투가 시작될 때 이 값이 반영된다 */
  addStartCp(amount: number): void;
}

/** 궁극기 게이지 창구 (카드의 ultimateGain). 궁극기가 없거나 이미 썼으면 0을 돌려준다 */
export interface UltimateGainSink {
  /** 게이지를 올리고 실제로 늘어난 양을 반환 (최대 100) */
  gainUltimate(amount: number): number;
}

/** 이번 전투의 주문 피해 보정 창구 (카드의 spellDamageBoost) */
export interface SpellBoostSink {
  addSpellDamagePct(pct: number): void;
}

/** 지휘관 HP 회복 예약 창구 (카드의 commanderHeal). 전투에서 이기면 런이 확정한다 */
export interface CommanderHealSink {
  reserveHeal(amount: number): void;
}

/** 카드 확장 효과가 쓰는 선택 창구 모음. 카드 시스템이 없는 전투에서는 비어 있다 */
export interface EffectSinks {
  ultimate?: UltimateGainSink;
  spellBoost?: SpellBoostSink;
  commanderHeal?: CommanderHealSink;
}

/** 손패 카드 비용 조정 창구. 주술사 특성(handCostReduction)이 사용한다. 카드 시스템이 없는 전투에서는 주지 않는다 */
export interface HandCostSink {
  /**
   * 손패에서 비용이 1 이상인 카드 중 sim Rng로 한 장을 골라 비용을 amount만큼(최소 0까지) 줄인다.
   * 줄였으면 그 카드와 누적 조정값·실제로 줄어든 양, 줄일 카드가 없으면 null (Rng도 쓰지 않는다)
   */
  reduceRandomCost(amount: number): { instanceId: number; cardId: string; surcharge: number; delta: number } | null;
}

const SUMMON_PLACEMENT_LABELS: Record<SummonPlacement, string> = { allyBack: '후열', allyFront: '전열', enemyBack: '적 후열' };

const durationToSeconds = (d: number | 'combat'): number => (d === 'combat' ? Infinity : d);
const statusDuration = (seconds: number): number | 'combat' => (Number.isFinite(seconds) ? seconds : 'combat');

/**
 * 효과 실행기. 카드·스킬·특성이 같은 효과 데이터를 이 클래스로 실행한다.
 * 효과는 목록 순서대로 적용되며, 선택자(selector)는 효과마다 그 시점의 상태로 다시 평가한다.
 */
export class EffectExecutor {
  private delayedStrikes: DelayedStrikes | null = null;
  private zones: GroundZones | null = null;
  /** 스킬로 CP를 얻은 횟수 (시전 유닛 uid별) */
  private readonly skillCpUses = new Map<number, number>();

  /** cp: 아군(side 0)의 CP 수급 창구. null이면 cpOnKill 효과는 아무것도 하지 않는다. handCost: 손패 비용 조정 창구(없으면 주술사 특성은 비용을 건드리지 않는다) */
  constructor(
    private readonly world: CombatWorld,
    private readonly cp: CpGainSink | null = null,
    private readonly deck: Deck | null = null,
    private readonly catalog: UnitCatalog | null = null,
    private readonly handCost: HandCostSink | null = null,
    private readonly sinks: EffectSinks = {},
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
      if (effect.kind === 'summon') {
        if (effect.unitId !== undefined) {
          const def = this.catalog?.get(effect.unitId);
          if (!def || def.boss) return `징집할 유닛 "${effect.unitId}"을(를) 찾을 수 없습니다`;
          const placement = effect.placement ?? 'allyBack';
          if (this.summonCells(ctx.side, placement).length < effect.count) {
            return `${SUMMON_PLACEMENT_LABELS[placement]}에 빈 칸 ${effect.count}개가 필요합니다`;
          }
        } else {
          if (!this.catalog?.units.some((u) => !u.boss && u.tier === effect.tier)) return '징집할 등급의 유닛이 없습니다';
          if (this.summonCells(ctx.side).length < effect.count) return `후열에 빈 칸 ${effect.count}개가 필요합니다`;
        }
      }
      if (effect.kind === 'teleport') {
        const primary = ctx.targets[0];
        if (!primary || !primary.alive) return '순간이동의 기준이 될 대상이 없습니다';
        for (const mover of this.select(effect.selector, ctx, effect.selectorRadius ?? 1)) {
          if (!this.teleportDestination(mover, primary, effect.destination)) return '순간이동할 빈 칸이 없습니다';
        }
      } else if (effect.kind === 'swapPositions') {
        const units = this.select(effect.selector, ctx, effect.selectorRadius ?? 1);
        if (units.length !== 2) return '위치를 바꿀 유닛이 2명 필요합니다';
        if (units.some((u) => u.moving)) return '이동 중인 유닛은 위치를 바꿀 수 없습니다';
      }
    }
    return null;
  }

  /** 선택자를 유닛 목록으로 변환 (살아 있는 유닛만) */
  select(selector: ResolvedEffect['selector'], ctx: EffectContext, radius = 1): CombatUnit[] {
    const world = this.world;
    switch (selector) {
      case 'alliesAroundSelf': {
        const caster = ctx.caster;
        return caster ? world.alliesOf(ctx.side).filter((u) => chebyshev(u.cell, caster.cell) <= radius) : [];
      }
      case 'enemiesAroundSelf': {
        const caster = ctx.caster;
        return caster ? world.enemiesOf(ctx.side).filter((u) => chebyshev(u.cell, caster.cell) <= radius) : [];
      }
      case 'allEnemies':
        return world.enemiesOf(ctx.side);
      case 'fanArrows':
        return this.fanHits(ctx);
      case 'fanTargets':
        return [...new Set(this.fanHits(ctx))];
      case 'traitUnits': return ctx.targets.filter((u) => u.alive);
      case 'selfAndAdjacent': return ctx.caster ? world.alliesOf(ctx.side).filter((u) => chebyshev(u.cell, (ctx.caster as CombatUnit).cell) <= 1) : [];
      case 'targetArea2x2': {
        const target = ctx.targets[0];
        return target ? world.enemiesOf(ctx.side).filter((u) => u.cell.col >= target.cell.col && u.cell.col <= target.cell.col + 1 && u.cell.row >= target.cell.row && u.cell.row <= target.cell.row + 1) : [];
      }
      case 'target':
        return ctx.targets.filter((u) => u.alive);
      case 'self':
        return ctx.caster && ctx.caster.alive ? [ctx.caster] : [];
      case 'allAllies':
        return world.alliesOf(ctx.side);
      case 'alliesFrontRow':
        return world.alliesOf(ctx.side).filter((u) => u.cell.col === frontCol(ctx.side));
      case 'alliesBackRow':
        return world.alliesOf(ctx.side).filter((u) => u.cell.col === backCol(ctx.side));
      case 'randomAlly': {
        const allies = world.alliesOf(ctx.side);
        return allies.length === 0 ? [] : [world.rng.pick(allies)];
      }
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

  /** 부채꼴 화살 5발이 각각 처음 맞히는 적 (화살 순서, 같은 적이 여러 번 나올 수 있음) */
  private fanHits(ctx: EffectContext): CombatUnit[] {
    const primary = ctx.targets[0];
    if (!ctx.caster || !primary) return [];
    const enemies = this.world.enemiesOf(ctx.side);
    const hits: CombatUnit[] = [];
    for (const ray of fanRays(ctx.caster.cell, primary.cell)) {
      for (const cell of ray) {
        const hit = enemies.find((e) => sameCell(e.cell, cell));
        if (hit) {
          hits.push(hit);
          break;
        }
      }
    }
    return hits;
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
    const units = this.select(effect.selector, ctx, effect.selectorRadius ?? 1);
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
      case 'root':
        for (const u of units) { u.statuses.addRoot(world.now + effect.duration); applied(u, 'root', effect.duration); }
        break;
      case 'hpCost':
        for (const u of units) {
          const amount = Math.min(u.hp - 1, Math.round(u.maxHp * effect.pctMaxHp / 100));
          u.hp -= amount;
          world.emit({ type: 'damage', unit: u.uid, source: u.uid, amount, absorbed: 0, dmgType: 'magic', hp: u.hp });
        }
        break;
      case 'lifesteal':
        for (const u of units) {
          const seconds = durationToSeconds(effect.duration);
          u.statuses.addLifesteal(effect.pct, world.now + seconds);
          applied(u, 'lifesteal', seconds, effect.pct);
        }
        break;
      case 'onAttackBurn': {
        const members = new Set(units.map((u) => u.uid));
        world.bus.on('onAttack', ({ attacker, target }) => {
          if (!members.has(attacker.uid) || !target.alive) return;
          const dps = attacker.stat('atk') * effect.pctAtk / 100;
          target.statuses.addBurn(dps, world.now + effect.duration, attacker.uid);
          world.emit({ type: 'statusApplied', unit: target.uid, status: 'burn', source: attacker.uid, value: dps, duration: effect.duration });
        });
        break;
      }
      case 'killFeast': {
        const members = new Set(units.map((u) => u.uid));
        world.bus.on('onKill', ({ killer }) => {
          if (!killer?.alive || !members.has(killer.uid)) return;
          world.heal(killer, killer, killer.maxHp * effect.healPct / 100);
          this.execute([{ kind: 'statMod', selector: 'self', stat: 'atk', pct: effect.atkPct, duration: 'combat' }], { side: killer.side, caster: killer, targets: [] });
        });
        break;
      }
      case 'marksman':
        for (const u of units) { u.rangeBonus += effect.rangeBonus; u.volleyChance = Math.min(1, u.volleyChance + effect.chance); }
        break;
      case 'attackMana': {
        const members = new Set(units.map((u) => u.uid));
        world.bus.on('onAttack', ({ attacker }) => { if (members.has(attacker.uid)) world.addMana(attacker, effect.amount); });
        break;
      }
      case 'summon': {
        if (effect.unitId !== undefined) {
          const def = this.catalog?.get(effect.unitId);
          if (!def) break;
          for (const cell of this.summonCells(ctx.side, effect.placement ?? 'allyBack').slice(0, effect.count)) {
            const unit = world.spawn(def, ctx.side, cell, true, { star: effect.star ?? 1 });
            if (effect.manaFull) world.setMana(unit, unit.maxMana);
          }
          break;
        }
        const cells = this.summonCells(ctx.side).slice(0, effect.count);
        const candidates = this.catalog?.units.filter((u) => !u.boss && u.tier === effect.tier) ?? [];
        for (const cell of cells) world.spawn(world.rng.pick(candidates), ctx.side, cell, true);
        break;
      }
      case 'scout':
        for (const u of world.rng.shuffle(world.enemiesOf(ctx.side)).slice(0, effect.count)) {
          const loss = Math.round(u.maxHp * effect.pctMaxHp / 100);
          u.maxHp = Math.max(1, u.maxHp - loss);
          u.hp = Math.min(u.hp, u.maxHp);
          world.emit({ type: 'maxHp', unit: u.uid, hp: u.hp, maxHp: u.maxHp });
        }
        break;
      case 'taunt': {
        // 실행 시점의 위치로 한 번 판정한다. 적마다 반경 안의 도발자 중 가장 가까운 쪽(동률은 uid 작은 쪽)을 우선 공격
        for (const enemy of world.enemiesOf(ctx.side)) {
          let nearest: CombatUnit | null = null;
          for (const taunter of units) {
            const distance = chebyshev(taunter.cell, enemy.cell);
            if (distance > effect.radius) continue;
            if (!nearest || distance < chebyshev(nearest.cell, enemy.cell)) nearest = taunter;
          }
          if (!nearest) continue;
          enemy.statuses.setForcedTarget(nearest.uid, world.now + effect.duration);
          applied(enemy, 'taunted', effect.duration);
        }
        break;
      }
      case 'cpGain':
        this.cp?.gainCp(effect.amount, 'effect');
        break;
      case 'drawCards':
        if (!this.deck) throw new Error('drawCards 효과는 카드 덱이 필요함');
        this.deck.draw(effect.count);
        break;
      case 'manaFill':
        for (const u of units) world.setMana(u, u.maxMana);
        break;
      case 'shield':
        for (const u of units) {
          world.addShield(u, Math.round((u.maxHp * effect.pctMaxHp) / 100), durationToSeconds(effect.duration));
        }
        break;

      case 'damageTakenMult': {
        const seconds = durationToSeconds(effect.duration);
        for (const u of units) {
          u.statuses.addTakenMult(effect.mult, world.now + seconds, effect.dmgType);
          applied(u, 'damageTakenMult', seconds, effect.mult);
        }
        break;
      }

      case 'statMod':
      case 'statAdd': {
        const seconds = durationToSeconds(effect.duration);
        const maxStacks = effect.kind === 'statMod' ? effect.maxStacks : undefined;
        // 중첩 상한이 있으면 같은 시전자 종류가 건 같은 스탯 효과끼리 센다 (특성은 시전자가 없어 'trait')
        const stackKey = maxStacks === undefined ? undefined : `${ctx.caster ? ctx.caster.def.id : 'trait'}:${effect.stat}`;
        for (const u of units) {
          if (stackKey !== undefined && maxStacks !== undefined && u.statuses.stackCount(stackKey) >= maxStacks) continue;
          u.statuses.addStatMod({
            stat: effect.stat,
            pct: effect.kind === 'statMod' ? effect.pct : 0,
            flat: effect.kind === 'statAdd' ? effect.amount : 0,
            until: world.now + seconds,
            duration: seconds,
            refreshOnKill: effect.kind === 'statMod' && effect.refreshOnKill === true,
            ...(stackKey === undefined ? {} : { stackKey }),
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
            canCrit: true,
          });
          if (!u.alive && effect.maxHpOnKill && caster.alive) {
            caster.maxHp += effect.maxHpOnKill;
            caster.hp += effect.maxHpOnKill;
            world.emit({ type: 'maxHp', unit: caster.uid, maxHp: caster.maxHp, hp: caster.hp });
          }
          if (!u.alive && effect.manaOnKill && caster.alive) world.addMana(caster, effect.manaOnKill);
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
          const cell = this.teleportDestination(u, primary, effect.destination);
          if (cell && !sameCell(cell, u.cell)) world.relocate(u, cell);
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
          let raw = effect.amount;
          let bonus = false;
          if (effect.bonusIfBurning !== undefined && u.statuses.isBurning()) {
            raw += effect.bonusIfBurning;
            bonus = true;
          }
          if (effect.hpBelowPct !== undefined && effect.belowMult !== undefined && u.hp <= (u.maxHp * effect.hpBelowPct) / 100) {
            raw *= effect.belowMult;
            bonus = true;
          }
          world.dealDamage({
            source: ctx.caster,
            target: u,
            raw,
            type: effect.dmgType,
            ignoreArmorPct: effect.ignoreArmorPct ?? 0,
            ...(bonus ? { bonus: true } : {}),
          });
          // 이 카드 피해로 처치하면 CP (카드 전용)
          if (effect.killCp !== undefined && !u.alive && ctx.card && ctx.side === 0) this.cp?.gainCp(effect.killCp, 'effect');
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
        this.registerCpOnKill(effect.amount, effect.maxPerCombat, ctx.side, ctx.card ? 'effect' : 'abyss');
        break;

      case 'flatShield':
        for (const u of units) world.addShield(u, effect.amount, durationToSeconds(effect.duration));
        break;

      case 'cleanse':
        for (const u of units) {
          for (const status of u.statuses.cleanse()) world.emit({ type: 'statusRemoved', unit: u.uid, status });
        }
        break;

      case 'damageAura':
        for (const u of units) {
          u.statuses.addPulse({ amount: effect.amount, dmgType: effect.dmgType, radius: effect.radius, intervalSeconds: effect.intervalSeconds, count: effect.count });
          applied(u, 'damageAura', effect.intervalSeconds * effect.count, effect.amount);
        }
        break;

      case 'empoweredAttack':
        for (const u of units) {
          u.statuses.setEmpoweredAttack({ pctAtk: effect.pctAtk, dmgType: effect.dmgType, manaPctOnKill: effect.manaPctOnKill ?? 0 });
          applied(u, 'empoweredAttack', Infinity, effect.pctAtk);
        }
        break;

      case 'reflect':
        for (const u of units) {
          u.statuses.addReflect(effect.pct, world.now + effect.duration);
          applied(u, 'reflect', effect.duration, effect.pct);
        }
        break;

      case 'regen':
        for (const u of units) {
          u.statuses.addRegen(effect.pctMaxHp, world.now + effect.duration);
          applied(u, 'regen', effect.duration, effect.pctMaxHp);
        }
        break;

      case 'delayedStrike': {
        this.delayedStrikes ??= new DelayedStrikes(world, this);
        if (effect.area === 'targetArea') {
          if (ctx.area) this.delayedStrikes.scheduleArea(ctx.side, ctx.area, effect, ctx.card?.name);
          break;
        }
        const caster = this.requireCaster(ctx, 'delayedStrike');
        this.delayedStrikes.schedule(caster, effect);
        break;
      }

      case 'skillCpGain': {
        const caster = this.requireCaster(ctx, 'skillCpGain');
        const used = this.skillCpUses.get(caster.uid) ?? 0;
        if (ctx.side !== 0 || !this.cp || used >= effect.maxPerCombat) break;
        // 상한(CP 6)에 막혀 못 얻었으면 횟수를 쓰지 않는다
        if (this.cp.gainCp(effect.amount, 'effect') > 0) this.skillCpUses.set(caster.uid, used + 1);
        break;
      }

      case 'stackingStatMod':
        this.registerStackingStatMod(effect, ctx);
        break;

      case 'startMana':
        if (effect.amount > 0) for (const u of units) world.addMana(u, effect.amount);
        break;

      case 'handCostReduction':
        this.registerHandCostReduction(effect.amount, effect.maxPerCombat, units, ctx.side);
        break;

      case 'backRowLeap': {
        const members = [...units];
        world.bus.on('onCombatStart', () => {
          for (const u of members) {
            if (!u.alive || u.moving) continue;
            const cell = this.backRowLeapCell(u.side, u.cell);
            if (cell) world.relocate(u, cell);
          }
        });
        break;
      }

      case 'critical':
        for (const u of units) {
          u.critChance = Math.min(1, u.critChance + effect.chance);
          u.critDamagePct = Math.max(u.critDamagePct, effect.damagePct);
        }
        break;

      case 'manaGain':
        for (const u of units) world.addMana(u, effect.amount);
        break;

      case 'handCostCut': {
        // 손패 무작위 1장 (비용 1 이상)의 이번 전투 비용을 줄인다. 줄일 카드가 없으면 Rng도 쓰지 않는다
        const change = this.handCost?.reduceRandomCost(effect.amount);
        if (change) world.emit({ type: 'cardCost', instanceId: change.instanceId, cardId: change.cardId, surcharge: change.surcharge, delta: -change.delta });
        break;
      }

      case 'spellDamageBoost':
        this.sinks.spellBoost?.addSpellDamagePct(effect.pct);
        break;

      case 'ultimateGain':
        this.sinks.ultimate?.gainUltimate(effect.amount);
        break;

      case 'damageZone':
        if (ctx.area) {
          this.zones ??= new GroundZones(world);
          this.zones.install(ctx.side, ctx.area, effect);
        }
        break;

      case 'reviveOnce':
        for (const u of units) {
          u.reviveHpPct = Math.max(u.reviveHpPct, effect.hpPct);
          applied(u, 'reviveOnce', Infinity, effect.hpPct);
        }
        break;

      case 'startCp':
        this.cp?.addStartCp(effect.amount);
        break;

      case 'commanderHeal':
        if (ctx.card && this.sinks.commanderHeal) {
          this.sinks.commanderHeal.reserveHeal(effect.amount);
          world.emit({ type: 'commanderHeal', amount: effect.amount, cardId: ctx.card.cardId, instanceId: ctx.card.instanceId });
        }
        break;
    }
  }

  /** 특성: intervalSeconds마다 (전투 시각 기준) selector 유닛에게 스탯 증가를 한 겹씩 쌓는다. 겹 수 상한을 넘으면 쌓지 않는다 */
  private registerStackingStatMod(effect: Extract<ResolvedEffect, { kind: 'stackingStatMod' }>, ctx: EffectContext): void {
    const world = this.world;
    const interval = Math.max(1, Math.round(effect.intervalSeconds * COMBAT.TICKS_PER_SECOND));
    const stackKey = `trait:${effect.stat}`;
    world.bus.on('onTick', ({ tick }) => {
      if (tick === 0 || tick % interval !== 0) return;
      for (const u of this.select(effect.selector, ctx, effect.selectorRadius ?? 1)) {
        if (u.statuses.stackCount(stackKey) >= effect.maxStacks) continue;
        u.statuses.addStatMod({ stat: effect.stat, pct: effect.pct, flat: 0, until: Infinity, duration: Infinity, refreshOnKill: false, stackKey });
        world.emit({ type: 'statusApplied', unit: u.uid, status: `statMod:${effect.stat}`, duration: 'combat', source: null, value: effect.pct });
      }
    });
  }

  /**
   * 특성(주술사): 이 진영의 selector 유닛이 스킬을 쓸 때마다 손패 무작위 1장의 비용을 줄인다 (limit 0 = 무제한).
   * 손패 창구가 없거나(카드 시스템 없음) 아군(side 0)이 아니면 아무것도 등록하지 않는다. 줄일 카드가 없으면 횟수를 쓰지 않는다.
   */
  private registerHandCostReduction(amount: number, limit: number, members: readonly CombatUnit[], side: Side): void {
    const sink = this.handCost;
    if (!sink || side !== 0) return;
    const uids = new Set(members.map((u) => u.uid));
    let used = 0;
    this.world.bus.on('onSkillCast', ({ caster }) => {
      if (!uids.has(caster.uid) || (limit > 0 && used >= limit)) return;
      const change = sink.reduceRandomCost(amount);
      if (!change) return;
      used += 1;
      this.world.emit({ type: 'cardCost', instanceId: change.instanceId, cardId: change.cardId, surcharge: change.surcharge, delta: -change.delta, source: caster.uid });
    });
  }

  /**
   * 심연 같은 "처치 시 CP" 트리거 등록. 해당 진영 유닛이 적을 처치할 때마다 amount만큼 얻고,
   * 실제로 얻은 합계가 limit에 닿으면 멈춘다 (CP 상한 때문에 못 얻은 양은 한도를 소모하지 않음).
   * CP 창구가 없거나 플레이어(side 0)가 아닌 진영이면 등록하지 않는다.
   */
  private registerCpOnKill(amount: number, limit: number, side: Side, reason: 'abyss' | 'effect'): void {
    const cp = this.cp;
    if (!cp || side !== 0) return;
    let gained = 0;
    this.world.bus.on('onKill', ({ killer }) => {
      if (!killer || killer.side !== side || gained >= limit) return;
      gained += cp.gainCp(Math.min(amount, limit - gained), reason);
    });
  }

  private requireCaster(ctx: EffectContext, kind: string): CombatUnit {
    if (!ctx.caster) throw new Error(`${kind} 효과는 시전자가 필요함`);
    return ctx.caster;
  }

  /**
   * 징집이 놓일 빈 칸 (우선순위 순). allyBack/allyFront는 해당 열만, enemyBack은 상대 후열부터 한 열씩 앞으로
   * (한 열 안에서는 가운데 행에 가까운 칸 먼저, 같으면 위쪽 행).
   */
  private summonCells(side: Side, placement: SummonPlacement = 'allyBack'): Cell[] {
    const free = (col: number): Cell[] => Array.from({ length: BOARD_ROWS }, (_, row) => ({ col, row })).filter((c) => this.world.board.isFree(c));
    if (placement === 'allyBack') return free(backCol(side));
    if (placement === 'allyFront') return free(frontCol(side));
    const opponent: Side = side === 0 ? 1 : 0;
    const step = opponent === 1 ? -1 : 1;
    const center = (BOARD_ROWS - 1) / 2;
    const cells: Cell[] = [];
    for (let i = 0; i < HALF_COLS; i++) {
      const column = free(backCol(opponent) + step * i);
      column.sort((a, b) => Math.abs(a.row - center) - Math.abs(b.row - center) || a.row - b.row);
      cells.push(...column);
    }
    return cells;
  }

  /**
   * 순간이동 목적지 (종류는 TELEPORT_DESTINATIONS 설명 참고). 갈 칸이 없으면 null (lineEnd는 제자리 = mover.cell).
   * behindTarget: target에 인접한 빈 칸 중 mover에서 가장 먼 칸, 동률이면 target과 같은 행, 그다음 (열, 행) 오름차순.
   * besideTarget: 같은 후보 중 mover에서 가장 가까운 칸, 같은 동률 규칙.
   */
  teleportDestination(mover: CombatUnit, target: CombatUnit, destination: TeleportDestination = 'behindTarget'): Cell | null {
    if (destination === 'enemyBackRow') return this.backRowLeapCell(mover.side, mover.cell);
    if (destination === 'lineEnd') {
      const free = rayCells(mover.cell, target.cell).filter((c) => this.world.board.isFree(c));
      return free[free.length - 1] ?? mover.cell;
    }
    const nearest = destination === 'besideTarget';
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
        (nearest ? chebyshev(a, mover.cell) - chebyshev(b, mover.cell) : chebyshev(b, mover.cell) - chebyshev(a, mover.cell)) ||
        Math.abs(a.row - target.cell.row) - Math.abs(b.row - target.cell.row) ||
        a.col - b.col ||
        a.row - b.row,
    );
    return candidates[0] ?? null;
  }

  /**
   * 도약 칸 (암살자 특성·균열 도약): side 유닛이 상대 진영 후열(가장 먼 열)의 빈 칸으로 간다.
   * 후열 열에서 from과 행 차이가 가장 작은 빈 칸, 같으면 위쪽 행. 그 열이 가득 차면 한 열씩 앞으로 옮겨 찾고,
   * 상대 진영 전체에 빈 칸이 없으면 null (호출 쪽에서 제자리로 둔다).
   */
  backRowLeapCell(side: Side, from: Cell): Cell | null {
    const opponent: Side = side === 0 ? 1 : 0;
    const back = backCol(opponent);
    const step = opponent === 1 ? -1 : 1;
    for (let i = 0; i < HALF_COLS; i++) {
      const col = back + step * i;
      let best: Cell | null = null;
      for (let row = 0; row < BOARD_ROWS; row++) {
        const cell = { col, row };
        if (!this.world.board.isFree(cell)) continue;
        if (!best || Math.abs(row - from.row) < Math.abs(best.row - from.row)) best = cell;
      }
      if (best) return best;
    }
    return null;
  }
}
