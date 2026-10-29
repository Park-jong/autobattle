import type { CombatStat, DamageType } from '../data/effect';
import { COMBAT } from './constants';

interface TimedEntry {
  expiresAt: number;
}
interface StatModEntry extends TimedEntry {
  stat: CombatStat;
  pct: number;
  flat: number;
  /** 지속 시간(초). 처치 시 초기화에 쓰임 */
  duration: number;
  refreshOnKill: boolean;
  /** 중첩 상한이 있는 효과의 묶음 키 (같은 키끼리 센다) */
  stackKey?: string;
}
interface BurnState extends TimedEntry {
  dps: number;
  sourceUid: number | null;
  nextTickAt: number;
}
interface HealAuraState extends TimedEntry {
  perSecond: number;
  radius: number;
  nextTickAt: number;
}
/** 주기 피해 오라: intervalSeconds마다 반경 안의 적에게 고정 피해, remaining회 */
interface PulseState {
  amount: number;
  dmgType: DamageType;
  radius: number;
  intervalSeconds: number;
  remaining: number;
  nextTickAt: number;
}
/** 다음 기본 공격 강화 */
export interface EmpoweredAttack {
  pctAtk: number;
  dmgType: DamageType;
  manaPctOnKill: number;
}
interface RegenState extends TimedEntry {
  pctMaxHp: number;
  nextTickAt: number;
}

export interface DueBurn {
  dps: number;
  sourceUid: number | null;
}
export interface DueAura {
  perSecond: number;
  radius: number;
}
export interface DuePulse {
  amount: number;
  dmgType: DamageType;
  radius: number;
}

/**
 * 유닛 하나가 가진 상태이상·버프 모음. 순수 상태이며 이벤트는 내보내지 않는다 (호출 쪽이 알림).
 * 현재 시각은 주입된 clock으로 읽는다. expiresAt이 Infinity이면 전투 끝까지.
 *
 * 중첩 규칙
 * - 기절·침묵: 중첩 없음, 더 늦게 끝나는 쪽으로 갱신
 * - 화상: 중첩 없음, 지속 시간 갱신 + 초당 피해는 더 큰 값
 * - 보호막·받는 피해 배율·스탯 증감: 각각 독립 인스턴스로 쌓임 (배율은 곱연산)
 */
export class StatusSet {
  private stunUntil = 0;
  private silenceUntil = 0;
  private rootUntil = 0;
  private readonly leeches: (TimedEntry & { pct: number })[] = [];
  private burn: BurnState | null = null;
  private shields: (TimedEntry & { amount: number })[] = [];
  private takenMults: (TimedEntry & { mult: number; dmgType?: DamageType })[] = [];
  private statMods: StatModEntry[] = [];
  private forced: (TimedEntry & { targetUid: number }) | null = null;
  private undyingUntil = 0;
  private auras: HealAuraState[] = [];
  private extraShotCharges = 0;
  private pulses: PulseState[] = [];
  private empowered: EmpoweredAttack | null = null;
  private regens: RegenState[] = [];
  private reflects: (TimedEntry & { pct: number })[] = [];

  constructor(private readonly clock: () => number) {}

  private isActive(expiresAt: number): boolean {
    return expiresAt > this.clock() + COMBAT.EPS;
  }

  // ---- 추가 ----

  addStun(until: number): void {
    this.stunUntil = Math.max(this.stunUntil, until);
  }

  addSilence(until: number): void {
    this.silenceUntil = Math.max(this.silenceUntil, until);
  }

  addRoot(until: number): void { this.rootUntil = Math.max(this.rootUntil, until); }
  isRooted(): boolean { return this.isActive(this.rootUntil); }
  addLifesteal(pct: number, until: number): void { this.leeches.push({ pct, expiresAt: until }); }
  lifestealPct(): number { return this.leeches.reduce((sum, l) => sum + (this.isActive(l.expiresAt) ? l.pct : 0), 0); }

