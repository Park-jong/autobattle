import { describe, expect, it } from 'vitest';
import type { CombatSimulator } from './sim';
import { eventsOf, fillMana, makeCardSim, makeSim, stepTicks, unitOf, type Placement } from './testSupport';

/** 아군 진영 칸을 앞열부터 채우는 배치 (열 3 → 2 → 1 → 0, 행 0~4) */
function lineup(unitIds: readonly string[], star: 1 | 2 | 3 = 1): Placement[] {
  const cells: [number, number][] = [3, 2, 1, 0].flatMap((col) => [0, 1, 2, 3, 4].map((row) => [col, row] as [number, number]));
  return unitIds.map((id, i) => [id, star, ...(cells[i] as [number, number])] as Placement);
}

/** 적이 움직이지도 죽지도 않아 오래 지켜볼 수 있는 상대 */
const DUMMY: Placement[] = [['iron_shieldbearer', 1, 7, 2]];
function freezeEnemies(sim: CombatSimulator): void {
  for (const u of sim.world.units) {
    if (u.side === 1) {
      u.statuses.addStun(1e9);
      u.statuses.addUndying(1e9);
    }
  }
}

const FOREST = ['moss_warden', 'grove_archer', 'grove_druid', 'bear_warrior', 'shadow_panther', 'wind_hunter', 'elder_treeking'];
const MYSTIC = ['ember_kindler', 'abyss_whisperer', 'grove_druid', 'battle_chaplain', 'void_hierophant', 'volcano_oracle'];
const ASSASSIN = ['shade_dagger', 'legion_spy', 'shadow_panther', 'ember_bladedancer', 'rift_stalker', 'muhon'];

describe('숲의 맹약 (기원 2/4/6)', () => {
  it.each([
    [2, 1, 0.1],
    [4, 2, 0.2],
    [6, 3, 0.35],
  ])('%i종: %i단계, 전투 시작 시 아군 전체 최대 HP의 %f 보호막(전투 끝까지)', (count, tier, pct) => {
    const sim = makeSim(lineup(FOREST.slice(0, count)), DUMMY);
    expect(sim.activeTraits[0].find((t) => t.traitId === 'forest_pact')?.tier).toBe(tier);
    const shields = eventsOf(sim, 'shield');
    expect(shields).toHaveLength(count);
    for (const e of shields) expect(e).toMatchObject({ t: 0, duration: 'combat', amount: Math.round(unitOf(sim, e.unit).maxHp * pct) });
  });

  it('2종 미만이면 효과가 없다', () => {
    const sim = makeSim(lineup(FOREST.slice(0, 1)), DUMMY);
    expect(eventsOf(sim, 'shield')).toHaveLength(0);
    stepTicks(sim, 40);
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:as')).toHaveLength(0);
  });

  it('3초마다 아군 전체 AS +5%가 쌓이고 10중첩에서 멈춘다 (1단계)', () => {
    const sim = makeSim(lineup(FOREST.slice(0, 2)), DUMMY);
    freezeEnemies(sim);
    const base = unitOf(sim, 0).def.stats.as;
    stepTicks(sim, 29);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base);
    stepTicks(sim, 2); // 3.0초
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base * 1.05);
    expect(unitOf(sim, 1).stat('as')).toBeCloseTo(unitOf(sim, 1).def.stats.as * 1.05);
    stepTicks(sim, 30);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base * 1.1);
    stepTicks(sim, 300); // 33초: 10번째 중첩(30초) 이후
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base * 1.5);
    stepTicks(sim, 200);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base * 1.5); // 더 쌓이지 않는다
    expect(unitOf(sim, 0).statuses.stackCount('trait:as')).toBe(10);
    // 적에게는 숲의 맹약이 없다
    expect(unitOf(sim, 2).stat('as')).toBeCloseTo(unitOf(sim, 2).def.stats.as);
  });

  it('3단계는 +12%씩', () => {
    const sim = makeSim(lineup(FOREST.slice(0, 6)), DUMMY);
    freezeEnemies(sim);
    const base = unitOf(sim, 0).def.stats.as;
    stepTicks(sim, 61);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(base * 1.24);
    const applied = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:as' && e.unit === 0);
    expect(applied.map((e) => e.value)).toEqual([12, 12]);
  });

  it('죽은 유닛에는 쌓지 않는다', () => {
    const sim = makeSim(lineup(FOREST.slice(0, 2)), DUMMY);
    freezeEnemies(sim);
    sim.world.dealDamage({ source: null, target: unitOf(sim, 1), raw: 99999, type: 'magic' });
    stepTicks(sim, 31);
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:as').map((e) => e.unit)).toEqual([0]);
  });

  it('적 진영도 같은 규칙으로 켜진다', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], lineup(FOREST.slice(0, 2)).map(([id, star, col, row]) => [id, star, col + 4, row] as Placement));
    const shields = eventsOf(sim, 'shield');
    expect(shields.map((e) => unitOf(sim, e.unit).side)).toEqual([1, 1]);
  });
});

