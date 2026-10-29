import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import { startingDeckSpecs } from '../cards';
import { fixtureCard, fixtureCatalog } from '../cards/testSupport';
import { Rng } from '../rng';
import { generateCardStock } from './cardMarket';
import { CardRewardGenerator } from './cardRewards';
import { RunController } from './runController';
import { loadRunDeps } from './runData';
import { damageCommander, driveTo, forceResult, newRunAs, rawRunData, runDeps } from './testSupport';

/** M5-4 2부-A: 지휘관 전용 보상 풀, 불씨 화살 전환·테스트 덱, 지휘관 HP 회복·저주 골드 정산 */

const common = (id: string, owner = 'neutral', rarity = 'common') => fixtureCard(id, { owner, rarity });
const catalog = fixtureCatalog([
  common('n_c1'), common('n_c2'), common('n_c3'), common('n_r1', 'neutral', 'rare'), common('n_r2', 'neutral', 'rare'), common('n_e1', 'neutral', 'epic'),
  common('i_c1', 'cmd_isera'), common('i_r1', 'cmd_isera', 'rare'), common('i_e1', 'cmd_isera', 'epic'), common('i_start', 'cmd_isera', 'starter'),
  fixtureCard('i_curse', { owner: 'cmd_isera', type: 'curse', rarity: 'common', effects: [] }),
  common('h_c1', 'cmd_harten'), common('h_r1', 'cmd_harten', 'rare'), common('n_start', 'neutral', 'starter'),
]);
const idsOf = (list: { id: string }[]): string[] => list.map((c) => c.id);

describe('지휘관 전용 보상 풀', () => {
  it('공용 보상 카드 + 그 지휘관의 고유 카드 (starter·curse·다른 지휘관 카드 제외)', () => {
    const isera = new CardRewardGenerator(catalog, 'cmd_isera');
    expect(idsOf(isera.pool('common'))).toEqual(['n_c1', 'n_c2', 'n_c3', 'i_c1']);
    expect(idsOf(isera.pool('rare'))).toEqual(['n_r1', 'n_r2', 'i_r1']);
    expect(idsOf(isera.pool('epic'))).toEqual(['n_e1', 'i_e1']);
    const harten = new CardRewardGenerator(catalog, 'cmd_harten');
    expect(idsOf(harten.pool('common'))).toEqual(['n_c1', 'n_c2', 'n_c3', 'h_c1']);
    const nox = new CardRewardGenerator(catalog, 'cmd_nox'); // 고유 카드가 없는 지휘관은 공용만
    expect(idsOf(nox.pool('common'))).toEqual(['n_c1', 'n_c2', 'n_c3']);
    for (const generator of [isera, harten, nox]) {
      for (const rarity of ['common', 'rare', 'epic'] as const) {
        expect(idsOf(generator.pool(rarity))).not.toContain('i_start');
        expect(idsOf(generator.pool(rarity))).not.toContain('i_curse');
        expect(idsOf(generator.pool(rarity))).not.toContain('n_start');
      }
    }
  });

  it('지휘관을 주지 않으면 공용 카드만 쓴다', () => {
    expect(idsOf(new CardRewardGenerator(catalog).pool('common'))).toEqual(['n_c1', 'n_c2', 'n_c3']);
  });

  it('보상 제시는 다른 지휘관 카드를 내지 않고 고유 카드를 낼 수 있으며, 같은 제시 안에서 겹치지 않는다', () => {
    const generator = new CardRewardGenerator(catalog, 'cmd_isera');
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const kind of ['normal', 'elite', 'boss'] as const) {
        const offer = generator.offer(kind, new Rng(seed));
        expect(new Set(offer).size).toBe(offer.length);
        for (const id of offer) seen.add(id);
      }
    }
    expect(seen.has('i_c1')).toBe(true);
    expect(seen.has('h_c1')).toBe(false);
    expect(seen.has('i_start')).toBe(false);
  });

  it('희귀도 가중치(일반 전투 70/27/3)는 풀 크기와 무관하게 유지되고, 보스는 첫 장이 희귀 이상', () => {
    const generator = new CardRewardGenerator(catalog, 'cmd_isera');
    const tally = { common: 0, rare: 0, epic: 0 };
    const N = 6000;
    for (let seed = 1; seed <= N; seed++) {
      const first = catalog.get(generator.offer('normal', new Rng(seed))[0] as string)!.rarity as keyof typeof tally;
      tally[first] += 1;
      expect(['rare', 'epic']).toContain(catalog.get(generator.offer('boss', new Rng(seed))[0] as string)!.rarity);
    }
    expect(tally.common / N).toBeGreaterThan(0.66);
    expect(tally.common / N).toBeLessThan(0.74);
    expect(tally.rare / N).toBeGreaterThan(0.23);
    expect(tally.rare / N).toBeLessThan(0.31);
  });

  it('상점 진열과 이벤트 카드 지급도 같은 풀을 쓴다', () => {
    const generator = new CardRewardGenerator(catalog, 'cmd_harten');
    const stock = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const slot of generateCardStock(catalog, generator, new Rng(seed))) stock.add(slot.cardId);
      expect(['n_c1', 'n_c2', 'n_c3', 'h_c1']).toContain(generator.pickRandom('common', new Rng(seed)));
    }
    expect(stock.has('h_c1')).toBe(true);
    expect([...stock].some((id) => id.startsWith('i_'))).toBe(false);
  });
});

