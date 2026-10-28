import type { DeckPreset } from '../cards';
import type { BattleKind, BattleOutcome, BattleReward } from '../economy';
import type { ShopCardSlot } from './cardMarket';
import type { ShopRelicSlot } from './relicRewards';
import type { CommanderHealth } from './commanderHealth';
import type { EventSessionState } from './eventDirector';
import type { PlayerForces } from './forces';
import { RUN } from './constants';
import type { MapNode, NodeType, RunMap } from './runMap';

/**
 * 런 상태 머신의 단계.
 * - map: 다음 노드 선택 (시작 직후 포함)
 * - battlePrep: 전투 준비 (상점 구매·배치·준비 카드). 보스 전투에서 지고도 살아 있으면 다시 여기로 돌아온다
 * - battle: 전투 진행 중 (관리 명령 거부). 저장하면 battlePrep으로 저장된다
 * - reward: 전투 승리 카드 보상 선택
 * - bossRelic: 액트 보스를 쓰러뜨린 뒤 보스 유물 후보 중 하나 선택 (마지막 액트가 아닐 때)
 * - actIntro: 다음 액트로 넘어온 직후의 소개 화면 (지휘관 HP 회복 결과 표시). 계속하면 새 액트의 맵 단계
 * - shop / event / camp: 해당 노드 화면
 * - ended: 런 종료 (outcome: victory / dead)
 */
export const RUN_PHASES = ['map', 'battlePrep', 'battle', 'reward', 'bossRelic', 'actIntro', 'shop', 'event', 'camp', 'ended'] as const;
export type RunPhase = (typeof RUN_PHASES)[number];
export type RunOutcome = 'victory' | 'dead';

/** 노드 화면별 진행 정보 (현재 노드에 한정된 상태) */
export type NodeSession =
  /** tries: 이 노드의 전투 시도 횟수(0부터). 보스에서 지면 다시 도전하며 1씩 오른다 */
  | { kind: 'battle'; tries: number }
  /** relic: 정예 승리 보상으로 함께 받을 유물 id (없거나 일반 전투면 null). claimRelic으로 받는다 */
  | { kind: 'reward'; source: 'normal' | 'elite'; offer: string[]; relic: string | null }
  /** offer: 고를 수 있는 보스 유물 id (1~BOSS_CHOICES개). claimBossRelic으로 하나를 받거나 skipBossRelic으로 건너뛴다 */
  | { kind: 'bossRelic'; offer: string[] }
  /** 새 액트 도입: 액트 전환 회복 전 HP와 회복량 */
  | { kind: 'actIntro'; hpBefore: number; healed: number }
  | { kind: 'shop'; cards: ShopCardSlot[]; relics: ShopRelicSlot[] }
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
  /** 지휘관 패시브로 받은 골드 (녹스: 남은 CP당. 해당 없으면 0) */
  passiveGold: number;
  /** 유물로 회복한 지휘관 HP (승리 시 강철 심장 등. 없으면 0) */
  healed: number;
  hpBefore: number;
  hpAfter: number;
  /** 런이 끝났으면 결과 */
  runEnded: RunOutcome | null;
  /** 마지막 액트가 아닌 보스를 쓰러뜨렸다면 방금 끝낸 액트 번호 (다음은 보스 유물 선택 → 다음 액트). 그 외 null */
  actCleared: number | null;
  /** 보스 유물 후보 (actCleared이고 고를 후보가 있을 때. 없으면 null — 후보가 없으면 바로 다음 액트 소개로 간다) */
  bossRelicOffer: string[] | null;
  /** 승리 후 제시된 카드 보상 (없으면 null) */
  cardOffer: string[] | null;
  /** 정예 승리로 함께 제시된 유물 (없으면 null) */
  relicOffer: string | null;
}

/**
 * 런의 전체 상태 (데이터 묶음). 규칙은 RunController, 저장은 RunSerializer가 맡는다.
 * 난수는 용도별로 분리되어 있다: 맵·적 편성·보상·상점 진열·이벤트는 (시드, 액트, 노드)에서 파생하는 무상태 Rng,
 * 상점 유닛 Rng와 덱 섞기 Rng만 상태를 가지며 forces와 함께 저장된다.
 * 액트는 maps의 길이다: 보스를 쓰러뜨리고 다음 액트로 넘어갈 때 새 맵이 하나씩 붙고, 지난 액트의 맵도 기록 검증을 위해 남는다.
 * 노드 id는 액트가 다르면 겹치지 않으므로 visited·history·currentNodeId는 모든 액트를 이어서 담는다.
 */
export class RunState {
  currentNodeId: string | null = null;
  /** 입장한 노드 (모든 액트, 순서대로) */
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
    /** 액트 1부터 지금 액트까지의 맵 (마지막이 지금 맵) */
    readonly maps: RunMap[],
    readonly health: CommanderHealth,
    readonly forces: PlayerForces,
    /** 이 런의 전체 액트 수. 마지막 액트의 보스를 쓰러뜨리면 승리 */
    readonly totalActs: number = RUN.ACTS.COUNT,
  ) {}

  /** 지금 액트 (1부터) */
  get act(): number {
    return this.maps.length;
  }

  /** 지금 액트의 맵 */
  get map(): RunMap {
    return this.maps[this.maps.length - 1] as RunMap;
  }

  /** 모든 액트의 맵에서 노드를 찾는다 (노드 id는 액트가 달라도 겹치지 않는다) */
  findNode(id: string): { node: MapNode; act: number } | undefined {
    for (const map of this.maps) {
      const node = map.node(id);
      if (node) return { node, act: map.act };
    }
    return undefined;
  }
}