  addBurn(dps: number, until: number, sourceUid: number | null): void {
    if (this.burn) {
      this.burn.dps = Math.max(this.burn.dps, dps);
      this.burn.expiresAt = until;
      this.burn.sourceUid = sourceUid;
    } else {
      this.burn = { dps, expiresAt: until, sourceUid, nextTickAt: this.clock() + COMBAT.BURN_INTERVAL_SECONDS };
    }
  }

  addShield(amount: number, until: number): void {
    this.shields.push({ amount, expiresAt: until });
  }

  /** dmgType을 주면 그 종류의 피해에만 적용되는 배율이다 */
  addTakenMult(mult: number, until: number, dmgType?: DamageType): void {
    this.takenMults.push({ mult, expiresAt: until, ...(dmgType ? { dmgType } : {}) });
  }

  addStatMod(entry: { stat: CombatStat; pct: number; flat: number; until: number; duration: number; refreshOnKill: boolean; stackKey?: string }): void {
    this.statMods.push({
      stat: entry.stat,
      pct: entry.pct,
      flat: entry.flat,
      expiresAt: entry.until,
      duration: entry.duration,
      refreshOnKill: entry.refreshOnKill,
      ...(entry.stackKey === undefined ? {} : { stackKey: entry.stackKey }),
    });
  }

  /** 같은 묶음 키로 걸려 있는(만료 전) 스탯 증감 수 */
  stackCount(stackKey: string): number {
    return this.statMods.filter((m) => m.stackKey === stackKey && this.isActive(m.expiresAt)).length;
  }

  addPulse(pulse: { amount: number; dmgType: DamageType; radius: number; intervalSeconds: number; count: number }): void {
    this.pulses.push({ ...pulse, remaining: pulse.count, nextTickAt: this.clock() + pulse.intervalSeconds });
  }

  setEmpoweredAttack(empowered: EmpoweredAttack): void {
    this.empowered = empowered;
  }

  /** 강화된 다음 기본 공격이 남아 있으면 소비해서 반환 */
  consumeEmpoweredAttack(): EmpoweredAttack | null {
    const taken = this.empowered;
    this.empowered = null;
    return taken;
  }

  hasEmpoweredAttack(): boolean {
    return this.empowered !== null;
  }

  addRegen(pctMaxHp: number, until: number): void {
    this.regens.push({ pctMaxHp, expiresAt: until, nextTickAt: this.clock() + COMBAT.HEAL_AURA_INTERVAL_SECONDS });
  }

  addReflect(pct: number, until: number): void {
    this.reflects.push({ pct, expiresAt: until });
  }

  /** 반사 비율 합계 (%) */
  reflectPct(): number {
    return this.reflects.reduce((sum, r) => sum + (this.isActive(r.expiresAt) ? r.pct : 0), 0);
  }

  /**
   * 해로운 상태를 모두 지운다: 기절·침묵·속박·화상·도발당함(강제 타겟), 받는 피해 증가(mult > 1), 스탯 감소(pct/flat < 0).
   * 지운 상태 이름(중복 없음)을 반환한다.
   */
  cleanse(): string[] {
    const removed: string[] = [];
    const active = (until: number): boolean => this.isActive(until);
    if (active(this.stunUntil)) removed.push('stun');
    this.stunUntil = 0;
    if (active(this.silenceUntil)) removed.push('silence');
    this.silenceUntil = 0;
    if (active(this.rootUntil)) removed.push('root');
    this.rootUntil = 0;
    if (this.burn && active(this.burn.expiresAt)) removed.push('burn');
    this.burn = null;
    if (this.forced && active(this.forced.expiresAt)) removed.push('taunted');
    this.forced = null;
    if (this.takenMults.some((m) => m.mult > 1 && active(m.expiresAt))) removed.push('damageTakenMult');
    this.takenMults = this.takenMults.filter((m) => m.mult <= 1);
    const harmfulStats = this.statMods.filter((m) => (m.pct < 0 || m.flat < 0) && active(m.expiresAt));
    for (const stat of new Set(harmfulStats.map((m) => m.stat))) removed.push(`statMod:${stat}`);
    this.statMods = this.statMods.filter((m) => !(m.pct < 0 || m.flat < 0));
    return removed;
  }

