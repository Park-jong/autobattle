import { CARDS, Deck, type DeckPreset, type DeckSnapshot } from '../../core/cards';
import {
  TraitEngine,
  CombatSimulator,
  isInsideBoard,
  assertFormationValid,
  parseFormation,
  sameCell,
  sideOfCol,
  type ActiveTrait,
  type Cell,
  type CombatResult,
  type FormationEntry,
  type PlayTarget,
  type Side,
} from '../../core/combat';
import type { UnitDef } from '../../core/data';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { CommanderCatalog } from '../../core/data/commanderLoader';
import type { CommanderDef } from '../../core/data/commander';
import type { TraitCatalog } from '../../core/data/traitLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import { Rng } from '../../core/rng';
import { Economy, type BattleKind } from '../../core/economy';
import type { ManagementResult } from '../../core/management';
import { forceCombatResult, type BattleSettlement, type ForcedResult } from '../../core/run';
import { BoardLayout } from '../battle/BoardLayout';
import { BoardPicker, type BoardPick } from '../battle/BoardPicker';
import { CardInteraction, type CardInputMode, type InteractionOutcome } from '../cards/CardInteraction';
import { CardPanelViewBuilder, hiddenCardPanelView, type CardPanelView, type DeckPiles } from '../cards/cardPanelView';
import { createStartingDeck, dealOpeningHand } from '../cards/dealDeck';
import { playbackScale } from '../cards/playbackScale';
import { Gauntlet, type GauntletStage } from '../live/Gauntlet';
import { LiveBattle } from '../live/LiveBattle';
import { ManagementRun } from '../live/ManagementRun';
import { ReplayState, type MeteorView, type ReplayEffect, type ReviveWatchView, type TelegraphView, type UltimateAuraView, type UnitView, type ZoneView } from '../replay/ReplayState';
import { CARD_UI, LAYOUT } from '../theme';
import type { RosterCommands, RunBattleHost, RunBattleLink } from './runLink';
import type {
  BattleViewSource,
  Brush,
  CardController,
  DebugController,
  PlaybackSpeed,
  SessionPhase,
  SessionSnapshot,
  SeriesView,
  TargetingView,
} from './contracts';

const SIDE_NAMES = ['아군', '적'] as const;

const EMPTY_TARGETING: TargetingView = {
  active: false,
  validUnits: [],
  selectedUnits: [],
  hoverUnit: null,
  areaCells: [],
  areaCenter: null,
  areaUnits: [],
  invalidHoverUnit: null,
  dropZone: false,
  hint: '',
};

/** 카드·지휘관·연전 기능에 필요한 선택 의존성 (없으면 M1 디버그 화면과 같은 동작) */
export interface SessionExtras {
  cards?: CardCatalog;
  commanders?: CommanderCatalog;
  /** 지휘관 id → 시작 유닛 편성 ("시작 편성 불러오기") */
  startFormations?: ReadonlyMap<string, readonly FormationEntry[]>;
  /** 연전의 고정 적 편성 (순서대로) */
  seriesStages?: readonly GauntletStage[];
  /** 포인터 → 칸/유닛 변환기 (기본: theme의 보드 배치) */
  picker?: BoardPicker;
  /** 처음 선택해 둘 지휘관 id (없거나 카탈로그에 없으면 지휘관 없음) */
  defaultCommanderId?: string | null;
}

/**
 * 디버그 화면의 상태 한 곳: 편성 편집, 지휘관·덱·카드, 전투 진행(LiveBattle), 연전(Gauntlet)을 묶는다 (Phaser·DOM 비의존).
 * 씬은 BattleViewSource, 패널은 DebugController, 손패 패널은 CardController 인터페이스로만 접근한다.
 *
 * 전투는 재생 시각에 맞춰 sim을 조금씩 진행하며(LiveBattle), 카드는 그때 진행된 틱에서 사용한다.
 * 지휘관이 있으면 편성 단계가 곧 준비 단계다: 손패가 뽑혀 있고 작전 카드를 준비 CP로 쓸 수 있으며,
 * 이때의 sim은 전투 시작 직전 상태(LiveBattle, startCombat 전)로 살아 있다. 편성·시드·지휘관이 바뀌면 다시 만든다.
 */
