import { describe, expect, it } from 'vitest';
import { Rng } from '../rng';
import { Deck } from '../cards/deck';
import { startingDeckSpecs } from '../cards/startingDeck';
import { CardPlanRunner, parseCardPlan, ULTIMATE_PLAN_CARD } from './cardPlan';
import { ULTIMATE_COMMAND_ID } from './cardCommand';
import { CombatSimulator } from './sim';
import { CARD_A, CARD_B, cardCatalog, formation, harten, makeCardSim, nox, traits, units } from './testSupport';

function simWithPlan(planJson: unknown, seed = 1) {
  const deck = Deck.create(startingDeckSpecs(harten), cardCatalog, new Rng(seed));
  deck.drawOpeningHand();
  const sim = new CombatSimulator(
    { seed, formations: [formation(CARD_A), formation(CARD_B)], cards: { commander: harten, deck: deck.serialize() } },
    units,
    traits,
    cardCatalog,
  );
  return { sim, runner: new CardPlanRunner(sim, cardCatalog, parseCardPlan(planJson)) };
}

describe('parseCardPlan', () => {
  it('항목을 읽고 기본값을 채운다', () => {
    expect(parseCardPlan([{ tick: 50, card: 'focus_fire', target: { rule: 'lowestHpEnemy' } }, { tick: 0, card: 'war_drums' }])).toEqual([
      { tick: 50, card: 'focus_fire', rule: 'lowestHpEnemy', until: Infinity },
      { tick: 0, card: 'war_drums', rule: 'none', until: Infinity },
    ]);
  });

  it('형식 오류는 위치가 담긴 메시지', () => {
    expect(() => parseCardPlan({})).toThrow('항목 배열');
    expect(() => parseCardPlan([{ card: 'x' }])).toThrow('plan[0].tick: 필수 필드 누락');
    expect(() => parseCardPlan([{ tick: 1, card: 'x', target: { rule: 'random' } }])).toThrow('plan[0].target.rule');
    expect(() => parseCardPlan([{ tick: 1, card: 'x', extra: 1 }])).toThrow('알 수 없는 필드');
  });
});