  setForcedTarget(targetUid: number, until: number): void {
    this.forced = { targetUid, expiresAt: until };
  }

  addUndying(until: number): void {
    this.undyingUntil = Math.max(this.undyingUntil, until);
  }

  addHealAura(perSecond: number, radius: number, until: number): void {
    this.auras.push({
      perSecond,
      radius,
      expiresAt: until,
      nextTickAt: this.clock() + COMBAT.HEAL_AURA_INTERVAL_SECONDS,
    });
  }

  addExtraShots(count: number): void {
    this.extraShotCharges += count;
  }

  // ---- 조회 ----

  isStunned(): boolean {
    return this.isActive(this.stunUntil);
  }

  /** 침묵: 스킬을 쓸 수 없다 (이동·기본 공격은 가능) */
  isSilenced(): boolean {
    return this.isActive(this.silenceUntil);
  }

  isBurning(): boolean {
    return this.burn !== null && this.isActive(this.burn.expiresAt);
  }

  isUndying(): boolean {
    return this.isActive(this.undyingUntil);
  }

  forcedTargetUid(): number | null {
    return this.forced && this.isActive(this.forced.expiresAt) ? this.forced.targetUid : null;
  }

  /** 받는 피해 배율의 곱. type을 주면 그 종류에만 걸린 배율도 포함하고, 생략하면 종류와 무관하게 모든 배율을 곱한다 */
  takenMultiplier(type?: DamageType): number {
    let result = 1;
    for (const m of this.takenMults) if (this.isActive(m.expiresAt) && (!m.dmgType || !type || m.dmgType === type)) result *= m.mult;
    return result;
  }

  shieldTotal(): number {
    let total = 0;
    for (const s of this.shields) if (this.isActive(s.expiresAt)) total += s.amount;
    return total;
  }

  /** 스탯 보정 합계. 최종값 = (기본 + flat) × (1 + pct/100) */
  statBonus(stat: CombatStat): { flat: number; pct: number } {
    let flat = 0;
    let pct = 0;
    for (const m of this.statMods) {
      if (m.stat === stat && this.isActive(m.expiresAt)) {
        flat += m.flat;
        pct += m.pct;
      }
    }
    return { flat, pct };
  }

  get extraShots(): number {
    return this.extraShotCharges;
  }

  // ---- 소비·갱신 ----

  /** 보호막으로 피해를 흡수한다 (먼저 얻은 것부터). 흡수한 양을 반환 */
  absorb(damage: number): number {
    let remaining = damage;
    for (const s of this.shields) {
      if (remaining <= 0) break;
      if (!this.isActive(s.expiresAt)) continue;
      const used = Math.min(s.amount, remaining);
      s.amount -= used;
      remaining -= used;
    }
    this.shields = this.shields.filter((s) => s.amount > 0);
    return damage - remaining;
  }

  /** 연발 충전 1개 소비. 없으면 false */
  consumeExtraShot(): boolean {
    if (this.extraShotCharges <= 0) return false;
    this.extraShotCharges -= 1;
    return true;
  }

  /** 이번 틱에 도래한 화상 피해 (없으면 null). 마지막 틱은 만료 시각 포함 */
  takeDueBurn(): DueBurn | null {
    const b = this.burn;
    if (!b) return null;
    const now = this.clock();
    if (now < b.nextTickAt - COMBAT.EPS || b.nextTickAt > b.expiresAt + COMBAT.EPS) return null;
    b.nextTickAt += COMBAT.BURN_INTERVAL_SECONDS;
    return { dps: b.dps, sourceUid: b.sourceUid };
  }

