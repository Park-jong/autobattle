/** 런 내에서 사용하는 골드 규칙. 모든 금액은 0 이상의 안전한 정수다. */
export const ECONOMY = {
  START_GOLD: 10,
  INTEREST_STEP: 10,
  INTEREST_MAX: 3,
  LOSS_REWARD: 3,
  WIN_REWARDS: { normal: 5, elite: 8, boss: 15 },
} as const;

export const BATTLE_KINDS = ['normal', 'elite', 'boss'] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];
export type BattleOutcome = 'win' | 'loss' | 'draw';

export interface BattleReward {
  readonly battleId: string;
  readonly kind: BattleKind;
  readonly outcome: BattleOutcome;
  readonly goldBefore: number;
  readonly base: number;
  readonly interest: number;
  readonly total: number;
  readonly goldAfter: number;
}

export interface EconomyView {
  readonly gold: number;
  readonly nextInterest: number;
  readonly lastReward: BattleReward | null;
}

function assertGold(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('골드는 0 이상의 안전한 정수여야 합니다');
}

/** 전투 보상을 받기 전 잔고로 계산한다. 보상 자체에는 이자가 붙지 않는다. */
export function goldInterest(gold: number): number {
  assertGold(gold);
  return Math.min(ECONOMY.INTEREST_MAX, Math.floor(gold / ECONOMY.INTEREST_STEP));
}

/** 전투와 렌더러를 모르는 골드 계정. 같은 전투 ID의 보상은 한 번만 지급한다. */
export class Economy {
  private balance: number;
  private readonly rewards = new Map<string, BattleReward>();
  private latest: BattleReward | null = null;

  constructor(startGold: number = ECONOMY.START_GOLD) {
    assertGold(startGold);
    this.balance = startGold;
  }

  get gold(): number {
    return this.balance;
  }

  snapshot(): EconomyView {
    return { gold: this.balance, nextInterest: goldInterest(this.balance), lastReward: this.latest };
  }

  /** 재생·리셋으로 동일 전투가 다시 끝나도 최초 영수증을 돌려주며 재지급하지 않는다. */
  settleBattle(battleId: string, kind: BattleKind, outcome: BattleOutcome): BattleReward {
    if (battleId.trim() === '') throw new Error('전투 ID가 필요합니다');
    if (!BATTLE_KINDS.includes(kind)) throw new Error('알 수 없는 전투 종류입니다');
    if (!['win', 'loss', 'draw'].includes(outcome)) throw new Error('알 수 없는 전투 결과입니다');
    const previous = this.rewards.get(battleId);
    if (previous) return previous;
    const base = outcome === 'win' ? ECONOMY.WIN_REWARDS[kind] : ECONOMY.LOSS_REWARD;
    const interest = goldInterest(this.balance);
    const total = base + interest;
    const goldAfter = this.balance + total;
    assertGold(goldAfter);
    const reward = Object.freeze({ battleId, kind, outcome, goldBefore: this.balance, base, interest, total, goldAfter });
    this.balance = goldAfter;
    this.rewards.set(battleId, reward);
    this.latest = reward;
    return reward;
  }

  /** 상점 등 다음 경제 기능이 쓸 차감 창구. 잔고 부족 시 상태를 바꾸지 않는다. */
  spend(amount: number): boolean {
    assertGold(amount);
    if (amount > this.balance) return false;
    this.balance -= amount;
    return true;
  }

  /** 판매·이벤트 등 즉시 수입. 오버플로를 포함한 잘못된 금액은 반영 전에 거부한다. */
  gain(amount: number): void {
    assertGold(amount);
    const next = this.balance + amount;
    assertGold(next);
    this.balance = next;
  }
}
