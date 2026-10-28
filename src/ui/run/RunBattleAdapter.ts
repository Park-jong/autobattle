import type { DeckSnapshot } from '../../core/cards';
import type { CombatSimulator, FormationEntry } from '../../core/combat';
import type { CommanderDef } from '../../core/data/commander';
import type { BattleKind, EconomyView } from '../../core/economy';
import type { RunController, RunRoster, SettleResult } from '../../core/run';
import type { RunBattleLink } from '../debug/runLink';

/** RunController를 BattleSession이 쓰는 RunBattleLink로 맞춰 주는 얇은 어댑터 */
export class RunBattleAdapter implements RunBattleLink {
  constructor(private readonly run: RunController) {}

  get commander(): CommanderDef {
    return this.run.commander;
  }

  get roster(): RunRoster {
    return this.run.roster;
  }

  get economyView(): EconomyView {
    return this.run.economyView;
  }

  get kind(): BattleKind {
    const type = this.run.currentNode?.type;
    return type === 'elite' ? 'elite' : type === 'boss' ? 'boss' : 'normal';
  }

  allyFormation(): FormationEntry[] {
    return this.run.roster.formation();
  }

  enemyFormation(): FormationEntry[] {
    return this.run.battlePlan().formation.map((entry) => ({ ...entry, cell: { ...entry.cell } }));
  }

  deck(): DeckSnapshot {
    return this.run.deck;
  }

  createSimulator(): CombatSimulator {
    return this.run.createSimulator();
  }

  begin(): { ok: true } | { ok: false; reason: string } {
    return this.run.beginBattle();
  }

  abandon(): void {
    this.run.abandonBattle();
  }

  complete(sim: CombatSimulator): SettleResult {
    return this.run.completeBattle(sim);
  }

  commitPreparedEquipment(sim: CombatSimulator): void {
    this.run.commitPreparedEquipment(sim);
  }
}
