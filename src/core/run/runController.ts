import { removableCards, upgradableCards, type CardInstance, type DeckPreset, type DeckSnapshot } from '../cards';
import { CombatSimulator, type CardCommand, type CombatSetup } from '../combat';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderDef } from '../data/commander';
import type { CommanderCatalog } from '../data/commanderLoader';
import type { EncounterCatalog } from '../data/encounterLoader';
import type { EventDef } from '../data/event';
import type { EventCatalog } from '../data/eventLoader';
import type { TraitCatalog } from '../data/traitLoader';
import type { UnitCatalog } from '../data/unitLoader';
import type { BattleKind, BattleOutcome, EconomyView } from '../economy';
import type { PromotionQuote } from '../management';
import { Rng } from '../rng';
import { generateCardStock, removalPrice, type ShopCardSlot } from './cardMarket';
import { CardRewardGenerator } from './cardRewards';
import { CommanderHealth, defeatDamage } from './commanderHealth';
import { RUN } from './constants';
import { EncounterPlanner, type EncounterPlan } from './encounterPlanner';
import { EventDirector, type ChoiceView, type EventHost, type EventSessionState, type PendingPick } from './eventDirector';
import { PlayerForces } from './forces';
import { MapGenerator } from './mapGenerator';
import type { MapNode, RunMap } from './runMap';
import { RunRoster } from './runRoster';
import { RunSerializer, type RunSave } from './runSerializer';
import { RunState, type BattleSettlement, type NodeSession, type RunOutcome, type RunPhase, type RunRecord } from './runState';
import { deriveSeed } from './seeds';

/** 런 코어가 쓰는 검증된 게임 데이터 */
export interface RunDeps {
  units: UnitCatalog;
  traits: TraitCatalog;
  cards: CardCatalog;
  commanders: CommanderCatalog;
  encounters: EncounterCatalog;
  events: EventCatalog;
}

export interface RunOptions {
  seed: number;
  commanderId: string;
  deckPreset?: DeckPreset;
}

export type RunResult = { ok: true } | { ok: false; reason: string };
export type SettleResult = { ok: true; settlement: BattleSettlement } | { ok: false; reason: string };
const OK: RunResult = { ok: true };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** 상점 노드 화면 정보 */
export interface ShopView {
  cards: ShopCardSlot[];
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
 * 1액트 런의 상태 머신. 맵 선택 → 노드 입장 → 노드 처리 → 결과 적용 → 다음 선택을 진행한다.
 * 전투 실행은 CombatSimulator가 맡고, 이 클래스는 전투 입력(편성·덱·적 보정·시드)을 만들어 주고
 * 끝난 시뮬을 받아 골드·지휘관 HP·덱·장비·다음 단계에 반영한다. Phaser·DOM 비의존.
 *
 * 단계: map → (battlePrep → battle → reward | map | battlePrep(보스 재도전) | ended) / shop / event / camp → map … → ended
 * 저장은 단계가 map일 때와 노드 입장 직후를 포함한 모든 비전투 시점에 할 수 있다 (battle은 battlePrep으로 저장).
 */
export class RunController {
  private readonly planner: EncounterPlanner;
  private readonly rewards: CardRewardGenerator;
  private readonly director: EventDirector;
  private readonly serializer: RunSerializer;
  /** 단계에 따라 명령을 허용하는 유닛 관리 창구 */
  readonly roster: RunRoster;

  private constructor(
    private readonly deps: RunDeps,
    private readonly state: RunState,
  ) {
    this.planner = new EncounterPlanner(deps.units, deps.encounters, state.seed);
    this.rewards = new CardRewardGenerator(deps.cards);
    this.director = new EventDirector(deps.events, this.rewards, state.seed);
    this.serializer = new RunSerializer(deps);
    this.roster = new RunRoster(state.forces.management, {
      canEdit: () => this.state.phase !== 'battle' && this.state.phase !== 'ended',
      canShop: () => this.state.phase === 'battlePrep' || this.state.phase === 'shop',
    });
  }