export class BattleSession implements BattleViewSource, DebugController, CardController, RunBattleHost {
  private formations: [FormationEntry[], FormationEntry[]];
  private brush: Brush;
  private currentPhase: SessionPhase = 'edit';
  private speed: PlaybackSpeed = 1;
  private pauseOnCardHold = false;
  private error: string | null = null;
  private seed = 1;
  private commander: CommanderDef | null = null;
  private deckPreset: DeckPreset = 'starter';
  private economy = new Economy();
  private battleKind: BattleKind = 'normal';
  private singleBattleId = 1;
  private managementRun: ManagementRun | null = null;
  /** 런 코어의 전투를 재생 중이면 그 연결 (경제 플레이와 배타) */
  private runLink: RunBattleLink | null = null;
  private runResult: BattleSettlement | null = null;
  private selectedOwnedId: number | null = null;
  private savedManagementFormations: [FormationEntry[], FormationEntry[]] | null = null;
  private savedCommander: CommanderDef | null = null;
  /** 단일 전투의 준비 덱 (손패가 뽑힌 상태). 연전 중에는 Gauntlet이 덱을 관리한다 */
  private deckSnapshot: DeckSnapshot | null = null;
  private live: LiveBattle | null = null;
  private result: CombatResult | null = null;
  private preview: ReplayState;
  private gauntlet: Gauntlet | null = null;
  private savedEnemy: FormationEntry[] = [];
  private lastPick: BoardPick | null = null;
  private toastSeq = 0;
  private toast: { id: number; message: string } | null = null;
  private fallbackDeck: Deck | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly traitEngine: TraitEngine;
  private readonly interaction: CardInteraction;
  private readonly picker: BoardPicker;
  private readonly panelBuilder: CardPanelViewBuilder | null;

  constructor(
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    initial: readonly [readonly FormationEntry[], readonly FormationEntry[]] = [[], []],
    private readonly extras: SessionExtras = {},
  ) {
    this.formations = [[...initial[0]], [...initial[1]]];
    this.traitEngine = new TraitEngine(traits);
    const first = units.units[0];
    this.brush = first ? { kind: 'unit', unitId: first.id, star: 1 } : { kind: 'erase' };
    this.picker =
      extras.picker ??
      new BoardPicker(new BoardLayout(LAYOUT.BOARD_X, LAYOUT.BOARD_Y, LAYOUT.CELL_SIZE), CARD_UI.UNIT_PICK_RADIUS);
    this.interaction = new CardInteraction(() => this.views());
    this.panelBuilder = extras.cards ? new CardPanelViewBuilder(extras.cards) : null;
    this.preview = this.buildPreview();
    const defaultId = extras.defaultCommanderId;
    this.commander = (defaultId ? extras.commanders?.get(defaultId) : undefined) ?? null;
    if (this.commander && extras.cards) {
      this.redeal();
      this.rebuildPrep();
    } else {
      this.commander = null;
    }
  }

  // ---- BattleViewSource ----

  get phase(): SessionPhase {
    return this.currentPhase;
  }

  get time(): number {
    return this.currentPhase === 'edit' ? 0 : (this.live?.time ?? 0);
  }

  get overheating(): boolean {
    return this.live !== null && this.currentPhase !== 'edit' && this.live.replay.overheating;
  }

  get openSlots(): number {
    if (!this.roster || !this.canManage()) return 0;
    const snapshot = this.roster.snapshot();
    return Math.max(0, snapshot.level - snapshot.population);
  }

  get prepping(): boolean {
    return this.currentPhase === 'edit' && this.commander !== null;
  }

  get timeScale(): number {
    return playbackScale({
      speed: this.speed,
      paused: this.currentPhase === 'paused',
      cardHeld: this.interaction.active,
      pauseOnCardHold: this.pauseOnCardHold,
    });
  }

  views(): readonly UnitView[] {
    return this.activeReplay().views();
  }

  recentEffects(maxAge: number): readonly ReplayEffect[] {
    if (this.currentPhase === 'edit' || !this.live) return [];
    const effects = this.live.replay.recentEffects(maxAge);
    // 전투가 끝나면 재생 시각이 멈추므로, 강타 번쩍임이 결과 화면에 남지 않게 보스 연출은 걷어 낸다
    return this.currentPhase === 'finished' ? effects.filter((e) => e.kind !== 'strike' && e.kind !== 'telegraph' && e.kind !== 'impact' && e.kind !== 'ultimate' && e.kind !== 'phase' && e.kind !== 'revive' && e.kind !== 'dispel' && e.kind !== 'reviveCancel' && e.kind !== 'zonePulse' && e.kind !== 'phoenix') : effects;
  }

  meteors(): readonly MeteorView[] {
    return this.currentPhase === 'edit' || this.currentPhase === 'finished' || !this.live ? [] : this.live.replay.meteors();
  }

  ultimateAura(): UltimateAuraView | null {
    return this.currentPhase === 'edit' || this.currentPhase === 'finished' || !this.live ? null : this.live.replay.ultimateAura();
  }

  reviveWatches(): readonly ReviveWatchView[] {
    return this.currentPhase === 'edit' || this.currentPhase === 'finished' || !this.live ? [] : this.live.replay.reviveWatches();
  }

  zones(): readonly ZoneView[] {
    return this.currentPhase === 'edit' || this.currentPhase === 'finished' || !this.live ? [] : this.live.replay.zones();
  }

