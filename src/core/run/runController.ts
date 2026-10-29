import { removableCards, upgradableCards, type CardInstance, type DeckPreset, type DeckSnapshot } from '../cards';
import { CombatSimulator, type CardCommand, type CombatSetup } from '../combat';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderDef } from '../data/commander';
import type { CommanderCatalog } from '../data/commanderLoader';
import type { RelicDef } from '../data/relic';
import type { RelicCatalog } from '../data/relicLoader';
import type { UnitDef } from '../data/unit';
import type { EncounterCatalog } from '../data/encounterLoader';
import type { EventDef } from '../data/event';
import type { EventCatalog } from '../data/eventLoader';
import type { TraitCatalog } from '../data/traitLoader';
import type { UnitCatalog } from '../data/unitLoader';
import type { BattleKind, BattleOutcome, EconomyView } from '../economy';
import type { PromotionQuote } from '../management';
import { Rng } from '../rng';
import { discounted, generateCardStock, removalPrice, type ShopCardSlot } from './cardMarket';
import { CardRewardGenerator } from './cardRewards';
import { CommanderHealth, defeatDamage } from './commanderHealth';
import type { ContentMigrations } from './contentMigration';
import { RUN } from './constants';
import { EncounterPlanner, type EncounterPlan } from './encounterPlanner';
import { EventDirector, type ChoiceView, type EventHost, type EventSessionState, type PendingPick } from './eventDirector';
import { PlayerForces } from './forces';
import { MapGenerator } from './mapGenerator';
import { globalFloor, type MapNode, type RunMap } from './runMap';
import { RelicRewardGenerator, type ShopRelicSlot } from './relicRewards';
import { RunRoster } from './runRoster';
import { RunSerializer, type RunSave } from './runSerializer';
import { RunState, type BattleSettlement, type NodeSession, type RunOutcome, type RunPhase, type RunRecord, type TestRunInfo } from './runState';
import { deriveSeed, normalizeRunSeed } from './seeds';
import { TestRunTools, type TestRunSetup } from './testRun';

/** 런 코어가 쓰는 검증된 게임 데이터 */
export interface RunDeps {
  units: UnitCatalog;
  traits: TraitCatalog;
  cards: CardCatalog;
  commanders: CommanderCatalog;
  encounters: EncounterCatalog;
  events: EventCatalog;
  relics: RelicCatalog;
  migrations: ContentMigrations;
}

export interface RunOptions {
  seed: number;
  /** 시작 지휘관 (생략하면 하르텐) */
  commanderId?: string;
  deckPreset?: DeckPreset;
  /** 전체 액트 수 (기본 3, 1이면 액트 1 보스 처치가 곧 승리 — 헤드리스 회귀 비교용) */
  acts?: number;
}

export type RunResult = { ok: true } | { ok: false; reason: string };
export type SettleResult = { ok: true; settlement: BattleSettlement } | { ok: false; reason: string };
const OK: RunResult = { ok: true };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** 상점 노드 화면 정보 */
export interface ShopView {
  /** price는 보유 유물(도매 증서)의 할인이 적용된 실제 가격 */
  cards: ShopCardSlot[];
  /** 유물 진열 (할인 없음) */
  relics: ShopRelicSlot[];
  removalPrice: number;
  /** 제거할 수 있는 덱 카드 (유닛 제공 카드 제외) */
  removable: CardInstance[];
}

/** 이벤트 노드 화면 정보 */
export interface EventView {
  eventId: string;
  title: string;
  text: string;
  choices: ChoiceView[];
  /** 고른 선택지 (아직이면 null) */
  chosen: number | null;
  /** 카드를 더 골라야 하면 그 후보 */
  pending: PendingPick | null;
  messages: string[];
  /** 모든 효과가 끝나 finishEvent()로 나갈 수 있는가 */
  finished: boolean;
}

/** 야영지 승급 후보 한 기 */
export interface CampPromotion {
  id: number;
  unitId: string;
  star: number;
  quote: PromotionQuote;
  available: boolean;
  reason?: string;
}

/** 야영지 화면 정보 (택1: 휴식 / 카드 강화 / 유닛 승급) */
export interface CampView {
  healAmount: number;
  canHeal: boolean;
  upgradable: CardInstance[];
  promotions: CampPromotion[];
}

const kindOf = (node: MapNode): BattleKind => (node.type === 'combat' ? 'normal' : node.type === 'elite' ? 'elite' : 'boss');

/**
 * 3액트 런의 상태 머신. 맵 선택 → 노드 입장 → 노드 처리 → 결과 적용 → 다음 선택을 진행한다.
 * 액트 보스를 쓰러뜨리면 (마지막 액트가 아닐 때) 보스 유물 선택 → 다음 액트 소개 → 새 액트의 맵으로 이어지고,
 * 마지막 액트의 보스를 쓰러뜨리면 승리로 끝난다. 경제(골드·로스터·덱·장비·유물)는 액트 사이에 그대로 유지된다.
 * 전투 실행은 CombatSimulator가 맡고, 이 클래스는 전투 입력(편성·덱·적 보정·시드)을 만들어 주고
 * 끝난 시뮬을 받아 골드·지휘관 HP·덱·장비·다음 단계에 반영한다. Phaser·DOM 비의존.
 *
 * 단계: map → (battlePrep → battle → reward | map | battlePrep(보스 재도전) | bossRelic → actIntro → map | ended) / shop / event / camp → map … → ended
 * 저장은 단계가 map일 때와 노드 입장 직후를 포함한 모든 비전투 시점에 할 수 있다 (battle은 battlePrep으로 저장).
 */