describe('런이 지휘관 전용 풀을 쓴다 (RunController)', () => {
  const raw = {
    ...rawRunData,
    cards: {
      ...cardsJson,
      cards: [
        ...cardsJson.cards,
        { ...fixtureCard('i_extra', { owner: 'cmd_isera', rarity: 'common' }) },
        { ...fixtureCard('h_extra', { owner: 'cmd_harten', rarity: 'common' }) },
      ],
    },
  };
  const deps = loadRunDeps(raw);

  function offersFor(commanderId: string): Set<string> {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const run = RunController.create(deps, { seed, commanderId, acts: 1 });
      driveTo(run, 'combat');
      const sim = run.createSimulator();
      run.beginBattle();
      forceResult(sim, 'win');
      run.completeBattle(sim);
      for (const id of run.rewardOffer()) seen.add(id);
    }
    return seen;
  }

  it('이세라는 자기 고유 카드를, 하르텐은 자기 고유 카드를 보상으로 얻고 서로의 것은 얻지 않는다', () => {
    const isera = offersFor('cmd_isera');
    expect(isera.has('i_extra')).toBe(true);
    expect(isera.has('h_extra')).toBe(false);
    const harten = offersFor('cmd_harten');
    expect(harten.has('h_extra')).toBe(true);
    expect(harten.has('i_extra')).toBe(false);
    const nox = offersFor('cmd_nox');
    expect(nox.has('h_extra') || nox.has('i_extra')).toBe(false);
  });

  it('고유 카드를 얻은 런의 저장본은 복원되고, 다른 지휘관 카드가 제시/진열된 저장본은 거부된다', () => {
    const run = RunController.create(deps, { seed: 3, commanderId: 'cmd_isera', acts: 1 });
    const save = JSON.parse(JSON.stringify(run.serialize()));
    const deck = save.forces.carryDeck;
    deck.draw.push({ instanceId: deck.nextInstanceId, cardId: 'i_extra', upgraded: false });
    deck.nextInstanceId += 1;
    expect(() => RunController.restore(deps, save)).not.toThrow();
    const last = deck.draw.length - 1;
    deck.draw[last].cardId = 'h_extra';
    expect(() => RunController.restore(deps, save)).toThrow(new RegExp(`forces\\.carryDeck\\.draw\\[${last}\\]\\.cardId.*다른 지휘관의 고유 카드`));
  });
});

describe('불씨 화살: 이세라 고유 시작 카드', () => {
  const arrow = runDeps.cards.get('ember_arrow')!;

  it('owner cmd_isera, rarity starter', () => {
    expect(arrow.owner).toBe('cmd_isera');
    expect(arrow.rarity).toBe('starter');
  });

  it('어느 지휘관의 보상 풀에도 없고, 이세라 시작 덱(×3)은 그대로다', () => {
    for (const id of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
      const generator = new CardRewardGenerator(runDeps.cards, id);
      for (const rarity of ['common', 'rare', 'epic'] as const) expect(idsOf(generator.pool(rarity))).not.toContain('ember_arrow');
    }
    const isera = runDeps.commanders.get('cmd_isera')!;
    expect(isera.startingDeck.find((e) => e.cardId === 'ember_arrow')?.count).toBe(3);
  });

  it('테스트 덱 프리셋은 모든 지휘관에게 공용 카드 10장이고 불씨 화살 대신 덩굴 속박이 들어 있다', () => {
    for (const commander of runDeps.commanders.commanders) {
      const specs = startingDeckSpecs(commander, 'test');
      expect(specs).toHaveLength(10);
      expect(specs.map((s) => s.cardId)).toContain('vine_snare');
      expect(specs.map((s) => s.cardId)).not.toContain('ember_arrow');
      for (const spec of specs) expect(runDeps.cards.get(spec.cardId)?.owner).toBe('neutral');
    }
  });

  it('테스트 덱으로 시작한 모든 지휘관의 런이 저장·복원된다', () => {
    for (const commanderId of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
      const run = RunController.create(runDeps, { seed: 4, commanderId, deckPreset: 'test', acts: 1 });
      const save = JSON.parse(JSON.stringify(run.serialize()));
      expect(RunController.restore(runDeps, save).contentNotices).toEqual([]);
    }
  });

  it('테스트 도구는 다른 지휘관의 불씨 화살을 넣지 못하고 이세라는 넣을 수 있다', () => {
    const base = { seed: 5, cards: [{ cardId: 'ember_arrow' }] };
    expect(() => RunController.createTest(runDeps, { ...base, commanderId: 'cmd_harten' })).toThrow('다른 지휘관의 고유 카드');
    expect(() => RunController.createTest(runDeps, { ...base, commanderId: 'cmd_isera' })).not.toThrow();
  });
});

