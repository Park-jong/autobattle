import { RunController, type RunDeps, type RunResult } from '../../core/run';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import type { RunBattleHost } from '../debug/runLink';
import { RunBattleAdapter } from './RunBattleAdapter';
import type { RunSaveStore } from './RunSaveStore';
import type {
  BattleScreenInfo, BattleStage, RunCommands, RunNotice, RunScreenId, RunSnapshot, RunViewSource,
} from './contracts';
import {
  buildCampView, buildEncounterPreview, buildEndView, buildEventView, buildHud, buildMapView, buildRewardView, buildSettlementView,
  buildShopView, type EncounterPreviewView,
} from './runViews';

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
export class RunSession implements RunViewSource, RunCommands {
  private mode: Mode = 'start';
  private controller: RunController | null = null;
  private suggestedSeed: number;
  private resultPending = false;
  private handledSettlement: unknown = null;
  /** 전투 연결을 건 (노드, 시도). 같은 전투 준비는 한 번만 연결한다 */
  private attachedKey: string | null = null;
  private notice: RunNotice | null = null;
  private noticeSeq = 0;
  private readonly listeners = new Set<() => void>();
  private readonly cards: CardCatalog;
  private readonly units: UnitCatalog;

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
      case 'reward': return 'reward';
      case 'shop': return 'shop';
      case 'event': return 'event';
      case 'camp': return 'camp';
      case 'ended': return 'ended';
    }
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
      start: screen === 'start' ? { save: this.o.store.status(), suggestedSeed: this.suggestedSeed } : null,
      hud: live ? buildHud(run) : null,
      map: live && screen === 'map' ? buildMapView(run) : null,
      battle: live && screen === 'battle' ? this.battleInfo(run) : null,
      reward: live && screen === 'reward' ? buildRewardView(run, this.cards) : null,
      shop: live && shopView ? buildShopView(shopView, run.gold, this.cards) : null,
      event: live && eventView ? buildEventView(eventView, run, this.cards) : null,
      camp: live && campView ? buildCampView(campView, run, this.cards, this.units) : null,
      ended: live && screen === 'ended' ? buildEndView(run, this.cards, this.units) : null,
    };
  }

  previewNode(nodeId: string): EncounterPreviewView | null {
    const plan = this.controller?.previewNode(nodeId) ?? null;
    return plan ? buildEncounterPreview(plan) : null;
  }

  // ---- RunCommands: 시작 화면 ----

  newRun(seed: number | null): void {
    const value = seed ?? this.suggestedSeed;
    if (!Number.isInteger(value) || value < SEED_MIN || value > SEED_MAX) {
      return this.fail(`시드는 ${SEED_MIN}~${SEED_MAX} 사이의 정수여야 합니다.`);
    }
    try {
      this.adopt(RunController.create(this.o.deps, { seed: value, commanderId: this.o.commanderId }));
    } catch (e) {
      return this.fail(`새 런을 만들 수 없습니다: ${(e as Error).message}`);
    }
    this.suggestedSeed = this.o.suggestSeed();
    this.afterChange();
  }

  continueRun(): void {
    const loaded = this.o.store.load();
    if (loaded === null) return this.fail('이어할 저장본이 없습니다.');
    if (!loaded.ok) return this.fail(loaded.message);
    this.adopt(loaded.controller);
    this.afterChange();
  }

  deleteSave(): void {
    this.o.store.clear();
    this.notice = null;
    this.notify();
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
    this.afterChange();
  }

  // ---- RunCommands: 노드 화면 ----

  claimReward(index: number): void { this.run((run) => run.claimReward(index)); }
  skipReward(): void { this.run((run) => run.skipReward()); }
  buyShopCard(slot: number): void { this.run((run) => run.buyShopCard(slot)); }
  removeCard(instanceId: number): void { this.run((run) => run.removeCardForGold(instanceId)); }
  leaveShop(): void { this.run((run) => run.leaveShop()); }
  chooseEventOption(index: number): void { this.run((run) => run.chooseEventOption(index)); }
  pickEventOption(optionIndex: number): void { this.run((run) => run.pickEventOption(optionIndex)); }
  finishEvent(): void { this.run((run) => run.finishEvent()); }
  campHeal(): void { this.run((run) => run.campHeal()); }
  campUpgrade(instanceId: number): void { this.run((run) => run.campUpgrade(instanceId)); }
  campPromote(ownedUnitId: number): void { this.run((run) => run.campPromote(ownedUnitId)); }
  leaveCamp(): void { this.run((run) => run.leaveCamp()); }

  // ---- 내부 ----

  /** 컨트롤러 명령 한 건: 실패하면 사유를 알리고, 성공하면 저장·전투 연결을 갱신한다 */
  private run(command: (run: RunController) => RunResult): void {
    const run = this.controller;
    if (!run || this.mode !== 'run') return;
    const result = command(run);
    if (!result.ok) return this.fail(result.reason);
    this.notice = null;
    this.afterChange();
  }

  private adopt(controller: RunController): void {
    this.leaveRun();
    this.controller = controller;
    this.mode = 'run';
    this.notice = null;
  }

  /** 진행 중인 런 연결(전투 세션, 상태 플래그)을 정리한다 */
  private leaveRun(): void {
    this.controller = null; // 연결을 풀며 전투 세션이 알림을 보내도 옛 런을 건드리지 않게 먼저 비운다
    this.resultPending = false;
    this.handledSettlement = null;
    this.attachedKey = null;
    this.o.battle.detachRun();
  }

  /** 단계가 바뀐 뒤: 전투 준비면 전투 세션을 연결하고, 저장하고, 화면을 갱신한다 */
  private afterChange(): void {
    const run = this.controller;
    if (!run) return this.notify();
    if (run.phase === 'battlePrep' && !this.resultPending) this.attachBattle(run);
    this.persist();
    this.notify();
  }

  private attachBattle(run: RunController): void {
    const session = run.session;
    const key = `${run.currentNode?.id ?? ''}#${session?.kind === 'battle' ? session.tries : 0}`;
    if (key === this.attachedKey) return;
    this.attachedKey = key;
    this.o.battle.attachRun(new RunBattleAdapter(run));
  }

  private persist(): void {
    const run = this.controller;
    if (!run) return;
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
    const stage: BattleStage = this.resultPending ? 'result' : phase === 'playing' || phase === 'paused' ? 'playing' : 'prep';
    const settlement = this.resultPending ? this.o.battle.runSettlement() : null;
    const session = run.session;
    return {
      stage,
      plan: buildEncounterPreview(run.battlePlan()),
      attempt: (session?.kind === 'battle' ? session.tries : 0) + 1,
      settlement: settlement ? buildSettlementView(settlement) : null,
    };
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
