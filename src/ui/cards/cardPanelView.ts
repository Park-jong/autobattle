import { CARDS, CP_REGEN_TICKS, effectiveCard, type CardInstance } from '../../core/cards';
import { COMBAT, ULTIMATE, type CombatPhase, type UltimateView } from '../../core/combat';
import type { CardType, TargetKind } from '../../core/data/card';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { CommanderDef } from '../../core/data/commander';
import { explainUnplayable } from './cardAvailability';
import { CARD_TYPE_LABELS, cardTags, targetLabel } from './cardLabels';

/** 손패 카드 한 장의 표시 정보 (HTML 손패가 그대로 그린다) */
export interface HandCardView {
  instanceId: number;
  cardId: string;
  name: string;
  type: CardType;
  typeLabel: string;
  /** 지금 내야 하는 CP (연쇄·강화·방해 변이·주술사 특성을 모두 반영, 최소 0) */
  cost: number;
  /** 변이·특성 조정 전 비용. cost와 다르면 UI가 올랐는지(빨강)/내렸는지(초록) 표시한다 */
  baseCost: number;
  upgraded: boolean;
  text: string;
  targetKind: TargetKind;
  targetLabel: string;
  /** 소모·보존·연쇄·전투당 N회 같은 짧은 표기 */
  tags: string[];
  playable: boolean;
  /** 사용할 수 없는 이유 (사용 가능하면 null) */
  reason: string | null;
  selected: boolean;
}

/** 더미 목록의 한 줄: 같은 카드는 묶어서 장수를 센다 */
export interface PileEntry {
  cardId: string;
  name: string;
  upgraded: boolean;
  count: number;
}

export interface PileView {
  count: number;
  entries: PileEntry[];
}

export interface CpView {
  /** 전투 CP / 상한 */
  combat: number;
  max: number;
  /** 준비 단계 작전 전용 CP / 지급량. 전투 중에는 표시하지 않는다 */
  prep: number;
  prepMax: number;
  showPrep: boolean;
  /** 다음 +1까지의 진행률 0~1 (상한이면 1) */
  regenProgress: number;
}

export interface ToastView {
  id: number;
  message: string;
}

/** 손패 패널이 그리는 전체 정보 (읽기 전용 스냅샷) */
export interface CardPanelView {
  /** false면 카드 UI를 숨긴다 (지휘관 없음) */
  visible: boolean;
  phaseLabel: string;
  commanderName: string;
  passiveName: string;
  passiveText: string;
  hand: HandCardView[];
  /** 지휘관 궁극기 (없으면 null). 시뮬이 없을 때는 게이지 0의 정적 표시 */
  ultimate: UltimateView | null;
  cp: CpView;
  draw: PileView;
  discard: PileView;
  exhaust: PileView;
  /** 카드를 집은 상태인지 (슬로모션 중) */
  holding: boolean;
  hint: string;
  /** 손패 대신 보여줄 안내 (카드 사용 금지, 편성 필요 등). 없으면 null */
  notice: string | null;
  toast: ToastView | null;
}

/** 더미 조회에 필요한 최소 형태 (Deck이 그대로 만족한다) */
export interface DeckPiles {
  readonly hand: readonly CardInstance[];
  readonly drawPile: readonly CardInstance[];
  readonly discardPile: readonly CardInstance[];
  readonly exhaustPile: readonly CardInstance[];
}

/** 패널 구성에 필요한 입력 */
export interface PanelInput {
  commander: CommanderDef;
  piles: DeckPiles;
  /** 시뮬 진행 단계. 시뮬이 없으면(편성 부족) null */
  phase: CombatPhase | null;
  prepCp: number;
  combatCp: number;
  /** 재생 시각(초): CP 진행률 계산용 */
  time: number;
  usesOf(cardId: string): number;
  cardsPlayed?: number;
  /** 손패 카드 한 장의 비용 조정 (방해 변이 +, 주술사 특성 −). 생략하면 0 */
  costAdjustOf?(instanceId: number): number;
  selectedInstanceId: number | null;
  holding: boolean;
  hint: string;
  /** 모든 카드를 막는 이유 (카드 사용 금지, 편성 필요 등) */
  blockedReason: string | null;
  toast: ToastView | null;
  /** 시뮬이 돌려준 궁극기 상태. 시뮬이 없으면 null (지휘관 정의로 정적 표시) */
  ultimate?: UltimateView | null;
}

/** 카드 UI를 숨길 때(지휘관 없음)의 빈 표시 정보 */
export function hiddenCardPanelView(): CardPanelView {
  const empty: PileView = { count: 0, entries: [] };
  return {
    visible: false,
    phaseLabel: '',
    commanderName: '',
    passiveName: '',
    passiveText: '',
    hand: [],
    ultimate: null,
    cp: { combat: 0, max: CARDS.CP_MAX, prep: 0, prepMax: CARDS.PREP_CP, showPrep: false, regenProgress: 0 },
    draw: empty,
    discard: empty,
    exhaust: empty,
    holding: false,
    hint: '',
    notice: null,
    toast: null,
  };
}