export class RunController {
  private readonly planner: EncounterPlanner;
  private readonly rewards: CardRewardGenerator;
  private readonly relicRewards: RelicRewardGenerator;
  private readonly director: EventDirector;
  private readonly serializer: RunSerializer;
  /** 이 컨트롤러가 발급한 전투 시뮬 → 발급 당시 노드·시도·정산 여부. completeBattle이 현재 전투의 결과만 받게 묶는다 */
  private readonly issued = new WeakMap<CombatSimulator, { nodeId: string; tries: number; settled: boolean }>();
  private notices: string[] = [];
  /** 단계에 따라 명령을 허용하는 유닛 관리 창구 */
  readonly roster: RunRoster;
  /** 플레이 테스트 도구 (테스트 런에서만 명령을 받는다. 일반 런에서는 모든 명령이 거부됨) */
  readonly test: TestRunTools;

  private constructor(
    private readonly deps: RunDeps,
    private readonly state: RunState,
  ) {
    this.planner = new EncounterPlanner(deps.units, deps.encounters, state.seed);
    this.rewards = new CardRewardGenerator(deps.cards, state.commanderId);
    this.relicRewards = new RelicRewardGenerator(deps.relics);
    this.director = new EventDirector(deps.events, this.rewards, state.seed, deps.cards);
    this.serializer = new RunSerializer(deps);
    this.roster = new RunRoster(state.forces.management, {
      canEdit: () => this.state.phase !== 'battle' && this.state.phase !== 'ended',
      canShop: () => this.state.phase === 'battlePrep' || this.state.phase === 'shop',
    });
    this.test = new TestRunTools(deps, state, {
      acquireRelic: (relicId) => this.acquireRelic(relicId),
      visitNode: (node) => this.visitNode(node),
      toMap: () => this.toMap(),
      clearActBoss: (offerRelic) => { this.clearActBoss(offerRelic); },
      pickEvent: (nodeId, seen) => this.director.pickEvent(nodeId, seen).id,
      createSimulator: () => this.createSimulator(),
      beginBattle: () => this.beginBattle(),
      completeBattle: (sim) => this.completeBattle(sim),
    });
  }

  /** 새 런: 시드 하나로 맵·지휘관 시작 전력이 결정된다 */
  static create(deps: RunDeps, options: RunOptions): RunController {
    const commanderId = options.commanderId ?? RUN.DEFAULT_COMMANDER_ID;
    const commander = deps.commanders.get(commanderId);
    if (!commander) throw new Error(`알 수 없는 지휘관 "${commanderId}"`);
    const preset = options.deckPreset ?? 'starter';
    const seed = normalizeRunSeed(options.seed); // 이후 모든 파생은 저장되는 값과 같은 시드를 쓴다
    const totalActs = options.acts ?? RUN.ACTS.COUNT;
    if (!Number.isInteger(totalActs) || totalActs < 1 || totalActs > RUN.ACTS.COUNT) {
      throw new Error(`액트 수는 1~${RUN.ACTS.COUNT}의 정수여야 합니다 (실제: ${totalActs})`);
    }
    const forces = PlayerForces.create(
      deps.units, deps.cards, commander,
      { management: deriveSeed(seed, 'management'), deck: deriveSeed(seed, 'deck') },
      preset,
      deps.relics,
    );
    const health = new CommanderHealth(commander.maxHp ?? RUN.START_HP);
    const state = new RunState(seed, commander.id, preset, [new MapGenerator().generate(seed, 1)], health, forces, totalActs);
    return new RunController(deps, state);
  }

  /**
   * 플레이 테스트 런: 일반 런을 만든 뒤 설정(시작 액트·위치, 골드·HP·레벨, 유물·카드·유닛)을 적용하고 `test` 표시를 붙인다.
   * 설정이 틀리면 Error(한국어)이고 아무 런도 만들지 않는다. 이후 규칙(전투·정산·보상)은 일반 런과 같다.
   */
  static createTest(deps: RunDeps, setup: TestRunSetup): RunController {
    const run = RunController.create(deps, { seed: setup.seed, ...(setup.commanderId ? { commanderId: setup.commanderId } : {}), ...(setup.deckPreset ? { deckPreset: setup.deckPreset } : {}) });
    run.test.validateSetup(setup);
    run.state.test = { startAct: setup.startAct ?? 1, startPosition: setup.startPosition ?? 'actStart' };
    run.test.build(setup);
    return run;
  }

