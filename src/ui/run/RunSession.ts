import { RUN, RunController, type ForcedResult, type RunDeps, type RunResult, type TestRunSetup } from '../../core/run';
import { deckCards, type CardInstance } from '../../core/cards';
import type { CardListEntry } from '../cards/cardListView';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import type { RunUnlocks } from '../../core/meta';
import type { RunBattleHost } from '../debug/runLink';
import type { MetaStore } from './MetaStore';
import { buildEndMetaView, buildMetaStartView, type EndSettlement } from './metaViews';
import { buildThreatPicker } from './threatViews';
import { RunBattleAdapter } from './RunBattleAdapter';
import type { RunSaveStore } from './RunSaveStore';
import type {
  BattleScreenInfo, BattleStage, RunCommands, RunNotice, RunScreenId, RunSnapshot, RunViewSource, StartInfo, TestCommands, TestToolCommand,
} from './contracts';
import {
  buildActIntroView, buildBossRelicView, buildCampView, buildCommanderChoices, buildDeckList, buildEncounterPreview, buildEndView, buildEventView, buildHud, buildMapView, buildRewardView, buildSettlementView,
  buildEquipmentView, buildShopView, buildUpgradeNotice, newlyUpgraded, type EncounterPreviewView, type MapView,
} from './runViews';
import { buildTestCatalog, buildTestToolsView, type TestCatalogView } from './testViews';

/** 시작 화면의 두 가지 옛 진입점(경제 플레이·편성 디버그)을 여는 쪽. 런 화면은 구현을 모른다 */
export interface LegacyModes {
  openManagement(): void;
  openDebug(): void;
  /** 옛 화면을 닫는다 (시작 화면으로 돌아가기 전) */
  close(): void;
}

export interface RunSessionOptions {
  deps: RunDeps;
  store: RunSaveStore;
  /** 메타 진행(전공·해금) 저장소. 일반 런에만 적용한다 (테스트 런·경제 플레이·편성 디버그는 해금과 무관) */
  meta: MetaStore;
  /** 새 런 식별자 발급 (메타 정산 중복 방지용. core가 아니므로 crypto/시간 기반이어도 된다) */
  newRunId: () => string;
  battle: RunBattleHost;
  legacy: LegacyModes;
  /** 새 런 시드 제안 (core가 아니므로 시간·crypto 기반이어도 된다) */
  suggestSeed: () => number;
  commanderId: string;
}

/** 시드는 core가 32비트 정수로 다룬다 (RunState: seed | 0). 저장·복원 때 같은 런이 되도록 범위를 제한한다 */
const SEED_MIN = -(2 ** 31);
const SEED_MAX = 2 ** 31 - 1;

type Mode = 'start' | 'run' | 'debug';

/**
 * 런 UI의 파사드 (Phaser·DOM 비의존). RunController(규칙)와 BattleSession(전투 재생)을 묶고,
 * 단계가 바뀔 때마다 자동 저장한다. 화면(DOM)은 RunViewSource/RunCommands 인터페이스로만 접근한다.
 *
 * 전투: 전투 준비 단계에 들어가면 BattleSession에 런 전투 연결을 걸어 준비 화면(상점·배치·준비 카드)을 재사용하고,
 * 전투가 끝나 정산되면 결과를 보여준 뒤(resultPending) "계속"을 눌러야 다음 단계 화면으로 넘어간다.
 */