const PHASE_LABELS: Record<CombatPhase, string> = { prep: '준비 단계', combat: '전투 중', ended: '전투 종료' };

/** 덱·CP·전투 상태에서 손패 패널 표시 정보를 만든다 (Phaser·DOM 비의존) */
export class CardPanelViewBuilder {
  constructor(private readonly catalog: CardCatalog) {}

  hidden(): CardPanelView {
    return hiddenCardPanelView();
  }

  build(input: PanelInput): CardPanelView {
    const phase = input.phase;
    return {
      visible: true,
      phaseLabel: phase ? PHASE_LABELS[phase] : '준비 단계',
      commanderName: input.commander.name,
      passiveName: input.commander.passive.name,
      passiveText: input.commander.passive.text,
      hand: input.piles.hand.map((c) => this.handCard(c, input)),
      ultimate: input.ultimate ?? this.staticUltimate(input),
      cp: this.cpView(input),
      draw: this.pile(input.piles.drawPile),
      discard: this.pile(input.piles.discardPile),
      exhaust: this.pile(input.piles.exhaustPile),
      holding: input.holding,
      hint: input.hint,
      notice: input.blockedReason,
      toast: input.toast,
    };
  }

  /** 시뮬이 없을 때(편성 부족)의 궁극기 표시: 게이지 0, 쓸 수 없음 */
  private staticUltimate(input: PanelInput): UltimateView | null {
    const def = input.commander.ultimate;
    if (!def) return null;
    return {
      commanderId: input.commander.id, name: def.name, text: def.text, charge: 0, max: ULTIMATE.GAUGE_MAX, used: false, hpCost: 0,
      ready: false, reason: '전투가 시작되면 사용할 수 있습니다',
    };
  }

  private handCard(instance: CardInstance, input: PanelInput): HandCardView {
    const card = this.catalog.get(instance.cardId);
    if (!card) throw new Error(`알 수 없는 카드 "${instance.cardId}"`);
    const view = effectiveCard(card, instance.upgraded, input.cardsPlayed);
    const costAdjust = input.costAdjustOf?.(instance.instanceId) ?? 0;
    const reason =
      input.blockedReason ??
      (input.phase === null
        ? '편성이 필요합니다'
        : explainUnplayable(card, instance.upgraded, {
            phase: input.phase,
            prepCp: input.prepCp,
            combatCp: input.combatCp,
            usesOf: input.usesOf,
            cardsPlayed: input.cardsPlayed,
            costAdjust,
          }));
    return {
      instanceId: instance.instanceId,
      cardId: card.id,
      name: instance.upgraded ? `${card.name}+` : card.name,
      type: card.type,
      typeLabel: CARD_TYPE_LABELS[card.type],
      cost: Math.max(0, view.cost + costAdjust),
      baseCost: view.cost,
      upgraded: instance.upgraded,
      text: view.text,
      targetKind: card.target.kind,
      targetLabel: targetLabel(card.target),
      tags: cardTags(card, instance.upgraded),
      playable: reason === null,
      reason,
      selected: input.selectedInstanceId === instance.instanceId,
    };
  }

  private cpView(input: PanelInput): CpView {
    const inCombat = input.phase === 'combat';
    const atMax = input.combatCp >= CARDS.CP_MAX;
    const ticks = input.time * COMBAT.TICKS_PER_SECOND;
    const progress = inCombat && !atMax ? (ticks % CP_REGEN_TICKS) / CP_REGEN_TICKS : atMax ? 1 : 0;
    return {
      combat: input.combatCp,
      max: CARDS.CP_MAX,
      prep: input.prepCp,
      prepMax: CARDS.PREP_CP,
      showPrep: input.phase === 'prep' || input.phase === null,
      regenProgress: progress,
    };
  }

  private pile(cards: readonly CardInstance[]): PileView {
    const grouped = new Map<string, PileEntry>();
    for (const c of cards) {
      const name = this.catalog.get(c.cardId)?.name ?? c.cardId;
      const key = `${c.cardId}:${c.upgraded}`;
      const entry = grouped.get(key);
      if (entry) entry.count += 1;
      else grouped.set(key, { cardId: c.cardId, name: c.upgraded ? `${name}+` : name, upgraded: c.upgraded, count: 1 });
    }
    // 뽑을 더미의 순서를 드러내지 않도록 이름순으로 정렬한다
    const entries = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return { count: cards.length, entries };
  }
}

/** 궁극기 칸의 HP 비용 표기. 쓰기 전에는 "지금 쓰면 잃는 HP", 쓴 뒤에는 실제로 잃은 HP (남은 HP로 다시 계산하지 않는다) */
export function ultimateCostLabel(ult: UltimateView): string | null {
  if (ult.hpCost <= 0) return null;
  return ult.used ? `사용 시 지휘관 HP -${ult.hpCost} 소모` : `지휘관 HP -${ult.hpCost}`;
}
