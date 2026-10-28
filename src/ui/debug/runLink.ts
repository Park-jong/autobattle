import type { DeckSnapshot } from '../../core/cards';
import type { CombatSimulator, FormationEntry } from '../../core/combat';
import type { Cell } from '../../core/combat/board';
import type { CommanderDef } from '../../core/data/commander';
import type { BattleKind, EconomyView } from '../../core/economy';
import type { ManagementResult, ManagementSnapshot } from '../../core/management';
import type { BattleSettlement, SettleResult } from '../../core/run';
import type { SessionPhase } from './contracts';

/** 로스터 명령 창구. Management(경제 플레이)와 RunRoster(런)가 같은 모양으로 만족한다 */
export interface RosterCommands {
  snapshot(): ManagementSnapshot;
  buy(slot: number): ManagementResult;
  reroll(): ManagementResult;
  toggleLock(): ManagementResult;
  buyXp(): ManagementResult;
  sell(id: number): ManagementResult;
  moveToBoard(id: number, cell: Cell): ManagementResult;
  moveToBench(id: number, index?: number): ManagementResult;
}

/**
 * 런 코어의 전투 한 판을 BattleSession이 재생하기 위한 연결. 세션은 런 컨트롤러를 직접 모르고
 * (준비 시뮬 발급 → 시작 → 정산) 이 인터페이스만 쓴다. 구현은 ui/run의 RunBattleAdapter.
 */
export interface RunBattleLink {
  readonly commander: CommanderDef;
  readonly roster: RosterCommands;
  readonly economyView: EconomyView;
  readonly kind: BattleKind;
  allyFormation(): FormationEntry[];
  enemyFormation(): FormationEntry[];
  /** 로스터를 편집하는 동안의 덱 (준비 시뮬이 없을 때 손패 표시용) */
  deck(): DeckSnapshot;
  /** 현재 노드·시도에 대한 준비 단계 시뮬을 새로 발급한다 (정산은 마지막으로 발급한 시뮬만 받는다) */
  createSimulator(): CombatSimulator;
  /** 전투 시작을 런에 알린다 (이후 로스터 명령 거부). 실패하면 사유 */
  begin(): { ok: true } | { ok: false; reason: string };
  /** 전투를 취소하고 준비 단계로 돌아간다 (정산 없음) */
  abandon(): void;
  complete(sim: CombatSimulator): SettleResult;
  /** 준비 단계에서 사용한 장비 카드를 로스터에 확정한다 */
  commitPreparedEquipment(sim: CombatSimulator): void;
}

/** 런 화면이 전투 세션에 요구하는 것 (BattleSession이 구현) */
export interface RunBattleHost {
  readonly phase: SessionPhase;
  /** 런 전투 연결을 걸고 준비 단계를 새로 만든다 (이미 걸려 있으면 같은 연결로 다시 만든다) */
  attachRun(link: RunBattleLink): void;
  /** 연결을 풀고 원래 디버그 편성으로 돌아간다 */
  detachRun(): void;
  /** 가장 최근에 끝난 런 전투의 정산 결과 (준비 단계를 다시 만들면 null) */
  runSettlement(): BattleSettlement | null;
  start(seed: number): void;
  subscribe(listener: () => void): () => void;
}
