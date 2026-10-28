import type { DeckPreset } from '../cards';
import type { BattleKind, BattleOutcome, BattleReward } from '../economy';
import type { ShopCardSlot } from './cardMarket';
import type { CommanderHealth } from './commanderHealth';
import type { EventSessionState } from './eventDirector';
import type { PlayerForces } from './forces';
import type { NodeType, RunMap } from './runMap';

/**
 * 런 상태 머신의 단계.
 * - map: 다음 노드 선택 (시작 직후 포함)
 * - battlePrep: 전투 준비 (상점 구매·배치·준비 카드). 보스 전투에서 지고도 살아 있으면 다시 여기로 돌아온다
 * - battle: 전투 진행 중 (관리 명령 거부). 저장하면 battlePrep으로 저장된다
 * - reward: 전투 승리 카드 보상 선택
 * - shop / event / camp: 해당 노드 화면
 * - ended: 런 종료 (outcome: victory / dead)
 */
export const RUN_PHASES = ['map', 'battlePrep', 'battle', 'reward', 'shop', 'event', 'camp', 'ended'] as const;
export type RunPhase = (typeof RUN_PHASES)[number];
export type RunOutcome = 'victory' | 'dead';

/** 노드 화면별 진행 정보 (현재 노드에 한정된 상태) */
export type NodeSession =
  /** tries: 이 노드의 전투 시도 횟수(0부터). 보스에서 지면 다시 도전하며 1씩 오른다 */
  | { kind: 'battle'; tries: number }
  | { kind: 'reward'; source: 'normal' | 'elite'; offer: string[] }
  | { kind: 'shop'; cards: ShopCardSlot[] }
  | { kind: 'event'; state: EventSessionState }
  | { kind: 'camp' };

/** 지나온 전투의 기록 */
export interface RunRecord {
  nodeId: string;
  floor: number;
  type: NodeType;
  outcome: BattleOutcome;
  endTime: number;
  cardsUsed: number;
  hpAfter: number;
  goldAfter: number;
}

/** 한 전투를 런에 반영한 결과 */
export interface BattleSettlement {
  nodeId: string;
  kind: BattleKind;
  outcome: BattleOutcome;
  reward: BattleReward;
  /** 카드(심연의 계약 등)로 잃은 지휘관 HP */
  cardHpLost: number;
  /** 패배 피해 (승리하면 0) */
  defeatDamage: number;
  hpBefore: number;
  hpAfter: number;
  /** 런이 끝났으면 결과 */
  runEnded: RunOutcome | null;
  /** 승리 후 제시된 카드 보상 (없으면 null) */
  cardOffer: string[] | null;
}

/**
 * 런의 전체 상태 (데이터 묶음). 규칙은 RunController, 저장은 RunSerializer가 맡는다.
 * 난수는 용도별로 분리되어 있다: 맵·적 편성·보상·상점 진열·이벤트는 (시드, 노드)에서 파생하는 무상태 Rng,
 * 상점 유닛 Rng와 덱 섞기 Rng만 상태를 가지며 forces와 함께 저장된다.
 */
export class RunState {
  currentNodeId: string | null = null;
  /** 입장한 노드 (순서대로) */
  visited: string[] = [];
  /** 상점에서 카드를 제거한 횟수 (가격 증가 기준) */
  removals = 0;
  /** 이미 나온 이벤트 id */
  seenEvents: string[] = [];
  phase: RunPhase = 'map';
  session: NodeSession | null = null;
  outcome: RunOutcome | null = null;
  history: RunRecord[] = [];

  constructor(
    readonly seed: number,
    readonly commanderId: string,
    readonly deckPreset: DeckPreset,
    readonly map: RunMap,
    readonly health: CommanderHealth,
    readonly forces: PlayerForces,
  ) {}
}
