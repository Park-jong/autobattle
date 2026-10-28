import type { SaveStatus } from './RunSaveStore';
import type {
  ActIntroView, BossRelicView, CommanderChoiceView, CampScreenView, EncounterPreviewView, EndScreenView, EventScreenView, MapView, RewardView, RunHud,
  SettlementView, ShopScreenView,
} from './runViews';

/** 지금 보여줄 화면 */
export type RunScreenId = 'start' | 'map' | 'battle' | 'reward' | 'bossRelic' | 'actIntro' | 'shop' | 'event' | 'camp' | 'ended' | 'debug';

/** 전투 화면의 진행: 준비 → 재생 → 결과 */
export type BattleStage = 'prep' | 'playing' | 'result';

export interface StartInfo {
  save: SaveStatus;
  /** 새 런 입력칸에 미리 채울 시드 */
  suggestedSeed: number;
  /** 고를 수 있는 지휘관 (해금은 M5-5 전까지 적용하지 않아 모두 선택 가능) */
  commanders: CommanderChoiceView[];
  /** 처음 선택해 둘 지휘관 id */
  defaultCommanderId: string;
}

export interface BattleScreenInfo {
  stage: BattleStage;
  /** 이 전투의 적 편성 (미리보기와 같은 계획) */
  plan: EncounterPreviewView;
  /** 보스 재도전이면 몇 번째 시도인지 (처음이면 1) */
  attempt: number;
  /** 정산 결과 (결과 단계에서만) */
  settlement: SettlementView | null;
}

/** 사용자에게 알릴 한 줄 (같은 id면 같은 알림) */
export interface RunNotice {
  id: number;
  kind: 'error' | 'info';
  message: string;
}

/** 화면이 그리는 읽기 전용 스냅샷. 화면에 해당하지 않는 조각은 null */
export interface RunSnapshot {
  screen: RunScreenId;
  notice: RunNotice | null;
  start: StartInfo | null;
  hud: RunHud | null;
  map: MapView | null;
  battle: BattleScreenInfo | null;
  reward: RewardView | null;
  bossRelic: BossRelicView | null;
  actIntro: ActIntroView | null;
  shop: ShopScreenView | null;
  event: EventScreenView | null;
  camp: CampScreenView | null;
  ended: EndScreenView | null;
}

/** 화면이 보는 쪽 (구독 + 스냅샷). Phaser·DOM과 무관 */
export interface RunViewSource {
  snapshot(): RunSnapshot;
  subscribe(listener: () => void): () => void;
  /** 맵에서 노드에 마우스를 올렸을 때 적 편성 미리보기 (전투·정예·보스가 아니면 null) */
  previewNode(nodeId: string): EncounterPreviewView | null;
}

/** 화면이 내리는 명령. 실패하면 상태는 그대로이고 사유가 알림으로 나온다 */
export interface RunCommands {
  // 시작 화면
  /** commanderId를 생략하면 기본 지휘관 */
  newRun(seed: number | null, commanderId?: string): void;
  continueRun(): void;
  deleteSave(): void;
  openManagement(): void;
  openDebug(): void;
  /** 런을 저장해 둔 채 시작 화면으로 */
  toStart(): void;
  // 맵
  chooseNode(nodeId: string): void;
  // 전투
  startBattle(): void;
  continueAfterBattle(): void;
  // 보상
  claimReward(index: number): void;
  skipReward(): void;
  /** 정예 보상 유물을 받는다 (카드 보상을 고르거나 건너뛸 때도 함께 받는다) */
  claimRelic(): void;
  // 보스 유물 선택 / 액트 소개
  /** 보스 유물 후보 중 하나를 받고 다음 액트로 넘어간다 */
  claimBossRelic(index: number): void;
  /** 보스 유물을 받지 않고 다음 액트로 넘어간다 */
  skipBossRelic(): void;
  /** 액트 소개를 확인하고 새 액트의 맵으로 간다 */
  continueAct(): void;
  // 상점
  buyShopCard(slot: number): void;
  buyShopRelic(slot: number): void;
  removeCard(instanceId: number): void;
  leaveShop(): void;
  // 이벤트
  chooseEventOption(index: number): void;
  pickEventOption(optionIndex: number): void;
  finishEvent(): void;
  // 야영지
  campHeal(): void;
  campUpgrade(instanceId: number): void;
  campPromote(ownedUnitId: number): void;
  leaveCamp(): void;
}
