import type { DamageType } from '../data/effect';
import { Rng } from '../rng';
import { Board, type Cell, type Side } from './board';
import { COMBAT } from './constants';
import { computeDamage, overheatMultiplier } from './damage';
import type { CombatEvent } from './events';
import { TriggerBus } from './triggers';
import { CombatUnit, type StatScale } from './unit';
import type { UnitDef } from '../data/unit';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** t(발생 시각)는 world가 채운다 */
export type NewEvent = DistributiveOmit<CombatEvent, 't'>;

export interface DamageRequest {
  source: CombatUnit | null;
  target: CombatUnit;
  /** 배율·방어 적용 전 피해 */
  raw: number;
  type: DamageType;
  /** 방어력 무시 비율(%) */
  ignoreArmorPct?: number;
  /** true면 source의 치명타 판정을 받는다 (ATK 비례 피해: 기본 공격·damage 효과) */
  canCrit?: boolean;
  /** true면 반사 피해를 되돌리지 않는다 (반사 피해끼리 무한히 오가지 않도록) */
  noReflect?: boolean;
  /** true면 조건부 추가 피해가 붙은 피해다 (damage 이벤트에 bonus 표시) */
  bonus?: boolean;
}

/**
 * 전투 한 판의 공유 상태와 기본 연산(피해·회복·사망·마나·위치 변경).
 * 효과 실행기, 유닛 컨트롤러, 시뮬이 모두 이 객체를 통해 상태를 바꾸고 이벤트를 남긴다.
 */
export class CombatWorld {
  readonly board = new Board();
  readonly bus = new TriggerBus();
  readonly events: CombatEvent[] = [];
  /** uid 오름차순 */
  readonly units: CombatUnit[] = [];
  tick = 0;

  constructor(readonly rng: Rng) {}

  /** 현재 시각(초) */
  get now(): number {
    return this.tick / COMBAT.TICKS_PER_SECOND;
  }

  /** 시각 계산용 함수 (상태 집합에 주입) */
  readonly clock = (): number => this.now;

  addUnit(unit: CombatUnit): void {
    this.units.push(unit);
    this.board.place(unit.uid, unit.cell);
  }

  /** 전투 중 유닛 소환. 기본은 1성·보정 없음 (보스 증원은 성급과 적 보정을 넘긴다) */
  spawn(def: UnitDef, side: Side, cell: Cell, temporary = false, options: { star?: number; scale?: StatScale } = {}): CombatUnit {
    const star = options.star ?? 1;
    const unit = new CombatUnit(this.units.length, side, def, star, cell, this.clock, options.scale);
    unit.temporary = temporary;
    this.addUnit(unit);
    this.emit({ type: 'spawn', unit: unit.uid, unitId: def.id, side, star, cell, hp: unit.hp, maxHp: unit.maxHp, mana: 0, maxMana: unit.maxMana });
    return unit;
  }

  /** 죽은 유닛을 되살린다: 빈 칸(원래 칸 우선, 없으면 가까운 칸)에 hp로 다시 세우고 상태·이동을 초기화한다 */
  revive(unit: CombatUnit, hp: number, cell: Cell): void {
    unit.alive = true;
    unit.hp = Math.min(unit.maxHp, Math.max(1, Math.round(hp)));
    unit.mana = 0;
    unit.moving = null;
    unit.cell = cell;
    unit.attackReadyAt = this.now;
    unit.retryAt = 0;
    unit.statuses.clear();
    this.board.place(unit.uid, cell);
    this.emit({ type: 'revive', unit: unit.uid, hp: unit.hp, maxHp: unit.maxHp, cell });
  }

  /** 부활 장비: 쓰러지지 않고 그 자리에서 최대 HP의 reviveHpPct%로 되살아난다 (전투당 1회, 상태·위치는 그대로) */
  private reviveInPlace(unit: CombatUnit): void {
    unit.reviveUsed = true;
    unit.hp = Math.min(unit.maxHp, Math.max(1, Math.round((unit.maxHp * unit.reviveHpPct) / 100)));
    this.emit({ type: 'revive', unit: unit.uid, hp: unit.hp, maxHp: unit.maxHp, cell: unit.cell, inPlace: true });
    this.emit({ type: 'statusRemoved', unit: unit.uid, status: 'reviveOnce' });
  }

  emit(event: NewEvent): void {
    this.events.push({ ...event, t: this.now } as CombatEvent);
  }

  unitByUid(uid: number): CombatUnit | undefined {
    return this.units[uid];
  }

  /** 살아 있는 유닛 (uid 오름차순) */
  aliveUnits(): CombatUnit[] {
    return this.units.filter((u) => u.alive);
  }

  alliesOf(side: Side): CombatUnit[] {
    return this.units.filter((u) => u.alive && u.side === side);
  }

  enemiesOf(side: Side): CombatUnit[] {
    return this.units.filter((u) => u.alive && u.side !== side);
  }

  // ---- 피해·회복·보호막 ----

