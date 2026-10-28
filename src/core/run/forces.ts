import {
  addCardToDeck, createStartingDeck, dealOpeningHand, exhaustCardInDeck, removeCardFromDeck,
  syncGrantedCards, upgradeCardInDeck, type DeckPreset, type DeckSnapshot,
} from '../cards';
import { parseDeckSnapshot } from '../cards/deckSnapshot';
import type { FormationEntry } from '../combat';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderDef } from '../data/commander';
import { FieldReader } from '../data/fieldReader';
import type { UnitCatalog } from '../data/unitLoader';
import { Economy, type EconomyState } from '../economy';
import { Management, type ManagementState } from '../management';
import { Rng } from '../rng';

/** 저장용 상태: 골드·로스터/상점·상점 RNG·덱 */
export interface ForcesState {
  economy: EconomyState;
  management: ManagementState;
  managementRng: number;
  carryDeck: DeckSnapshot;
}

/**
 * 플레이어가 키워 나가는 전력: 골드(Economy), 소유 로스터·상점(Management), 판 사이에 이어지는 덱과 장비.
 * 경제 플레이(ManagementRun)와 런 코어(RunController)가 함께 쓴다 — 로스터·덱·장비·골드 이어받기 규칙을 한 곳에 둔다.
 *
 * 덱: carryDeck(판 사이에 이어지는 덱)에서 전투 준비 때 손패 5장을 뽑은 preparedDeck을 만든다.
 * 한 판 안에서는 같은 준비 손패를 돌려주고(리셋해도 같은 준비 화면), 판이 끝나거나 덱을 편집하면 비운다.
 */
export class PlayerForces {
  private preparedDeck: DeckSnapshot | null = null;

  private constructor(
    private readonly units: UnitCatalog,
    private readonly cards: CardCatalog,
    readonly economy: Economy,
    readonly management: Management,
    private readonly managementRng: Rng,
    private carryDeck: DeckSnapshot,
  ) {}

  /** 지휘관의 시작 2기·시작 덱으로 새로 만든다. 상점 난수와 덱 섞기 난수의 시드는 따로 받는다 */
  static create(
    units: UnitCatalog,
    cards: CardCatalog,
    commander: CommanderDef,
    seeds: { management: number; deck: number },
    preset: DeckPreset,
  ): PlayerForces {
    const economy = new Economy();
    const rng = new Rng(seeds.management);
    const management = new Management(units, economy, rng, commander.startingUnits);
    return new PlayerForces(units, cards, economy, management, rng, createStartingDeck(commander, cards, seeds.deck, preset));
  }

  /** 저장된 상태를 검증해 복원한다 */
  static restore(units: UnitCatalog, cards: CardCatalog, data: unknown, path = 'forces'): PlayerForces {
    const r = FieldReader.of(data, path);
    r.onlyKeys(['economy', 'management', 'managementRng', 'carryDeck']);
    const economy = Economy.restore(r.rawValue('economy'), `${path}.economy`);
    const rng = new Rng(0);
    const management = new Management(units, economy, rng, []);
    management.restoreState(r.rawValue('management'), `${path}.management`);
    rng.setState(r.int('managementRng', 0));
    const deck = parseDeckSnapshot(r.rawValue('carryDeck'), `${path}.carryDeck`, cards);
    return new PlayerForces(units, cards, economy, management, rng, deck);
  }

  serialize(): ForcesState {
    return {
      economy: this.economy.serialize(),
      management: this.management.serializeState(),
      managementRng: this.managementRng.getState(),
      carryDeck: structuredClone(this.carryDeck),
    };
  }

  // ---- 전투 입력 ----

  /** 보드에 올린 소유 유닛의 전투 편성 (장비 포함) */
  formation(): FormationEntry[] {
    return this.management.formation();
  }

  /** 판 사이에 이어지는 덱 (손패 없음) */
  get deck(): DeckSnapshot {
    return structuredClone(this.carryDeck);
  }

  /** 전투 준비용 덱(손패 5장): 보드 소유 유닛이 제공하는 카드를 동기화한 뒤 처음 한 번만 뽑는다 */
  deckForBattle(): DeckSnapshot {
    const providers = this.management.snapshot().board.map((unit) => ({ sourceId: String(unit.id), unitId: unit.unitId, star: unit.star }));
    if (!this.preparedDeck) {
      this.preparedDeck = dealOpeningHand(syncGrantedCards(this.carryDeck, this.cards, providers, this.units), this.cards);
    } else {
      this.preparedDeck = syncGrantedCards(this.preparedDeck, this.cards, providers, this.units);
    }
    return this.preparedDeck;
  }

  /** 영구 장비는 준비 화면을 다시 만들어도 사용 전 카드가 복구되지 않아야 한다. 인스턴스 하나를 소모 더미로 보낸다 */
  commitEquipmentCard(instanceId: number): void {
    const consume = (snapshot: DeckSnapshot): DeckSnapshot => {
      const pile = [snapshot.draw, snapshot.hand, snapshot.discard].some((cards) => cards.some((c) => c.instanceId === instanceId));
      return pile ? exhaustCardInDeck(snapshot, instanceId) : snapshot;
    };
    this.carryDeck = consume(this.carryDeck);
    if (this.preparedDeck) this.preparedDeck = consume(this.preparedDeck);
  }

  /**
   * 전투 종료 반영: 시뮬이 정리한 덱을 이어받고(다음 준비 때 다시 뽑음) 장비를 소유 유닛에 저장한다.
   * equipped의 키는 전투 유닛 uid이며, 아군 uid i는 formation()의 i번째(= 보드 소유 유닛의 i번째)와 같다. 소환 유닛은 읽지 않는다.
   */
  finishBattle(endDeck: DeckSnapshot, equipped?: ReadonlyMap<number, readonly string[]>): void {
    if (equipped) this.syncEquipment(equipped);
    this.carryDeck = structuredClone(endDeck);
    this.preparedDeck = null;
  }

  /** 아군 편성 인덱스(uid) → 소유 유닛 장비 저장 */
  syncEquipment(equipped: ReadonlyMap<number, readonly string[]>): void {
    const board = this.management.snapshot().board;
    board.forEach((unit, index) => {
      const items = equipped.get(index);
      if (items) this.management.setEquipment(unit.id, items);
    });
  }

  /** 새 전투(노드) 입장 때의 무료 상점 갱신. 잠금이면 1회 유지하고 해제 */
  refreshShop(): void {
    this.management.advanceBattle();
  }

  // ---- 덱 편집 (런 보상·상점·이벤트·야영지) ----

  addCard(cardId: string): void {
    this.carryDeck = addCardToDeck(this.carryDeck, this.cards, cardId);
    this.preparedDeck = null;
  }

  removeCard(instanceId: number): void {
    this.carryDeck = removeCardFromDeck(this.carryDeck, instanceId);
    this.preparedDeck = null;
  }

  upgradeCard(instanceId: number): void {
    this.carryDeck = upgradeCardInDeck(this.carryDeck, this.cards, instanceId);
    this.preparedDeck = null;
  }
}