export class RunSession implements RunViewSource, RunCommands, TestCommands {
  private mode: Mode = 'start';
  private controller: RunController | null = null;
  private deckListCache: { key: string; list: CardListEntry[] } | null = null;
  private suggestedSeed: number;
  private resultPending = false;
  /** 카드 보상 창이 방금 끝난 전투 화면 위에 떠 있다 (결과 확인 뒤 보상 단계로 넘어온 경우. 저장본에서 이어하면 false) */
  private rewardOverBattle = false;
  private handledSettlement: unknown = null;
  /** 이 런의 전공 정산 결과 (런이 끝나는 순간 한 번만 만든다. 화면을 다시 그려도 재정산하지 않는다) */
  private endSettlement: EndSettlement | null = null;
  /** 전투 연결을 건 (노드, 시도). 같은 전투 준비는 한 번만 연결한다 */
  private attachedKey: string | null = null;
  /** 연결한 전투의 시도 번호(1부터). 정산 후에는 tries가 늘어 있으므로 결과 화면은 이 값을 쓴다 */
  private attachedAttempt = 1;
  /** 강화 결과 창에 보여 줄 방금 강화된 카드 (닫으면 null) */
  private upgradeNotice: CardInstance[] | null = null;
  /**
   * 지금 연결된 전투의 적 편성. 결과 창을 보여 주는 동안 런은 이미 다음 단계로 넘어가 있을 수 있어서
   * (보스 유물 후보가 0개면 곧바로 다음 액트 — 현재 노드가 없다) 전투 단계일 때 계산한 것을 기억해 둔다
   */
  private attachedPlan: EncounterPreviewView | null = null;
  private notice: RunNotice | null = null;
  private noticeSeq = 0;
  private readonly listeners = new Set<() => void>();
  private readonly cards: CardCatalog;
  private readonly units: UnitCatalog;
  /** 테스트 도구의 선택지 목록 (데이터에서 한 번만 만든다) */
  private testCatalogCache: TestCatalogView | null = null;

  constructor(private readonly o: RunSessionOptions) {
    this.cards = o.deps.cards;
    this.units = o.deps.units;
    this.suggestedSeed = o.suggestSeed();
    o.battle.subscribe(() => this.onBattleChanged());
  }

  // ---- RunViewSource ----

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 현재 화면 */
  get screen(): RunScreenId {
    if (this.mode === 'start') return 'start';
    if (this.mode === 'debug') return 'debug';
    const run = this.controller;
    if (!run) return 'start';
    if (this.resultPending) return 'battle';
    switch (run.phase) {
      case 'map': return 'map';
      case 'battlePrep':
      case 'battle': return 'battle';
      case 'reward': return this.rewardOverBattle ? 'battle' : 'reward';
      case 'bossRelic': return 'bossRelic';
      case 'actIntro': return 'actIntro';
      case 'shop': return 'shop';
      case 'event': return 'event';
      case 'camp': return 'camp';
      case 'ended': return 'ended';
    }
  }

  /** 덱 목록: 같은 덱이면 같은 배열을 돌려준다 (카드 이동으로 순서만 바뀌어도 키는 같도록 정렬) */
  private deckList(run: RunController): CardListEntry[] {
    const cards = deckCards(run.deck);
    const key = cards.map((c) => `${c.instanceId}:${c.cardId}:${c.upgraded}`).sort().join('|');
    if (this.deckListCache?.key !== key) this.deckListCache = { key, list: buildDeckList(this.cards, cards) };
    return this.deckListCache.list;
  }

