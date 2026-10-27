import { describe, expect, it } from 'vitest';
import { CARDS } from '../cards/constants';
import { UnitCatalog } from '../data';
import {
  cpEvents,
  eventsOf,
  harten,
  makeCardSim,
  units,
  unitOf,
  type Placement,
} from './testSupport';

const NONE = { kind: 'none' } as const;

describe('CP', () => {
  it('생성 직후에는 준비 CP 2만 있고 전투 CP는 0, 전투 시작에 2가 지급된다', () => {
    const sim = makeCardSim();
    expect(sim.commandPoints?.prep).toBe(CARDS.PREP_CP);
    expect(sim.commandPoints?.combat).toBe(0);
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(2);
    expect(cpEvents(sim).map((e) => [e.pool, e.delta, e.cp, e.reason])).toEqual([
      ['prep', 2, 2, 'start'],
      ['combat', 2, 2, 'start'],
    ]);
  });

  it('지휘관 CP 보정이 시작 CP에 더해진다', () => {
    const sim = makeCardSim({ commander: { ...harten, startCpBonus: 1 } });
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(3);
  });

  it('4초(40틱)마다 +1, 상한 6에서 멈춘다', () => {
    const sim = makeCardSim({ a: [['iron_shieldbearer', 1, 0, 0]], b: [['iron_shieldbearer', 1, 7, 4]] });
    sim.runUntil(39);
    expect(sim.commandPoints?.combat).toBe(2);
    sim.runUntil(40);
    expect(sim.commandPoints?.combat).toBe(3);
    const regen = cpEvents(sim).filter((e) => e.reason === 'regen');
    expect(regen).toHaveLength(1);
    expect(regen[0]?.t).toBe(4);
    sim.runUntil(40 * 6);
    expect(sim.commandPoints?.combat).toBe(CARDS.CP_MAX);
    expect(cpEvents(sim).filter((e) => e.reason === 'regen')).toHaveLength(4);
  });

  it('준비 CP는 작전 카드 전용이고 남아도 전투로 이월되지 않는다', () => {
    const sim = makeCardSim({ hand: ['war_drums'] });
    sim.playCard(1, NONE);
    expect(sim.commandPoints?.prep).toBe(1);
    sim.startCombat();
    expect(sim.commandPoints?.prep).toBe(0);
    expect(sim.commandPoints?.combat).toBe(2);
  });

  it('작전 카드는 전투 CP를 쓰지 않고, 명령 카드는 준비 CP를 쓰지 않는다', () => {
    const sim = makeCardSim({ hand: ['war_drums', 'charge_signal'] });
    sim.playCard(1, NONE);
    expect(sim.commandPoints?.combat).toBe(0);
    sim.startCombat();
    sim.playCard(2, NONE);
    expect(sim.commandPoints?.combat).toBe(0);
    expect(eventsOf(sim, 'cardPlayed').map((e) => e.pool)).toEqual(['prep', 'combat']);
  });

  it('강화 카드는 강화 비용을 쓴다 (최후의 저항+ = 1CP)', () => {
    const sim = makeCardSim({ hand: ['last_stand'], upgraded: [1] });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'unit', uid: 0 })).toEqual({ ok: true, cp: 1, pool: 'combat' });
  });
});

