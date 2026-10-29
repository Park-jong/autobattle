import type { CardCatalog } from '../data/cardLoader';
import type { Rng } from '../rng';
import type { CardInstance, DeckCardSpec } from './cardInstance';
import { CARDS } from './constants';
import { effectiveCard } from './effectiveCard';

/** 직렬화된 덱 상태 (런 저장·전투 입력용). 모든 더미의 순서가 보존된다. */
export interface DeckSnapshot {
  nextInstanceId: number;
  /** 0번이 맨 위(다음에 뽑힐 카드) */
  draw: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  exhaust: CardInstance[];
  /** 섞기용 Rng 내부 상태 */
  rngState: number;
}

export interface DrawResult {
  /** 손패에 들어온 카드 */
  drawn: CardInstance[];
  /** 손패 상한 때문에 바로 버린 더미로 간 카드 */
  overflowed: CardInstance[];
}

export interface DeckOptions {
  handLimit?: number;
}

/**
 * 덱 모델: 뽑을 더미(draw) / 손패(hand) / 버린 더미(discard) / 소모 더미(exhaust). Phaser 비의존.
 *
 * - 뽑기: 뽑을 더미 맨 위부터. 비어 있으면 버린 더미를 Rng로 섞어 새 뽑을 더미로 삼는다. 둘 다 비면 거기서 중단.
 * - 손패 상한을 넘기는 뽑기는 그 카드를 즉시 버린 더미로 보낸다 (overflowed).
 * - 사용한 카드: 소모(exhaust) 키워드면 소모 더미(이번 런에서 제거), 아니면 버린 더미.
 * - 전투 종료: 손패의 카드를 모두 버린 더미로. 보존(retain) 키워드 카드만 손패에 남는다.
 * - 더미는 전투가 끝나도 그대로 이어진다 (다음 전투에서 남은 뽑을 더미부터 뽑음).
 * 섞기에 쓰는 Rng는 덱이 소유하며 상태까지 직렬화된다.
 */
export class Deck {
  private draws: CardInstance[];
  private handCards: CardInstance[];
  private discards: CardInstance[];
  private exhausted: CardInstance[];
  private readonly nextId: number;
  private readonly handLimit: number;
  /** 카드를 뽑을 때마다 부르는 관찰자 (저주 카드의 뽑을 때 효과). 손패에 들어왔든 상한 때문에 바로 버려졌든 호출한다 */
  private drawListener: ((card: CardInstance) => void) | null = null;

  private constructor(
    private readonly catalog: CardCatalog,
    private readonly rng: Rng,
    state: Omit<DeckSnapshot, 'rngState'>,
    options: DeckOptions,
  ) {
    this.draws = state.draw.map((c) => ({ ...c }));
    this.handCards = state.hand.map((c) => ({ ...c }));
    this.discards = state.discard.map((c) => ({ ...c }));
    this.exhausted = state.exhaust.map((c) => ({ ...c }));
    this.nextId = state.nextInstanceId;
    this.handLimit = options.handLimit ?? CARDS.HAND_LIMIT;
    for (const pile of [this.draws, this.handCards, this.discards, this.exhausted]) {
      for (const card of pile) this.assertKnown(card);
    }
  }

  /** 새 덱: 명세대로 인스턴스를 만들고 전부 섞어 뽑을 더미에 둔다. instanceId는 1부터 순서대로 */
  static create(specs: readonly DeckCardSpec[], catalog: CardCatalog, rng: Rng, options: DeckOptions = {}): Deck {
    const cards: CardInstance[] = specs.map((s, i) => ({
      instanceId: i + 1,
      cardId: s.cardId,
      upgraded: s.upgraded === true,
    }));
    return new Deck(
      catalog,
      rng,
      { nextInstanceId: cards.length + 1, draw: rng.shuffle(cards), hand: [], discard: [], exhaust: [] },
      options,
    );
  }

  /** 직렬화된 상태에서 복원. 주어진 rng의 상태를 스냅샷에 맞춘다 */
  static restore(snapshot: DeckSnapshot, catalog: CardCatalog, rng: Rng, options: DeckOptions = {}): Deck {
    rng.setState(snapshot.rngState);
    return new Deck(catalog, rng, snapshot, options);
  }