  /** 저장된 체크포인트에서 이어간다. 잘못된 데이터는 위치가 담긴 한국어 오류 */
  static restore(deps: RunDeps, data: unknown): RunController {
    // 저장본의 콘텐츠 버전이 낮으면 먼저 등록된 마이그레이션으로 현재 데이터에 맞게 고친다 (바뀐 내용은 알림으로 남는다)
    const { data: migrated, notices } = deps.migrations.migrate(data);
    const controller = new RunController(deps, new RunSerializer(deps).parse(migrated));
    controller.notices = notices;
    return controller;
  }

  /** 복원할 때 콘텐츠 마이그레이션이 저장본을 바꾼 내용 (한국어 문장들; 바뀐 게 없으면 빈 목록). 이어하기 화면이 한 번 알려 준다 */
  get contentNotices(): readonly string[] {
    return this.notices;
  }

  /** JSON으로 저장 가능한 체크포인트. 전투 중이면 전투 준비 단계로 저장한다 (전투 중간 저장 없음) */
  serialize(): RunSave {
    return this.serializer.serialize(this.state);
  }

  // ---- 조회 ----

  get phase(): RunPhase { return this.state.phase; }
  get outcome(): RunOutcome | null { return this.state.outcome; }
  get seed(): number { return this.state.seed; }
  /** 지금 액트의 맵 */
  get map(): RunMap { return this.state.map; }
  /** 지금 액트 (1부터) */
  get act(): number { return this.state.act; }
  /** 이 런의 전체 액트 수 */
  get totalActs(): number { return this.state.totalActs; }
  /** 지금 액트의 이름·지역 */
  get actInfo(): { name: string; region: string; text: string } { return RUN.ACTS.INFO[this.state.act - 1] as { name: string; region: string; text: string }; }
  /** 테스트 런 표시 (일반 런이면 null) */
  get testInfo(): TestRunInfo | null { return this.state.test; }
  get commander(): CommanderDef { return this.deps.commanders.get(this.state.commanderId) as CommanderDef; }
  get hp(): number { return this.state.health.hp; }
  get maxHp(): number { return this.state.health.max; }
  get gold(): number { return this.state.forces.economy.gold; }
  get economyView(): EconomyView { return this.state.forces.economy.snapshot(); }
  get visited(): readonly string[] { return this.state.visited; }
  get history(): readonly RunRecord[] { return this.state.history; }
  get removals(): number { return this.state.removals; }
  get deck(): DeckSnapshot { return this.state.forces.deck; }
  get session(): Readonly<NodeSession> | null { return this.state.session; }
  /** 보유 유물 정의 (획득 순서) */
  get relics(): RelicDef[] { return this.state.forces.relics.defs(); }

  /**
   * 승리로 끝난 런에서 마지막 보스 처치 때 받을 수 있었던 보스 유물 후보 (런 시드에서 결정적, 없는 유물만).
   * 런이 끝났으므로 받을 수는 없고 종료 화면에 보여 줄 뿐이다. 마지막이 아닌 액트의 보스는 bossRelic 단계에서 실제로 고른다.
   */
  bossRelicOffer(): string[] {
    if (this.state.outcome !== 'victory') return [];
    return this.relicRewards.offerBoss(this.state.forces.relics.ids, this.bossRelicRng());
  }

  /** 보스 유물 후보 뽑기용 Rng: 액트 1은 기존 파생 그대로, 액트 2부터는 액트 번호를 더한다 */
  private bossRelicRng(): Rng {
    const { seed, act } = this.state;
    return new Rng(act === 1 ? deriveSeed(seed, 'bossrelic') : deriveSeed(seed, 'bossrelic', act));
  }

  /** 현재(마지막으로 입장한) 노드. 시작 직후는 null */
  get currentNode(): MapNode | null {
    return this.state.currentNodeId === null ? null : (this.state.map.node(this.state.currentNodeId) ?? null);
  }

  /** 지금 액트에서 도달한 최고 층 (이 액트에서 입장한 노드가 아직 없으면 0) */
  get floorReached(): number {
    return this.state.visited.reduce((max, id) => Math.max(max, this.state.map.node(id)?.floor ?? 0), 0);
  }

  // ---- 맵 ----

  /** 지금 고를 수 있는 노드 (map 단계에서만) */
  availableNodes(): MapNode[] {
    if (this.state.phase !== 'map') return [];
    // 현재 위치가 지금 맵에 없으면(시작 전, 또는 지난 액트의 보스) 지금 맵의 1층에서 고른다
    const here = this.currentNode;
    return here === null ? [...this.state.map.startNodes()] : this.state.map.nextNodes(here.id);
  }

  /** 노드의 적 편성 미리보기 (전투·정예·보스가 아니면 null). 실제 전투가 쓰는 계획과 같다 */
  previewNode(nodeId: string): EncounterPlan | null {
    const node = this.state.map.node(nodeId);
    return node ? this.planner.plan(node, this.state.act) : null;
  }

  /** 다음에 고를 수 있는 노드들의 미리보기 */
  previewAvailable(): { node: MapNode; plan: EncounterPlan | null }[] {
    return this.availableNodes().map((node) => ({ node, plan: this.planner.plan(node, this.state.act) }));
  }