describe('주술사 (직업 2/4/6)', () => {
  const hand = (n: number, cardId = 'mana_infusion') => Array.from({ length: n }, () => cardId);
  const mystics = (count: number) => lineup(MYSTIC.slice(0, count));
  const costEvents = (sim: CombatSimulator) => eventsOf(sim, 'cardCost');
  const castKindler = (sim: CombatSimulator) => {
    const before = eventsOf(sim, 'skillCast').filter((e) => e.unit === 0).length;
    fillMana(sim, 0);
    for (let i = 0; i < 30 && eventsOf(sim, 'skillCast').filter((e) => e.unit === 0).length === before; i++) sim.step();
  };
  const make = (count: number, cards: readonly string[], b: Placement[] = [['iron_shieldbearer', 1, 4, 2]]) => {
    const sim = makeCardSim({ a: mystics(count), b, hand: cards });
    freezeEnemies(sim);
    return sim;
  };

  it('1단계: 스킬을 쓸 때마다 손패 무작위 1장의 비용 -1, 전투당 2회까지', () => {
    const sim = make(2, hand(3));
    for (let i = 0; i < 4; i++) castKindler(sim);
    const events = costEvents(sim);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.delta === -1 && e.source !== undefined && (e.surcharge === -1 || e.surcharge === -2))).toBe(true);
    const total = [1, 2, 3].reduce((sum, id) => sum + sim.cardSurcharge(id), 0);
    expect(total).toBe(-2);
  });

  it('비용은 0 밑으로 내려가지 않고, 이미 0인 카드만 남으면 횟수를 쓰지 않는다', () => {
    const sim = make(2, hand(1, 'focus_fire')); // 비용 1
    castKindler(sim);
    expect(costEvents(sim)).toHaveLength(1);
    expect(sim.cardSurcharge(1)).toBe(-1);
    castKindler(sim);
    castKindler(sim);
    expect(costEvents(sim)).toHaveLength(1); // 후보 없음
    // 비용 0이 된 카드는 CP 없이 쓸 수 있다
    sim.startCombat();
    const cpBefore = sim.commandPoints?.combat ?? 0;
    expect(sim.playCard(1, { kind: 'unit', uid: 2 })).toMatchObject({ ok: true });
    expect(sim.commandPoints?.combat).toBe(cpBefore);
  });

  it('2단계: 전투당 5회, 3단계: 무제한', () => {
    const four = make(4, hand(8));
    for (let i = 0; i < 8; i++) castKindler(four);
    expect(costEvents(four)).toHaveLength(5);

    const six = make(6, hand(10));
    for (let i = 0; i < 8; i++) castKindler(six);
    const casts = eventsOf(six, 'skillCast').length;
    expect(costEvents(six)).toHaveLength(casts);
    expect(casts).toBeGreaterThanOrEqual(8);
  });

  it('4종(2단계)부터 주술사 시작 마나 +20, 주술사가 아닌 유닛은 제외', () => {
    const one = makeSim(lineup(MYSTIC.slice(0, 2)), DUMMY);
    expect(unitOf(one, 0).mana).toBe(0);
    const two = makeSim([...lineup(MYSTIC.slice(0, 4)), ['arena_recruit', 1, 1, 0]], DUMMY);
    expect([0, 1, 2, 3].map((uid) => unitOf(two, uid).mana)).toEqual([20, 20, 20, 20]);
    expect(unitOf(two, 4).mana).toBe(0);
    expect(eventsOf(two, 'mana').filter((e) => e.t === 0)).toHaveLength(4);
  });

  it('카드 시스템이 없는 전투에서는 비용 감소를 무시하고 오류 없이 스킬이 나간다', () => {
    const sim = makeSim(mystics(2), [['iron_shieldbearer', 1, 4, 2]]);
    freezeEnemies(sim);
    castKindler(sim);
    expect(eventsOf(sim, 'skillCast')).toHaveLength(1);
    expect(costEvents(sim)).toHaveLength(0);
  });

  it('손패가 비어 있으면 아무 일도 없고 Rng도 쓰지 않는다', () => {
    const empty = make(2, []);
    const withCard = make(2, hand(1));
    castKindler(empty);
    castKindler(withCard);
    expect(costEvents(empty)).toHaveLength(0);
    expect(costEvents(withCard)).toHaveLength(1);
  });

  it('적 진영 주술사는 손패를 건드리지 않는다', () => {
    const sim = makeCardSim({
      a: [['iron_shieldbearer', 1, 3, 2]],
      b: lineup(MYSTIC.slice(0, 2)).map(([id, star, col, row]) => [id, star, col + 4, row] as Placement),
      hand: hand(3),
    });
    for (const u of sim.world.units) if (u.side === 0) u.statuses.addStun(1e9);
    for (let i = 0; i < 6; i++) {
      for (const uid of [1, 2]) fillMana(sim, uid);
      stepTicks(sim, 10);
    }
    expect(eventsOf(sim, 'skillCast').length).toBeGreaterThan(0);
    expect(costEvents(sim)).toHaveLength(0);
  });

  it('같은 입력이면 이벤트 로그가 JSON까지 같다', () => {
    const run = () => {
      const sim = make(4, hand(5));
      for (let i = 0; i < 6; i++) castKindler(sim);
      return JSON.stringify(sim.world.events);
    };
    expect(run()).toBe(run());
  });
});

