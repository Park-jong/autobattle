/**
 * 런 화면에 그릴 표시 정보를 만드는 순수 함수 모음 (Phaser·DOM 비의존).
 * RunController가 돌려주는 값을 화면이 그대로 쓸 수 있는 읽기 전용 구조로 바꾼다.
 */
import { deckCards, effectiveCard, type CardInstance } from '../../core/cards';
import { MUTATION_INFO, type MutationId } from '../../core/combat';
import type { Card, Rarity } from '../../core/data/card';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import type { BattleKind } from '../../core/economy';
import {
  RUN,
  type BattleSettlement, type CampView, type EncounterPlan, type EventView, type NodeType, type RunController,
  type RunOutcome, type RunPhase, type ShopView,
} from '../../core/run';
import { CARD_TYPE_LABELS, cardTags, targetLabel } from '../cards/cardLabels';

// ---- 공통 표기 ----

export const NODE_TYPE_INFO: Readonly<Record<NodeType, { label: string; icon: string }>> = {
  combat: { label: '전투', icon: '전' },
  elite: { label: '정예', icon: '정' },
  shop: { label: '상점', icon: '상' },
  event: { label: '이벤트', icon: '이' },
  camp: { label: '야영지', icon: '야' },
  boss: { label: '보스', icon: '보' },
};

export const RARITY_LABELS: Readonly<Record<Rarity, string>> = { starter: '시작', common: '일반', rare: '희귀', epic: '에픽' };
export const BATTLE_KIND_LABELS: Readonly<Record<BattleKind, string>> = { normal: '일반 전투', elite: '정예 전투', boss: '보스 전투' };
const OUTCOME_LABELS = { win: '승리', loss: '패배', draw: '무승부' } as const;

/** 단계 이름 (저장본 요약·헤더용) */
export const PHASE_LABELS: Readonly<Record<RunPhase, string>> = {
  map: '맵', battlePrep: '전투 준비', battle: '전투', reward: '카드 보상', shop: '상점', event: '이벤트', camp: '야영지', ended: '종료',
};

// ---- 상단 정보 ----

export interface RunHud {
  seed: number;
  commanderName: string;
  /** 도달한 최고 층 (노드 입장 전이면 0) */
  floor: number;
  floorCount: number;
  hp: number;
  maxHp: number;
  gold: number;
  /** 덱에 남아 있는 카드 수 (뽑을 + 손패 + 버린 더미) */
  deckCount: number;
  phaseLabel: string;
  /** 지금 있는 노드 설명 (없으면 '출발 전') */
  location: string;
}

export function buildHud(run: RunController): RunHud {
  const node = run.currentNode;
  return {
    seed: run.seed,
    commanderName: run.commander.name,
    floor: run.floorReached,
    floorCount: RUN.MAP.FLOORS,
    hp: run.hp,
    maxHp: run.maxHp,
    gold: run.gold,
    deckCount: deckCards(run.deck).length,
    phaseLabel: PHASE_LABELS[run.phase],
    location: node ? `${node.floor}층 ${NODE_TYPE_INFO[node.type].label}` : '출발 전',
  };
}

// ---- 맵 ----

/** 노드 상태: 방문함 / 현재 위치 / 지금 고를 수 있음 / 아직 잠김 */
export type MapNodeState = 'visited' | 'current' | 'available' | 'locked';

export interface MapNodeView {
  id: string;
  floor: number;
  index: number;
  /** 층 안 가로 위치 0~1 */
  x: number;
  type: NodeType;
  label: string;
  icon: string;
  state: MapNodeState;
  /** 적 편성 미리보기가 있는 노드 (전투·정예·보스) */
  previewable: boolean;
}

/** 간선 상태: 지나온 길 / 지금 갈 수 있는 길 / 그 외 */
export type MapEdgeState = 'walked' | 'available' | 'idle';

export interface MapEdgeView {
  from: string;
  to: string;
  state: MapEdgeState;
}

export interface MapView {
  /** 1층부터 순서대로 */
  floors: MapNodeView[][];
  edges: MapEdgeView[];
  currentId: string | null;
  availableIds: string[];
}