  chooseNode(nodeId: string): RunResult {
    if (this.state.phase !== 'map') return fail('지금은 노드를 고를 수 없습니다');
    const node = this.availableNodes().find((candidate) => candidate.id === nodeId);
    if (!node) return fail('고를 수 없는 노드입니다 (현재 위치에서 이어진 다음 층 노드만 선택 가능)');
    this.visitNode(node);
    return OK;
  }

  // ---- 전투 (전투·정예·보스) ----

  /** 현재 전투 노드의 적 편성 계획 */
  battlePlan(): EncounterPlan {
    const node = this.requireBattleNode();
    return this.planner.plan(node, this.state.act) as EncounterPlan;
  }

  /** 현재 전투의 시드: (런 시드, 노드, 시도 횟수)에서 파생 */
  battleSeed(): number {
    const session = this.requireBattleSession();
    return deriveSeed(this.state.seed, 'battle', this.requireBattleNode().id, session.tries);
  }

  /**
   * 현재 전투 노드의 전투 시뮬을 만든다 (준비 단계 상태). 편성·준비 손패·지휘관 HP·적 보정/변이는 모두
   * 런 상태에서 결정되므로 같은 상태에서는 같은 시뮬이다. 준비 카드 사용(sim.playCard)은 시뮬 쪽에서 한다.
   */
  createSimulator(commands: readonly CardCommand[] = []): CombatSimulator {
    const plan = this.battlePlan();
    const setup: CombatSetup = {
      seed: this.battleSeed(),
      formations: [this.state.forces.formation(), plan.formation],
      cards: {
        commander: this.commander, deck: this.state.forces.deckForBattle(), commands, commanderHp: this.state.health.hp,
        relics: this.state.forces.relics.effects(),
      },
      enemy: plan.enemy,
    };
    const sim = new CombatSimulator(setup, this.deps.units, this.deps.traits, this.deps.cards);
    this.issued.set(sim, { nodeId: this.requireNode().id, tries: this.requireBattleSession().tries, settled: false });
    return sim;
  }

  /** 준비를 마치고 전투를 시작한다. 이후 정산 전까지 로스터 관리 명령은 거부된다 */
  beginBattle(): RunResult {
    if (this.state.phase !== 'battlePrep') return fail('전투를 시작할 수 있는 단계가 아닙니다');
    this.state.phase = 'battle';
    return OK;
  }

  /** 전투를 취소하고 준비 단계로 돌아간다 (정산·보상 없음) */
  abandonBattle(): RunResult {
    if (this.state.phase !== 'battle') return fail('진행 중인 전투가 없습니다');
    this.state.phase = 'battlePrep';
    return OK;
  }

