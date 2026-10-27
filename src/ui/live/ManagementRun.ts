import { Deck, type DeckPreset, type DeckSnapshot, syncGrantedCards } from '../../core/cards';
import type { CombatResult, FormationEntry } from '../../core/combat';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { CommanderDef } from '../../core/data/commander';
import type { UnitCatalog } from '../../core/data/unitLoader';
import { Economy, type EconomyView } from '../../core/economy';
import { Management } from '../../core/management';
import { Rng } from '../../core/rng';
import { createStartingDeck, dealOpeningHand } from '../cards/dealDeck';
import { deriveBattleSeed, type GauntletRecord, type GauntletStage, type GauntletSummary } from './Gauntlet';

/** 경제 플레이용 5연전. 구매·배치한 로스터와 덱·장비·골드를 다음 판으로 이어간다. */
export class ManagementRun {
  readonly economy = new Economy();
  readonly management: Management;
  readonly stages: readonly GauntletStage[];
  private currentIndex = 0;
  private readonly recordList: GauntletRecord[] = [];
  private carryDeck: DeckSnapshot;
  private preparedDeck: DeckSnapshot | null = null;
  private nextPrepared = true;
  private readonly completedLogs = new WeakSet<CombatResult['events']>();

  constructor(
    private readonly units: UnitCatalog,
    private readonly cards: CardCatalog,
    readonly commander: CommanderDef,
    stages: readonly GauntletStage[],
    private readonly baseSeed: number,
    preset: DeckPreset,
  ) {
    if (stages.length === 0) throw new Error('경제 플레이의 적 편성이 없습니다.');
    this.stages = stages.map((stage, i) => ({ ...stage, kind: stage.kind ?? (i === stages.length - 1 ? 'boss' : i === stages.length - 2 ? 'elite' : 'normal') }));
    this.management = new Management(units, this.economy, new Rng(baseSeed), commander.startingUnits);
    this.carryDeck = createStartingDeck(commander, cards, baseSeed, preset);
  }

  get index(): number { return this.currentIndex; }
  get total(): number { return this.stages.length; }
  get done(): boolean { return this.currentIndex >= this.total; }
  get stage(): GauntletStage | null { return this.stages[this.currentIndex] ?? null; }
  get seed(): number { return deriveBattleSeed(this.baseSeed, this.currentIndex); }
  get records(): readonly GauntletRecord[] { return this.recordList; }
  get economyView(): EconomyView { return this.economy.snapshot(); }

  formation(): FormationEntry[] { return this.management.formation(); }

  deckForBattle(): DeckSnapshot {
    const providers = this.management.snapshot().board.map((unit) => ({ sourceId: String(unit.id), unitId: unit.unitId, star: unit.star }));
    if (!this.preparedDeck) {
      this.preparedDeck = dealOpeningHand(syncGrantedCards(this.carryDeck, this.cards, providers, this.units), this.cards);
    } else {
      this.preparedDeck = syncGrantedCards(this.preparedDeck, this.cards, providers, this.units);
    }
    return this.preparedDeck;
  }

  /** 영구 장비는 준비 화면을 다시 만들어도 사용 전 카드가 복구되지 않아야 한다. */
  commitEquipmentCard(instanceId: number): void {
    const consume = (snapshot: DeckSnapshot): DeckSnapshot => {
      const deck = Deck.restore(snapshot, this.cards, new Rng(0));
      const result = deck.serialize();
      for (const pile of [result.hand, result.draw, result.discard]) {
        const index = pile.findIndex((card) => card.instanceId === instanceId);
        if (index < 0) continue;
        const [card] = pile.splice(index, 1);
        if (card) result.exhaust.push(card);
        break;
      }
      return result;
    };
    this.carryDeck = consume(this.carryDeck);
    if (this.preparedDeck) this.preparedDeck = consume(this.preparedDeck);
  }

  complete(result: CombatResult, cardsUsed: number, endDeck: DeckSnapshot): void {
    const stage = this.stage;
    if (!stage || !this.nextPrepared || this.completedLogs.has(result.events)) return;
    this.completedLogs.add(result.events);
    this.recordList.push({
      index: this.currentIndex, name: stage.name, winner: result.winner, reason: result.reason,
      endTime: result.endTime, cardsUsed, allySurvivors: result.survivors.filter((unit) => unit.side === 0).length,
      reward: this.economy.settleBattle(`stage:${this.currentIndex}`, stage.kind ?? 'normal', result.winner === 0 ? 'win' : result.winner === 1 ? 'loss' : 'draw'),
    });
    this.carryDeck = endDeck;
    this.preparedDeck = null;
    this.currentIndex += 1;
    this.nextPrepared = false;
  }

  prepareNextBattle(): void {
    if (this.done || this.nextPrepared) return;
    this.management.advanceBattle();
    this.nextPrepared = true;
  }

  summary(): GauntletSummary {
    return this.recordList.reduce<GauntletSummary>((summary, record) => {
      summary.played++;
      if (record.winner === 0) summary.wins++;
      else if (record.winner === 1) summary.losses++;
      else summary.draws++;
      summary.totalTime += record.endTime;
      summary.totalCards += record.cardsUsed;
      summary.totalGold += record.reward.total;
      return summary;
    }, { played: 0, wins: 0, losses: 0, draws: 0, totalTime: 0, totalCards: 0, totalGold: 0 });
  }
}
