import type { Cell } from '../combat/board';
import type { Management, ManagementResult, ManagementSnapshot } from '../management';

/** 런 단계에 따라 로스터 명령을 허용할지 정하는 규칙 */
export interface RosterGate {
  /** 배치·판매 같은 편집 (전투 중·런 종료 후에는 불가) */
  canEdit(): boolean;
  /** 구매·리롤·잠금·경험치 (전투 준비와 상점 노드에서만) */
  canShop(): boolean;
}

const deny = (reason: string): ManagementResult => ({ ok: false, reason });

/**
 * 런이 노출하는 유닛 관리 명령. 기존 Management(상점·벤치·레벨·합성·판매)를 그대로 쓰되
 * 런 단계가 허용하지 않을 때는 상태를 바꾸지 않고 거부한다 (전투 진행 중 관리 명령 거부).
 */
export class RunRoster {
  constructor(
    private readonly management: Management,
    private readonly gate: RosterGate,
  ) {}

  snapshot(): ManagementSnapshot {
    return this.management.snapshot();
  }

  buy(slot: number): ManagementResult {
    return this.gate.canShop() ? this.management.buy(slot) : deny('지금은 유닛을 구매할 수 없습니다 (전투 준비·상점에서만 가능)');
  }

  reroll(): ManagementResult {
    return this.gate.canShop() ? this.management.reroll() : deny('지금은 리롤할 수 없습니다 (전투 준비·상점에서만 가능)');
  }

  toggleLock(): ManagementResult {
    return this.gate.canShop() ? this.management.toggleLock() : deny('지금은 상점을 잠글 수 없습니다 (전투 준비·상점에서만 가능)');
  }

  buyXp(): ManagementResult {
    return this.gate.canShop() ? this.management.buyXp() : deny('지금은 경험치를 구매할 수 없습니다 (전투 준비·상점에서만 가능)');
  }

  sell(id: number): ManagementResult {
    return this.gate.canEdit() ? this.management.sell(id) : deny('지금은 유닛을 판매할 수 없습니다');
  }

  moveToBoard(id: number, cell: Cell): ManagementResult {
    return this.gate.canEdit() ? this.management.moveToBoard(id, cell) : deny('지금은 유닛을 옮길 수 없습니다');
  }

  moveToBench(id: number, index?: number): ManagementResult {
    return this.gate.canEdit() ? this.management.moveToBench(id, index) : deny('지금은 유닛을 옮길 수 없습니다');
  }
}