  /**
   * 피해 적용. 순서: 받는 피해 배율(상태 × 과열) → 방어(ARM/RES) → 보호막 흡수 → HP 감소.
   * 최종 피해량(보호막 흡수 전)을 반환한다.
   */
  dealDamage(req: DamageRequest): number {
    const { source, target } = req;
    if (!target.alive) return 0;

    // 치명타: 확률이 있는 유닛만 Rng를 쓴다 (치명 특성이 없으면 로그가 그대로다). 대상이 이미 죽었으면 굴리지 않는다
    let raw = req.raw;
    let crit = false;
    if (req.canCrit && source && source.critChance > 0 && this.rng.next() < source.critChance) {
      raw = raw * source.critDamagePct / 100;
      crit = true;
    }

    const defense = target.stat(req.type === 'physical' ? 'arm' : 'res');
    const takenMult = target.statuses.takenMultiplier(req.type) * overheatMultiplier(this.now);
    const amount = computeDamage(raw, takenMult, defense, req.ignoreArmorPct ?? 0);

    const hadShield = target.statuses.shieldTotal() > 0;
    const absorbed = target.statuses.absorb(amount);
    const hpBefore = target.hp;
    let hp = target.hp - (amount - absorbed);
    if (hp < 1 && target.statuses.isUndying()) hp = 1;
    target.hp = Math.max(0, hp);

    this.emit({
      type: 'damage',
      unit: target.uid,
      source: source ? source.uid : null,
      amount,
      absorbed,
      dmgType: req.type,
      hp: target.hp,
      ...(crit ? { crit: true as const } : {}),
      ...(req.bonus ? { bonus: true as const } : {}),
    });
    if (target.hp <= 0 && target.reviveHpPct > 0 && !target.reviveUsed) this.reviveInPlace(target);
    if (hadShield && target.statuses.shieldTotal() === 0) {
      this.emit({ type: 'statusRemoved', unit: target.uid, status: 'shield' });
    }
    this.bus.emit('onDamageTaken', { unit: target, source, amount, dmgType: req.type });
    if (target.hp <= 0) this.kill(target, source);
    if (source?.alive && source !== target) this.heal(source, source, (hpBefore - target.hp) * source.statuses.lifestealPct() / 100);
    // 반사: 받은 피해의 일부를 공격자에게 방어 무시로 되돌린다 (반사 피해는 다시 반사되지 않음)
    const reflectPct = target.statuses.reflectPct();
    if (reflectPct > 0 && !req.noReflect && target.alive && source?.alive && source !== target) {
      this.dealDamage({ source: target, target: source, raw: (amount * reflectPct) / 100, type: req.type, ignoreArmorPct: 100, noReflect: true });
    }
    return amount;
  }

  heal(source: CombatUnit | null, target: CombatUnit, amount: number): void {
    if (!target.alive) return;
    const actual = Math.min(Math.round(amount), target.maxHp - target.hp);
    if (actual <= 0) return;
    target.hp += actual;
    this.emit({ type: 'heal', unit: target.uid, source: source ? source.uid : null, amount: actual, hp: target.hp });
  }

  /** untilSeconds가 Infinity면 전투 끝까지 */
  addShield(target: CombatUnit, amount: number, durationSeconds: number): void {
    if (!target.alive || amount <= 0) return;
    target.statuses.addShield(amount, this.now + durationSeconds);
    this.emit({
      type: 'shield',
      unit: target.uid,
      amount,
      duration: Number.isFinite(durationSeconds) ? durationSeconds : 'combat',
    });
  }

  private kill(victim: CombatUnit, killer: CombatUnit | null): void {
    victim.alive = false;
    victim.hp = 0;
    victim.moving = null;
    this.board.release(victim.uid);
    this.emit({ type: 'death', unit: victim.uid, killer: killer ? killer.uid : null });
    this.bus.emit('onKill', { killer, victim });
    this.bus.emit('onDeath', { unit: victim, killer });
  }

  // ---- 마나 ----

  /** 마나를 절대값으로 설정(0~최대로 제한). 변하면 이벤트를 남긴다. */
  setMana(unit: CombatUnit, value: number): void {
    const next = Math.round(Math.min(unit.maxMana, Math.max(0, value)) * 100) / 100;
    if (next === unit.mana) return;
    unit.mana = next;
    this.emit({ type: 'mana', unit: unit.uid, mana: next });
  }

  addMana(unit: CombatUnit, delta: number): void {
    if (unit.alive) this.setMana(unit, unit.mana + delta);
  }

  // ---- 위치 변경 ----

  /** 순간이동. 대상 칸이 비어 있어야 한다. */
  relocate(unit: CombatUnit, to: Cell): void {
    const from = unit.cell;
    this.board.relocate(unit.uid, from, to);
    unit.cell = to;
    this.emit({ type: 'teleport', unit: unit.uid, from, to });
  }

  /** 두 유닛의 위치 교환. 이동 중인 유닛이 있으면 하지 않는다. */
  swap(a: CombatUnit, b: CombatUnit): void {
    if (a.moving || b.moving || a === b) return;
    const cellA = a.cell;
    const cellB = b.cell;
    this.board.swap(a.uid, cellA, b.uid, cellB);
    a.cell = cellB;
    b.cell = cellA;
    this.emit({ type: 'teleport', unit: a.uid, from: cellA, to: cellB });
    this.emit({ type: 'teleport', unit: b.uid, from: cellB, to: cellA });
  }
}