  snapshot(): RunSnapshot {
    const screen = this.screen;
    const run = this.controller;
    const live = this.mode === 'run' && run !== null;
    const shopView = live && screen === 'shop' ? run.shopView() : null;
    const eventView = live && screen === 'event' ? run.eventView() : null;
    const campView = live && screen === 'camp' ? run.campView() : null;
    return {
      screen,
      notice: this.notice,
      start: screen === 'start' ? this.startInfo() : null,
      hud: live ? buildHud(run) : null,
      map: live && screen === 'map' ? buildMapView(run) : null,
      deck: live && (screen === 'map' || screen === 'battle') ? this.deckList(run) : null,
      battle: live && screen === 'battle' ? this.battleInfo(run) : null,
      reward: live && !this.resultPending && run.phase === 'reward' ? buildRewardView(run, this.cards, this.o.deps.relics) : null,
      bossRelic: live && screen === 'bossRelic' ? buildBossRelicView(run, this.o.deps.relics) : null,
      actIntro: live && screen === 'actIntro' ? buildActIntroView(run) : null,
      shop: live && shopView ? buildShopView(shopView, run.gold, this.cards, this.o.deps.relics) : null,
      event: live && eventView ? buildEventView(eventView, run, this.cards) : null,
      camp: live && campView ? buildCampView(campView, run, this.cards, this.units) : null,
      ended: live && screen === 'ended' ? buildEndView(run, this.cards, this.units, this.o.deps.relics) : null,
      endMeta: live && screen === 'ended' && this.endSettlement
        ? buildEndMetaView(this.endSettlement, this.o.meta.catalog, this.o.deps.commanders, this.o.deps.relics, this.o.deps.threat) : null,
      equipment: live && (screen === 'map' || screen === 'battle') ? buildEquipmentView(run, this.cards, this.units) : null,
      upgraded: live && this.upgradeNotice ? buildUpgradeNotice(this.cards, this.upgradeNotice) : null,
      testTools: live && screen !== 'ended' ? buildTestToolsView(run, this.o.deps, this.testCatalog(), this.resultPending) : null,
    };
  }

  private testCatalog(): TestCatalogView {
    this.testCatalogCache ??= buildTestCatalog(this.o.deps);
    return this.testCatalogCache;
  }

  private startInfo(): StartInfo {
    return {
      save: this.o.store.status(),
      suggestedSeed: this.suggestedSeed,
      commanders: buildCommanderChoices(this.o.deps.commanders.commanders, this.cards, this.units, RUN.START_HP),
      meta: buildMetaStartView(this.o.meta.status(), this.o.meta.catalog, this.o.deps.commanders, this.o.deps.relics),
      threat: buildThreatPicker(this.o.deps.threat, this.o.meta.progress?.maxThreatLevel ?? 0, this.o.meta.catalog.points.threatBonusPctPerLevel),
      defaultCommanderId: this.o.commanderId,
      testCatalog: this.testCatalog(),
    };
  }

  mapView(): MapView | null {
    return this.mode === 'run' && this.controller ? buildMapView(this.controller) : null;
  }

  previewNode(nodeId: string): EncounterPreviewView | null {
    const plan = this.controller?.previewNode(nodeId) ?? null;
    return plan ? buildEncounterPreview(plan) : null;
  }

  // ---- RunCommands: 시작 화면 ----

  newRun(seed: number | null, commanderId?: string, threatLevel = 0): void {
    const value = seed ?? this.suggestedSeed;
    if (!Number.isInteger(value) || value < SEED_MIN || value > SEED_MAX) {
      return this.fail(`시드는 ${SEED_MIN}~${SEED_MAX} 사이의 정수여야 합니다.`);
    }
    const id = commanderId ?? this.o.commanderId;
    const unlocks = this.currentUnlocks();
    if (typeof unlocks === 'string') return this.fail(unlocks);
    if (this.o.deps.commanders.get(id) && !unlocks.commanders.includes(id)) {
      return this.fail(`아직 해금하지 않은 지휘관입니다: ${this.o.deps.commanders.get(id)?.name ?? id}`);
    }
    if (!Number.isInteger(threatLevel) || threatLevel < 0 || threatLevel > this.o.deps.threat.maxLevel) {
      return this.fail(`위협 레벨은 0~${this.o.deps.threat.maxLevel}의 정수여야 합니다.`);
    }
    if (threatLevel > (unlocks.maxThreat ?? 0)) {
      return this.fail(`아직 해금하지 않은 위협 레벨입니다: ${threatLevel} (레벨 ${threatLevel - 1}을 승리하면 열립니다).`);
    }
    try {
      this.adopt(RunController.create(this.o.deps, { seed: value, commanderId: id, unlocks, runId: this.o.newRunId(), threatLevel }));
    } catch (e) {
      return this.fail(`새 런을 만들 수 없습니다: ${(e as Error).message}`);
    }
    this.suggestedSeed = this.o.suggestSeed();
    this.afterChange();
  }

