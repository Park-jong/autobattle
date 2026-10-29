import { CommandPoints, type CpPool } from '../cards/commandPoints';
import type { CpGainSink } from './effects';
import type { CpReason } from './events';
import type { CombatWorld } from './world';

/**
 * 전투 중 아군(side 0)의 지휘력(CP). 규칙 계산은 CommandPoints, 이 클래스는 변화를 `cp` 이벤트로 남기고
 * 효과 실행기(심연 특성)의 CP 수급 창구 역할을 한다.
 */
export class CombatCommandPoints implements CpGainSink {
  private readonly points: CommandPoints;
  private boostUntilTick = 0;

  constructor(
    private readonly world: CombatWorld,
    startBonus: number,
  ) {
    this.points = new CommandPoints(startBonus);
  }

  get prep(): number {
    return this.points.prep;
  }
  get combat(): number {
    return this.points.combat;
  }

  amount(pool: CpPool): number {
    return this.points.amount(pool);
  }

  startPrep(): void {
    const gained = this.points.startPrep();
    this.emit('prep', gained, 'start');
  }

  startCombat(): void {
    const gained = this.points.startCombat();
    this.emit('combat', gained, 'start');
  }

  /** 틱이 바뀐 직후 호출: 간격마다 +1 (가속 중이면 2배 빠르게) */
  regen(tick: number): void {
    const gained = this.points.regen(tick, tick < this.boostUntilTick);
    if (gained > 0) this.emit('combat', gained, 'regen');
  }

  /** 이 틱 전까지 자연 증가 속도 2배 */
  boostUntil(tick: number): void {
    this.boostUntilTick = Math.max(this.boostUntilTick, tick);
  }

  gainCp(amount: number, reason: 'abyss' | 'effect'): number {
    const gained = this.points.gain(amount);
    if (gained > 0) this.emit('combat', gained, reason);
    return gained;
  }

  addStartCp(amount: number): void {
    this.points.addStartBonus(amount);
  }

  canSpend(pool: CpPool, cost: number): boolean {
    return this.points.canSpend(pool, cost);
  }

  spend(pool: CpPool, cost: number): void {
    if (cost <= 0) return;
    this.points.spend(pool, cost);
    this.emit(pool, -cost, 'card');
  }

  private emit(pool: CpPool, delta: number, reason: CpReason): void {
    this.world.emit({ type: 'cp', pool, delta, cp: this.points.amount(pool), reason });
  }
}