  /**
   * 끝난 전투를 런에 정산한다. 같은 전투는 한 번만 정산된다 (단계가 바뀌고 전투 ID가 골드 계정에도 기록됨).
   * 골드(전투 종류별) → 카드로 잃은 HP → 패배/무승부면 패배 피해 → 덱·장비 이어받기 → 다음 단계:
   * 사망 → ended / 마지막 액트의 보스 승리 → ended(승리) / 그 외 보스 승리 → bossRelic(후보가 없으면 바로 actIntro) /
   * 승리 → reward / 보스 패배 → battlePrep(재도전) / 그 외 패배 → map
   * createSimulator가 현재 노드·시도에 발급한 시뮬만 받는다 (다른 노드·이전 시도·다른 컨트롤러의 시뮬, 이미 정산한 시뮬은 거부).
   */
  completeBattle(sim: CombatSimulator): SettleResult {
    const session = this.state.session;
    if (session?.kind !== 'battle' || (this.state.phase !== 'battle' && this.state.phase !== 'battlePrep')) {
      return fail('정산할 전투가 없습니다 (이미 정산했거나 전투 단계가 아님)');
    }
    const node = this.requireBattleNode();
    const ticket = this.issued.get(sim);
    if (!ticket) return fail('이 런에서 발급한 전투가 아닙니다 (createSimulator로 만든 시뮬만 정산할 수 있음)');
    if (ticket.settled) return fail('이미 정산한 전투입니다');
    if (ticket.nodeId !== node.id || ticket.tries !== session.tries) {
      return fail(`현재 전투가 아닌 전투 결과입니다 (발급: ${ticket.nodeId} ${ticket.tries}번째 시도, 현재: ${node.id} ${session.tries}번째 시도)`);
    }
    if (!sim.finished || !sim.deck) return fail('전투가 아직 끝나지 않았습니다');
    const kind = kindOf(node);
    const result = sim.result();
    const outcome: BattleOutcome = result.winner === 0 ? 'win' : result.winner === 1 ? 'loss' : 'draw';
    const forces = this.state.forces;
    const health = this.state.health;
    const hpBefore = health.hp;

    const reward = forces.economy.settleBattle(`${node.id}#${session.tries}`, kind, outcome);
    const cardHpLost = result.events.reduce((sum, e) => (e.type === 'commanderHp' ? sum - e.delta : sum), 0);
    health.damage(cardHpLost);
    let defeat = 0;
    if (outcome !== 'win') {
      const survivorTierSum = result.survivors
        .filter((u) => u.side === 1 && !u.temporary)
        .reduce((sum, u) => sum + (this.deps.units.get(u.unitId)?.tier ?? 0), 0);
      defeat = defeatDamage({ survivorTierSum, floor: globalFloor(this.state.act, node.floor), kind });
      health.damage(defeat);
    }
    // 지휘관 패시브(녹스): 승리하면 남은 CP 1당 골드. 유물(강철 심장): 승리하면 HP 회복
    let passiveGold = 0;
    let healed = 0;
    let cardHealed = 0;
    if (outcome === 'win') {
      passiveGold = (sim.commandPoints?.combat ?? 0) * (this.commander.passive.goldPerLeftoverCp ?? 0);
      if (passiveGold > 0) forces.economy.gain(passiveGold);
      // 카드(빚 청산)로 예약한 회복은 승리했을 때만 확정한다 (최대 HP 초과분은 버림)
      const reserved = result.events.reduce((sum, e) => (e.type === 'commanderHeal' ? sum + e.amount : sum), 0);
      if (!health.dead && reserved > 0) cardHealed = health.heal(reserved);
      if (!health.dead) healed = health.heal(forces.relics.sum('winHeal', (e) => e.amount));
    }
    // 저주 카드: 전투가 끝날 때 손패에 남아 있던 저주의 골드 손실 (결과와 무관, 잔고 한도까지)
    const curseGold = result.events.reduce((sum, e) => (e.type === 'cursePenalty' ? sum + e.gold : sum), 0);
    const curseGoldLost = Math.min(forces.economy.gold, curseGold);
    if (curseGoldLost > 0) forces.economy.spend(curseGoldLost);
    forces.finishBattle(sim.deck.serialize(), sim.equippedItems);
    ticket.settled = true;

    this.state.history.push({
      nodeId: node.id, floor: node.floor, type: node.type, outcome, endTime: result.endTime,
      cardsUsed: sim.commandLog.length, hpAfter: health.hp, goldAfter: forces.economy.gold,
    });

    let runEnded: RunOutcome | null = null;
    let actCleared: number | null = null;
    let bossOffer: string[] | null = null;
    let cardOffer: string[] | null = null;
    let relicOffer: string | null = null;
    if (health.dead) {
      runEnded = 'dead';
      this.finish('dead');
    } else if (outcome === 'win' && kind === 'boss' && this.state.act >= this.state.totalActs) {
      runEnded = 'victory';
      this.finish('victory');
    } else if (outcome === 'win' && kind === 'boss') {
      actCleared = this.state.act;
      bossOffer = this.clearActBoss(true);
    } else if (outcome === 'win') {
      const choices = RUN.REWARD.CHOICES + forces.relics.sum('rewardChoices', (e) => e.amount);
      cardOffer = this.rewards.offer(kind, new Rng(deriveSeed(this.state.seed, 'reward', node.id, session.tries)), choices);
      if (kind === 'elite') {
        relicOffer = this.relicRewards.offerElite(forces.relics.ids, new Rng(deriveSeed(this.state.seed, 'relicreward', node.id, session.tries)));
      }
      this.state.session = { kind: 'reward', source: kind === 'elite' ? 'elite' : 'normal', offer: cardOffer, relic: relicOffer };
      this.state.phase = 'reward';
    } else if (kind === 'boss') {
      this.state.session = { kind: 'battle', tries: session.tries + 1 };
      this.state.phase = 'battlePrep';
    } else {
      this.toMap();
    }
    return { ok: true, settlement: { nodeId: node.id, kind, outcome, reward, cardHpLost, defeatDamage: defeat, passiveGold, healed, cardHealed, curseGoldLost, hpBefore, hpAfter: health.hp, runEnded, actCleared, bossRelicOffer: bossOffer, cardOffer, relicOffer } };
  }

  /** 준비 단계에서 장비·카드 사용으로 바뀐 장비를 로스터에 확정한다 (준비 화면 재구성 시 카드가 복구되지 않도록) */
  commitPreparedEquipment(sim: CombatSimulator): void {
    for (const event of sim.events) {
      if (event.type === 'cardPlayed' && this.deps.cards.get(event.cardId)?.type === 'equipment') {
        this.state.forces.commitEquipmentCard(event.instanceId);
      }
    }
    this.state.forces.syncEquipment(sim.equippedItems);
  }

  // ---- 보스 유물 / 액트 전환 ----

  /** 보스 유물 후보 (bossRelic 단계에서만) */
  bossRelicChoices(): string[] {
    const session = this.state.session;
    return session?.kind === 'bossRelic' ? [...session.offer] : [];
  }