  startTestRun(seed: number | null, setup: Omit<TestRunSetup, 'seed'>): void {
    const value = seed ?? this.suggestedSeed;
    if (!Number.isInteger(value) || value < SEED_MIN || value > SEED_MAX) {
      return this.fail(`시드는 ${SEED_MIN}~${SEED_MAX} 사이의 정수여야 합니다.`);
    }
    try {
      this.adopt(RunController.createTest(this.o.deps, { ...setup, seed: value }));
    } catch (e) {
      return this.fail(`테스트 런을 만들 수 없습니다: ${(e as Error).message}`);
    }
    this.suggestedSeed = this.o.suggestSeed();
    this.afterChange();
  }

  continueRun(): void {
    const loaded = this.o.store.load();
    if (loaded === null) return this.fail('이어할 저장본이 없습니다.');
    if (!loaded.ok) return this.fail(loaded.message);
    this.adopt(loaded.controller);
    // 메타 진행 도입 이전 저장본은 런 식별자가 없다: 이어할 때 한 번 붙여 끝났을 때 정산할 수 있게 한다 (테스트 런은 제외)
    if (loaded.controller.testInfo === null && loaded.controller.runId === null) loaded.controller.assignRunId(this.o.newRunId());
    this.afterChange();
    // 콘텐츠 데이터가 바뀌어 저장본이 고쳐졌다면 무엇이 바뀌었는지 한 번 알려 준다
    const changes = loaded.controller.contentNotices;
    if (changes.length > 0) this.setNotice('info', `게임 데이터가 업데이트되어 저장본을 맞췄습니다. ${changes.join(' / ')}`);
  }

  deleteSave(): void {
    this.o.store.clear();
    this.notice = null;
    this.notify();
  }

  purchaseUnlock(id: string): void {
    const progress = this.o.meta.progress;
    if (!progress) return this.fail('전공 기록이 손상되어 해금할 수 없습니다. 먼저 전공 기록을 초기화하세요.');
    const result = progress.purchase(id);
    if (!result.ok) return this.fail(result.reason);
    const error = this.o.meta.save();
    if (error) return this.setNotice('error', `해금했지만 전공 기록 저장에 실패했습니다. ${error}`);
    this.notice = null;
    this.notify();
  }

  resetMeta(): void {
    this.o.meta.reset();
    this.setNotice('info', '전공 기록을 초기화했습니다. (진행 중인 런 저장본은 그대로입니다)');
  }

  openManagement(): void {
    this.leaveRun();
    this.mode = 'debug';
    this.o.legacy.openManagement();
    this.notify();
  }

  openDebug(): void {
    this.leaveRun();
    this.mode = 'debug';
    this.o.legacy.openDebug();
    this.notify();
  }

  toStart(): void {
    if (this.mode === 'debug') this.o.legacy.close();
    if (this.controller) this.persist(); // 진행 중인 런은 저장해 둔다 (끝난 런이면 저장이 지워진다)
    this.leaveRun();
    this.mode = 'start';
    this.notice = null;
    this.notify();
  }

  // ---- RunCommands: 맵 / 전투 ----

  chooseNode(nodeId: string): void {
    this.run((run) => run.chooseNode(nodeId));
  }

  startBattle(): void {
    const run = this.controller;
    if (!run || run.phase !== 'battlePrep') return this.fail('전투를 시작할 수 있는 단계가 아닙니다.');
    this.o.battle.start(run.battleSeed());
  }

  /** 전투 결과를 확인하고 다음 단계로 넘어간다 (보스 재도전이면 준비 화면을 새로 만든다) */
  continueAfterBattle(): void {
    if (!this.resultPending) return;
    this.resultPending = false;
    this.rewardOverBattle = this.controller?.phase === 'reward';
    this.afterChange();
  }

  // ---- RunCommands: 노드 화면 ----