export function buildMapView(run: RunController): MapView {
  const available = new Set(run.availableNodes().map((n) => n.id));
  const visited = run.visited;
  const visitedSet = new Set(visited);
  const currentId = run.currentNode?.id ?? null;
  const walked = new Set<string>();
  for (let i = 1; i < visited.length; i++) walked.add(`${visited[i - 1]}>${visited[i]}`);

  const floors = run.map.floors.map((nodes) =>
    nodes.map<MapNodeView>((node) => {
      const state: MapNodeState = node.id === currentId ? 'current' : visitedSet.has(node.id) ? 'visited' : available.has(node.id) ? 'available' : 'locked';
      const info = NODE_TYPE_INFO[node.type];
      return {
        id: node.id, floor: node.floor, index: node.index, x: node.x, type: node.type, label: info.label, icon: info.icon, state,
        previewable: node.type === 'combat' || node.type === 'elite' || node.type === 'boss',
      };
    }),
  );
  const edges: MapEdgeView[] = [];
  for (const node of run.map.allNodes()) {
    for (const next of node.next) {
      const state: MapEdgeState = walked.has(`${node.id}>${next}`) ? 'walked' : node.id === currentId && available.has(next) ? 'available' : 'idle';
      edges.push({ from: node.id, to: next, state });
    }
  }
  // 시작 직전에는 1층 노드 전부가 후보이므로 간선이 없다 (표시할 것 없음)
  return { floors, edges, currentId, availableIds: [...available] };
}

// ---- 적 편성 미리보기 ----

export interface MutationView {
  id: MutationId;
  name: string;
  text: string;
}

export interface PreviewUnitView {
  unitId: string;
  name: string;
  tier: number;
  star: number;
  /** 층 보정 후 최대 HP / ATK */
  hp: number;
  atk: number;
  skillName: string;
  boss: boolean;
}

export interface EncounterPreviewView {
  nodeId: string;
  floor: number;
  kind: BattleKind;
  kindLabel: string;
  name: string;
  text: string;
  /** 층 보정 문구 (예: 'HP·ATK +12%') */
  scaleLabel: string;
  mutations: MutationView[];
  units: PreviewUnitView[];
}

export function buildEncounterPreview(plan: EncounterPlan): EncounterPreviewView {
  const bonus = Math.round((plan.scale - 1) * 100);
  return {
    nodeId: plan.nodeId,
    floor: plan.floor,
    kind: plan.kind,
    kindLabel: BATTLE_KIND_LABELS[plan.kind],
    name: plan.name,
    text: plan.text,
    scaleLabel: bonus > 0 ? `HP·ATK +${bonus}%` : '층 보정 없음',
    mutations: plan.mutations.map((id) => ({ id, ...MUTATION_INFO[id] })),
    units: plan.units.map((u) => ({
      unitId: u.unitId, name: u.name, tier: u.tier, star: u.star, hp: u.hp, atk: u.atk, skillName: u.skillName, boss: u.boss,
    })),
  };
}

// ---- 카드 ----

export interface CardView {
  cardId: string;
  name: string;
  upgraded: boolean;
  cost: number;
  rarity: Rarity;
  rarityLabel: string;
  typeLabel: string;
  targetLabel: string;
  text: string;
  tags: string[];
  /** 지휘관 HP를 쓰는 카드의 비용 표기 (없으면 null) */
  hpCostLabel: string | null;
}

/** 덱 안의 카드 한 장 (제거·강화 대상 고르기에 쓴다) */
export interface DeckCardView extends CardView {
  instanceId: number;
  /** 강화하면 어떻게 되는지 (강화 가능한 카드만) */
  upgradePreview: { name: string; cost: number; text: string } | null;
}

function requireCard(cards: CardCatalog, cardId: string): Card {
  const card = cards.get(cardId);
  if (!card) throw new Error(`알 수 없는 카드 "${cardId}"`);
  return card;
}

export function buildCardView(cards: CardCatalog, cardId: string, upgraded = false): CardView {
  const card = requireCard(cards, cardId);
  const effective = effectiveCard(card, upgraded && card.upgrade !== undefined);
  return {
    cardId,
    name: `${card.name}${upgraded ? '+' : ''}`,
    upgraded,
    cost: effective.cost,
    rarity: card.rarity,
    rarityLabel: RARITY_LABELS[card.rarity],
    typeLabel: CARD_TYPE_LABELS[card.type],
    targetLabel: targetLabel(card.target),
    text: effective.text,
    tags: cardTags(card),
    hpCostLabel: card.commanderHpCost ? `지휘관 HP ${card.commanderHpCost.amount}` : null,
  };
}

