import { describe, expect, it } from 'vitest';
import { eventsOf, fillMana, makeSim, stepTicks, stepUntil, unitOf } from './testSupport';

describe('잿불 점화사 (U06): 점화', () => {
  // 아군 uid 0 점화사(3,2). 적 uid 1(4,2) 대상, uid 2(4,3) 인접, uid 3(5,2) 대상과 인접, uid 4(7,0) 멀리
  const make = () =>
    makeSim(
      [['ember_kindler', 1, 3, 2]],
      [
        ['iron_shieldbearer', 1, 4, 2],
        ['iron_shieldbearer', 1, 4, 3],
        ['iron_shieldbearer', 1, 5, 2],
        ['iron_shieldbearer', 1, 7, 0],
      ],
    );

  it('대상과 인접한 적(같은 진영)에게 마법 피해 + 화상, 멀리 있는 적은 제외', () => {
    const sim = make();
    fillMana(sim, 0);
    expect(stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 20)).toBe(true);

    const hit = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic');
    expect(hit.map((e) => e.unit).sort()).toEqual([1, 2, 3]);
    // 마법 피해 120, RES 20 -> 120 x 100/120 = 100
    for (const e of hit) expect(e.amount).toBe(100);
    expect(unitOf(sim, 4).hp).toBe(650);

    const burns = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'burn');
    expect(burns.map((e) => e.unit).sort()).toEqual([1, 2, 3]);
    expect(burns[0]).toMatchObject({ duration: 3, source: 0, value: 35 });
  });

  it('2성은 피해 180', () => {
    const sim = makeSim([['ember_kindler', 2, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    fillMana(sim, 0);
    stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 20);
    const first = eventsOf(sim, 'damage').find((e) => e.dmgType === 'magic');
    expect(first?.amount).toBe(150); // 180 x 100/120
  });

  it('화상은 1초마다 피해를 준다', () => {
    const sim = make();
    fillMana(sim, 0);
    stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 20);
    const castTick = sim.world.tick;
    stepTicks(sim, 31);
    void castTick;
    const burnTicks = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic' && e.unit === 1);
    expect(burnTicks.length).toBeGreaterThanOrEqual(3); // 스킬 1회 + 화상 최소 2회
  });
});

describe('심연 속삭임꾼 (U13): 속삭임', () => {
  it('마법 피해 80 + 침묵 2초 + 마나 -30', () => {
    const sim = makeSim([['abyss_whisperer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    fillMana(sim, 0);
    sim.world.setMana(unitOf(sim, 1), 60);
    expect(stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 20)).toBe(true);

    const dmg = eventsOf(sim, 'damage').find((e) => e.source === 0 && e.dmgType === 'magic');
    expect(dmg?.amount).toBe(Math.round((80 * 100) / 120)); // 방패병 RES 20 -> 67
    const silence = eventsOf(sim, 'statusApplied').find((e) => e.status === 'silence');
    expect(silence).toMatchObject({ unit: 1, duration: 2, source: 0 });
    expect(unitOf(sim, 1).statuses.isSilenced()).toBe(true);
    // 마나 60 - 30 (+ 피격 마나 소량)
    expect(unitOf(sim, 1).mana).toBeLessThan(45); // 60 + 공격·피격 소량 - 30
  });

  it('3성은 침묵 3초', () => {
    const sim = makeSim([['abyss_whisperer', 3, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    fillMana(sim, 0);
    stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 20);
    expect(eventsOf(sim, 'statusApplied').find((e) => e.status === 'silence')?.duration).toBe(3);
  });

  it('침묵 중에는 마나가 가득이어도 스킬을 쓰지 못하고, 끝나면 쓴다 (기본 공격은 계속)', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    const enemy = unitOf(sim, 1);
    enemy.statuses.addSilence(sim.world.now + 3);
    fillMana(sim, 1);
    stepTicks(sim, 25);
    expect(eventsOf(sim, 'skillCast').filter((e) => e.unit === 1)).toHaveLength(0);
    expect(eventsOf(sim, 'attack').some((e) => e.unit === 1)).toBe(true);
    stepUntil(sim, () => eventsOf(sim, 'skillCast').some((e) => e.unit === 1), 40);
    expect(eventsOf(sim, 'skillCast').some((e) => e.unit === 1)).toBe(true);
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.unit === 1 && e.status === 'silence')).toBe(true);
  });
});
