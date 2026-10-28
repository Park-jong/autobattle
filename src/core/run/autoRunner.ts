import { CardPlanRunner, ULTIMATE_COMMAND_ID, ULTIMATE_PLAN_CARD, type PlanEntry } from '../combat';
import { HALF_COLS, BOARD_ROWS, type Cell } from '../combat/board';
import type { CardCatalog } from '../data/cardLoader';
import type { UnitCatalog } from '../data/unitLoader';
import { MANAGEMENT } from '../management';
import { Rng } from '../rng';
import type { RunController } from './runController';
import type { RunOutcome } from './runState';

export interface AutoRunOptions {
  /** 맵 경로 선택: 항상 첫 노드 / 정책 Rng로 무작위 */
  pathMode: 'first' | 'random';
  /** 경로 무작위용 시드 (런 시드와 별개) */
  policySeed: number;
  /** 전투 중 카드 사용 계획 (null이면 카드를 쓰지 않는다) */
  plan: readonly PlanEntry[] | null;
  /** 유물 정책: 정예 보상 유물 획득, 상점에서 살 수 있는 유물 구매, 유물을 주는 이벤트 선택지 우선 (기본 꺼짐) */
  relics?: boolean;
  /** 궁극기 정책: 전투 계획에 궁극기를 더해 게이지가 차면 바로 쓴다 (기본 꺼짐) */
  ultimate?: boolean;
  /** 안전 장치: 이 횟수만큼 행동해도 끝나지 않으면 Error */
  maxSteps?: number;
  /** 각 행동 직전(전투 중이 아닌 시점)에 불리는 관찰 훅. 상태를 바꾸지 않는 용도 (저장·복원 검증 등) */
  onStep?: () => void;
}

export interface AutoRunSummary {
  outcome: RunOutcome;
  floorReached: number;
  hp: number;
  maxHp: number;
  gold: number;
  battles: number;
  wins: number;
  losses: number;
  draws: number;
  averageBattleSeconds: number;
  /** 사망한 노드 (승리하면 null) */
  diedAt: { nodeId: string; floor: number; type: string } | null;
  steps: number;
  /** 런이 끝났을 때 보유한 유물 수 */
  relics: number;
  /** 궁극기를 쓴 전투 수 */
  ultimatesUsed: number;
}

/** 후열(원거리)과 전열(근접) 배치 선호 열 */
const BACK_COLS = [1, 0, 2, 3];
const FRONT_COLS = [3, 2, 1, 0];
const ROW_ORDER = [2, 1, 3, 0, 4];

/**
 * 헤드리스 자동 런 정책 (밸런스 확인용의 단순한 플레이어). 사람이 아니라 규칙으로 1액트를 끝까지 진행한다.
 * - 경로: 첫 노드 또는 무작위
 * - 준비/상점: 보드가 비면 벤치 유닛부터 올리고, 가장 싼 유닛을 사서 보드를 채운다. 인구가 찼고 골드가 넉넉하면 경험치를 산다
 * - 전투: 카드 사용 계획이 있으면 CardPlanRunner로, 없으면 카드 없이 진행
 * - 유물(옵션): 정예 보상 유물을 받고, 상점에서 살 수 있는 가장 싼 유물을 사며, 유물을 주는 이벤트 선택지를 고른다
 * - 궁극기(옵션): 카드 계획에 궁극기 항목을 더해 게이지가 차면 쓴다
 * - 보상: 첫 카드 / 이벤트: 선택 가능한 첫 선택지(카드 선택은 첫 후보) / 야영지: HP 50% 미만이면 휴식, 아니면 첫 강화 가능 카드 강화
 * 모든 결정은 컨트롤러의 공개 API만 쓰므로 UI가 같은 순서로 호출한 것과 같다.
 */
export class AutoRunner {
  private readonly policyRng: Rng;
  private steps = 0;

  constructor(
    private readonly controller: RunController,
    private readonly cards: CardCatalog,
    private readonly units: UnitCatalog,
    private readonly options: AutoRunOptions,
  ) {
    this.policyRng = new Rng(options.policySeed);
  }

  run(): AutoRunSummary {
    const limit = this.options.maxSteps ?? 2000;
    let battles = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let seconds = 0;
    let ultimatesUsed = 0;
    const controller = this.controller;
    while (controller.phase !== 'ended') {
      if (++this.steps > limit) throw new Error(`자동 런이 ${limit}번 행동해도 끝나지 않았습니다 (단계: ${controller.phase})`);
      this.options.onStep?.();
      switch (controller.phase) {
        case 'map':
          this.chooseNode();
          break;
        case 'battlePrep': {
          this.manageRoster();
          const settlement = this.fight();
          battles++;
          seconds += settlement.seconds;
          if (settlement.ultimate) ultimatesUsed++;
          if (settlement.outcome === 'win') wins++;
          else if (settlement.outcome === 'loss') losses++;
          else draws++;
          break;
        }
        case 'reward':
          if (this.options.relics && controller.session?.kind === 'reward' && controller.session.relic !== null) this.expect(controller.claimRelic());
          this.expect(controller.claimReward(0));
          break;
        case 'shop':
          if (this.options.relics) this.buyRelics();
          this.manageRoster();
          this.expect(controller.leaveShop());
          break;
        case 'event':
          this.playEvent();
          break;
        case 'camp':
          this.playCamp();
          break;
        case 'battle':
          throw new Error('자동 런이 전투 중 단계에서 멈췄습니다');
      }
    }
    const last = controller.history.at(-1);
    const node = controller.currentNode;
    return {
      outcome: controller.outcome as RunOutcome,
      floorReached: controller.floorReached,
      hp: controller.hp,
      maxHp: controller.maxHp,
      gold: controller.gold,
      battles, wins, losses, draws,
      averageBattleSeconds: battles === 0 ? 0 : seconds / battles,
      diedAt: controller.outcome === 'dead' && node ? { nodeId: node.id, floor: node.floor, type: last?.type ?? node.type } : null,
      steps: this.steps,
      relics: controller.relics.length,
      ultimatesUsed,
    };
  }