export function buildDeckCardView(cards: CardCatalog, instance: CardInstance): DeckCardView {
  const card = requireCard(cards, instance.cardId);
  const up = !instance.upgraded && card.upgrade ? effectiveCard(card, true) : null;
  return {
    ...buildCardView(cards, instance.cardId, instance.upgraded),
    instanceId: instance.instanceId,
    upgradePreview: up ? { name: `${card.name}+`, cost: up.cost, text: up.text } : null,
  };
}

function deckViews(cards: CardCatalog, instances: readonly CardInstance[]): DeckCardView[] {
  return instances.map((instance) => buildDeckCardView(cards, instance));
}

// ---- 보상 / 상점 / 이벤트 / 야영지 ----

export interface RewardView {
  source: 'normal' | 'elite';
  cards: CardView[];
}

export function buildRewardView(run: RunController, cards: CardCatalog): RewardView {
  const session = run.session;
  return {
    source: session?.kind === 'reward' ? session.source : 'normal',
    cards: run.rewardOffer().map((id) => buildCardView(cards, id)),
  };
}

export interface ShopCardEntry extends CardView {
  slot: number;
  price: number;
  sold: boolean;
  /** 지금 골드로 살 수 있나 (판매 완료면 false) */
  affordable: boolean;
  /** 비활성 사유 */
  reason: string | null;
}

export interface ShopScreenView {
  gold: number;
  cards: ShopCardEntry[];
  removal: { price: number; affordable: boolean; reason: string | null; candidates: DeckCardView[] };
}

export function buildShopView(view: ShopView, gold: number, cards: CardCatalog): ShopScreenView {
  const removalOk = gold >= view.removalPrice;
  const removalReason = view.removable.length === 0 ? '제거할 수 있는 카드가 없습니다' : removalOk ? null : '골드가 부족합니다';
  return {
    gold,
    cards: view.cards.map((slot, i) => {
      const affordable = !slot.sold && gold >= slot.price;
      return {
        ...buildCardView(cards, slot.cardId), slot: i, price: slot.price, sold: slot.sold, affordable,
        reason: slot.sold ? '판매 완료' : affordable ? null : '골드가 부족합니다',
      };
    }),
    removal: { price: view.removalPrice, affordable: removalReason === null, reason: removalReason, candidates: deckViews(cards, view.removable) },
  };
}

export interface EventChoiceEntry {
  index: number;
  text: string;
  enabled: boolean;
  reason: string | null;
}

/** 이벤트가 요구하는 추가 선택: 카드 획득 후보 또는 덱 카드(제거/강화) 후보. optionIndex는 pickEventOption에 넘기는 값 */
export type EventPendingView =
  | { kind: 'gainCard'; title: string; options: { optionIndex: number; card: CardView }[] }
  | { kind: 'removeCard' | 'upgradeCard'; title: string; options: { optionIndex: number; card: DeckCardView }[] };

export interface EventScreenView {
  title: string;
  text: string;
  choices: EventChoiceEntry[];
  chosen: number | null;
  messages: string[];
  pending: EventPendingView | null;
  finished: boolean;
}

export function buildEventView(view: EventView, run: RunController, cards: CardCatalog): EventScreenView {
  const pending = view.pending;
  let pendingView: EventPendingView | null = null;
  if (pending?.kind === 'gainCard') {
    pendingView = { kind: 'gainCard', title: '얻을 카드를 고르세요', options: pending.options.map((id, optionIndex) => ({ optionIndex, card: buildCardView(cards, id) })) };
  } else if (pending) {
    const byId = new Map(deckCards(run.deck).map((card) => [card.instanceId, card]));
    const options = pending.options.flatMap((id, optionIndex) => {
      const instance = byId.get(id);
      return instance ? [{ optionIndex, card: buildDeckCardView(cards, instance) }] : [];
    });
    pendingView = { kind: pending.kind, title: pending.kind === 'removeCard' ? '제거할 카드를 고르세요' : '강화할 카드를 고르세요', options };
  }
  return {
    title: view.title,
    text: view.text,
    choices: view.choices.map((c, index) => ({ index, text: c.text, enabled: c.enabled, reason: c.reason ?? null })),
    chosen: view.chosen,
    messages: view.messages,
    pending: pendingView,
    finished: view.finished,
  };
}

export interface CampPromotionEntry {
  id: number;
  unitName: string;
  star: number;
  nextStar: number;
  cost: number;
  extraCopies: number;
  available: boolean;
  reason: string | null;
}

export interface CampScreenView {
  hp: number;
  maxHp: number;
  gold: number;
  healAmount: number;
  canHeal: boolean;
  upgradable: DeckCardView[];
  promotions: CampPromotionEntry[];
}

