import { COMBAT } from '../combat/constants';
import { CARDS } from './constants';

/** CP 풀 종류: 준비 단계 작전 전용 / 전투 중 */
export type CpPool = 'prep' | 'combat';

/** CP 자연 증가 간격(틱). 상수 한 곳(CARDS)과 틱 길이(COMBAT)에서 계산한다 */
export const CP_REGEN_TICKS = CARDS.CP_REGEN_SECONDS * COMBAT.TICKS_PER_SECOND;

/**
 * 지휘력(CP) 규칙 (순수 계산, 이벤트 없음).
 * - 준비 단계: 작전 카드 전용 CP(PREP_CP)를 따로 갖는다. 전투가 시작되면 사라지고 이월되지 않는다.
 * - 전투: 시작 시 CP_START + 지휘관 보정, 경과 CP_REGEN_SECONDS마다 +1, 최대 CP_MAX. 전투마다 초기화.
 * - 심연 특성 등 다른 수급도 gain으로 얻으며 같은 상한을 받는다.
 */
export class CommandPoints {
  private prepCp = 0;
  private combatCp = 0;

  constructor(private readonly startBonus = 0) {}

  get prep(): number {
    return this.prepCp;
  }
  get combat(): number {
    return this.combatCp;
  }

  amount(pool: CpPool): number {
    return pool === 'prep' ? this.prepCp : this.combatCp;
  }

  /** 준비 단계 시작: 작전 전용 CP 지급. 지급량 반환 */
  startPrep(): number {
    this.prepCp = CARDS.PREP_CP;
    return this.prepCp;
  }

  /** 전투 시작: 남은 준비 CP는 버리고 전투 CP를 시작값으로. 시작값 반환 */
  startCombat(): number {
    this.prepCp = 0;
    this.combatCp = Math.min(CARDS.CP_MAX, CARDS.CP_START + this.startBonus);
    return this.combatCp;
  }

  /**
   * 전투 경과 tick(0 제외)이 간격의 배수일 때 +1. 실제로 늘어난 양(0 또는 1) 반환.
   * boosted면 자연 증가 속도가 2배라 간격의 절반마다 +1 (궁극기 대가 지불).
   */
  regen(tick: number, boosted = false): number {
    if (tick <= 0) return 0;
    const interval = boosted ? CP_REGEN_TICKS / 2 : CP_REGEN_TICKS;
    if (tick % interval !== 0) return 0;
    return this.gain(1);
  }

  /** 전투 CP를 상한까지만 늘린다. 실제로 늘어난 양 반환 */
  gain(amount: number): number {
    const next = Math.min(CARDS.CP_MAX, this.combatCp + amount);
    const actual = next - this.combatCp;
    this.combatCp = next;
    return actual;
  }

  canSpend(pool: CpPool, cost: number): boolean {
    return this.amount(pool) >= cost;
  }

  /** 비용 차감. 모자라면 Error (호출 전에 canSpend로 확인) */
  spend(pool: CpPool, cost: number): void {
    if (!this.canSpend(pool, cost)) {
      throw new Error(`${pool === 'prep' ? '준비' : '전투'} CP 부족 (필요 ${cost}, 보유 ${this.amount(pool)})`);
    }
    if (pool === 'prep') this.prepCp -= cost;
    else this.combatCp -= cost;
  }
}