  claimReward(index: number): void { this.run((run) => this.withRelic(run, () => run.claimReward(index))); }
  skipReward(): void { this.run((run) => this.withRelic(run, () => run.skipReward())); }
  claimRelic(): void { this.run((run) => run.claimRelic()); }
  claimBossRelic(index: number): void { this.run((run) => run.claimBossRelic(index)); }
  skipBossRelic(): void { this.run((run) => run.skipBossRelic()); }
  continueAct(): void { this.run((run) => run.continueAct()); }
  buyShopCard(slot: number): void { this.run((run) => run.buyShopCard(slot)); }
  buyShopRelic(slot: number): void { this.run((run) => run.buyShopRelic(slot)); }
  removeCard(instanceId: number): void { this.run((run) => run.removeCardForGold(instanceId)); }
  leaveShop(): void { this.run((run) => run.leaveShop()); }
  chooseEventOption(index: number): void { this.run((run) => run.chooseEventOption(index)); }
  pickEventOption(optionIndex: number): void { this.run((run) => run.pickEventOption(optionIndex)); }
  finishEvent(): void { this.run((run) => run.finishEvent()); }
  campHeal(): void { this.run((run) => run.campHeal()); }
  campUpgrade(instanceId: number): void { this.run((run) => run.campUpgrade(instanceId)); }
  campPromote(ownedUnitId: number): void { this.run((run) => run.campPromote(ownedUnitId)); }
  leaveCamp(): void { this.run((run) => run.leaveCamp()); }

  // ---- TestCommands: 런 중 테스트 도구 ----

  /** 테스트 런의 명령 한 건. 일반 런이거나 단계가 맞지 않으면 core가 거부하고 사유가 알림으로 나온다 */
  testCommand(command: TestToolCommand): void {
    const run = this.controller;
    if (!run || this.mode !== 'run') return;
    if (run.testInfo === null) return this.fail('테스트 런에서만 쓸 수 있습니다.');
    if (this.resultPending) return this.fail('전투 결과를 확인한 뒤("계속") 쓸 수 있습니다.');
    if (command.kind === 'forceResult') return this.forceBattle(run, command.result);
    const result = this.execTest(run, command);
    if (!result.ok) return this.fail(result.reason);
    this.notice = null;
    // 전투 준비 중에 덱·HP·유닛·유물이 바뀌었으면 준비 화면(시뮬)을 새 상태로 다시 만든다
    if (run.phase === 'battlePrep') this.attachBattle(run, true);
    this.afterChange();
  }

  private execTest(run: RunController, c: TestToolCommand): RunResult {
    const t = run.test;
    switch (c.kind) {
      case 'setGold': return t.setGold(c.amount);
      case 'addGold': return t.addGold(c.amount);
      case 'setHp': return t.setHp(c.hp, c.maxHp);
      case 'setLevel': return t.setLevel(c.level);
      case 'addRelic': return t.addRelic(c.relicId);
      case 'removeRelic': return t.removeRelic(c.relicId);
      case 'addCard': return t.addCard(c.cardId, c.upgraded, c.count);
      case 'removeCard': return t.removeCard(c.instanceId);
      case 'grantUnit': return t.grantUnit(c.unitId, c.star, c.place);
      case 'jumpToBoss': return t.jumpToBoss(c.viaCamp);
      case 'nextAct': return t.skipToNextAct(c.withBossRelic);
      case 'forceResult': return { ok: false, reason: '전투 결과는 별도 경로로 처리합니다' };
    }
  }

  /** 지금 전투를 강제로 끝낸다: 연결된 전투 세션의 시뮬에 적용해 일반 전투 종료·정산 경로를 그대로 탄다 */
  private forceBattle(run: RunController, result: ForcedResult): void {
    const blocked = run.test.availability().battle;
    if (blocked) return this.fail(blocked);
    if (run.phase === 'battlePrep') this.attachBattle(run);
    this.notice = null;
    this.o.battle.forceRunResult(result);
  }

