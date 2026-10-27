import type { CombatStat } from '../data/effect';
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

export interface DueBurn {
  dps: number;
  sourceUid: number | null;
}
export interface DueAura {
  perSecond: number;
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
  private takenMults: (TimedEntry & { mult: number })[] = [];
  private statMods: StatModEntry[] = [];
  private forced: (TimedEntry & { targetUid: number }) | null = null;
  private undyingUntil = 0;
  private auras: HealAuraState[] = [];
  private extraShotCharges = 0;

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

  addTakenMult(mult: number, until: number): void {
    this.takenMults.push({ mult, expiresAt: until });
  }

  addStatMod(entry: { stat: CombatStat; pct: number; flat: number; until: number; duration: number; refreshOnKill: boolean }): void {
    this.statMods.push({
      stat: entry.stat,
      pct: entry.pct,
      flat: entry.flat,
      expiresAt: entry.until,
      duration: entry.duration,
      refreshOnKill: entry.refreshOnKill,
    });
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

  /** 받는 피해 배율의 곱 */
  takenMultiplier(): number {
    let result = 1;
    for (const m of this.takenMults) if (this.isActive(m.expiresAt)) result *= m.mult;
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