describe('정산: 지휘관 HP 회복·저주 골드', () => {
  const extra = [
    fixtureCard('heal5', { cost: 0, keywords: ['exhaust'], effects: [{ kind: 'commanderHeal', selector: 'allAllies', amount: 5 }] }),
    fixtureCard('rot', { type: 'curse', cost: 1, keywords: ['exhaust'], effects: [], curse: { playable: true, goldLossAtEnd: 3 } }),
  ];
  const deps = loadRunDeps({ ...rawRunData, cards: { ...cardsJson, cards: [...cardsJson.cards, ...extra] } });

  /** 지정 카드를 12장 넣은 테스트 런에서 전투 준비 시뮬을 만든다 (손패에 그 카드가 있어야 함) */
  function prepared(cardId: string, hpLoss = 0) {
    const run = RunController.createTest(deps, { seed: 6, cards: [{ cardId, count: 12 }] });
    driveTo(run, 'combat');
    damageCommander(run, hpLoss);
    const sim = run.createSimulator();
    run.beginBattle();
    sim.startCombat();
    const instance = sim.deck!.hand.find((c) => c.cardId === cardId);
    if (!instance) throw new Error('테스트 시드의 손패에 카드가 없음');
    return { run, sim, instance };
  }

  it('빚 청산 류: 승리하면 예약한 회복이 확정되고 최대 HP를 넘지 않는다', () => {
    const { run, sim, instance } = prepared('heal5', 12);
    const hp = run.hp;
    expect(sim.playCard(instance.instanceId, { kind: 'none' }).ok).toBe(true);
    expect(run.hp).toBe(hp); // 사용 즉시 HP가 늘지 않는다
    forceResult(sim, 'win');
    const settled = run.completeBattle(sim);
    expect(settled.ok && settled.settlement.cardHealed).toBe(5);
    expect(run.hp).toBe(hp + 5);
  });

  it('최대 HP 초과분은 버린다', () => {
    const { run, sim, instance } = prepared('heal5', 2);
    sim.playCard(instance.instanceId, { kind: 'none' });
    forceResult(sim, 'win');
    const settled = run.completeBattle(sim);
    expect(settled.ok && settled.settlement.cardHealed).toBe(2);
    expect(run.hp).toBe(run.maxHp);
  });

  it('패배하면 회복은 확정되지 않는다', () => {
    const { run, sim, instance } = prepared('heal5', 12);
    sim.playCard(instance.instanceId, { kind: 'none' });
    forceResult(sim, 'loss');
    const settled = run.completeBattle(sim);
    expect(settled.ok && settled.settlement.cardHealed).toBe(0);
  });

  it('전투가 끝날 때 손패에 남은 저주만큼 골드를 잃는다 (잔고 한도까지, 이긴 경우에도)', () => {
    const { run, sim } = prepared('rot');
    const inHand = sim.deck!.hand.filter((c) => c.cardId === 'rot').length;
    const goldBefore = run.gold;
    forceResult(sim, 'win');
    const settled = run.completeBattle(sim);
    if (!settled.ok) throw new Error(settled.reason);
    const lost = settled.settlement.curseGoldLost;
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(inHand * 3);
    expect(run.gold).toBe(goldBefore + settled.settlement.reward.total + settled.settlement.passiveGold - lost);
    expect(run.gold).toBeGreaterThanOrEqual(0);
  });

  it('써서 없앤 저주는 손실이 없다', () => {
    const { run, sim } = prepared('rot');
    for (const c of [...sim.deck!.hand]) if (c.cardId === 'rot') sim.playCard(c.instanceId, { kind: 'none' });
    const left = sim.deck!.hand.filter((c) => c.cardId === 'rot').length;
    forceResult(sim, 'win');
    const settled = run.completeBattle(sim);
    expect(settled.ok && settled.settlement.curseGoldLost).toBeLessThanOrEqual(left * 3);
  });
});

describe('회귀 보조', () => {
  it('새 런(하르텐)의 시작 덱에는 영향이 없다', () => {
    const run = newRunAs('cmd_harten', 1);
    expect(run.serialize().forces.carryDeck.draw).toHaveLength(10);
  });
});