  // ---- 내부 ----

  /** 정예 보상 유물이 남아 있으면 먼저 받고 카드 보상을 처리한다 (카드만 고르고 유물을 놓치지 않게) */
  private withRelic(run: RunController, command: () => RunResult): RunResult {
    const session = run.session;
    if (session?.kind === 'reward' && session.relic !== null) {
      const claimed = run.claimRelic();
      if (!claimed.ok) return claimed;
    }
    return command();
  }

  /** 컨트롤러 명령 한 건: 실패하면 사유를 알리고, 성공하면 저장·전투 연결을 갱신한다 */
  private run(command: (run: RunController) => RunResult): void {
    const run = this.controller;
    if (!run || this.mode !== 'run') return;
    const before = deckCards(run.deck);
    const result = command(run);
    if (!result.ok) return this.fail(result.reason);
    this.notice = null;
    // 이 명령으로 강화된 카드가 있으면 강화 결과 창으로 보여 준다 (이미 떠 있으면 이어 붙인다)
    const upgraded = newlyUpgraded(before, deckCards(run.deck));
    if (upgraded.length > 0) this.upgradeNotice = [...(this.upgradeNotice ?? []), ...upgraded];
    this.afterChange();
  }

  unequipItem(ownedId: number, index: number): void {
    this.run((run) => run.unequip(ownedId, index));
    // 전투 준비 중이면 장비가 빠진 편성·되돌아온 카드로 준비 시뮬을 다시 만든다
    const run = this.controller;
    if (run && run.phase === 'battlePrep' && !this.resultPending) {
      this.attachBattle(run, true);
      this.notify();
    }
  }

  dismissUpgradeNotice(): void {
    if (this.upgradeNotice === null) return;
    this.upgradeNotice = null;
    this.notify();
  }

  private adopt(controller: RunController): void {
    this.leaveRun();
    this.controller = controller;
    this.mode = 'run';
    this.notice = null;
  }

  /** 진행 중인 런 연결(전투 세션, 상태 플래그)을 정리한다 */
  private leaveRun(): void {
    this.deckListCache = null;
    this.upgradeNotice = null;
    this.controller = null; // 연결을 풀며 전투 세션이 알림을 보내도 옛 런을 건드리지 않게 먼저 비운다
    this.resultPending = false;
    this.rewardOverBattle = false;
    this.handledSettlement = null;
    this.endSettlement = null;
    this.attachedKey = null;
    this.attachedAttempt = 1;
    this.attachedPlan = null;
    this.o.battle.detachRun();
  }

  /** 단계가 바뀐 뒤: 전투 준비면 전투 세션을 연결하고, 저장하고, 화면을 갱신한다 */
  private afterChange(): void {
    const run = this.controller;
    if (!run) return this.notify();
    if (run.phase !== 'reward') this.rewardOverBattle = false;
    if (run.phase === 'battlePrep' && !this.resultPending) this.attachBattle(run);
    this.persist();
    this.notify();
  }

  /** 전투 준비 화면을 연결한다. force면 같은 전투여도 준비 시뮬을 새 상태로 다시 만든다 */
  private attachBattle(run: RunController, force = false): void {
    const session = run.session;
    const key = `${run.currentNode?.id ?? ''}#${session?.kind === 'battle' ? session.tries : 0}`;
    if (key === this.attachedKey && !force) return;
    this.attachedKey = key;
    this.attachedAttempt = (session?.kind === 'battle' ? session.tries : 0) + 1;
    this.o.battle.attachRun(new RunBattleAdapter(run));
  }

  /** 현재 메타 진행으로 런에 줄 해금 집합. 전공 기록이 손상되었으면 사유 문자열 */
  private currentUnlocks(): RunUnlocks | string {
    const progress = this.o.meta.progress;
    if (!progress) return '전공 기록이 손상되어 새 런을 시작할 수 없습니다. 시작 화면에서 전공 기록을 초기화하세요.';
    return progress.runUnlocks(this.o.deps.commanders.commanders.map((c) => c.id), this.o.deps.relics.relics.map((r) => r.id));
  }