  /** 이번 틱에 도래한 회복 오라 */
  takeDueAuras(): DueAura[] {
    const due: DueAura[] = [];
    const now = this.clock();
    for (const a of this.auras) {
      if (now < a.nextTickAt - COMBAT.EPS || a.nextTickAt > a.expiresAt + COMBAT.EPS) continue;
      a.nextTickAt += COMBAT.HEAL_AURA_INTERVAL_SECONDS;
      due.push({ perSecond: a.perSecond, radius: a.radius });
    }
    return due;
  }

  /** 이번 틱에 도래한 주기 피해 오라 (횟수를 다 쓰면 목록에서 제거) */
  takeDuePulses(): DuePulse[] {
    const due: DuePulse[] = [];
    const now = this.clock();
    for (const p of this.pulses) {
      if (p.remaining <= 0 || now < p.nextTickAt - COMBAT.EPS) continue;
      p.nextTickAt += p.intervalSeconds;
      p.remaining -= 1;
      due.push({ amount: p.amount, dmgType: p.dmgType, radius: p.radius });
    }
    this.pulses = this.pulses.filter((p) => p.remaining > 0);
    return due;
  }

  /** 이번 틱에 도래한 재생: 회복할 최대 HP 비율(%)의 합계 (없으면 0) */
  takeDueRegenPct(): number {
    let total = 0;
    const now = this.clock();
    for (const r of this.regens) {
      if (now < r.nextTickAt - COMBAT.EPS || r.nextTickAt > r.expiresAt + COMBAT.EPS) continue;
      r.nextTickAt += COMBAT.HEAL_AURA_INTERVAL_SECONDS;
      total += r.pctMaxHp;
    }
    return total;
  }

  /** refreshOnKill 스탯 증감의 지속 시간을 초기화. 갱신된 상태 이름과 지속 시간을 반환 */
  refreshOnKill(): { status: string; duration: number; value: number }[] {
    const now = this.clock();
    const refreshed: { status: string; duration: number; value: number }[] = [];
    for (const m of this.statMods) {
      if (!m.refreshOnKill || !this.isActive(m.expiresAt) || !Number.isFinite(m.duration)) continue;
      m.expiresAt = now + m.duration;
      refreshed.push({ status: `statMod:${m.stat}`, duration: m.duration, value: m.pct });
    }
    return refreshed;
  }

  /**
   * 보스 페이즈 전환의 버프 해제: 카드·스킬이 건 시간제(만료 시각이 유한한) 이로운 상태와 보호막 전부를 지운다.
   * 지우는 것 = 보호막(전부), 스탯 증가(pct/flat > 0), 받는 피해 감소(mult < 1), 흡혈, 불사, 회복 오라, 연발 충전.
   * 지우지 않는 것 = 기절·침묵·속박·화상·도발 등 불리한 상태, 스탯 감소, 받는 피해 증가,
   * 전투 내내 지속되는(만료 시각 Infinity) 특성·장비·유물·패시브 효과. 지운 상태 이름(중복 없음)을 반환한다.
   */
  dispelBuffs(): string[] {
    const removed = new Set<string>();
    const timed = (expiresAt: number): boolean => Number.isFinite(expiresAt);
    if (this.shields.some((s) => this.isActive(s.expiresAt))) removed.add('shield');
    this.shields = [];
    this.statMods = this.statMods.filter((m) => {
      if (!timed(m.expiresAt) || (m.pct <= 0 && m.flat <= 0)) return true;
      if (this.isActive(m.expiresAt)) removed.add(`statMod:${m.stat}`);
      return false;
    });
    this.takenMults = this.takenMults.filter((m) => {
      if (!timed(m.expiresAt) || m.mult >= 1) return true;
      if (this.isActive(m.expiresAt)) removed.add('damageTakenMult');
      return false;
    });
    this.leeches.splice(0, this.leeches.length, ...this.leeches.filter((l) => {
      if (!timed(l.expiresAt)) return true;
      if (this.isActive(l.expiresAt)) removed.add('lifesteal');
      return false;
    }));
    if (this.undyingUntil > 0 && timed(this.undyingUntil)) {
      if (this.isActive(this.undyingUntil)) removed.add('undying');
      this.undyingUntil = 0;
    }
    this.auras = this.auras.filter((a) => {
      if (!timed(a.expiresAt)) return true;
      if (this.isActive(a.expiresAt)) removed.add('healAura');
      return false;
    });
    if (this.extraShotCharges > 0) {
      removed.add('extraShots');
      this.extraShotCharges = 0;
    }
    if (this.empowered) {
      removed.add('empoweredAttack');
      this.empowered = null;
    }
    this.regens = this.regens.filter((r) => {
      if (!timed(r.expiresAt)) return true;
      if (this.isActive(r.expiresAt)) removed.add('regen');
      return false;
    });
    this.reflects = this.reflects.filter((r) => {
      if (!timed(r.expiresAt)) return true;
      if (this.isActive(r.expiresAt)) removed.add('reflect');
      return false;
    });
    return [...removed];
  }

