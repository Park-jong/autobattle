/**
 * 한 전투 동안 카드로 쓸 수 있는 지휘관 HP 장부. 지휘관 HP 자체는 런이 소유하고,
 * 전투는 시작 시점의 HP만 받아 "남는 HP가 1 이상"인 범위에서만 비용을 허용한다.
 * 실제 차감은 commanderHp 이벤트를 보고 런이 정산한다 (전투는 결정론을 위해 런 상태를 바꾸지 않는다).
 * 값을 주지 않으면(런이 아닌 디버그 전투) 사실상 무제한(MAX_SAFE_INTEGER)으로 본다.
 */
export class CommanderHpLedger {
  private left: number;
  private lost = 0;
  /** 런에서 현재 HP를 받았는가 (디버그 전투는 false) */
  readonly tracked: boolean;

  constructor(available?: number) {
    this.tracked = available !== undefined;
    this.left = available ?? Number.MAX_SAFE_INTEGER;
  }

  /** 이 전투에서 아직 쓸 수 있는 HP */
  get remaining(): number {
    return this.left;
  }

  /** 이 전투에서 카드로 잃은 HP 합계 */
  get spent(): number {
    return this.lost;
  }

  /** 지불 후에도 HP가 1 이상 남아야 한다 */
  canSpend(amount: number): boolean {
    return this.left - amount >= 1;
  }

  spend(amount: number): void {
    this.left -= amount;
    this.lost += amount;
  }
}
