import { describe, expect, it } from 'vitest';
import unitsJson from '../../../data/units.json';
import { loadUnits } from '../data';
import { CombatSimulator } from './sim';
import { cardCatalog, eventsOf, formation, handSnapshot, makeCardSim, traits, unitOf, units } from './testSupport';

const NONE = { kind: 'none' } as const;
const ally = { kind: 'unit', uid: 0 } as const;
const enemy = { kind: 'unit', uid: 3 } as const;

describe('추가 시작 카드', () => {
  it.each([[false, 150], [true, 200]] as const)('화염 폭풍 강화=%s: 범위 내 적만 피해 %s', (upgraded, amount) => {
    const sim = makeCardSim({
      hand: ['firestorm'], upgraded: upgraded ? [1] : [],
      b: [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 3], ['legion_crossbow', 1, 7, 0]],
    });
    sim.startCombat();
    sim.commandPoints?.gainCp(1, 'abyss');
    expect(sim.playCard(1, { kind: 'cell', cell: { col: 4, row: 2 } }).ok).toBe(true);
    expect(unitOf(sim, 3).hp).toBe(650 - Math.round(amount * 100 / 120));
    expect(unitOf(sim, 4).hp).toBe(650 - Math.round(amount * 100 / 120));
    expect(unitOf(sim, 5).hp).toBe(450);
    expect(eventsOf(sim, 'statusApplied').some((e) => e.status === 'burn')).toBe(false);
  });

  it('화염 폭풍의 잿불 공명은 활성 특성에서만 화상을 추가한다', () => {
    // M2에는 잿불 유닛이 1종이므로 2종 활성 조건은 테스트 카탈로그로 구성한다.
    const data = structuredClone(unitsJson);
    const shield = data.units.find((u) => u.id === 'iron_shieldbearer');
    if (!shield) throw new Error('방패병 없음');
    shield.origin = 'ember';
    const sim = makeCardSim({
      hand: ['firestorm'], unitCatalog: loadUnits(data, traits),
      a: [['iron_shieldbearer', 1, 3, 1], ['ember_kindler', 1, 2, 2]],
      b: [['iron_shieldbearer', 1, 4, 2]],
    });
    sim.startCombat();
    sim.commandPoints?.gainCp(1, 'abyss');
    sim.playCard(1, { kind: 'cell', cell: { col: 4, row: 2 } });
    expect(eventsOf(sim, 'statusApplied').find((e) => e.status === 'burn')).toMatchObject({ unit: 2, value: 30, duration: 3 });
  });

  it.each([false, true])('마나 주입 강화=%s: 마나 충전 후 다음 행동에서 스킬 사용', (upgraded) => {
    const sim = makeCardSim({ hand: ['mana_infusion'], upgraded: upgraded ? [1] : [] });
    sim.startCombat();
    expect(sim.playCard(1, ally).ok).toBe(true);
    expect(unitOf(sim, 0).mana).toBe(unitOf(sim, 0).maxMana);
    expect(sim.commandPoints?.combat).toBe(upgraded ? 1 : 0);
    sim.step();
    expect(eventsOf(sim, 'skillCast').some((e) => e.unit === 0)).toBe(true);
  });

  it('마나 주입을 적에게 쓰면 상태와 명령 로그가 변하지 않는다', () => {
    const sim = makeCardSim({ hand: ['mana_infusion'] });
    sim.startCombat();
    const before = JSON.stringify({ events: sim.events, deck: sim.deck?.serialize() });
    expect(sim.playCard(1, enemy).ok).toBe(false);
    expect(JSON.stringify({ events: sim.events, deck: sim.deck?.serialize() })).toBe(before);
    expect(sim.commandLog).toEqual([]);
  });

  it('전술 재정비는 사용 중인 자신을 다시 뽑지 않고 버린 더미를 섞는다', () => {
    const deck = handSnapshot(['tactical_reorganization', 'mana_infusion', 'marching_song']);
    deck.discard = deck.hand.splice(1);
    const sim = makeCardSim({ deck });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(sim.deck?.hand.map((c) => c.cardId).sort()).toEqual(['mana_infusion', 'marching_song']);
    expect(sim.deck?.discardPile.map((c) => c.cardId)).toEqual(['tactical_reorganization']);
    expect(sim.commandPoints?.combat).toBe(1);
  });

  it('전술 재정비 연쇄는 CP가 0이어도 쓸 수 있고, 준비 단계 작전도 연쇄로 센다', () => {
    for (const opener of ['war_drums', 'charge_signal']) {
      const sim = makeCardSim({ hand: [opener, 'tactical_reorganization'] });
      if (opener === 'war_drums') sim.playCard(1, NONE);
      sim.startCombat();
      if (opener === 'charge_signal') sim.playCard(1, NONE);
      const cp = sim.commandPoints?.combat;
      expect(sim.playCard(2, NONE).ok).toBe(true);
      expect(sim.commandPoints?.combat).toBe(cp);
      expect(eventsOf(sim, 'cardPlayed').at(-1)?.cardId).toBe('tactical_reorganization');
      expect(sim.deck?.hand.some((c) => c.cardId === 'tactical_reorganization')).toBe(false);
    }
  });

  it('강화 전술 재정비는 3장을 뽑고 손패 상한 초과분은 버린다', () => {
    const deck = handSnapshot(['tactical_reorganization', ...Array<string>(12).fill('mana_infusion')], [1]);
    deck.draw = deck.hand.splice(10);
    const sim = makeCardSim({ deck });
    sim.startCombat();
    sim.playCard(1, NONE);
    expect(sim.deck?.hand).toHaveLength(10);
    expect(sim.deck?.discardPile).toHaveLength(3); // 초과 2장 + 사용 카드
    expect(sim.deck?.drawPile).toHaveLength(0);
  });

  it.each([[false, 80, 20], [true, 120, 30]] as const)('불씨 화살 강화=%s: 피해·화상·소모 적용', (upgraded, damage, dps) => {
    const sim = makeCardSim({ hand: ['ember_arrow'], upgraded: upgraded ? [1] : [] });
    sim.startCombat();
    sim.playCard(1, enemy);
    expect(unitOf(sim, 3).hp).toBe(650 - Math.round(damage * 100 / 120));
    expect(eventsOf(sim, 'statusApplied').find((e) => e.status === 'burn')).toMatchObject({ value: dps, duration: 3 });
    expect(sim.deck?.exhaustPile.map((c) => c.cardId)).toEqual(['ember_arrow']);
  });

  it.each([[false, 20], [true, 35]] as const)('행군가 강화=%s: ARM +%s가 4초 후 해제된다', (upgraded, armor) => {
    const sim = makeCardSim({ hand: ['marching_song'], upgraded: upgraded ? [1] : [] });
    const before = sim.world.alliesOf(0).map((u) => u.stat('arm'));
    sim.startCombat();
    sim.playCard(1, NONE);
    sim.world.alliesOf(0).forEach((u, i) => expect(u.stat('arm')).toBe((before[i] ?? 0) + armor));
    sim.runUntil(41);
    sim.world.alliesOf(0).forEach((u) => expect(u.stat('arm')).toBe(before[u.uid]));
  });

  it('마나 주입의 보존은 전투 종료 후에도 손패를 유지한다', () => {
    const sim = makeCardSim({ hand: ['mana_infusion', 'marching_song'] });
    sim.run();
    expect(sim.deck?.hand.map((c) => c.cardId)).toEqual(['mana_infusion']);
    expect(sim.deck?.discardPile.map((c) => c.cardId)).toEqual(['marching_song']);
  });

  it('공격 카드가 마지막 적을 처치하면 즉시 종료되고 추가 카드를 거부한다', () => {
    const sim = makeCardSim({ hand: ['ember_arrow', 'marching_song'], b: [['iron_shieldbearer', 1, 4, 2]] });
    sim.startCombat();
    unitOf(sim, 3).hp = 1;
    sim.playCard(1, enemy);
    expect(sim.finished).toBe(true);
    expect(sim.events.at(-1)?.type).toBe('end');
    expect(sim.deck?.hand).toHaveLength(0);
    const count = sim.events.length;
    expect(sim.playCard(2, NONE).ok).toBe(false);
    expect(sim.events).toHaveLength(count);
  });

  it('예약 공격 카드로 종료한 틱에는 주기 피해가 이어서 발생하지 않는다', () => {
    const sim = makeCardSim({
      a: [['iron_shieldbearer', 1, 0, 0]], b: [['iron_shieldbearer', 1, 7, 4]],
      hand: ['ember_arrow'], commands: [{ tick: 10, cardInstanceId: 1, target: { kind: 'unit', uid: 1 } }],
    });
    unitOf(sim, 1).hp = 1;
    unitOf(sim, 0).statuses.addBurn(30, 3, null);
    sim.run();
    expect(sim.world.tick).toBe(10);
    expect(sim.events.at(-1)?.type).toBe('end');
    expect(eventsOf(sim, 'damage').some((e) => e.unit === 0 && e.t === 1)).toBe(false);
  });

  it('드로우·연쇄·공격 명령을 기록 후 재생하면 이벤트와 덱 상태가 일치한다', () => {
    const deck = handSnapshot(['tactical_reorganization', 'marching_song', 'ember_arrow', 'mana_infusion'], [4]);
    deck.draw = deck.hand.splice(2);
    const setup = { seed: 42, formations: [formation([['iron_shieldbearer', 1, 3, 2]]), formation([['iron_shieldbearer', 2, 4, 2]])] as const,
      cards: { commander: null, deck } };
    const sim = new CombatSimulator(setup, units, traits, cardCatalog);
    sim.startCombat();
    sim.playCard(2, NONE);
    sim.playCard(1, NONE);
    sim.playCard(3, { kind: 'unit', uid: 1 });
    sim.runUntil(40);
    sim.playCard(4, ally);
    sim.run();
    expect(sim.commandLog).toHaveLength(4);
    const replay = new CombatSimulator({ ...setup, cards: { ...setup.cards, commands: sim.commandLog } }, units, traits, cardCatalog);
    replay.run();
    expect(replay.rejectedCommands).toEqual([]);
    expect(replay.events).toEqual(sim.events);
    expect(replay.deck?.serialize()).toEqual(sim.deck?.serialize());
  });
});