describe('CardPlanRunner', () => {
  it('손패에 있는 카드만 사용하고 없으면 실패로 센다', () => {
    // 시드 1의 시작 손패를 알아낸 뒤, 손패에 있는 카드와 없는 카드를 섞어 계획
    const { sim } = simWithPlan([]);
    const inHand = new Set(sim.deck?.hand.map((c) => c.cardId));
    const missing = ['shield_formation', 'hold_the_line', 'war_drums', 'formation_swap', 'focus_fire', 'last_stand', 'charge_signal'].find(
      (id) => !inHand.has(id),
    );
    const present = [...inHand].find((id) => cardCatalog.get(id)?.type === 'command' && cardCatalog.get(id)?.target.kind === 'none') ?? 'shield_formation';
    expect(missing).toBeDefined();

    const plan = [
      { tick: 5, card: missing, target: { rule: 'lowestHpAlly' } },
      { tick: 5, card: present, target: { rule: 'lowestHpAlly' } },
    ];
    const { runner, sim: sim2 } = simWithPlan(plan);
    const { stats } = runner.run();
    expect(stats.failed).toBeGreaterThanOrEqual(1);
    expect(stats.failureReasons['손패에 없는 카드']).toBeGreaterThanOrEqual(1);
    expect(sim2.finished).toBe(true);
  });

  it('계획대로 사용하면 commandLog와 cardPlayed 이벤트가 남고 같은 시드에서 재현된다', () => {
    const plan = [
      { tick: 0, card: 'war_drums' },
      { tick: 10, card: 'focus_fire', target: { rule: 'lowestHpEnemy' } },
      { tick: 20, card: 'hold_the_line', target: { rule: 'lowestHpAlly' } },
      { tick: 30, card: 'shield_formation' },
      { tick: 40, card: 'charge_signal' },
      { tick: 50, card: 'last_stand', target: { rule: 'lowestHpAlly' } },
      { tick: 60, card: 'formation_swap', target: { rule: 'highestHpAlly' } },
    ];
    // 여러 시드를 돌려 적어도 한 판에서는 카드가 실제로 쓰이는지 확인
    let anyPlayed = false;
    for (let seed = 1; seed <= 5; seed++) {
      const a = simWithPlan(plan, seed);
      const ra = a.runner.run();
      const b = simWithPlan(plan, seed);
      const rb = b.runner.run();
      expect(JSON.stringify(ra.result.events)).toBe(JSON.stringify(rb.result.events));
      expect(ra.stats.played + ra.stats.failed).toBe(plan.length);
      expect(a.sim.commandLog).toHaveLength(ra.stats.played);
      if (ra.stats.played > 0) anyPlayed = true;

      // 기록한 명령을 다시 넣으면 같은 로그
      const deck = Deck.create(startingDeckSpecs(harten), cardCatalog, new Rng(seed));
      deck.drawOpeningHand();
      const replay = new CombatSimulator(
        {
          seed,
          formations: [formation(CARD_A), formation(CARD_B)],
          cards: { commander: harten, deck: deck.serialize(), commands: a.sim.commandLog },
        },
        units,
        traits,
        cardCatalog,
      ).run();
      expect(JSON.stringify(replay.events)).toBe(JSON.stringify(ra.result.events));
    }
    expect(anyPlayed).toBe(true);
  });

  it('작전 카드는 tick과 무관하게 준비 단계에서 쓴다', () => {
    // war_drums가 손패에 오는 시드를 찾는다
    for (let seed = 1; seed <= 30; seed++) {
      const { sim, runner } = simWithPlan([{ tick: 99, card: 'war_drums' }], seed);
      if (!sim.deck?.hand.some((c) => c.cardId === 'war_drums')) continue;
      const { stats } = runner.run();
      expect(stats.played).toBe(1);
      expect(sim.commandLog[0]?.tick).toBe(0);
      return;
    }
    throw new Error('war_drums가 손패에 오는 시드를 찾지 못함');
  });

  it('알 수 없는 카드 id는 생성 시 Error', () => {
    const { sim } = simWithPlan([]);
    expect(() => new CardPlanRunner(sim, cardCatalog, parseCardPlan([{ tick: 1, card: 'ghost' }]))).toThrow('알 수 없는 카드');
  });
});

describe('카드 사용 계획: 궁극기 항목', () => {
  it('{"ultimate": true}는 카드 대신 궁극기 예약어로 읽힌다', () => {
    const [entry] = parseCardPlan([{ tick: 30, ultimate: true, until: 200 }]);
    expect(entry).toEqual({ tick: 30, card: ULTIMATE_PLAN_CARD, rule: 'none', until: 200 });
    expect(() => parseCardPlan([{ tick: 0, ultimate: true, card: 'focus_fire' }])).toThrow(/card: ultimate: true인 항목에는 card를 함께 쓸 수 없음/);
  });

  it('CardPlanRunner가 게이지가 찰 때까지 시도해 궁극기를 쓰고 commandLog에 남긴다', () => {
    // 0CP 카드 7장(피의 대가)으로 게이지를 채운 뒤 궁극기: 계획만으로 전부 수행된다
    const plan = parseCardPlan([
      ...Array.from({ length: 7 }, (_, i) => ({ tick: i, card: 'blood_price', target: { rule: 'highestHpAlly' } })),
      { tick: 0, ultimate: true },
    ]);
    const sim = makeCardSim({ commander: nox, commanderHp: 65, hand: Array(7).fill('blood_price') });
    const { stats } = new CardPlanRunner(sim, cardCatalog, plan).run();
    expect(stats.failed).toBe(0);
    expect(sim.ultimate?.used).toBe(true);
    expect(sim.commandLog.filter((c) => c.cardInstanceId === ULTIMATE_COMMAND_ID)).toHaveLength(1);
  });

  it('게이지가 차지 않으면 실패 항목으로 집계되고 사유가 남는다', () => {
    const sim = makeCardSim({ commander: harten, hand: [] });
    const plan = parseCardPlan([{ tick: 0, ultimate: true, until: 50 }]);
    const { stats } = new CardPlanRunner(sim, cardCatalog, plan).run();
    expect(stats.failed).toBe(1);
    expect(Object.keys(stats.failureReasons)[0]).toContain('게이지가 부족합니다');
  });
});
