import { describe, expect, it } from 'vitest';
import { CombatSimulator, type CardCommand } from '../../core/combat';
import { CARD_A, cardCatalog, formation, harten, traits, units } from '../../core/combat/testSupport';
import { Gauntlet, deriveBattleSeed, type GauntletConfig } from './Gauntlet';

const STAGES = [
  { name: '1전', enemy: formation([['arena_recruit', 1, 4, 2]]) },
  { name: '2전', enemy: formation([['iron_shieldbearer', 1, 4, 2], ['arena_recruit', 1, 5, 1]]) },
  { name: '3전', enemy: formation([['iron_shieldbearer', 2, 4, 2], ['legion_crossbow', 1, 6, 2], ['shade_dagger', 1, 5, 3]]) },
];

function config(over: Partial<GauntletConfig> = {}): GauntletConfig {
  return {
    stages: STAGES,
    ally: formation(CARD_A),
    commander: harten,
    cardsEnabled: true,
    baseSeed: 7,
    ...over,
  };
}

/** 지금 판을 끝까지 돌려 결과를 기록한다. commands가 있으면 그대로 예약한다 */
function playStage(g: Gauntlet, commands: readonly CardCommand[] = []) {
  const stage = g.stage;
  const deck = g.deckForBattle();
  if (!stage || !deck) throw new Error('판 또는 덱 없음');
  const sim = new CombatSimulator(
    { seed: g.seed, formations: [g.ally, stage.enemy], cards: { commander: harten, deck, commands } },
    units,
    traits,
    cardCatalog,
  );
  const result = sim.run();
  return g.complete(result, sim.commandLog.length, sim.deck?.serialize() ?? null);
}

