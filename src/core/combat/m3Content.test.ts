import { describe, expect, it } from 'vitest';
import { CombatSimulator } from './sim';
import { cardCatalog, eventsOf, fillMana, formation, handSnapshot, makeCardSim, makeSim, stepUntil, traits, unitOf, units } from './testSupport';

describe('M3 유닛·특성', () => {
  it('상점 유닛 30종(등급별 8/8/6/5/3)이며 제공 카드 참조가 유효하고 특성 9개 모두 효과가 있다 (M5-4)', () => {
    const shopUnits = units.units.filter((u) => !u.boss);
    expect([1, 2, 3, 4, 5].map((tier) => shopUnits.filter((u) => u.tier === tier).length)).toEqual([8, 8, 6, 5, 3]);
    for (const unit of units.units) if (unit.grantedCard) expect(cardCatalog.get(unit.grantedCard)).toBeDefined();
    expect(traits.traits.filter((t) => t.effects?.length)).toHaveLength(9);
  });

  it('잿불 시너지는 잿불 유닛의 기본 공격에만 화상을 부여한다', () => {
    const sim = makeSim([['ember_kindler', 1, 3, 1], ['ember_slinger', 1, 3, 3]], [['iron_shieldbearer', 3, 4, 2]]);
    sim.step();
    const burns = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'burn');
    expect(burns).toHaveLength(2);
    expect(burns.map((e) => e.value).sort()).toEqual([3.5, 4.8]);
  });

  it('검투사의 처치 시 회복·ATK가 누적되고 다른 직업은 받지 않는다', () => {
    const sim = makeSim([['arena_recruit', 1, 3, 1], ['abyss_devourer', 1, 3, 3]], [['iron_shieldbearer', 1, 4, 1], ['iron_shieldbearer', 1, 4, 3]]);
    const attacker = unitOf(sim, 0);
    attacker.hp = 100;
    const before = attacker.stat('atk');
    sim.world.dealDamage({ source: attacker, target: unitOf(sim, 2), raw: 9999, type: 'magic' });
    expect(attacker.hp).toBe(187);
    expect(attacker.stat('atk')).toBeCloseTo(before * 1.08);
    sim.world.dealDamage({ source: attacker, target: unitOf(sim, 3), raw: 9999, type: 'magic' });
    expect(attacker.stat('atk')).toBeCloseTo(before * 1.16);
  });

  it('사수 시너지로 사거리 +1과 결정론적인 확률 연사가 적용된다', () => {
    const make = () => makeSim([['legion_crossbow', 1, 0, 0], ['grove_archer', 1, 0, 4]], [['iron_shieldbearer', 3, 7, 2]], 71);
    const a = make();
    expect(unitOf(a, 0).range).toBe(5);
    expect(unitOf(a, 0).volleyChance).toBe(.2);
    const first = a.run(); const second = make().run();
    expect(first.events).toEqual(second.events);
    expect(eventsOf(a, 'attack').some((e) => e.unit < 2 && e.shots === 2)).toBe(true);
  });

  it('군악대는 자신과 인접 아군에만 두 가지 버프를 준다', () => {
    const sim = makeSim([['war_drummer', 1, 3, 2], ['iron_shieldbearer', 1, 2, 2], ['legion_crossbow', 1, 0, 0]], [['iron_shieldbearer', 3, 4, 2]]);
    fillMana(sim, 0);
    sim.step();
    const own = eventsOf(sim, 'statusApplied').filter((e) => e.source === 0);
    expect(own.filter((e) => e.status === 'statMod:arm').map((e) => e.unit).sort()).toEqual([0, 1]);
    expect(own.filter((e) => e.status === 'statMod:as')).toHaveLength(2);
  });

  it('투석수의 2×2 범위는 대상 칸을 좌상단으로 잡고 범위 밖을 제외한다', () => {
    const sim = makeSim([['ember_slinger', 1, 3, 2]], [
      ['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 3],
      ['iron_shieldbearer', 1, 4, 1], ['iron_shieldbearer', 1, 6, 2],
    ]);
    fillMana(sim, 0); sim.step();
    expect(eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic').map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.source === 0 && e.status === 'burn').map((e) => e.unit).sort()).toEqual([1, 2]);
  });

  it('첩보원의 급소 공격은 ARM 50% 무시 후 받는 피해 증가를 적용한다', () => {
    const sim = makeSim([['legion_spy', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    fillMana(sim, 0); sim.step();
    expect(eventsOf(sim, 'damage').find((e) => e.source === 0)?.amount).toBe(103);
    expect(eventsOf(sim, 'statusApplied').find((e) => e.source === 0 && e.status === 'damageTakenMult')).toMatchObject({ unit: 1, value: 1.15, duration: 3 });
  });

  it('광전사는 HP를 지불하고 생명력 흡수로 실제 HP 피해만 회복한다', () => {
    const sim = makeSim([['ember_berserker', 1, 3, 2]], [['iron_shieldbearer', 3, 4, 2]]);
    fillMana(sim, 0); sim.step();
    const caster = unitOf(sim, 0);
    expect(eventsOf(sim, 'damage').some((e) => e.source === 0 && e.unit === 0 && e.amount === 108)).toBe(true);
    const before = caster.hp;
    sim.world.dealDamage({ source: caster, target: unitOf(sim, 1), raw: 120, type: 'magic' });
    expect(caster.hp).toBe(before + 20); // RES 20 → 100 실피해 ×20%
  });

  it('포식으로 처치할 때만 최대 HP가 증가하며 다음 전투에는 초기화된다', () => {
    const sim = makeSim([['abyss_devourer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 3, 7, 0]]);
    unitOf(sim, 1).hp = 1;
    fillMana(sim, 0); sim.step();
    expect(unitOf(sim, 0).maxHp).toBe(810);
    expect(eventsOf(sim, 'maxHp')).toContainEqual(expect.objectContaining({ unit: 0, maxHp: 810 }));
    expect(makeSim([['abyss_devourer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]).world.units[0]?.maxHp).toBe(750);
  });

  it('드루이드는 성급별 수의 무작위 적을 속박하며 속박 중에도 공격은 가능하다', () => {
    const sim = makeSim([['grove_druid', 1, 3, 2]], [['iron_shieldbearer', 3, 4, 0], ['iron_shieldbearer', 3, 4, 2], ['iron_shieldbearer', 3, 4, 4]]);
    fillMana(sim, 0); sim.step();
    expect(eventsOf(sim, 'statusApplied').filter((e) => e.status === 'root')).toHaveLength(2);
    const rooted = sim.world.units.find((u) => u.side === 1 && u.statuses.isRooted());
    expect(rooted).toBeDefined();
    expect(eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic')).toHaveLength(2);
  });
});

describe('징집·장비 카드', () => {
  it('속박은 이동을 멈추지만 사거리 내 기본 공격은 막지 않는다', () => {
    const distant = makeCardSim({ a: [['legion_crossbow', 1, 0, 0]], b: [['iron_shieldbearer', 3, 7, 0]], hand: ['vine_snare'] });
    distant.startCombat();
    distant.playCard(1, { kind: 'cell', cell: { col: 7, row: 0 } });
    distant.runUntil(10);
    expect(unitOf(distant, 1).cell).toEqual({ col: 7, row: 0 });
    expect(unitOf(distant, 1).moving).toBeNull();
    const adjacent = makeCardSim({ a: [['iron_shieldbearer', 1, 3, 2]], b: [['iron_shieldbearer', 3, 4, 2]], hand: ['vine_snare'] });
    adjacent.startCombat(); adjacent.playCard(1, { kind: 'cell', cell: { col: 4, row: 2 } }); adjacent.step();
    expect(eventsOf(adjacent, 'attack').some((e) => e.unit === 1)).toBe(true);
    expect(unitOf(adjacent, 1).statuses.isRooted()).toBe(true);
  });

  it('장비 카드는 전투 중 사용할 수 없고 실패 시 상태가 보존된다', () => {
    const sim = makeCardSim({ hand: ['forged_blade'] }); sim.startCombat();
    const before = JSON.stringify({ events: sim.events, deck: sim.deck?.serialize(), equipment: [...sim.equippedItems] });
    expect(sim.playCard(1, { kind: 'unit', uid: 0 })).toEqual({ ok: false, reason: '장비 카드는 준비 단계에서만 사용할 수 있습니다' });
    expect(JSON.stringify({ events: sim.events, deck: sim.deck?.serialize(), equipment: [...sim.equippedItems] })).toBe(before);
  });

  it('징집은 후열에 임시 1등급 2기를 만들고 같은 시드면 같은 로그다', () => {
    const make = () => {
      const sim = makeCardSim({ hand: ['call_reserves'] });
      sim.startCombat(); sim.commandPoints?.gainCp(1, 'abyss');
      expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
      return sim;
    };
    const a = make(); const b = make();
    expect(a.events).toEqual(b.events);
    const summoned = a.world.units.filter((u) => u.temporary);
    expect(summoned).toHaveLength(2);
    expect(summoned.every((u) => u.def.tier === 1 && u.cell.col === 0)).toBe(true);
    expect(a.equippedItems.size).toBe(5); // 원본 아군3 + 적2만
    expect(a.deck?.exhaustPile[0]?.cardId).toBe('call_reserves');
    expect(makeCardSim({ hand: ['call_reserves'] }).world.units).toHaveLength(5);
  });

  it('후열 자리가 부족하면 징집은 RNG·CP·손패·이벤트를 전혀 바꾸지 않는다', () => {
    const sim = makeCardSim({
      a: [0, 1, 2, 3].map((row) => ['iron_shieldbearer', 1, 0, row] as const), hand: ['call_reserves'],
    });
    sim.startCombat(); sim.commandPoints?.gainCp(1, 'abyss');
    const before = JSON.stringify({ events: sim.events, deck: sim.deck?.serialize(), rng: sim.world.rng.getState(), cp: sim.commandPoints?.combat });
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(false);
    expect(JSON.stringify({ events: sim.events, deck: sim.deck?.serialize(), rng: sim.world.rng.getState(), cp: sim.commandPoints?.combat })).toBe(before);
  });

  it.each([false, true])('장비 강화=%s는 준비 CP로 장착하고 다음 전투에도 스탯·마나 효과를 유지한다', (upgraded) => {
    const sim = makeCardSim({ hand: ['forged_blade'], upgraded: upgraded ? [1] : [] });
    const atk = unitOf(sim, 0).stat('atk');
    expect(sim.playCard(1, { kind: 'unit', uid: 0 }).ok).toBe(true);
    expect(sim.commandPoints?.prep).toBe(1);
    expect(unitOf(sim, 0).stat('atk')).toBe(atk + (upgraded ? 25 : 15));
    expect(sim.deck?.exhaustPile.map((c) => c.cardId)).toEqual(['forged_blade']);
    const setup = {
      seed: 5, formations: [formation([['iron_shieldbearer', 1, 3, 2]]), formation([['iron_shieldbearer', 3, 4, 2]])] as const,
      cards: { commander: null, deck: handSnapshot([]) },
    };
    setup.formations[0][0]!.equipment = [...(sim.equippedItems.get(0) ?? [])];
    const next = new CombatSimulator(setup, units, traits, cardCatalog);
    expect(unitOf(next, 0).stat('atk')).toBe(atk + (upgraded ? 25 : 15));
    next.step();
    expect(eventsOf(next, 'mana').some((e) => e.unit === 0 && e.mana === 15)).toBe(true);
    next.startCombat();
    expect(next.equippedItems.get(0)).toEqual([`forged_blade${upgraded ? '+' : ''}`]);
  });

  it('장비 사용 명령을 예약 재생하면 동일한 장비와 이벤트가 나온다', () => {
    const sim = makeCardSim({ hand: ['forged_blade'] });
    sim.playCard(1, { kind: 'unit', uid: 0 }); sim.run();
    const replay = makeCardSim({ hand: ['forged_blade'], commands: sim.commandLog }); replay.run();
    expect(replay.events).toEqual(sim.events);
    expect(replay.equippedItems).toEqual(sim.equippedItems);
  });
});