export function buildCampView(view: CampView, run: RunController, cards: CardCatalog, units: UnitCatalog): CampScreenView {
  return {
    hp: run.hp,
    maxHp: run.maxHp,
    gold: run.gold,
    healAmount: view.healAmount,
    canHeal: view.canHeal,
    upgradable: deckViews(cards, view.upgradable),
    promotions: view.promotions.map((p) => ({
      id: p.id,
      unitName: units.get(p.unitId)?.name ?? p.unitId,
      star: p.star,
      nextStar: p.star + 1,
      cost: p.quote.cost,
      extraCopies: p.quote.extraCopies,
      available: p.available,
      reason: p.reason ?? null,
    })),
  };
}

// ---- 전투 결과 / 종료 ----

export interface SettlementView {
  headline: string;
  outcome: 'win' | 'loss' | 'draw';
  /** 골드 지급 요약 (예: '+8G (기본 5G + 이자 3G)') */
  goldLine: string;
  /** 지휘관 HP 변화 줄들 (변화 없으면 빈 배열) */
  hpLines: string[];
  hpBefore: number;
  hpAfter: number;
  runEnded: RunOutcome | null;
  /** 결과 확인 뒤 버튼 문구 */
  continueLabel: string;
}

export function buildSettlementView(s: BattleSettlement): SettlementView {
  const hpLines: string[] = [];
  if (s.cardHpLost > 0) hpLines.push(`카드 사용으로 지휘관 HP -${s.cardHpLost}`);
  if (s.defeatDamage > 0) hpLines.push(`패배 피해 지휘관 HP -${s.defeatDamage}`);
  const retry = s.outcome !== 'win' && s.kind === 'boss' && s.runEnded === null;
  return {
    headline: `${BATTLE_KIND_LABELS[s.kind]} ${OUTCOME_LABELS[s.outcome]}`,
    outcome: s.outcome,
    goldLine: `+${s.reward.total}G (기본 ${s.reward.base}G + 이자 ${s.reward.interest}G)`,
    hpLines,
    hpBefore: s.hpBefore,
    hpAfter: s.hpAfter,
    runEnded: s.runEnded,
    continueLabel: s.runEnded ? '결과 보기' : s.cardOffer ? '카드 보상 선택' : retry ? '보스 재도전 준비' : '맵으로',
  };
}

export interface EndScreenView {
  outcome: RunOutcome;
  title: string;
  seed: number;
  commanderName: string;
  floorReached: number;
  floorCount: number;
  hp: number;
  maxHp: number;
  gold: number;
  battles: { played: number; wins: number; losses: number; draws: number };
  /** 덱 요약: 같은 카드는 묶어서 장수를 센다 */
  deck: { name: string; count: number }[];
  deckCount: number;
  /** 소유 유닛 요약 (보드 + 벤치) */
  roster: { name: string; star: number; onBoard: boolean }[];
}

export function buildEndView(run: RunController, cards: CardCatalog, units: UnitCatalog): EndScreenView {
  const outcome: RunOutcome = run.outcome ?? 'dead';
  const counts = new Map<string, { name: string; count: number }>();
  for (const instance of deckCards(run.deck)) {
    const view = buildCardView(cards, instance.cardId, instance.upgraded);
    const entry = counts.get(view.name) ?? { name: view.name, count: 0 };
    entry.count += 1;
    counts.set(view.name, entry);
  }
  const roster = run.roster.snapshot();
  const unitName = (unitId: string): string => units.get(unitId)?.name ?? unitId;
  const battles = { played: run.history.length, wins: 0, losses: 0, draws: 0 };
  for (const record of run.history) {
    if (record.outcome === 'win') battles.wins++;
    else if (record.outcome === 'loss') battles.losses++;
    else battles.draws++;
  }
  return {
    outcome,
    title: outcome === 'victory' ? '1액트 돌파' : '지휘관 쓰러짐',
    seed: run.seed,
    commanderName: run.commander.name,
    floorReached: run.floorReached,
    floorCount: RUN.MAP.FLOORS,
    hp: run.hp,
    maxHp: run.maxHp,
    gold: run.gold,
    battles,
    deck: [...counts.values()],
    deckCount: deckCards(run.deck).length,
    roster: [
      ...roster.board.map((u) => ({ name: unitName(u.unitId), star: u.star, onBoard: true })),
      ...roster.bench.flatMap((u) => (u ? [{ name: unitName(u.unitId), star: u.star, onBoard: false }] : [])),
    ],
  };
}