describe('Gauntlet', () => {
  it('같은 전투 결과를 다시 읽어 정산해도 판 번호와 골드가 중복 증가하지 않는다', () => {
    const g = new Gauntlet(config(), cardCatalog);
    const stage = g.stage;
    const deck = g.deckForBattle();
    if (!stage || !deck) throw new Error('준비 데이터 없음');
    const sim = new CombatSimulator(
      { seed: g.seed, formations: [g.ally, stage.enemy], cards: { commander: harten, deck } },
      units, traits, cardCatalog,
    );
    const first = g.complete(sim.run(), 0, sim.deck?.serialize() ?? null);
    const gold = g.economyView.gold;
    expect(g.complete(sim.result(), 0, sim.deck?.serialize() ?? null)).toBe(first);
    expect(g.index).toBe(1);
    expect(g.records).toHaveLength(1);
    expect(g.economyView.gold).toBe(gold);
  });

  it('확장 덱에서 보존·소모·드로우 결과를 다음 판에도 이어받는다', () => {
    const g = new Gauntlet(config({ deckPreset: 'test', baseSeed: 1 }), cardCatalog);
    const deck = g.deckForBattle();
    const stage = g.stage;
    if (!deck || !stage) throw new Error('준비 데이터 없음');
    const sim = new CombatSimulator(
      { seed: g.seed, formations: [g.ally, stage.enemy], cards: { commander: harten, deck } },
      units, traits, cardCatalog,
    );
    sim.startCombat();
    // 드로우까지 포함해 각 카드가 다음 손패/더미로 이어지는 실제 흐름을 확인한다.
    const reorganization = sim.deck?.hand.find((c) => c.cardId === 'tactical_reorganization');
    if (reorganization) expect(sim.playCard(reorganization.instanceId, { kind: 'none' }).ok).toBe(true);
    const arrow = sim.deck?.hand.find((c) => c.cardId === 'ember_arrow');
    if (!arrow) throw new Error('테스트 시드에 불씨 화살이 필요함');
    const target = sim.world.enemiesOf(0)[0];
    if (!target) throw new Error('적 없음');
    expect(sim.playCard(arrow.instanceId, { kind: 'unit', uid: target.uid }).ok).toBe(true);
    const mana = sim.deck?.hand.find((c) => c.cardId === 'mana_infusion');
    if (!mana) throw new Error('테스트 시드에 마나 주입이 필요함');
    g.complete(sim.run(), sim.commandLog.length, sim.deck?.serialize() ?? null);
    const next = g.deckForBattle();
    expect(next?.hand.some((c) => c.instanceId === mana.instanceId)).toBe(true);
    expect(next?.exhaust.some((c) => c.instanceId === arrow.instanceId)).toBe(true);
    expect([...(next?.hand ?? []), ...(next?.draw ?? []), ...(next?.discard ?? [])].some((c) => c.instanceId === arrow.instanceId)).toBe(false);
  });

  it('판 번호별 시드는 결정적이고 서로 다르다', () => {
    const seeds = [0, 1, 2, 3, 4].map((i) => deriveBattleSeed(7, i));
    expect(new Set(seeds).size).toBe(5);
    expect(seeds).toEqual([0, 1, 2, 3, 4].map((i) => deriveBattleSeed(7, i)));
    expect(deriveBattleSeed(8, 0)).not.toBe(deriveBattleSeed(7, 0));
  });

  it('순서대로 진행하며 결과를 기록하고 요약한다', () => {
    const g = new Gauntlet(config(), cardCatalog);
    expect(g.total).toBe(3);
    expect(g.stage?.name).toBe('1전');
    for (let i = 0; i < 3; i++) {
      expect(g.done).toBe(false);
      expect(g.index).toBe(i);
      playStage(g);
    }
    expect(g.done).toBe(true);
    expect(g.stage).toBeNull();
    expect(g.records.map((r) => r.name)).toEqual(['1전', '2전', '3전']);
    const s = g.summary();
    expect(s.played).toBe(3);
    expect(s.wins + s.losses + s.draws).toBe(3);
    expect(s.totalTime).toBeCloseTo(g.records.reduce((sum, r) => sum + r.endTime, 0));
    expect(() => playStage(g)).toThrow();
  });

  it('한 판 안에서는 준비 손패가 같고, 다음 판에는 덱이 이어진다', () => {
    const g = new Gauntlet(config(), cardCatalog);
    const first = g.deckForBattle();
    expect(g.deckForBattle()).toBe(first);
    expect(first?.hand).toHaveLength(5);
    expect(first?.draw).toHaveLength(5);

    // 1판: 손패 카드 한 장(전쟁 북이면 작전)을 직접 쓰지 않아도 손패는 전투 종료 시 버린 더미로 간다
    playStage(g);
    const second = g.deckForBattle();
    expect(second).not.toBe(first);
    expect(second?.hand).toHaveLength(5);
    // 첫 손패 5장 + 남은 뽑을 더미에서 5장이 새로 뽑히므로 뽑을 더미는 비게 된다
    expect(second?.draw).toHaveLength(0);
    const handIds = (s: typeof first) => (s?.hand ?? []).map((c) => c.instanceId).sort();
    expect(handIds(second)).not.toEqual(handIds(first));
    expect(handIds(second).every((id) => first?.draw.some((c) => c.instanceId === id))).toBe(true);

    // 3판째: 뽑을 더미가 비어 버린 더미를 섞어 다시 뽑는다
    playStage(g);
    const third = g.deckForBattle();
    expect(third?.hand).toHaveLength(5);
  });

  it('카드 사용 금지면 손패를 뽑지 않고, 같은 시드로 같은 판을 카드 없이 돌릴 수 있다', () => {
    const g = new Gauntlet(config({ cardsEnabled: false }), cardCatalog);
    expect(g.cardsEnabled).toBe(false);
    expect(g.deckForBattle()?.hand).toHaveLength(0);
    playStage(g);
    expect(g.records[0]?.cardsUsed).toBe(0);
    expect(g.deckForBattle()?.hand).toHaveLength(0);
    expect(g.seed).toBe(deriveBattleSeed(7, 1));
  });

  it('지휘관이 없으면 덱이 없다', () => {
    const g = new Gauntlet(config({ commander: null }), cardCatalog);
    expect(g.cardsEnabled).toBe(false);
    expect(g.deckForBattle()).toBeNull();
  });

  it('같은 설정이면 같은 기록이 나온다', () => {
    const run = () => {
      const g = new Gauntlet(config(), cardCatalog);
      while (!g.done) playStage(g);
      return JSON.stringify(g.records);
    };
    expect(run()).toBe(run());
  });
});