  serialize(): DeckSnapshot {
    return {
      nextInstanceId: this.nextId,
      draw: this.draws.map((c) => ({ ...c })),
      hand: this.handCards.map((c) => ({ ...c })),
      discard: this.discards.map((c) => ({ ...c })),
      exhaust: this.exhausted.map((c) => ({ ...c })),
      rngState: this.rng.getState(),
    };
  }

  // ---- 조회 ----

  get hand(): readonly CardInstance[] {
    return this.handCards;
  }
  get drawPile(): readonly CardInstance[] {
    return this.draws;
  }
  get discardPile(): readonly CardInstance[] {
    return this.discards;
  }
  get exhaustPile(): readonly CardInstance[] {
    return this.exhausted;
  }
  /** 런에 남아 있는 카드 수 (소모 더미 제외) */
  get size(): number {
    return this.draws.length + this.handCards.length + this.discards.length;
  }

  findInHand(instanceId: number): CardInstance | undefined {
    return this.handCards.find((c) => c.instanceId === instanceId);
  }

  // ---- 뽑기 ----

  /** 전투 준비: 기본 손패 장수만큼 뽑는다 */
  drawOpeningHand(): DrawResult {
    return this.draw(CARDS.HAND_SIZE);
  }

  /** 뽑기 관찰자를 등록한다 (하나만 유지; null이면 해제). 관찰자 안에서 다시 뽑지 않는다 */
  onDraw(listener: ((card: CardInstance) => void) | null): void {
    this.drawListener = listener;
  }

  draw(count: number): DrawResult {
    const result: DrawResult = { drawn: [], overflowed: [] };
    for (let i = 0; i < count; i++) {
      if (this.draws.length === 0) this.reshuffleDiscard();
      const card = this.draws.shift();
      if (!card) break;
      if (this.handCards.length >= this.handLimit) {
        this.discards.push(card);
        result.overflowed.push(card);
      } else {
        this.handCards.push(card);
        result.drawn.push(card);
      }
      this.drawListener?.(card);
    }
    return result;
  }

  private reshuffleDiscard(): void {
    if (this.discards.length === 0) return;
    this.draws = this.rng.shuffle(this.discards);
    this.discards = [];
  }

  // ---- 사용·종료 ----

  /** 손패에서 분리해 resolve로 효과를 해결한 뒤 소모/버린 더미로 옮긴다. 손패에 없으면 Error */
  play(instanceId: number, resolve?: () => void): CardInstance {
    const index = this.handCards.findIndex((c) => c.instanceId === instanceId);
    const card = this.handCards[index];
    if (!card) throw new Error(`손패에 없는 카드 인스턴스 ${instanceId}`);
    this.handCards.splice(index, 1);
    // 해결 중인 카드는 손패와 버린 더미 양쪽에서 제외한다.
    // 드로우 효과가 자신을 다시 뽑지 않고 손패의 빈 자리도 정확히 계산하게 한다.
    resolve?.();
    (this.hasKeyword(card, 'exhaust') || this.catalog.get(card.cardId)?.type === 'equipment' ? this.exhausted : this.discards).push(card);
    return card;
  }

  /** 전투 종료: 손패를 정리한다. 보존(retain) 카드만 손패에 남고 나머지는 버린 더미로 (손패 순서대로) */
  endCombat(): void {
    const kept: CardInstance[] = [];
    for (const card of this.handCards) {
      if (this.hasKeyword(card, 'retain')) kept.push(card);
      else this.discards.push(card);
    }
    this.handCards = kept;
  }

  // ---- 내부 ----

  private hasKeyword(card: CardInstance, keyword: 'exhaust' | 'retain'): boolean {
    const def = this.catalog.get(card.cardId);
    if (!def) return false;
    return effectiveCard(def, card.upgraded && def.upgrade !== undefined).keywords.includes(keyword);
  }

  private assertKnown(card: CardInstance): void {
    const def = this.catalog.get(card.cardId);
    if (!def) throw new Error(`덱에 알 수 없는 카드 "${card.cardId}"`);
    if (card.upgraded && !def.upgrade) throw new Error(`카드 "${card.cardId}"에는 강화 버전이 없음`);
  }
}