  telegraphs(): readonly TelegraphView[] {
    return this.currentPhase === 'edit' || this.currentPhase === 'finished' || !this.live ? [] : this.live.replay.telegraphs();
  }

  advance(dtSeconds: number): void {
    if (this.currentPhase !== 'playing' || !this.live) return;
    this.live.advance(dtSeconds * this.timeScale);
    if (this.live.finished) this.finishBattle(this.live);
  }

  canPlaceAt(cell: Cell): boolean {
    if (this.roster) return this.canManage() && isInsideBoard(cell) && cell.col < 4;
    return this.isEditable() && isInsideBoard(cell);
  }

  targeting(): TargetingView {
    if (!this.interaction.active) return EMPTY_TARGETING;
    return {
      active: true,
      validUnits: this.interaction.validUnits(),
      selectedUnits: [...this.interaction.pickedUnits],
      hoverUnit: this.interaction.hoverUnit(),
      areaCells: this.interaction.previewCells(),
      areaCenter: this.interaction.previewCenter(),
      areaUnits: this.interaction.previewUnits(),
      invalidHoverUnit: this.interaction.invalidHoverUnit(),
      dropZone: this.interaction.dropZone,
      hint: this.interaction.hint(),
    };
  }

  pointerMoved(x: number, y: number): void {
    this.lastPick = this.picker.pick(x, y, this.views());
    this.interaction.hover(this.lastPick);
  }

  /** 게임 좌표 아래의 살아 있는 유닛 (툴팁·정보 패널용, 보간 위치 기준). 없으면 null */
  unitAtStage(x: number, y: number): UnitView | null {
    const uid = this.picker.pick(x, y, this.views()).unitUid;
    return uid === null ? null : this.views().find((v) => v.uid === uid) ?? null;
  }

  pointerLeft(): void {
    this.lastPick = null;
    this.interaction.hover(null);
  }

  pointerDown(x: number, y: number, rightButton: boolean): void {
    const pick = this.picker.pick(x, y, this.views());
    if (this.interaction.active) {
      this.handleOutcome(rightButton ? this.interaction.cancel() : this.interaction.activate(pick));
      return;
    }
    if (pick.cell) this.clickCell(pick.cell, rightButton);
  }

