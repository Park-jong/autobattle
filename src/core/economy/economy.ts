import { FieldReader } from '../data/fieldReader';

/** 런 내에서 사용하는 골드 규칙. 모든 금액은 0 이상의 안전한 정수다. */
export const ECONOMY = {
  START_GOLD: 10,
  INTEREST_STEP: 10,
  INTEREST_MAX: 5,
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
  /** 유물 등 추가 승리 골드 (없으면 키 자체가 없다) */
  readonly bonus?: number;
  readonly total: number;
  readonly goldAfter: number;
}

export interface EconomyView {
  readonly gold: number;
  readonly nextInterest: number;
  readonly lastReward: BattleReward | null;
}

/** 저장용 상태: 잔고와 정산한 영수증 전부(중복 정산 방지 유지) */
export interface EconomyState {
  balance: number;
  rewards: BattleReward[];
  /** 가장 최근 영수증의 battleId (없으면 null) */
  latestId: string | null;
}

function assertGold(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('골드는 0 이상의 안전한 정수여야 합니다');
}

/** 전투 보상을 받기 전 잔고로 계산한다. 보상 자체에는 이자가 붙지 않는다. */
export function goldInterest(gold: number, maxBonus = 0): number {
  assertGold(gold);
  return Math.min(ECONOMY.INTEREST_MAX + maxBonus, Math.floor(gold / ECONOMY.INTEREST_STEP));
}

/** 유물이 바꾸는 골드 규칙 */
export interface EconomyModifiers {
  /** 이자 상한 증가 */
  interestMaxBonus: number;
  /** 전투 승리 보상 증가 */
  winBonus: number;
}

/** 전투와 렌더러를 모르는 골드 계정. 같은 전투 ID의 보상은 한 번만 지급한다. */
export class Economy {
  private balance: number;
  private readonly rewards = new Map<string, BattleReward>();
  private latest: BattleReward | null = null;
  private modifiers: EconomyModifiers = { interestMaxBonus: 0, winBonus: 0 };

  constructor(startGold: number = ECONOMY.START_GOLD) {
    assertGold(startGold);
    this.balance = startGold;
  }

  get gold(): number {
    return this.balance;
  }

  /** 유물 보정 (저장 대상이 아니라 보유 유물에서 매번 다시 계산해 넣는다) */
  setModifiers(modifiers: EconomyModifiers): void {
    this.modifiers = { ...modifiers };
  }

  /** JSON 직렬화 가능한 상태. 영수증은 정산 순서를 보존한다 */
  serialize(): EconomyState {
    return { balance: this.balance, rewards: [...this.rewards.values()].map((r) => ({ ...r })), latestId: this.latest?.battleId ?? null };
  }

  /** 저장된 상태에서 복원한다. 잘못된 데이터는 위치가 담긴 DataValidationError */
  static restore(data: unknown, path = 'economy'): Economy {
    const r = FieldReader.of(data, path);
    r.onlyKeys(['balance', 'rewards', 'latestId']);
    const economy = new Economy(r.int('balance', 0));
    for (const [i, raw] of r.array('rewards').entries()) {
      const rr = FieldReader.of(raw, `${path}.rewards[${i}]`);
      rr.onlyKeys(['battleId', 'kind', 'outcome', 'goldBefore', 'base', 'interest', 'bonus', 'total', 'goldAfter']);
      const reward: BattleReward = Object.freeze({
        battleId: rr.string('battleId'),
        kind: rr.enum('kind', BATTLE_KINDS),
        outcome: rr.enum('outcome', ['win', 'loss', 'draw'] as const),
        goldBefore: rr.int('goldBefore', 0), base: rr.int('base', 0), interest: rr.int('interest', 0),
        ...(rr.has('bonus') ? { bonus: rr.int('bonus', 1) } : {}),
        total: rr.int('total', 0), goldAfter: rr.int('goldAfter', 0),
      });
      if (economy.rewards.has(reward.battleId)) rr.fail('battleId', `중복된 전투 ID "${reward.battleId}"`);
      economy.rewards.set(reward.battleId, reward);
    }
    const latestId = r.has('latestId') && r.rawValue('latestId') !== null ? r.string('latestId') : null;
    if (latestId !== null) {
      const latest = economy.rewards.get(latestId);
      if (!latest) r.fail('latestId', `영수증 목록에 없는 전투 ID "${latestId}"`);
      economy.latest = latest ?? null;
    }
    return economy;
  }

  snapshot(): EconomyView {
    return { gold: this.balance, nextInterest: goldInterest(this.balance, this.modifiers.interestMaxBonus), lastReward: this.latest };
  }

  /** 재생·리셋으로 동일 전투가 다시 끝나도 최초 영수증을 돌려주며 재지급하지 않는다. */
  settleBattle(battleId: string, kind: BattleKind, outcome: BattleOutcome): BattleReward {
    if (battleId.trim() === '') throw new Error('전투 ID가 필요합니다');
    if (!BATTLE_KINDS.includes(kind)) throw new Error('알 수 없는 전투 종류입니다');
    if (!['win', 'loss', 'draw'].includes(outcome)) throw new Error('알 수 없는 전투 결과입니다');
    const previous = this.rewards.get(battleId);
    if (previous) return previous;
    const base = outcome === 'win' ? ECONOMY.WIN_REWARDS[kind] : ECONOMY.LOSS_REWARD;
    const interest = goldInterest(this.balance, this.modifiers.interestMaxBonus);
    const bonus = outcome === 'win' ? this.modifiers.winBonus : 0;
    const total = base + interest + bonus;
    const goldAfter = this.balance + total;
    assertGold(goldAfter);
    const reward: BattleReward = Object.freeze({
      battleId, kind, outcome, goldBefore: this.balance, base, interest, ...(bonus > 0 ? { bonus } : {}), total, goldAfter,
    });
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