  // ---- 단계별 행동 ----

  private chooseNode(): void {
    const nodes = this.controller.availableNodes();
    const node = this.options.pathMode === 'random' ? this.policyRng.pick(nodes) : nodes[0];
    if (!node) throw new Error('고를 수 있는 노드가 없습니다');
    this.expect(this.controller.chooseNode(node.id));
  }

  private fight(): { outcome: string; seconds: number; ultimate: boolean } {
    const controller = this.controller;
    const sim = controller.createSimulator();
    this.expect(controller.beginBattle());
    const plan = this.battlePlan();
    if (plan) new CardPlanRunner(sim, this.cards, plan).run();
    else sim.run();
    const done = controller.completeBattle(sim);
    if (!done.ok) throw new Error(done.reason);
    return {
      outcome: done.settlement.outcome,
      seconds: sim.result().endTime,
      ultimate: sim.commandLog.some((c) => c.cardInstanceId === ULTIMATE_COMMAND_ID),
    };
  }

  /** 카드 계획 (+ 궁극기 정책이 켜져 있으면 궁극기 항목). 둘 다 없으면 null */
  private battlePlan(): readonly PlanEntry[] | null {
    const base = this.options.plan;
    if (!this.options.ultimate) return base;
    return [...(base ?? []), { tick: 0, card: ULTIMATE_PLAN_CARD, rule: 'none', until: Infinity }];
  }

  /** 상점 유물: 살 수 있는 것 중 가장 싼 것부터 반복 구매 */
  private buyRelics(): void {
    for (let guard = 0; guard < 4; guard++) {
      const view = this.controller.shopView();
      const slots = (view?.relics ?? [])
        .map((relic, slot) => ({ relic, slot }))
        .filter((e) => !e.relic.sold && e.relic.price <= this.controller.gold)
        .sort((a, b) => a.relic.price - b.relic.price || a.slot - b.slot);
      const pick = slots[0];
      if (!pick) return;
      this.expect(this.controller.buyShopRelic(pick.slot));
    }
  }

  /** 보드 채우기 → 가장 싼 유닛 구매 → (인구가 찼고 골드가 넉넉하면) 경험치 */
  private manageRoster(): void {
    const roster = this.controller.roster;
    for (let guard = 0; guard < 40; guard++) {
      const snap = roster.snapshot();
      if (snap.population < snap.level) {
        const benched = snap.bench.find((unit) => unit !== null);
        if (benched) {
          const cell = this.freeCell(snap.board.map((u) => u.cell as Cell), benched.unitId);
          if (cell && roster.moveToBoard(benched.id, cell).ok) continue;
        }
        const offer = snap.offers
          .map((o, slot) => ({ o, slot }))
          .filter((e) => e.o !== null && e.o.cost <= snap.gold)
          .sort((a, b) => (a.o?.cost ?? 0) - (b.o?.cost ?? 0) || a.slot - b.slot)[0];
        if (offer && roster.buy(offer.slot).ok) continue;
      } else if (snap.level < MANAGEMENT.MAX_LEVEL && snap.gold >= MANAGEMENT.XP_COST + 4 && roster.buyXp().ok) continue;
      break;
    }
  }

  private freeCell(taken: readonly Cell[], unitId: string): Cell | null {
    const ranged = (this.units.get(unitId)?.stats.rng ?? 1) >= 3;
    for (const col of ranged ? BACK_COLS : FRONT_COLS) {
      for (const row of ROW_ORDER) {
        if (col < HALF_COLS && row < BOARD_ROWS && !taken.some((c) => c.col === col && c.row === row)) return { col, row };
      }
    }
    return null;
  }

  private playEvent(): void {
    const controller = this.controller;
    let view = controller.eventView();
    if (!view) throw new Error('이벤트 화면이 없습니다');
    if (view.chosen === null) {
      const relicIndex = this.options.relics ? view.choices.findIndex((choice) => choice.enabled && choice.grantsRelic) : -1;
      const index = relicIndex >= 0 ? relicIndex : view.choices.findIndex((choice) => choice.enabled);
      if (index < 0) throw new Error('선택 가능한 이벤트 선택지가 없습니다');
      this.expect(controller.chooseEventOption(index));
      view = controller.eventView();
    }
    while (view?.pending) {
      this.expect(controller.pickEventOption(0));
      view = controller.eventView();
    }
    this.expect(controller.finishEvent());
  }

  private playCamp(): void {
    const controller = this.controller;
    const view = controller.campView();
    if (!view) throw new Error('야영지 화면이 없습니다');
    const lowHp = controller.hp * 2 < controller.maxHp;
    if (view.canHeal && lowHp) return this.expect(controller.campHeal());
    const card = view.upgradable[0];
    if (card) return this.expect(controller.campUpgrade(card.instanceId));
    if (view.canHeal) return this.expect(controller.campHeal());
    this.expect(controller.leaveCamp());
  }

  private expect(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) throw new Error(`자동 런 행동 실패: ${result.reason ?? '알 수 없음'}`);
  }
}
