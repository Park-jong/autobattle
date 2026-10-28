import type { ActiveTrait, Cell, CombatResult, FormationEntry, Side, StarLevel } from '../../core/combat';
import type { DeckPreset } from '../../core/cards';
import type { BattleKind, EconomyView } from '../../core/economy';
import type { ManagementSnapshot } from '../../core/management';
import type { CardInputMode } from '../cards/CardInteraction';
import type { CardPanelView } from '../cards/cardPanelView';
import type { PlaybackSpeed } from '../cards/playbackScale';
import type { GauntletRecord, GauntletSummary } from '../live/Gauntlet';
import type { ReplayEffect, TelegraphView, UnitView } from '../replay/ReplayState';

export { PLAYBACK_SPEEDS, type PlaybackSpeed } from '../cards/playbackScale';

/**
 * 진행 단계: 편성 중(지휘관이 있으면 "준비 단계": 손패 표시·작전 카드 사용) → 재생 중 ↔ 일시정지 → 종료
 */
export type SessionPhase = 'edit' | 'playing' | 'paused' | 'finished';

/** 팔레트 선택: 유닛 배치 또는 지우기 */
export type Brush = { kind: 'unit'; unitId: string; star: StarLevel } | { kind: 'erase' };

/** 연전(5연전) 진행 상황 */
export interface SeriesView {
  total: number;
  /** 지금 준비/진행 중인 판(0부터). 한 판이 끝나면 다음 판 번호이고, 모두 끝나면 total */
  index: number;
  /** 지금(또는 다음) 판의 이름. 모두 끝났으면 null */
  stageName: string | null;
  cardsEnabled: boolean;
  records: readonly GauntletRecord[];
  summary: GauntletSummary;
  done: boolean;
}

/** 패널이 그리는 데이터 스냅샷 (읽기 전용) */
export interface SessionSnapshot {
  phase: SessionPhase;
  speed: PlaybackSpeed;
  brush: Brush;
  formations: readonly [readonly FormationEntry[], readonly FormationEntry[]];
  traits: readonly [readonly ActiveTrait[], readonly ActiveTrait[]];
  result: CombatResult | null;
  /** 사용자에게 보여줄 오류. 없으면 null */
  error: string | null;
  seed: number;
  /** 선택한 지휘관 id. 없으면 null (카드 시스템 꺼짐) */
  commanderId: string | null;
  deckPreset: DeckPreset;
  battleKind: BattleKind;
  economy: EconomyView;
  management: { state: ManagementSnapshot; selectedUnitId: number | null; canManage: boolean } | null;
  /** 지금 적용 중인 시간 배율 (배속 × 슬로모션, 정지면 0) */
  timeScale: number;
  pauseOnCardHold: boolean;
  /** 편성을 편집할 수 있는지 (편성 단계이고 연전 중이 아님) */
  editable: boolean;
  /** 연전 모드가 아니면 null */
  series: SeriesView | null;
}

/** 카드 대상 지정 중 씬이 그릴 강조 정보 */
export interface TargetingView {
  active: boolean;
  /** 유효 대상 유닛 uid (강조) */
  validUnits: readonly number[];
  /** allyUnits에서 이미 고른 유닛 (고른 순서) */
  selectedUnits: readonly number[];
  /** 마우스가 가리키는 유효 대상 */
  hoverUnit: number | null;
  /** cell/area3x3 범위 미리보기 칸 */
  areaCells: readonly Cell[];
  /** 대상 없는 카드: 보드 전체가 "놓는 곳" */
  dropZone: boolean;
  hint: string;
}

