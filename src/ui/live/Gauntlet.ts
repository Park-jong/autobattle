import type { DeckPreset, DeckSnapshot } from '../../core/cards';
import type { CombatResult, FormationEntry, Winner } from '../../core/combat';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { CommanderDef } from '../../core/data/commander';
import { Economy, type BattleKind, type BattleReward, type EconomyView } from '../../core/economy';
import { createStartingDeck, dealOpeningHand } from '../cards/dealDeck';

/** 연전의 한 판: 이름과 고정 적 편성 */
export interface GauntletStage {
  name: string;
  enemy: readonly FormationEntry[];
  kind?: BattleKind;
}

export interface GauntletConfig {
  stages: readonly GauntletStage[];
  /** 모든 판에서 쓰는 아군 편성 (시작 시점의 편성을 그대로 유지) */
  ally: readonly FormationEntry[];
  /** 지휘관. null이면 카드 시스템 없이 진행 */
  commander: CommanderDef | null;
  /** false면 카드를 뽑지도 쓰지도 않는다 (지휘관 패시브는 유지) */
  cardsEnabled: boolean;
  baseSeed: number;
  deckPreset?: DeckPreset;
}

/** 한 판의 결과 기록 */
export interface GauntletRecord {
  index: number;
  name: string;
  winner: Winner;
  reason: 'annihilation' | 'timeout';
  endTime: number;
  /** 이 판에서 성공한 카드 사용 수 (준비 단계 작전 카드 포함) */
  cardsUsed: number;
  /** 종료 시 살아남은 아군 수 */
  allySurvivors: number;
  reward: BattleReward;
}

export interface GauntletSummary {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  totalTime: number;
  totalCards: number;
  totalGold: number;
}

/** 판마다 시드를 결정적으로 파생한다 (기본 시드와 판 번호만으로 결정) */
export function deriveBattleSeed(baseSeed: number, index: number): number {
  return (Math.imul(baseSeed | 0, 1_000_003) + Math.imul(index + 1, 7_919)) | 0;
}

/**
 * 고정 적 편성 연전(플레이테스트용) 진행기 (Phaser·DOM 비의존).
 * 아군 편성은 유지하고 적은 단계 순서대로 바뀐다. 덱은 판 사이에 이어진다:
 * 판이 끝나면 시뮬이 정리한 덱(손패 → 버린 더미)을 받아 두었다가 다음 판 준비 때 다시 5장 뽑는다.
 * 한 판 안에서 deckForBattle()은 항상 같은 손패를 돌려준다 (리셋해도 같은 준비 화면).
 */
export class Gauntlet {
  private currentIndex = 0;
  private readonly recordList: GauntletRecord[] = [];
  private carryDeck: DeckSnapshot | null;
  private dealt: DeckSnapshot | null = null;
  private readonly economy = new Economy();
  /** result() 재호출로 새 결과 객체가 와도 같은 시뮬의 로그는 같은 배열이다. */
  private readonly completedLogs = new WeakMap<CombatResult['events'], GauntletRecord>();

  constructor(
    private readonly config: GauntletConfig,
    private readonly catalog: CardCatalog,
  ) {
    if (config.stages.length === 0) throw new Error('연전에는 최소 한 판이 필요합니다');
    this.carryDeck = config.commander ? createStartingDeck(config.commander, catalog, config.baseSeed, config.deckPreset) : null;
  }

  get total(): number {
    return this.config.stages.length;
  }

  /** 지금 준비/진행 중인 판의 번호(0부터). 모두 끝나면 total */
  get index(): number {
    return this.currentIndex;
  }

  get done(): boolean {
    return this.currentIndex >= this.total;
  }

  get commander(): CommanderDef | null {
    return this.config.commander;
  }

  /** 카드를 뽑고 쓸 수 있는 연전인지 (지휘관이 있고 "카드 사용 금지"가 아님) */
  get cardsEnabled(): boolean {
    return this.config.cardsEnabled && this.config.commander !== null;
  }

  get ally(): readonly FormationEntry[] {
    return this.config.ally;
  }

  get stage(): GauntletStage | null {
    return this.config.stages[this.currentIndex] ?? null;
  }

  get records(): readonly GauntletRecord[] {
    return this.recordList;
  }

  get economyView(): EconomyView {
    return this.economy.snapshot();
  }

  /** 현재 판의 전투 시드 */
  get seed(): number {
    return deriveBattleSeed(this.config.baseSeed, this.currentIndex);
  }

  /** 현재 판의 준비 덱 상태 (카드 시스템이 없으면 null). 카드 금지면 손패가 비어 있다 */
  deckForBattle(): DeckSnapshot | null {
    if (!this.carryDeck) return null;
    if (!this.dealt) this.dealt = this.cardsEnabled ? dealOpeningHand(this.carryDeck, this.catalog) : this.carryDeck;
    return this.dealt;
  }

  /**
   * 현재 판의 결과를 기록하고 다음 판으로 넘어간다.
   * endDeck = 시뮬이 끝난 뒤의 덱 상태(sim.deck.serialize()). 다음 판의 뽑을 더미가 여기서 이어진다.
   */
  complete(result: CombatResult, cardsUsed: number, endDeck: DeckSnapshot | null): GauntletRecord {
    const completed = this.completedLogs.get(result.events);
    if (completed) return completed;
    const stage = this.stage;
    if (!stage) throw new Error('이미 모든 판이 끝났습니다');
    const record: GauntletRecord = {
      index: this.currentIndex,
      name: stage.name,
      winner: result.winner,
      reason: result.reason,
      endTime: result.endTime,
      cardsUsed,
      allySurvivors: result.survivors.filter((s) => s.side === 0).length,
      reward: this.economy.settleBattle(`stage:${this.currentIndex}`, stage.kind ?? 'normal', result.winner === 0 ? 'win' : result.winner === 1 ? 'loss' : 'draw'),
    };
    this.recordList.push(record);
    this.completedLogs.set(result.events, record);
    if (endDeck) this.carryDeck = endDeck;
    this.dealt = null;
    this.currentIndex += 1;
    return record;
  }

  summary(): GauntletSummary {
    const s: GauntletSummary = { played: this.recordList.length, wins: 0, losses: 0, draws: 0, totalTime: 0, totalCards: 0, totalGold: 0 };
    for (const r of this.recordList) {
      if (r.winner === 0) s.wins++;
      else if (r.winner === 1) s.losses++;
      else s.draws++;
      s.totalTime += r.endTime;
      s.totalCards += r.cardsUsed;
      s.totalGold += r.reward.total;
    }
    return s;
  }
}