  /**
   * 런이 끝난 순간 전공을 정산한다 (런마다 한 번). 정산 → 메타 저장을 마친 뒤에 런 저장이 지워지므로
   * 새로고침으로 종료 화면을 다시 볼 수 없어도 정산은 끝나 있다. 테스트 런은 정산하지 않는다.
   */
  private settleOnEnd(run: RunController): void {
    if (run.phase !== 'ended' || this.endSettlement) return;
    if (run.testInfo !== null) {
      this.endSettlement = { kind: 'test' };
      return;
    }
    const progress = this.o.meta.progress;
    if (!progress) {
      this.endSettlement = { kind: 'failed', reason: '전공 기록이 손상되어 이번 런을 정산하지 못했습니다.' };
    } else {
      const summary = run.runSummary();
      const result = progress.settleRun(summary);
      this.endSettlement = result.ok
        ? { kind: 'settled', summary, earned: result.earned, newUnlocks: result.newUnlocks, balance: result.balance, threatUnlocked: result.threatUnlocked }
        : { kind: 'failed', reason: `전공을 정산하지 못했습니다: ${result.reason}` };
      if (result.ok) {
        const error = this.o.meta.save();
        if (error) this.setNotice('error', `전공 기록 저장에 실패했습니다. ${error}`);
      }
    }
    if (this.endSettlement.kind === 'failed') this.setNotice('error', this.endSettlement.reason);
  }

  private persist(): void {
    const run = this.controller;
    if (!run) return;
    this.settleOnEnd(run);
    const error = this.o.store.save(run);
    if (error) this.setNotice('error', `자동 저장에 실패했습니다. ${error}`);
  }

  /** 전투 세션이 바뀌었다: 전투가 끝나 정산되었으면 결과 대기, 준비 중 로스터 변경이면 저장 */
  private onBattleChanged(): void {
    const run = this.controller;
    if (this.mode !== 'run' || !run) return;
    const settlement = this.o.battle.runSettlement();
    if (this.o.battle.phase === 'finished' && settlement && settlement !== this.handledSettlement) {
      this.handledSettlement = settlement;
      this.resultPending = true;
      this.persist();
    } else if (run.phase === 'battlePrep') {
      this.persist();
    }
    this.notify();
  }

  private battleInfo(run: RunController): BattleScreenInfo {
    const phase = this.o.battle.phase;
    // 보상 창이 전투 화면 위에 떠 있는 동안도 전투는 끝난 상태(결과 단계)로 보여준다 (결과 모달만 보상 창으로 바뀐다)
    const finished = this.resultPending || this.rewardOverBattle;
    const stage: BattleStage = finished ? 'result' : phase === 'playing' || phase === 'paused' ? 'playing' : 'prep';
    const settlement = this.resultPending ? this.o.battle.runSettlement() : null;
    const session = run.session;
    return {
      stage,
      plan: this.battlePlan(run),
      attempt: finished ? this.attachedAttempt : (session?.kind === 'battle' ? session.tries : 0) + 1,
      settlement: settlement ? buildSettlementView(settlement) : null,
    };
  }

  /** 전투 준비·전투 중이면 지금 노드의 편성을 새로 만들어 기억하고, 결과 단계(런이 다음 단계로 넘어갔을 수 있음)면 기억한 것을 쓴다 */
  private battlePlan(run: RunController): EncounterPreviewView {
    if (run.phase === 'battlePrep' || run.phase === 'battle' || !this.attachedPlan) this.attachedPlan = buildEncounterPreview(run.battlePlan());
    return this.attachedPlan;
  }

  private fail(message: string): void {
    this.setNotice('error', message);
  }

  private setNotice(kind: RunNotice['kind'], message: string): void {
    this.notice = { id: ++this.noticeSeq, kind, message };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