  // ---- DebugController ----

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.currentPhase,
      speed: this.speed,
      brush: this.brush,
      formations: [[...this.formations[0]], [...this.formations[1]]],
      traits: [this.traitsOf(0), this.traitsOf(1)],
      result: this.currentPhase === 'finished' ? this.result : null,
      error: this.error,
      seed: this.seed,
      commanderId: this.commander?.id ?? null,
      deckPreset: this.deckPreset,
      battleKind: this.runLink?.kind ?? this.managementRun?.stage?.kind ?? this.gauntlet?.stage?.kind ?? (this.gauntlet || this.managementRun ? 'normal' : this.battleKind),
      economy: this.runLink?.economyView ?? this.managementRun?.economyView ?? this.gauntlet?.economyView ?? this.economy.snapshot(),
      management: this.roster ? { state: this.roster.snapshot(), selectedUnitId: this.selectedOwnedId, canManage: this.canManage() } : null,
      timeScale: this.timeScale,
      pauseOnCardHold: this.pauseOnCardHold,
      editable: this.isEditable(),
      series: this.seriesView(),
    };
  }

  setBrush(brush: Brush): void {
    this.brush = brush;
    this.notify();
  }

  setSeed(seed: number): void {
    if (!Number.isInteger(seed) || seed === this.seed) return;
    if (this.currentPhase !== 'edit' || this.gauntlet || this.managementRun || this.runLink) return;
    this.seed = seed;
    this.redeal();
    this.rebuildPrep();
    this.notify();
  }

  start(seed: number): void {
    if (this.currentPhase !== 'edit') return;
    if (!Number.isInteger(seed)) return this.fail('시드는 정수여야 합니다.');
    if (this.formations[0].length === 0 || this.formations[1].length === 0) {
      return this.fail('양쪽 진영에 유닛을 1기 이상 배치하세요.');
    }
    if (!this.gauntlet && !this.managementRun && !this.runLink && seed !== this.seed) {
      this.seed = seed;
      this.redeal();
      this.rebuildPrep();
    }
    const link = this.runLink;
    if (link) {
      const begun = link.begin();
      if (!begun.ok) return this.fail(begun.reason);
    }
    try {
      const live = this.live ?? this.createLive();
      live.startCombat();
      this.live = live;
    } catch (e) {
      link?.abandon();
      return this.fail(`전투 계산 실패: ${(e as Error).message}`);
    }
    this.interaction.cancel();
    this.result = null;
    this.currentPhase = 'playing';
    this.error = null;
    this.notify();
  }

  togglePause(): void {
    if (this.currentPhase === 'playing') this.currentPhase = 'paused';
    else if (this.currentPhase === 'paused') this.currentPhase = 'playing';
    else return;
    this.notify();
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.speed = speed;
    this.notify();
  }

  setPauseOnCardHold(enabled: boolean): void {
    this.pauseOnCardHold = enabled;
    this.notify();
  }

  /** 편성(준비) 상태로 돌아간다. 편성·시드·손패는 유지, 연전 중에는 같은 판의 준비 단계로 돌아간다 */
  reset(): void {
    if ((this.gauntlet || this.managementRun || this.runLink) && this.currentPhase === 'finished') return; // 결과가 기록된 판은 "다음 전투"로 넘어간다
    this.toBattlePrep();
  }

  nextBattle(): void {
    if (this.managementRun) return this.nextSeriesBattle();
    if (this.gauntlet || this.runLink || this.currentPhase !== 'finished') return;
    this.singleBattleId += 1;
    this.toBattlePrep();
  }

  resetEconomy(): void {
    if (!this.isEditable()) return;
    this.economy = new Economy();
    this.singleBattleId = 1;
    this.notify();
  }

  setBattleKind(kind: BattleKind): void {
    if (!this.isEditable() || kind === this.battleKind) return;
    if (!['normal', 'elite', 'boss'].includes(kind)) return;
    this.battleKind = kind;
    this.notify();
  }

  startManagementRun(preset: DeckPreset = this.deckPreset): void {
    if (this.gauntlet || this.runLink || (this.currentPhase !== 'edit' && this.currentPhase !== 'finished')) return;
    const commander = this.commander;
    const cards = this.extras.cards;
    const stages = this.extras.seriesStages;
    if (!commander || !cards) return this.fail('경제 플레이를 시작하려면 지휘관을 선택하세요.');
    if (!stages || stages.length === 0) return this.fail('경제 플레이의 적 편성이 없습니다.');
    try {
      const run = new ManagementRun(this.units, cards, commander, stages, this.seed, preset);
      if (!this.managementRun) this.savedManagementFormations = [[...this.formations[0]], [...this.formations[1]]];
      this.managementRun = run;
      this.selectedOwnedId = null;
      this.syncManagementFormation();
      this.toBattlePrep();
    } catch (e) {
      this.fail(`경제 플레이 생성 실패: ${(e as Error).message}`);
    }
  }

  endManagementRun(): void {
    if (!this.managementRun) return;
    this.managementRun = null;
    this.selectedOwnedId = null;
    if (this.savedManagementFormations) this.formations = this.savedManagementFormations;
    this.savedManagementFormations = null;
    this.toBattlePrep();
  }

  buyUnit(slot: number): void {
    this.manage((roster) => roster.buy(slot));
  }

  rerollShop(): void {
    this.manage((roster) => roster.reroll());
  }

  buyExperience(): void {
    this.manage((roster) => roster.buyXp());
  }

  toggleShopLock(): void {
    this.manage((roster) => roster.toggleLock());
  }

  selectManagedUnit(id: number | null): void {
    if (!this.canManage()) return;
    const snapshot = this.roster!.snapshot();
    if (id !== null && ![...snapshot.board, ...snapshot.bench].some((unit) => unit?.id === id)) return;
    this.selectedOwnedId = this.selectedOwnedId === id ? null : id;
    this.notify();
  }

  moveManagedToBoard(id: number, cell: Cell): void {
    this.manage((roster) => roster.moveToBoard(id, cell));
  }

  moveManagedToBench(id: number, index?: number): void {
    this.manage((roster) => roster.moveToBench(id, index));
  }

  sellManagedUnit(id: number): void {
    this.manage((roster) => roster.sell(id));
  }

  managedUnitAtStage(x: number, y: number): number | null {
    if (!this.canManage() || this.interaction.active) return null;
    const cell = this.picker.pick(x, y, this.views()).cell;
    if (!cell) return null;
    return this.roster!.snapshot().board.find((unit) => unit.cell && sameCell(unit.cell, cell))?.id ?? null;
  }

  dropManagedToBoard(id: number, x: number, y: number): void {
    if (!this.canManage()) return;
    const cell = this.picker.pick(x, y, this.views()).cell;
    if (!cell || cell.col >= 4) return this.showToast('아군 보드에 유닛을 놓으세요.');
    this.moveManagedToBoard(id, cell);
  }

  /** 지금 유닛 관리 명령을 받는 쪽: 경제 플레이의 Management 또는 런의 RunRoster */
  private get roster(): RosterCommands | null {
    return this.runLink?.roster ?? this.managementRun?.management ?? null;
  }

  private canManage(): boolean {
    return this.roster !== null && this.currentPhase === 'edit' && !(this.managementRun?.done ?? false);
  }

  private manage(action: (roster: RosterCommands) => ManagementResult): void {
    const roster = this.roster;
    if (!roster || !this.canManage()) return;
    const formationBefore = JSON.stringify(this.formations[0]);
    const result = action(roster);
    if (!result.ok) return this.showToast(result.reason);
    const snapshot = roster.snapshot();
    if (![...snapshot.board, ...snapshot.bench].some((unit) => unit?.id === this.selectedOwnedId)) this.selectedOwnedId = null;
    this.syncManagementFormation();
    if (JSON.stringify(this.formations[0]) !== formationBefore) this.formationChanged();
    else this.notify();
  }

  private syncManagementFormation(): void {
    const link = this.runLink;
    if (link) {
      this.formations[0] = link.allyFormation();
      this.formations[1] = link.enemyFormation();
      return;
    }
    const run = this.managementRun;
    if (!run) return;
    this.formations[0] = run.formation();
    if (run.stage) this.formations[1] = [...run.stage.enemy];
  }

  clearSide(side: Side): void {
    if (!this.isEditable()) return;
    this.formations[side] = [];
    this.error = null;
    this.formationChanged();
  }

  exportFormation(side: Side): string {
    const units = this.formations[side].map((e) => ({
      unitId: e.unitId,
      star: e.star,
      col: e.cell.col,
      row: e.cell.row,
      ...(e.equipment?.length ? { equipment: [...e.equipment] } : {}),
    }));
    return JSON.stringify({ name: `${SIDE_NAMES[side]} 편성`, units }, null, 2);
  }

  importFormation(side: Side, json: string): void {
    if (!this.isEditable()) throw new Error('편성 중에만 불러올 수 있습니다. 먼저 리셋하세요.');
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error('JSON 형식이 올바르지 않습니다.');
    }
    const entries = parseFormation(data, SIDE_NAMES[side]);
    assertFormationValid(side, entries, this.units);
    this.formations[side] = entries;
    this.error = null;
    this.formationChanged();
  }

  /** 패널·부트스트랩이 오류를 화면에 알릴 때 쓴다 */
  reportError(message: string): void {
    this.fail(message);
  }

  setCommander(commanderId: string | null): void {
    if (!this.isEditable()) return;
    const next = commanderId === null ? null : (this.extras.commanders?.get(commanderId) ?? null);
    if (commanderId !== null && !next) return this.fail(`알 수 없는 지휘관 "${commanderId}"`);
    this.commander = next;
    this.redeal();
    this.error = null;
    this.rebuildPrep();
    this.notify();
  }

  loadCommanderStart(): void {
    if (!this.isEditable()) return;
    const commander = this.commander;
    if (!commander) return this.fail('먼저 지휘관을 선택하세요.');
    const formation = this.extras.startFormations?.get(commander.id);
    if (!formation) return this.fail(`${commander.name}의 시작 편성 파일이 없습니다.`);
    try {
      assertFormationValid(0, formation, this.units);
    } catch (e) {
      return this.fail(`시작 편성 오류: ${(e as Error).message}`);
    }
    this.formations[0] = [...formation];
    this.error = null;
    this.formationChanged();
  }

  setDeckPreset(preset: DeckPreset): void {
    if (!this.isEditable() || !this.commander || preset === this.deckPreset) return;
    this.deckPreset = preset;
    this.redeal();
    this.rebuildPrep();
    this.notify();
  }

  startSeries(cardsEnabled: boolean): void {
    if (this.currentPhase !== 'edit' || this.gauntlet || this.managementRun || this.runLink) return;
    const stages = this.extras.seriesStages;
    const catalog = this.extras.cards;
    if (!stages || stages.length === 0 || !catalog) return this.fail('연전 편성이 준비되지 않았습니다.');
    if (this.formations[0].length === 0) return this.fail('아군 편성에 유닛을 1기 이상 배치하세요.');
    this.savedEnemy = [...this.formations[1]];
    this.gauntlet = new Gauntlet(
      { stages, ally: [...this.formations[0]], commander: this.commander, cardsEnabled, baseSeed: this.seed, deckPreset: this.deckPreset },
      catalog,
    );
    this.error = null;
    this.enterSeriesStage();
  }

  nextSeriesBattle(): void {
    const run = this.managementRun;
    if (run) {
      if (this.currentPhase !== 'finished' || run.done) return;
      run.prepareNextBattle();
      this.syncManagementFormation();
      this.toBattlePrep();
      return;
    }
    const g = this.gauntlet;
    if (!g || this.currentPhase !== 'finished' || g.done) return;
    this.enterSeriesStage();
  }

  endSeries(): void {
    if (this.managementRun) return this.endManagementRun();
    if (!this.gauntlet) return;
    this.gauntlet = null;
    this.formations[1] = this.savedEnemy;
    this.savedEnemy = [];
    this.error = null;
    this.toBattlePrep();
  }

  // ---- CardController ----

  cardView(): CardPanelView {
    const builder = this.panelBuilder;
    const commander = this.commander;
    if (!builder || !commander) return hiddenCardPanelView();
    const live = this.live;
    const g = this.gauntlet;
    const blocked = g && !g.cardsEnabled ? '카드 사용 금지 (5연전 옵션)' : null;
    return builder.build({
      commander,
      piles: live?.sim.deck ?? this.restoredDeck(),
      phase: live ? live.sim.phase : null,
      prepCp: live?.sim.commandPoints?.prep ?? CARDS.PREP_CP,
      combatCp: live?.sim.commandPoints?.combat ?? 0,
      time: live?.time ?? 0,
      usesOf: (cardId) => live?.usesOf(cardId) ?? 0,
      cardsPlayed: live?.cardsPlayed ?? 0,
      costAdjustOf: (instanceId) => live?.sim.cardSurcharge(instanceId) ?? 0,
      selectedInstanceId: this.interaction.selectedInstanceId,
      holding: this.interaction.active,
      hint: this.interaction.hint(),
      blockedReason: blocked,
      toast: this.toast,
      ultimate: live ? live.sim.ultimate : null,
    });
  }

  useUltimate(): void {
    const live = this.live;
    if (!live) return this.showToast('편성이 필요합니다. 양쪽 진영에 유닛을 배치하세요.');
    const blocked = this.gauntlet && !this.gauntlet.cardsEnabled ? '카드 사용 금지 (5연전 옵션)' : null;
    if (blocked) return this.showToast(blocked);
    const result = live.useUltimate();
    if (result.ok) this.notify();
    else this.showToast(result.reason);
  }

  beginCard(instanceId: number, mode: CardInputMode): void {
    if (this.interaction.selectedInstanceId === instanceId && mode === 'click') {
      this.handleOutcome(this.interaction.cancel());
      return;
    }
    const card = this.cardView().hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    if (!card.playable) {
      this.showToast(`${card.name}: ${card.reason ?? '지금은 사용할 수 없습니다'}`);
      return;
    }
    const spec = this.extras.cards?.get(card.cardId)?.target;
    this.interaction.select({ instanceId, kind: card.targetKind, count: spec?.count ?? 1 }, mode);
    this.notify();
  }

  useCardNow(instanceId: number): void {
    const card = this.cardView().hand.find((c) => c.instanceId === instanceId);
    if (card?.targetKind === 'none' && card.playable) {
      this.interaction.cancel();
      this.playCard(instanceId, { kind: 'none' });
      return;
    }
    this.beginCard(instanceId, 'click');
  }

  cancelCard(): void {
    if (this.interaction.active) this.handleOutcome(this.interaction.cancel());
  }

  dropCard(point: { x: number; y: number } | null): void {
    if (!this.interaction.active) return;
    const pick = point ? this.picker.pick(point.x, point.y, this.views()) : null;
    this.handleOutcome(this.interaction.activate(pick));
  }

  // ---- 내부: 카드 ----

  private handleOutcome(outcome: InteractionOutcome): void {
    switch (outcome.type) {
      case 'commit':
        this.playCard(outcome.instanceId, outcome.target);
        return;
      case 'invalid':
        this.showToast(outcome.reason);
        return;
      case 'cancelled':
        if (outcome.reason) this.showToast(outcome.reason);
        this.notify();
        return;
      case 'pending':
        this.notify();
        return;
    }
  }

  /** 지금 진행된 틱에서 카드를 쓴다. 실패하면 sim이 돌려준 사유를 토스트로 알리고 카드는 손패에 남는다 */
  private playCard(instanceId: number, target: PlayTarget): void {
    const live = this.live;
    if (!live) return this.showToast('편성이 필요합니다. 양쪽 진영에 유닛을 배치하세요.');
    const instance = live.sim.deck?.findInHand(instanceId);
    const equipment = instance && this.extras.cards?.get(instance.cardId)?.type === 'equipment';
    const result = live.playCard(instanceId, target);
    if (result.ok) {
      if (equipment && this.runLink) {
        this.runLink.commitPreparedEquipment(live.sim);
        this.formations[0] = this.runLink.allyFormation();
      } else if (equipment && this.managementRun) {
        const owned = this.managementRun.management.snapshot().board;
        // 시뮬의 원본 아군 UID만 영구 로스터로 환원한다. 징집 UID는 포함하지 않는다.
        owned.forEach((unit, uid) => {
          const items = live.sim.equippedItems.get(uid);
          if (items) this.managementRun?.management.setEquipment(unit.id, items);
        });
        this.managementRun.commitEquipmentCard(instanceId);
        this.formations[0] = this.managementRun.formation();
      }
      this.notify();
    }
    else this.showToast(result.reason);
  }

  private showToast(message: string): void {
    this.toast = { id: ++this.toastSeq, message };
    this.notify();
  }

  /** 시뮬이 없을 때(편성 부족) 손패를 보여주기 위한 덱 사본 */
  private restoredDeck(): DeckPiles {
    const snapshot = this.currentDeckSnapshot();
    const catalog = this.extras.cards;
    if (!snapshot || !catalog) return { hand: [], drawPile: [], discardPile: [], exhaustPile: [] };
    if (!this.fallbackDeck) this.fallbackDeck = Deck.restore(snapshot, catalog, new Rng(0));
    return this.fallbackDeck;
  }

  // ---- 내부: 흐름 ----

  private isEditable(): boolean {
    return this.currentPhase === 'edit' && this.gauntlet === null && this.managementRun === null && this.runLink === null;
  }

  /** 시작 직전 상태(편성 단계)로 돌아가 준비 화면을 다시 만든다 */
  private toBattlePrep(): void {
    if (this.runLink && (this.currentPhase === 'playing' || this.currentPhase === 'paused')) this.runLink.abandon();
    this.runResult = null;
    this.interaction.cancel();
    this.currentPhase = 'edit';
    this.result = null;
    this.error = null;
    this.rebuildPrep();
    this.notify();
  }

  private enterSeriesStage(): void {
    const g = this.gauntlet;
    const stage = g?.stage;
    if (!g || !stage) return;
    this.formations[1] = [...stage.enemy];
    this.toBattlePrep();
  }

  private finishBattle(live: LiveBattle): void {
    this.result = live.result();
    this.currentPhase = 'finished';
    this.interaction.cancel();
    if (this.runLink) {
      const settled = this.runLink.complete(live.sim);
      if (settled.ok) this.runResult = settled.settlement;
      else this.error = settled.reason;
    } else if (this.managementRun && live.sim.deck) this.managementRun.complete(this.result, live.cardsPlayed, live.sim.deck.serialize());
    else if (this.gauntlet) this.gauntlet.complete(this.result, live.cardsPlayed, live.sim.deck?.serialize() ?? null);
    else this.economy.settleBattle(`single:${this.singleBattleId}`, this.battleKind, this.result.winner === 0 ? 'win' : this.result.winner === 1 ? 'loss' : 'draw');
    this.notify();
  }

  /** 지휘관·시드가 바뀌면 단일 전투용 덱을 새로 섞어 5장 뽑는다 */
  private redeal(): void {
    const catalog = this.extras.cards;
    this.deckSnapshot =
      this.commander && catalog ? dealOpeningHand(createStartingDeck(this.commander, catalog, this.seed, this.deckPreset), catalog) : null;
  }

  private currentDeckSnapshot(): DeckSnapshot | null {
    return this.runLink ? this.runLink.deck() : this.managementRun ? this.managementRun.deckForBattle() : this.gauntlet ? this.gauntlet.deckForBattle() : this.deckSnapshot;
  }

  private effectiveSeed(): number {
    return this.managementRun ? this.managementRun.seed : this.gauntlet ? this.gauntlet.seed : this.seed;
  }

  /** 지금 편성·덱·시드로 전투(준비 상태)를 만든다. 카드 시스템이 꺼져 있으면 카드 없는 전투 */
  private createLive(): LiveBattle {
    if (this.runLink) return new LiveBattle(this.runLink.createSimulator());
    const deck = this.currentDeckSnapshot();
    const catalog = this.extras.cards;
    const formations: [FormationEntry[], FormationEntry[]] = [this.formations[0], this.formations[1]];
    if (this.commander && deck && catalog) {
      return new LiveBattle(
        { seed: this.effectiveSeed(), formations, cards: { commander: this.commander, deck } },
        this.units,
        this.traits,
        catalog,
      );
    }
    return new LiveBattle({ seed: this.effectiveSeed(), formations }, this.units, this.traits, catalog);
  }

  /** 편성 단계의 화면을 다시 만든다: 카드 시스템이 켜져 있고 양쪽 유닛이 있으면 준비 상태 sim, 아니면 미리보기 */
  private rebuildPrep(): void {
    this.interaction.cancel();
    this.fallbackDeck = null;
    this.live = null;
    this.preview = this.buildPreview();
    if (!this.commander) return;
    if (this.formations[0].length === 0 || this.formations[1].length === 0) return;
    try {
      this.live = this.createLive();
    } catch (e) {
      this.error = `준비 단계 생성 실패: ${(e as Error).message}`;
    }
  }

  /** 편성 단계에서 칸 편집: erase(우클릭)이거나 지우기 모드면 제거, 아니면 현재 브러시를 배치 */
  clickCell(cell: Cell, erase: boolean): void {
    const roster = this.roster;
    if (roster) {
      if (!this.canPlaceAt(cell)) return;
      const owned = roster.snapshot().board.find((unit) => unit.cell && sameCell(unit.cell, cell));
      if (erase && owned) return this.moveManagedToBench(owned.id);
      if (owned) return this.selectManagedUnit(owned.id);
      if (this.selectedOwnedId !== null) return this.moveManagedToBoard(this.selectedOwnedId, cell);
      return;
    }
    if (!this.canPlaceAt(cell)) return;
    const side = sideOfCol(cell.col);
    const list = this.formations[side];
    const index = list.findIndex((e) => sameCell(e.cell, cell));
    if (erase || this.brush.kind === 'erase') {
      if (index >= 0) list.splice(index, 1);
    } else {
      const entry: FormationEntry = { unitId: this.brush.unitId, star: this.brush.star, cell };
      if (index >= 0) list[index] = entry;
      else list.push(entry);
    }
    this.error = null;
    this.formationChanged();
  }

  private activeReplay(): ReplayState {
    return this.live ? this.live.replay : this.preview;
  }

  private seriesView(): SeriesView | null {
    const g = this.managementRun ?? this.gauntlet;
    if (!g) return null;
    return {
      total: g.total,
      index: g.index,
      stageName: g.stage?.name ?? null,
      cardsEnabled: this.managementRun ? true : (this.gauntlet?.cardsEnabled ?? false),
      records: [...g.records],
      summary: g.summary(),
      done: g.done,
    };
  }

  private traitsOf(side: Side): ActiveTrait[] {
    // 시뮬(준비 단계 포함)이 있으면 그 시뮬이 실제로 적용한 단계를 쓴다 — 유물(다섯 번째 깃발·대군기)의 단계 +1이 들어 있다
    const sim = this.live?.sim;
    if (sim) return [...sim.activeTraits[side]];
    const defs = this.formations[side]
      .map((e) => this.units.get(e.unitId))
      .filter((d): d is UnitDef => d !== undefined);
    return this.traitEngine.compute(defs);
  }

  /** 편성 미리보기: 시뮬 생성 직후의 spawn 이벤트만 재생 상태로 만든다 */
  private buildPreview(): ReplayState {
    try {
      const sim = new CombatSimulator({ seed: 0, formations: [this.formations[0], this.formations[1]] }, this.units, this.traits, this.extras.cards);
      return new ReplayState(sim.world.events.filter((e) => e.type === 'spawn'));
    } catch {
      return new ReplayState([]);
    }
  }

  private formationChanged(): void {
    const lostOperations = this.live?.sim.events.some((event) => event.type === 'cardPlayed' && this.extras.cards?.get(event.cardId)?.type === 'operation') ?? false;
    this.rebuildPrep();
    if (lostOperations) {
      this.toast = { id: ++this.toastSeq, message: '편성이 바뀌어 준비 단계에서 쓴 작전 카드가 되돌려졌습니다.' };
    }
    this.notify();
  }

  // ---- RunBattleHost: 런 코어 전투 연결 ----

  attachRun(link: RunBattleLink): void {
    if (this.gauntlet) this.endSeries();
    if (this.managementRun) this.endManagementRun();
    if (!this.runLink) {
      this.savedManagementFormations = [[...this.formations[0]], [...this.formations[1]]];
      this.savedCommander = this.commander;
    }
    this.runLink = link;
    this.commander = link.commander;
    this.selectedOwnedId = null;
    this.syncManagementFormation();
    this.toBattlePrep();
  }

  detachRun(): void {
    const link = this.runLink;
    if (!link) return;
    if (this.currentPhase === 'playing' || this.currentPhase === 'paused') link.abandon();
    this.runLink = null;
    this.runResult = null;
    this.selectedOwnedId = null;
    this.commander = this.savedCommander;
    if (this.savedManagementFormations) this.formations = this.savedManagementFormations;
    this.savedManagementFormations = null;
    this.savedCommander = null;
    this.currentPhase = 'edit';
    this.redeal();
    this.toBattlePrep();
  }

  runSettlement(): BattleSettlement | null {
    return this.runResult;
  }

  forceRunResult(result: ForcedResult): void {
    if (!this.runLink) return this.fail('연결된 런 전투가 없습니다.');
    if (this.currentPhase === 'finished') return;
    if (this.currentPhase === 'edit') {
      this.start(this.seed);
      if (this.phase !== 'playing') return; // 시작하지 못했으면 start가 사유를 error로 남겼다
    }
    const live = this.live;
    if (!live) return;
    forceCombatResult(live.sim, result);
    live.advance(1e6); // 끝 시각까지 재생을 몰아 보내 일반 종료 처리(finishBattle)를 그대로 탄다
    if (live.finished) this.finishBattle(live);
  }

  private fail(message: string): void {
    this.error = message;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