  /** 새 런: 시드 하나로 맵·지휘관 시작 전력이 결정된다 */
  static create(deps: RunDeps, options: RunOptions): RunController {
    const commander = deps.commanders.get(options.commanderId);
    if (!commander) throw new Error(`알 수 없는 지휘관 "${options.commanderId}"`);
    const preset = options.deckPreset ?? 'starter';
    const forces = PlayerForces.create(
      deps.units, deps.cards, commander,
      { management: deriveSeed(options.seed, 'management'), deck: deriveSeed(options.seed, 'deck') },
      preset,
    );
    const health = new CommanderHealth(commander.maxHp ?? RUN.START_HP);
    const state = new RunState(options.seed | 0, commander.id, preset, new MapGenerator().generate(options.seed), health, forces);
    return new RunController(deps, state);
  }

  /** 저장된 체크포인트에서 이어간다. 잘못된 데이터는 위치가 담긴 한국어 오류 */
  static restore(deps: RunDeps, data: unknown): RunController {
    return new RunController(deps, new RunSerializer(deps).parse(data));
  }

  /** JSON으로 저장 가능한 체크포인트. 전투 중이면 전투 준비 단계로 저장한다 (전투 중간 저장 없음) */
  serialize(): RunSave {
    return this.serializer.serialize(this.state);
  }

  // ---- 조회 ----

  get phase(): RunPhase { return this.state.phase; }
  get outcome(): RunOutcome | null { return this.state.outcome; }
  get seed(): number { return this.state.seed; }
  get map(): RunMap { return this.state.map; }
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

  /** 현재(마지막으로 입장한) 노드. 시작 직후는 null */
  get currentNode(): MapNode | null {
    return this.state.currentNodeId === null ? null : (this.state.map.node(this.state.currentNodeId) ?? null);
  }

  /** 도달한 최고 층 (아직 입장 전이면 0) */
  get floorReached(): number {
    return this.state.visited.reduce((max, id) => Math.max(max, this.state.map.node(id)?.floor ?? 0), 0);
  }

  // ---- 맵 ----

  /** 지금 고를 수 있는 노드 (map 단계에서만) */
  availableNodes(): MapNode[] {
    if (this.state.phase !== 'map') return [];
    return this.state.currentNodeId === null ? [...this.state.map.startNodes()] : this.state.map.nextNodes(this.state.currentNodeId);
  }

  /** 노드의 적 편성 미리보기 (전투·정예·보스가 아니면 null). 실제 전투가 쓰는 계획과 같다 */
  previewNode(nodeId: string): EncounterPlan | null {
    const node = this.state.map.node(nodeId);
    return node ? this.planner.plan(node) : null;
  }

  /** 다음에 고를 수 있는 노드들의 미리보기 */
  previewAvailable(): { node: MapNode; plan: EncounterPlan | null }[] {
    return this.availableNodes().map((node) => ({ node, plan: this.planner.plan(node) }));
  }

  chooseNode(nodeId: string): RunResult {
    if (this.state.phase !== 'map') return fail('지금은 노드를 고를 수 없습니다');
    const node = this.availableNodes().find((candidate) => candidate.id === nodeId);
    if (!node) return fail('고를 수 없는 노드입니다 (현재 위치에서 이어진 다음 층 노드만 선택 가능)');
    this.state.currentNodeId = node.id;
    this.state.visited.push(node.id);
    this.enter(node);
    return OK;
  }

  // ---- 전투 (전투·정예·보스) ----

  /** 현재 전투 노드의 적 편성 계획 */
  battlePlan(): EncounterPlan {
    const node = this.requireBattleNode();
    return this.planner.plan(node) as EncounterPlan;
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
      cards: { commander: this.commander, deck: this.state.forces.deckForBattle(), commands, commanderHp: this.state.health.hp },
      enemy: plan.enemy,
    };
    return new CombatSimulator(setup, this.deps.units, this.deps.traits, this.deps.cards);
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
   * 사망 → ended / 보스 승리 → ended(승리) / 승리 → reward / 보스 패배 → battlePrep(재도전) / 그 외 패배 → map
   */
  completeBattle(sim: CombatSimulator): SettleResult {
    const session = this.state.session;
    if (session?.kind !== 'battle' || (this.state.phase !== 'battle' && this.state.phase !== 'battlePrep')) {
      return fail('정산할 전투가 없습니다 (이미 정산했거나 전투 단계가 아님)');
    }
    if (!sim.finished || !sim.deck) return fail('전투가 아직 끝나지 않았습니다');
    const node = this.requireBattleNode();
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
      defeat = defeatDamage({ survivorTierSum, floor: node.floor, kind });
      health.damage(defeat);
    }
    forces.finishBattle(sim.deck.serialize(), sim.equippedItems);