describe('암살자 (직업 2/4/6)', () => {
  const pair: Placement[] = [['shade_dagger', 1, 3, 1], ['legion_spy', 1, 3, 3]];

  it('전투 시작(startCombat) 때 적 후열로 도약한다: 준비 단계에는 제자리', () => {
    const sim = makeSim(pair, [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 7, 2]]);
    expect(sim.phase).toBe('prep');
    expect(eventsOf(sim, 'teleport')).toHaveLength(0);
    expect(unitOf(sim, 0).cell).toEqual({ col: 3, row: 1 });
    sim.step();
    const jumps = eventsOf(sim, 'teleport');
    expect(jumps.map((e) => [e.unit, e.t, e.from, e.to])).toEqual([
      [0, 0, { col: 3, row: 1 }, { col: 7, row: 1 }],
      [1, 0, { col: 3, row: 3 }, { col: 7, row: 3 }],
    ]);
    expect(sim.world.board.occupantAt({ col: 7, row: 1 })).toBe(0);
    expect(sim.world.board.occupantAt({ col: 3, row: 1 })).toBeUndefined();
  });

  it('후열에서 자기 행과 가장 가까운 빈 칸 (같으면 위쪽 행)', () => {
    // 후열 (7,2)가 차 있다: 행 2에서 출발하면 1과 3이 같은 거리 → 위쪽(행 1)
    const sim = makeSim([['shade_dagger', 1, 3, 2], ['legion_spy', 1, 2, 4]], [['iron_shieldbearer', 1, 7, 2], ['iron_shieldbearer', 1, 4, 0]]);
    sim.step();
    expect(eventsOf(sim, 'teleport').map((e) => e.to)).toEqual([{ col: 7, row: 1 }, { col: 7, row: 4 }]);
  });

  it('후열이 가득 차면 한 열씩 앞으로, 전체가 가득 차면 제자리', () => {
    const column = (col: number): Placement[] => [0, 1, 2, 3, 4].map((row) => ['iron_shieldbearer', 1, col, row] as Placement);
    const crowded = makeSim(pair, column(7));
    crowded.step();
    expect(eventsOf(crowded, 'teleport').map((e) => e.to)).toEqual([{ col: 6, row: 1 }, { col: 6, row: 3 }]);

    const full = makeSim(pair, [4, 5, 6, 7].flatMap(column));
    full.step();
    expect(eventsOf(full, 'teleport')).toHaveLength(0);
    expect(unitOf(full, 0).cell).toEqual({ col: 3, row: 1 });
  });

  it('적 진영 암살자는 아군 후열(열 0)로 도약한다', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], [['shade_dagger', 1, 4, 1], ['legion_spy', 1, 4, 3]]);
    sim.step();
    expect(eventsOf(sim, 'teleport').map((e) => e.to)).toEqual([{ col: 0, row: 1 }, { col: 0, row: 3 }]);
  });

  it('1종뿐이면 도약도 치명타도 없다', () => {
    const sim = makeSim([['shade_dagger', 1, 3, 1]], DUMMY);
    sim.step();
    expect(eventsOf(sim, 'teleport')).toHaveLength(0);
    expect(unitOf(sim, 0).critChance).toBe(0);
  });

  it.each([
    [2, 0.15],
    [4, 0.35],
    [6, 0.5],
  ])('%i종: 암살자만 치명타 확률 %f, 치명 피해 150%%', (count, chance) => {
    const sim = makeSim([...lineup(ASSASSIN.slice(0, count)), ['iron_shieldbearer', 1, 0, 4]], DUMMY);
    for (let uid = 0; uid < count; uid++) {
      expect(unitOf(sim, uid).critChance).toBeCloseTo(chance);
      expect(unitOf(sim, uid).critDamagePct).toBe(150);
    }
    expect(unitOf(sim, count).critChance).toBe(0);
  });

  it('치명타는 대상 방어·배율 전에 ATK 비례 피해에 150%를 곱하고 crit 표시를 남긴다', () => {
    const sim = makeSim(lineup(ASSASSIN.slice(0, 2)), DUMMY);
    const shade = unitOf(sim, 0);
    const target = unitOf(sim, 2);
    shade.critChance = 1;
    sim.world.dealDamage({ source: shade, target, raw: 100, type: 'physical', canCrit: true });
    sim.world.dealDamage({ source: shade, target, raw: 100, type: 'physical' }); // canCrit이 아니면 치명 없음
    sim.world.dealDamage({ source: shade, target, raw: 100, type: 'magic', canCrit: true });
    const hits = eventsOf(sim, 'damage');
    expect(hits[0]).toMatchObject({ crit: true, amount: Math.round((150 * 100) / (100 + target.stat('arm'))) });
    expect(hits[1]).not.toHaveProperty('crit');
    expect(hits[1]?.amount).toBe(Math.round((100 * 100) / (100 + target.stat('arm'))));
    expect(hits[2]).toHaveProperty('crit', true);
  });

  it('치명 판정은 sim Rng를 쓰므로 같은 시드는 같은 로그, 확률은 근사적으로 맞다', () => {
    const run = (seed: number) => {
      const sim = makeSim(
        [...lineup(ASSASSIN.slice(0, 2)), ['iron_shieldbearer', 1, 0, 4]],
        [['iron_shieldbearer', 1, 7, 2]],
        seed,
      );
      freezeEnemies(sim);
      for (let i = 0; i < 700; i++) sim.step();
      return sim;
    };
    expect(JSON.stringify(run(5).world.events)).toBe(JSON.stringify(run(5).world.events));
    const sim = run(5);
    const own = eventsOf(sim, 'damage').filter((e) => e.source === 0 || e.source === 1);
    const crits = own.filter((e) => e.crit).length;
    expect(own.length).toBeGreaterThan(80);
    expect(crits / own.length).toBeGreaterThan(0.05);
    expect(crits / own.length).toBeLessThan(0.3); // 기대값 15%
  });

  it('스킬의 ATK 비례 피해(damage)도 치명 판정을 받지만 고정 피해(flatDamage)는 받지 않는다', () => {
    // 암살자 2종 + 대상: 그림자 단검(damage)과 마법 고정 피해
    const sim = makeSim([...lineup(['shade_dagger', 'legion_spy'])], [['legion_crossbow', 1, 7, 2]]);
    unitOf(sim, 0).critChance = 1;
    fillMana(sim, 0);
    sim.step();
    const skillHit = eventsOf(sim, 'damage').find((e) => e.source === 0 && e.dmgType === 'physical' && e.unit === 2);
    expect(skillHit).toHaveProperty('crit', true);
  });
});