describe('심연 특성: 처치 시 CP', () => {
  const ABYSS_A: Placement[] = [['shade_dagger', 1, 3, 1], ['abyss_whisperer', 1, 3, 3]];
  const FIVE_ENEMIES: Placement[] = [
    ['iron_shieldbearer', 1, 4, 0],
    ['iron_shieldbearer', 1, 4, 1],
    ['iron_shieldbearer', 1, 4, 2],
    ['iron_shieldbearer', 1, 4, 3],
    ['iron_shieldbearer', 1, 4, 4],
  ];
  const kill = (sim: ReturnType<typeof makeCardSim>, killerUid: number, victimUid: number) =>
    sim.world.dealDamage({ source: unitOf(sim, killerUid), target: unitOf(sim, victimUid), raw: 99999, type: 'physical' });

  it('1단계(심연 2종): 처치마다 CP +1, 전투당 최대 2', () => {
    const sim = makeCardSim({ a: ABYSS_A, b: FIVE_ENEMIES });
    expect(sim.activeTraits[0].find((t) => t.traitId === 'abyss')?.tier).toBe(1);
    sim.startCombat();
    kill(sim, 0, 2);
    kill(sim, 0, 3);
    kill(sim, 0, 4);
    expect(sim.commandPoints?.combat).toBe(2 + 2);
    const abyss = cpEvents(sim).filter((e) => e.reason === 'abyss');
    expect(abyss.map((e) => [e.delta, e.cp])).toEqual([[1, 3], [1, 4]]);
  });

  it('CP 상한 6을 넘지 못하고, 상한 때문에 못 얻은 양은 한도를 소모하지 않는다', () => {
    const sim = makeCardSim({ a: ABYSS_A, b: FIVE_ENEMIES, commander: { ...harten, startCpBonus: 3 } });
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(5);
    kill(sim, 0, 2); // 5 -> 6
    kill(sim, 0, 3); // 이미 상한: 얻은 것 없음, 한도(2) 중 1만 사용
    expect(sim.commandPoints?.combat).toBe(6);
    expect(cpEvents(sim).filter((e) => e.reason === 'abyss')).toHaveLength(1);
  });

  it('상한에 막혔던 분은 CP를 쓴 뒤 다음 처치에서 얻을 수 있다 (한도 2 중 남은 1)', () => {
    const sim = makeCardSim({
      a: ABYSS_A,
      b: FIVE_ENEMIES,
      commander: { ...harten, startCpBonus: 3 },
      hand: ['hold_the_line'],
    });
    sim.startCombat();
    kill(sim, 0, 2); // 6, 한도 1/2
    kill(sim, 0, 3); // 얻은 것 없음
    sim.playCard(1, { kind: 'unit', uid: 0 }); // CP 5
    kill(sim, 0, 4); // +1 -> 6, 한도 2/2
    expect(sim.commandPoints?.combat).toBe(6);
    expect(cpEvents(sim).filter((e) => e.reason === 'abyss')).toHaveLength(2);
  });

  it('2단계(심연 4종): 최대 4, 한도를 다 쓰면 더 얻지 못한다', () => {
    const fakes = ['f1', 'f2', 'f3', 'f4'].map((id) => ({ ...(units.get('shade_dagger') as object), id }));
    const catalog = new UnitCatalog([...units.units, ...(fakes as never[])]);
    const sim = makeCardSim({
      unitCatalog: catalog,
      a: [['f1', 1, 3, 0], ['f2', 1, 3, 1], ['f3', 1, 3, 2], ['f4', 1, 3, 3]],
      b: FIVE_ENEMIES,
      hand: ['charge_signal'],
    });
    expect(sim.activeTraits[0].find((t) => t.traitId === 'abyss')?.tier).toBe(2);
    sim.startCombat();
    sim.playCard(1, NONE); // CP 2 -> 0
    for (const victim of [4, 5, 6, 7]) kill(sim, 0, victim);
    expect(sim.commandPoints?.combat).toBe(4);
    expect(cpEvents(sim).filter((e) => e.reason === 'abyss')).toHaveLength(4);
    // 한도 4를 다 썼으므로 더는 얻지 못한다
    kill(sim, 0, 8);
    expect(sim.commandPoints?.combat).toBe(4);
  });

  it('특성이 비활성(심연 1종)이면 CP를 얻지 못한다', () => {
    const sim = makeCardSim({ a: [['shade_dagger', 1, 3, 1]], b: FIVE_ENEMIES });
    sim.startCombat();
    kill(sim, 0, 1);
    expect(sim.commandPoints?.combat).toBe(2);
  });

  it('적 진영의 처치로는 CP가 늘지 않는다', () => {
    const sim = makeCardSim({
      a: [['iron_shieldbearer', 1, 3, 1]],
      b: [['shade_dagger', 1, 4, 1], ['abyss_whisperer', 1, 4, 3]],
    });
    sim.startCombat();
    kill(sim, 1, 0);
    expect(sim.commandPoints?.combat).toBe(2);
  });

  it('카드 시스템이 없는 전투에서는 효과가 아무 일도 하지 않는다', async () => {
    const { makeSim } = await import('./testSupport');
    const sim = makeSim(ABYSS_A, FIVE_ENEMIES);
    expect(sim.commandPoints).toBeNull();
    kill(sim, 0, 2);
    expect(eventsOf(sim, 'cp')).toHaveLength(0);
  });
});

describe('하르텐 패시브: 철의 서약', () => {
  it('전투 시작 시 전열 아군에게 최대 HP 10% 보호막(전투 끝까지), 후열은 제외', () => {
    const sim = makeCardSim({ commander: harten });
    expect(unitOf(sim, 0).statuses.shieldTotal()).toBe(65);
    expect(unitOf(sim, 1).statuses.shieldTotal()).toBe(65);
    expect(unitOf(sim, 2).statuses.shieldTotal()).toBe(0);
    expect(unitOf(sim, 3).statuses.shieldTotal()).toBe(0);
    const shields = eventsOf(sim, 'shield');
    expect(shields).toHaveLength(2);
    expect(shields[0]).toMatchObject({ amount: 65, duration: 'combat' });
  });

  it('특성 효과 다음에 적용된다 (이벤트 순서)', () => {
    const sim = makeCardSim({ commander: harten });
    const types = sim.events.map((e) => e.type);
    const lastTrait = types.lastIndexOf('statusApplied');
    const firstShield = types.indexOf('shield');
    expect(lastTrait).toBeGreaterThan(-1);
    expect(firstShield).toBeGreaterThan(lastTrait);
    expect(types.indexOf('spawn')).toBe(0);
  });

  it('지휘관이 없으면 보호막이 없다', () => {
    const sim = makeCardSim({ commander: null });
    expect(eventsOf(sim, 'shield')).toHaveLength(0);
  });

  it('CP 보정은 0이라 시작 CP 2', () => {
    expect(harten.startCpBonus).toBe(0);
    const sim = makeCardSim({ commander: harten });
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(2);
  });
});