/** 씬이 보는 쪽: 재생 화면 소스. 패널과 분리된 작은 인터페이스 */
export interface BattleViewSource {
  readonly phase: SessionPhase;
  /** 전투 시각(초). 편성 중이면 0 */
  readonly time: number;
  readonly overheating: boolean;
  /** 지휘관이 있는 편성 단계 = 준비 단계 */
  readonly prepping: boolean;
  /** 지금 적용 중인 시간 배율 (슬로모션 표시용) */
  readonly timeScale: number;
  /** 현재 화면에 그릴 유닛들 (편성 중이면 편성 미리보기) */
  views(): readonly UnitView[];
  recentEffects(maxAge: number): readonly ReplayEffect[];
  /** 지금 강조할 보스 패턴 예고 (재생 시각 기준, 발동 전까지) */
  telegraphs(): readonly TelegraphView[];
  /** 프레임 경과 실제 시간(초, 배속·슬로모션 적용 전)만큼 재생을 진행 */
  advance(dtSeconds: number): void;
  /** 편성 중 해당 칸이 배치 가능한지 */
  canPlaceAt(cell: Cell): boolean;
  targeting(): TargetingView;
  /** 포인터 입력 (게임 좌표 1280x720). 칸/유닛 판정은 세션이 보간 위치 기준으로 한다 */
  pointerMoved(x: number, y: number): void;
  pointerLeft(): void;
  /** 좌클릭: 대상 지정 또는 배치 / 우클릭: 선택 취소 또는 제거 */
  pointerDown(x: number, y: number, rightButton: boolean): void;
  subscribe(listener: () => void): () => void;
}

/** 패널이 쓰는 쪽: 명령과 상태 조회 */
export interface DebugController {
  snapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  setBrush(brush: Brush): void;
  start(seed: number): void;
  /** 입력칸의 시드가 바뀌었을 때 (지휘관이 있으면 손패를 다시 뽑는다) */
  setSeed(seed: number): void;
  togglePause(): void;
  setSpeed(speed: PlaybackSpeed): void;
  reset(): void;
  /** 단일 전투 결과를 확정하고 잔고를 유지한 채 새 전투를 준비한다 */
  nextBattle(): void;
  /** 단일 디버그 경제를 시작 잔고로 초기화한다 (준비 단계에서만) */
  resetEconomy(): void;
  setBattleKind(kind: BattleKind): void;
  startManagementRun(preset?: DeckPreset): void;
  endManagementRun(): void;
  buyUnit(slot: number): void;
  rerollShop(): void;
  buyExperience(): void;
  toggleShopLock(): void;
  selectManagedUnit(id: number | null): void;
  moveManagedToBoard(id: number, cell: Cell): void;
  moveManagedToBench(id: number, index?: number): void;
  sellManagedUnit(id: number): void;
  managedUnitAtStage(x: number, y: number): number | null;
  dropManagedToBoard(id: number, x: number, y: number): void;
  clearSide(side: Side): void;
  exportFormation(side: Side): string;
  /** 오류가 있으면 Error를 던진다 (한국어 메시지) */
  importFormation(side: Side, json: string): void;
  /** 패널에서 발생한 오류를 화면에 표시 */
  reportError(message: string): void;
  /** 지휘관 선택 (null이면 카드 시스템 끔) */
  setCommander(commanderId: string | null): void;
  setDeckPreset(preset: DeckPreset): void;
  /** 선택한 지휘관의 시작 유닛 편성을 아군 쪽에 불러온다 */
  loadCommanderStart(): void;
  setPauseOnCardHold(enabled: boolean): void;
  /** 현재 아군 편성으로 고정 적 편성 연전을 시작 */
  startSeries(cardsEnabled: boolean): void;
  /** 끝난 판 다음의 준비 단계로 */
  nextSeriesBattle(): void;
  /** 연전을 중단하고 원래 편성으로 돌아간다 */
  endSeries(): void;
}

/** 손패 패널(HTML)이 쓰는 쪽 */
export interface CardController {
  cardView(): CardPanelView;
  subscribe(listener: () => void): () => void;
  /** 카드를 집는다: click = 선택 후 대상 클릭, drag = 끌기 시작 (슬로모션 시작) */
  beginCard(instanceId: number, mode: CardInputMode): void;
  /** 대상이 필요 없는 카드는 바로 사용, 그 외는 클릭 선택으로 시작 */
  useCardNow(instanceId: number): void;
  cancelCard(): void;
  /** 드래그 중 포인터 위치 (게임 좌표). 캔버스 밖이면 pointerLeft */
  pointerMoved(x: number, y: number): void;
  pointerLeft(): void;
  /** 드래그를 놓았다. point가 null이면 캔버스 밖 */
  dropCard(point: { x: number; y: number } | null): void;
}