    this.state.history.push({
      nodeId: node.id, floor: node.floor, type: node.type, outcome, endTime: result.endTime,
      cardsUsed: sim.commandLog.length, hpAfter: health.hp, goldAfter: forces.economy.gold,
    });

    let runEnded: RunOutcome | null = null;
    let cardOffer: string[] | null = null;
    if (health.dead) {
      runEnded = 'dead';
      this.finish('dead');
    } else if (outcome === 'win' && kind === 'boss') {
      runEnded = 'victory';
      this.finish('victory');
    } else if (outcome === 'win') {
      cardOffer = this.rewards.offer(kind, new Rng(deriveSeed(this.state.seed, 'reward', node.id, session.tries)));
      this.state.session = { kind: 'reward', source: kind === 'elite' ? 'elite' : 'normal', offer: cardOffer };
      this.state.phase = 'reward';
    } else if (kind === 'boss') {
      this.state.session = { kind: 'battle', tries: session.tries + 1 };
      this.state.phase = 'battlePrep';
    } else {
      this.toMap();
    }
    return { ok: true, settlement: { nodeId: node.id, kind, outcome, reward, cardHpLost, defeatDamage: defeat, hpBefore, hpAfter: health.hp, runEnded, cardOffer } };
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

  skipReward(): RunResult {
    if (this.state.session?.kind !== 'reward') return fail('건너뛸 카드 보상이 없습니다');
    this.toMap();
    return OK;
  }

  // ---- 상점 노드 ----

  shopView(): ShopView | null {
    const session = this.state.session;
    if (session?.kind !== 'shop') return null;
    return {
      cards: session.cards.map((slot) => ({ ...slot })),
      removalPrice: removalPrice(this.state.removals),
      removable: removableCards(this.state.forces.deck),
    };
  }

  buyShopCard(slot: number): RunResult {
    const session = this.state.session;
    if (session?.kind !== 'shop') return fail('상점이 아닙니다');
    const entry = session.cards[slot];
    if (!entry) return fail('올바른 카드 슬롯을 고르세요');
    if (entry.sold) return fail('이미 구매한 카드입니다');
    if (!this.state.forces.economy.spend(entry.price)) return fail('카드를 구매할 골드가 부족합니다');
    this.state.forces.addCard(entry.cardId);
    entry.sold = true;
    return OK;
  }

  /** 덱에서 카드 1장을 제거한다. 가격은 75G에서 시작해 제거할 때마다(런 누적) 25G씩 오른다 */
  removeCardForGold(instanceId: number): RunResult {
    if (this.state.session?.kind !== 'shop') return fail('상점이 아닙니다');
    if (!removableCards(this.state.forces.deck).some((card) => card.instanceId === instanceId)) return fail('제거할 수 없는 카드입니다');
    if (!this.state.forces.economy.spend(removalPrice(this.state.removals))) return fail('카드를 제거할 골드가 부족합니다');
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
      healAmount: Math.min(health.max - health.hp, Math.ceil((health.max * RUN.CAMP.HEAL_PCT) / 100)),
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
        this.state.session = { kind: 'shop', cards: generateCardStock(this.deps.cards, this.rewards, rng) };
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

  private eventDef(session: EventSessionState): EventDef {
    const event = this.deps.events.get(session.eventId);
    if (!event) throw new Error(`알 수 없는 이벤트 "${session.eventId}"`);
    return event;
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
      hasBenchSpace: () => forces.management.hasBenchSpace(),
      grantRandomUnit: (tier, rng) => {
        const pool = forces.management.snapshot().pool;
        const candidates = this.deps.units.units.filter((u) => !u.boss && u.tier === tier && (pool[u.id] ?? 0) > 0);
        if (candidates.length === 0) return false;
        return forces.management.grantUnit(rng.pick(candidates).id).ok;
      },
    };
  }
}

