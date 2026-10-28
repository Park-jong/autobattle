import type { DeckPreset, DeckSnapshot } from '../../core/cards';
import type { CombatResult, FormationEntry } from '../../core/combat';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { CommanderDef } from '../../core/data/commander';
import type { UnitCatalog } from '../../core/data/unitLoader';
import type { Economy, EconomyView } from '../../core/economy';
import type { Management } from '../../core/management';
import { PlayerForces } from '../../core/run/forces';
import { deriveBattleSeed, type GauntletRecord, type GauntletStage, type GauntletSummary } from './Gauntlet';

/**
 * 경제 플레이용 5연전. 구매·배치한 로스터와 덱·장비·골드를 다음 판으로 이어간다.
 * 이어받기 로직은 core의 PlayerForces(런 코어와 공용)에 있고, 이 클래스는 고정 5연전의 판 진행과 기록만 맡는다.
 */
export class ManagementRun {
  private readonly forces: PlayerForces;
  readonly stages: readonly GauntletStage[];
  private currentIndex = 0;
  private readonly recordList: GauntletRecord[] = [];
  private nextPrepared = true;
  private readonly completedLogs = new WeakSet<CombatResult['events']>();

  constructor(
    units: UnitCatalog,
    cards: CardCatalog,
    readonly commander: CommanderDef,
    stages: readonly GauntletStage[],
    private readonly baseSeed: number,
    preset: DeckPreset,
  ) {
    if (stages.length === 0) throw new Error('경제 플레이의 적 편성이 없습니다.');
    this.stages = stages.map((stage, i) => ({ ...stage, kind: stage.kind ?? (i === stages.length - 1 ? 'boss' : i === stages.length - 2 ? 'elite' : 'normal') }));
    this.forces = PlayerForces.create(units, cards, commander, { management: baseSeed, deck: baseSeed }, preset);
  }

  get economy(): Economy { return this.forces.economy; }
  get management(): Management { return this.forces.management; }
  get index(): number { return this.currentIndex; }
  get total(): number { return this.stages.length; }
  get done(): boolean { return this.currentIndex >= this.total; }
  get stage(): GauntletStage | null { return this.stages[this.currentIndex] ?? null; }
  get seed(): number { return deriveBattleSeed(this.baseSeed, this.currentIndex); }
  get records(): readonly GauntletRecord[] { return this.recordList; }
  get economyView(): EconomyView { return this.economy.snapshot(); }

  formation(): FormationEntry[] { return this.forces.formation(); }

  deckForBattle(): DeckSnapshot { return this.forces.deckForBattle(); }

  /** 영구 장비는 준비 화면을 다시 만들어도 사용 전 카드가 복구되지 않아야 한다. */
  commitEquipmentCard(instanceId: number): void {
    this.forces.commitEquipmentCard(instanceId);
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
    this.forces.finishBattle(endDeck);
    this.currentIndex += 1;
    this.nextPrepared = false;
  }

  prepareNextBattle(): void {
    if (this.done || this.nextPrepared) return;
    this.forces.refreshShop();
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