  /** 모든 상태를 지운다 (쌍둥이 부활: 되살아난 유닛은 깨끗한 상태로 시작) */
  clear(): void {
    this.stunUntil = 0;
    this.silenceUntil = 0;
    this.rootUntil = 0;
    this.undyingUntil = 0;
    this.leeches.length = 0;
    this.burn = null;
    this.shields = [];
    this.takenMults = [];
    this.statMods = [];
    this.forced = null;
    this.auras = [];
    this.extraShotCharges = 0;
    this.pulses = [];
    this.empowered = null;
    this.regens = [];
    this.reflects = [];
  }

  /** 만료된 상태를 제거하고 제거된 상태 이름 목록을 반환 */
  expire(): string[] {
    const removed: string[] = [];
    const now = this.clock();
    const dead = (expiresAt: number) => expiresAt <= now + COMBAT.EPS;
    if (this.rootUntil > 0 && dead(this.rootUntil)) { this.rootUntil = 0; removed.push('root'); }
    this.drop(this.leeches, dead, 'lifesteal', removed);

    if (this.stunUntil > 0 && dead(this.stunUntil)) {
      this.stunUntil = 0;
      removed.push('stun');
    }
    if (this.silenceUntil > 0 && dead(this.silenceUntil)) {
      this.silenceUntil = 0;
      removed.push('silence');
    }
    // 화상·오라는 만료 시각의 마지막 틱 피해를 적용한 뒤(다음 틱에) 제거한다
    if (this.burn && now > this.burn.expiresAt + COMBAT.EPS) {
      this.burn = null;
      removed.push('burn');
    }
    this.drop(this.shields, dead, 'shield', removed);
    this.drop(this.takenMults, dead, 'damageTakenMult', removed);
    this.statMods = this.statMods.filter((m) => {
      if (!dead(m.expiresAt)) return true;
      removed.push(`statMod:${m.stat}`);
      return false;
    });
    if (this.forced && dead(this.forced.expiresAt)) {
      this.forced = null;
      removed.push('forceTarget');
    }
    if (this.undyingUntil > 0 && dead(this.undyingUntil)) {
      this.undyingUntil = 0;
      removed.push('undying');
    }
    this.auras = this.auras.filter((a) => {
      if (now <= a.expiresAt + COMBAT.EPS) return true;
      removed.push('healAura');
      return false;
    });
    // 재생도 만료 시각의 마지막 틱 회복을 처리한 뒤 제거한다
    this.regens = this.regens.filter((r) => {
      if (now <= r.expiresAt + COMBAT.EPS) return true;
      removed.push('regen');
      return false;
    });
    this.drop(this.reflects, dead, 'reflect', removed);
    return removed;
  }

  private drop<T extends TimedEntry>(
    list: T[],
    dead: (expiresAt: number) => boolean,
    name: string,
    removed: string[],
  ): void {
    for (let i = list.length - 1; i >= 0; i--) {
      if (dead((list[i] as T).expiresAt)) {
        list.splice(i, 1);
        removed.push(name);
      }
    }
  }
}