  /** 보스 유물 후보 중 하나를 받고 다음 액트로 넘어간다 (회복 → actIntro) */
  claimBossRelic(index: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'bossRelic') return fail('고를 보스 유물이 없습니다');
    const relicId = session.offer[index];
    if (relicId === undefined) return fail('올바른 보스 유물을 고르세요');
    if (this.state.forces.relics.has(relicId)) return fail('이미 가진 유물입니다');
    this.acquireRelic(relicId);
    this.advanceAct();
    return OK;
  }

  /** 보스 유물을 받지 않고 다음 액트로 넘어간다 */
  skipBossRelic(): RunResult {
    if (this.state.session?.kind !== 'bossRelic') return fail('건너뛸 보스 유물 선택이 없습니다');
    this.advanceAct();
    return OK;
  }

  /** 액트 소개를 확인하고 새 액트의 맵으로 간다 */
  continueAct(): RunResult {
    if (this.state.session?.kind !== 'actIntro') return fail('액트 소개 화면이 아닙니다');
    this.toMap();
    return OK;
  }

  // ---- 카드 보상 ----

  rewardOffer(): string[] {
    const session = this.state.session;
    return session?.kind === 'reward' ? [...session.offer] : [];
  }

  /** 제시된 카드 중 하나를 덱에 넣고 맵으로 돌아간다 */
  claimReward(index: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'reward') return fail('받을 카드 보상이 없습니다');
    const cardId = session.offer[index];
    if (cardId === undefined) return fail('올바른 카드를 고르세요');
    this.state.forces.addCard(cardId);
    this.toMap();
    return OK;
  }

  /** 정예 보상으로 제시된 유물을 받는다. 이미 받았으면 아무것도 하지 않고 성공 (카드 보상을 고르거나 건너뛰기 전에 부른다) */
  claimRelic(): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'reward') return fail('받을 유물 보상이 없습니다');
    if (session.relic === null) return fail('이번 보상에는 유물이 없습니다');
    if (!this.state.forces.relics.has(session.relic)) this.acquireRelic(session.relic);
    return OK;
  }

  skipReward(): RunResult {
    if (this.state.session?.kind !== 'reward') return fail('건너뛸 카드 보상이 없습니다');
    this.toMap();
    return OK;
  }

  // ---- 상점 노드 ----

  shopView(): ShopView | null {
    const session = this.state.session;
    if (session?.kind !== 'shop') return null;
    const discount = this.cardDiscountPct();
    return {
      cards: session.cards.map((slot) => ({ ...slot, price: discounted(slot.price, discount) })),
      relics: session.relics.map((slot) => ({ ...slot })),
      removalPrice: discounted(removalPrice(this.state.removals), discount),
      removable: removableCards(this.state.forces.deck),
    };
  }

  buyShopCard(slot: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'shop') return fail('상점이 아닙니다');
    const entry = session.cards[slot];
    if (!entry) return fail('올바른 카드 슬롯을 고르세요');
    if (entry.sold) return fail('이미 구매한 카드입니다');
    if (!this.state.forces.economy.spend(discounted(entry.price, this.cardDiscountPct()))) return fail('카드를 구매할 골드가 부족합니다');
    this.state.forces.addCard(entry.cardId);
    entry.sold = true;
    return OK;
  }

  /** 상점 유물 구매 */
  buyShopRelic(slot: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'shop') return fail('상점이 아닙니다');
    const entry = session.relics[slot];
    if (!entry) return fail('올바른 유물 슬롯을 고르세요');
    if (entry.sold) return fail('이미 구매한 유물입니다');
    if (this.state.forces.relics.has(entry.relicId)) return fail('이미 가진 유물입니다');
    if (!this.state.forces.economy.spend(entry.price)) return fail('유물을 구매할 골드가 부족합니다');
    entry.sold = true;
    this.acquireRelic(entry.relicId);
    return OK;
  }

  /** 덱에서 카드 1장을 제거한다. 가격은 75G에서 시작해 제거할 때마다(런 누적) 25G씩 오른다 */
  removeCardForGold(instanceId: number): RunResult {
    if (this.state.session?.kind !== 'shop') return fail('상점이 아닙니다');
    if (!removableCards(this.state.forces.deck).some((card) => card.instanceId === instanceId)) return fail('제거할 수 없는 카드입니다');
    if (!this.state.forces.economy.spend(discounted(removalPrice(this.state.removals), this.cardDiscountPct()))) return fail('카드를 제거할 골드가 부족합니다');
    this.state.forces.removeCard(instanceId);
    this.state.removals += 1;
    return OK;
  }

  leaveShop(): RunResult {
    if (this.state.session?.kind !== 'shop') return fail('상점이 아닙니다');
    this.toMap();
    return OK;
  }

  // ---- 이벤트 노드 ----

  eventView(): EventView | null {
    const session = this.state.session;
    if (session?.kind !== 'event') return null;
    const event = this.eventDef(session.state);
    return {
      eventId: event.id, title: event.title, text: event.text,
      choices: this.director.choiceViews(event, this.eventHost()),
      chosen: session.state.chosen,
      pending: session.state.pending ? structuredClone(session.state.pending) : null,
      messages: [...session.state.messages],
      finished: this.director.isFinished(session.state, event),
    };
  }

  chooseEventOption(index: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'event') return fail('이벤트가 아닙니다');
    return this.director.choose(session.state, this.eventDef(session.state), index, this.eventHost(), this.requireNode().id);
  }

  /** 추가 선택(카드 획득/제거/강화 후보 중 하나)을 고른다 */
  pickEventOption(optionIndex: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'event') return fail('이벤트가 아닙니다');
    return this.director.pick(session.state, this.eventDef(session.state), optionIndex, this.eventHost(), this.requireNode().id);
  }

  finishEvent(): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'event') return fail('이벤트가 아닙니다');
    if (!this.director.isFinished(session.state, this.eventDef(session.state))) return fail('아직 끝나지 않은 이벤트입니다 (선택지를 고르고 카드 선택을 마치세요)');
    this.toMap();
    return OK;
  }

  // ---- 야영지 노드 (택1) ----

  campView(): CampView | null {
    if (this.state.session?.kind !== 'camp') return null;
    const { health, forces } = this.state;
    const board = forces.management.snapshot();
    const owned = [...board.board, ...board.bench.filter((u): u is NonNullable<typeof u> => u !== null)];
    const promotions: CampPromotion[] = [];
    for (const unit of owned) {
      const quote = forces.management.promotionQuote(unit.id);
      if (!quote) continue;
      const reason = forces.economy.gold < quote.cost ? '골드가 부족합니다'
        : (board.pool[unit.unitId] ?? 0) < quote.extraCopies ? '유닛 풀에 승급에 필요한 재고가 부족합니다' : undefined;
      promotions.push({ id: unit.id, unitId: unit.unitId, star: unit.star, quote, available: reason === undefined, ...(reason ? { reason } : {}) });
    }
    return {
      healAmount: Math.min(health.max - health.hp, Math.ceil((health.max * this.campHealPct()) / 100)),
      canHeal: health.hp < health.max,
      upgradable: upgradableCards(forces.deck, this.deps.cards),
      promotions,
    };
  }

  /** 휴식: 최대 HP의 30%(올림)만큼 회복하고 맵으로 */
  campHeal(): RunResult {
    const view = this.campView();
    if (!view) return fail('야영지가 아닙니다');
    if (!view.canHeal) return fail('이미 HP가 가득합니다');
    this.state.health.heal(view.healAmount);
    this.toMap();
    return OK;
  }

  /** 단련: 덱의 카드 1장 강화 */
  campUpgrade(instanceId: number): RunResult {
    const view = this.campView();
    if (!view) return fail('야영지가 아닙니다');
    if (!view.upgradable.some((card) => card.instanceId === instanceId)) return fail('강화할 수 없는 카드입니다');
    this.state.forces.upgradeCard(instanceId);
    this.toMap();
    return OK;
  }

  /** 승급: 유닛 1기를 한 성급 올린다 (골드 비용, 유닛 풀 재고 사용 — Management.promote 규칙) */
  campPromote(ownedUnitId: number): RunResult {
    if (this.state.session?.kind !== 'camp') return fail('야영지가 아닙니다');
    const result = this.state.forces.management.promote(ownedUnitId);
    if (!result.ok) return result;
    this.toMap();
    return OK;
  }

  /** 아무것도 하지 않고 야영지를 떠난다 */
  leaveCamp(): RunResult {
    if (this.state.session?.kind !== 'camp') return fail('야영지가 아닙니다');
    this.toMap();
    return OK;
  }

  // ---- 내부 ----

  /** 노드에 입장한다: 위치·입장 기록을 갱신하고 노드 종류별 화면 상태를 연다 */
  private visitNode(node: MapNode): void {
    this.state.currentNodeId = node.id;
    this.state.visited.push(node.id);
    this.state.forces.relics.beginNode();
    this.enter(node);
  }

  private enter(node: MapNode): void {
    const forces = this.state.forces;
    switch (node.type) {
      case 'combat':
      case 'elite':
      case 'boss':
        forces.refreshShop(); // 전투 노드마다 상점 무료 갱신 (잠금이면 1회 유지)
        this.state.session = { kind: 'battle', tries: 0 };
        this.state.phase = 'battlePrep';
        break;
      case 'shop': {
        forces.refreshShop();
        const rng = new Rng(deriveSeed(this.state.seed, 'shopcards', node.id));
        const relicRng = new Rng(deriveSeed(this.state.seed, 'shoprelics', node.id));
        this.state.session = {
          kind: 'shop',
          cards: generateCardStock(this.deps.cards, this.rewards, rng),
          relics: this.relicRewards.stock(forces.relics.ids, relicRng),
        };
        this.state.phase = 'shop';
        break;
      }
      case 'event': {
        const event = this.director.pickEvent(node.id, this.state.seenEvents);
        this.state.seenEvents.push(event.id);
        this.state.session = { kind: 'event', state: this.director.start(event) };
        this.state.phase = 'event';
        break;
      }
      case 'camp':
        this.state.session = { kind: 'camp' };
        this.state.phase = 'camp';
        break;
    }
  }

  private toMap(): void {
    this.state.session = null;
    this.state.phase = 'map';
  }

  /**
   * 마지막이 아닌 액트의 보스를 쓰러뜨린 뒤: 보스 유물 후보가 있으면(offerRelic) 선택 단계로, 아니면 바로 다음 액트 소개로.
   * 후보 목록을 돌려준다 (선택 단계로 갔을 때만, 아니면 null)
   */
  private clearActBoss(offerRelic: boolean): string[] | null {
    if (offerRelic) {
      const offer = this.relicRewards.offerBoss(this.state.forces.relics.ids, this.bossRelicRng());
      if (offer.length > 0) {
        this.state.session = { kind: 'bossRelic', offer };
        this.state.phase = 'bossRelic';
        return [...offer];
      }
    }
    this.advanceAct();
    return null;
  }

  /**
   * 다음 액트로 넘어간다: 새 맵(시드·액트에서 파생)을 붙이고 지휘관 HP를 최대 HP의 TRANSITION_HEAL_PCT%(올림)만큼 회복한다.
   * 골드·로스터·덱·장비·유물은 그대로다. 회복 결과는 actIntro 세션에 담겨 소개 화면에 표시된다.
   */
  private advanceAct(): void {
    const { health, maps } = this.state;
    maps.push(new MapGenerator().generate(this.state.seed, maps.length + 1));
    const hpBefore = health.hp;
    const healed = health.heal(Math.ceil((health.max * RUN.ACTS.TRANSITION_HEAL_PCT) / 100));
    this.state.session = { kind: 'actIntro', hpBefore, healed };
    this.state.phase = 'actIntro';
  }

  private finish(outcome: RunOutcome): void {
    this.state.session = null;
    this.state.outcome = outcome;
    this.state.phase = 'ended';
  }

  private requireNode(): MapNode {
    const node = this.currentNode;
    if (!node) throw new Error('현재 노드가 없습니다');
    return node;
  }

  private requireBattleNode(): MapNode {
    const node = this.requireNode();
    if (node.type !== 'combat' && node.type !== 'elite' && node.type !== 'boss') throw new Error('현재 노드는 전투 노드가 아닙니다');
    return node;
  }

  private requireBattleSession(): Extract<NodeSession, { kind: 'battle' }> {
    const session = this.state.session;
    if (session?.kind !== 'battle') throw new Error('전투 준비 단계가 아닙니다');
    return session;
  }

  /** 유물을 얻고 즉시 효과(최대 HP, 카드 강화, 쌍둥이 거울 합성, 경제 보정)를 적용한다. 같은 유물은 받을 수 없다 */
  private acquireRelic(relicId: string): void {
    const { forces, health } = this.state;
    const def = forces.relics.add(relicId);
    for (const effect of def.effects) {
      if (effect.kind === 'maxHp') health.raiseMax(effect.amount);
      else if (effect.kind === 'upgradeOnAcquire') forces.upgradeRandomCards(effect.count, new Rng(deriveSeed(this.state.seed, 'relicupgrade', relicId)));
    }
    forces.syncRelicEffects();
    forces.management.applyMirrorMerge();
  }

  private cardDiscountPct(): number {
    return Math.min(100, this.state.forces.relics.sum('cardDiscount', (e) => e.pct));
  }

  private campHealPct(): number {
    return RUN.CAMP.HEAL_PCT + this.state.forces.relics.sum('campHeal', (e) => e.pct);
  }

  private eventDef(session: EventSessionState): EventDef {
    const event = this.deps.events.get(session.eventId);
    if (!event) throw new Error(`알 수 없는 이벤트 "${session.eventId}"`);
    return event;
  }

  /** 이벤트로 받을 수 있는 해당 등급 유닛 (보스 제외, 풀 재고가 남은 것) */
  private grantableUnits(tier: number): UnitDef[] {
    const pool = this.state.forces.management.snapshot().pool;
    return this.deps.units.units.filter((u) => !u.boss && u.tier === tier && (pool[u.id] ?? 0) > 0);
  }

  private eventHost(): EventHost {
    const { health, forces } = this.state;
    const cards = this.deps.cards;
    return {
      get gold() { return forces.economy.gold; },
      get hp() { return health.hp; },
      get maxHp() { return health.max; },
      addGold: (amount) => forces.economy.gain(amount),
      spendGold: (amount) => forces.economy.spend(amount),
      changeHp: (delta) => {
        if (delta >= 0) health.heal(delta);
        else health.damageNonLethal(-delta);
      },
      addCard: (cardId) => forces.addCard(cardId),
      removableCards: () => removableCards(forces.deck).map((c) => c.instanceId),
      upgradableCards: () => upgradableCards(forces.deck, cards).map((c) => c.instanceId),
      removeCard: (id) => forces.removeCard(id),
      upgradeCard: (id) => forces.upgradeCard(id),
      relicBlocker: (rarity) =>
        this.relicRewards.available(forces.relics.ids, rarity).length === 0 ? '더 받을 수 있는 유물이 없습니다' : null,
      grantRandomRelic: (rarity, rng) => {
        const relicId = this.relicRewards.pickRandom(forces.relics.ids, rarity, rng);
        if (relicId === null) return null;
        this.acquireRelic(relicId);
        return this.deps.relics.get(relicId)?.name ?? relicId;
      },
      unitGrantBlocker: (tier) => {
        if (!forces.management.hasBenchSpace()) return '벤치에 빈 자리가 없습니다';
        return this.grantableUnits(tier).length === 0 ? `유닛 풀에 ${tier}등급 유닛 재고가 없습니다` : null;
      },
      grantRandomUnit: (tier, rng) => {
        const candidates = this.grantableUnits(tier);
        if (candidates.length === 0) return false;
        return forces.management.grantUnit(rng.pick(candidates).id).ok;
      },
    };
  }
}

