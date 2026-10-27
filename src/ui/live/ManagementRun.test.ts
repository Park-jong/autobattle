import { describe, expect, it } from 'vitest';
import { CombatSimulator } from '../../core/combat';
import { cardCatalog, formation, harten, traits, units } from '../../core/combat/testSupport';
import { ManagementRun } from './ManagementRun';

describe('ManagementRun 정산', () => {
  it('다음 판 준비 이후에도 같은 전투 로그를 다시 정산하지 않는다', () => {
    const enemy = formation([['arena_recruit', 1, 4, 2]]);
    const run = new ManagementRun(units, cardCatalog, harten, [{ name: '1', enemy }, { name: '2', enemy }, { name: '3', enemy }], 1, 'starter');
    const sim = new CombatSimulator({ seed: run.seed, formations: [run.formation(), enemy], cards: { commander: harten, deck: run.deckForBattle() } }, units, traits, cardCatalog);
    const result = sim.run();
    run.complete(result, 0, sim.deck!.serialize());
    const gold = run.economy.gold;
    run.prepareNextBattle();
    run.complete(sim.result(), 0, sim.deck!.serialize());
    expect(run.records).toHaveLength(1);
    expect(run.index).toBe(1);
    expect(run.economy.gold).toBe(gold);
  });
});
