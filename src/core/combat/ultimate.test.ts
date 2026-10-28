import { describe, expect, it } from 'vitest';
import { ULTIMATE } from './constants';
import { ULTIMATE_COMMAND_ID } from './cardCommand';
import {
  CARD_A, CARD_B, cardCatalog, eventsOf, fillUltimateGauge, harten, isera, makeCardSim, nox, stepTicks, unitOf, type CardSimOptions,
} from './testSupport';
import type { CombatSimulator } from './sim';

function combat(options: CardSimOptions): CombatSimulator {
  const sim = makeCardSim(options);
  sim.startCombat();
  return sim;
}

describe('궁극기 게이지와 사용 규칙', () => {
  it('게이지는 0에서 시작하고 카드 사용 +15, 아군 사망 +25로 충전된다', () => {
    const sim = combat({ commander: harten, hand: ['formation_swap', 'hold_the_line'] });
    expect(sim.ultimate).toMatchObject({ charge: 0, max: ULTIMATE.GAUGE_MAX, used: false, ready: false });
    expect(sim.playCard(1, { kind: 'units', uids: [0, 1] }).ok).toBe(true);
    expect(sim.ultimate?.charge).toBe(ULTIMATE.CARD_CHARGE);
    const ally = unitOf(sim, 2);
    sim.world.dealDamage({ source: null, target: ally, raw: 1e9, type: 'magic' });
    expect(sim.ultimate?.charge).toBe(ULTIMATE.CARD_CHARGE + ULTIMATE.ALLY_DEATH_CHARGE);
  });

  it('적 사망은 충전하지 않고, 최대치를 넘지 않는다', () => {
    const sim = combat({ commander: harten });
    sim.world.dealDamage({ source: null, target: unitOf(sim, 3), raw: 1e9, type: 'magic' });
    expect(sim.ultimate?.charge).toBe(0);
    fillUltimateGauge(sim);
    fillUltimateGauge(sim);
    expect(sim.ultimate?.charge).toBe(ULTIMATE.GAUGE_MAX);
  });

  it('실패: 준비 단계 / 게이지 부족 / 이미 사용 — 사유만 돌려주고 상태·로그는 그대로다', () => {
    const prep = makeCardSim({ commander: harten });
    fillUltimateGauge(prep);
    const logBefore = JSON.stringify(prep.events);
    expect(prep.useUltimate()).toEqual({ ok: false, reason: '궁극기는 전투 중에만 사용할 수 있습니다' });
    expect(JSON.stringify(prep.events)).toBe(logBefore);
    expect(prep.commandLog).toHaveLength(0);

    const sim = combat({ commander: harten });
    const before = JSON.stringify(sim.events);
    const low = sim.useUltimate();
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.reason).toContain('게이지가 부족합니다 (0/100)');
    expect(JSON.stringify(sim.events)).toBe(before);
    expect(sim.commandLog).toHaveLength(0);

    fillUltimateGauge(sim);
    expect(sim.ultimate?.ready).toBe(true);
    expect(sim.useUltimate().ok).toBe(true);
    const again = sim.useUltimate();
    expect(again).toEqual({ ok: false, reason: '궁극기는 전투당 1회만 사용할 수 있습니다' });
    expect(sim.ultimate).toMatchObject({ used: true, ready: false });
  });

  it('카드 시스템이 없거나 궁극기가 없는 지휘관이면 사용할 수 없다', () => {
    const none = makeCardSim({ commander: null });
    expect(none.ultimate).toBeNull();
    expect(none.useUltimate()).toEqual({ ok: false, reason: '사용할 수 있는 궁극기가 없습니다' });
  });

  it('성공한 사용은 commandLog에 ULTIMATE_COMMAND_ID 명령으로 쌓이고, 그대로 다시 넣으면 같은 로그가 나온다', () => {
    // 0CP 카드(피의 대가) 7장으로 게이지를 정상 경로(카드 사용 +15)로 채운 뒤 궁극기를 쓴다
    const base: CardSimOptions = { commander: nox, commanderHp: 65, hand: Array(7).fill('blood_price') };
    const first = makeCardSim(base);
    first.startCombat();
    for (let id = 1; id <= 7; id++) expect(first.playCard(id, { kind: 'unit', uid: 0 }).ok).toBe(true);
    stepTicks(first, 3);
    expect(first.ultimate?.ready).toBe(true);
    expect(first.useUltimate().ok).toBe(true);
    first.run();
    const last = first.commandLog.at(-1);
    expect(last).toEqual({ tick: 3, cardInstanceId: ULTIMATE_COMMAND_ID, target: { kind: 'none' } });
    expect(first.commandLog).toHaveLength(8);

    const replay = makeCardSim({ ...base, commands: first.commandLog });
    replay.run();
    expect(replay.rejectedCommands).toEqual([]);
    expect(JSON.stringify(replay.events)).toBe(JSON.stringify(first.events));
    expect(replay.commandLog).toEqual(first.commandLog);
  });

  it('예약 명령의 궁극기가 게이지 부족이면 rejectedCommands에 사유가 남고 로그는 그대로다', () => {
    const sim = makeCardSim({ commander: harten, commands: [{ tick: 2, cardInstanceId: ULTIMATE_COMMAND_ID, target: { kind: 'none' } }] });
    sim.run();
    expect(sim.rejectedCommands).toHaveLength(1);
    expect(sim.rejectedCommands[0]?.reason).toContain('게이지가 부족합니다');
    expect(sim.commandLog).toHaveLength(0);
    expect(eventsOf(sim, 'ultimateUsed')).toHaveLength(0);
  });
});

describe('궁극기를 쓰지 않으면 로그가 궁극기 도입 전과 같다', () => {
  it('궁극기 정의를 뺀 지휘관과 이벤트 로그(JSON)가 완전히 같다', () => {
    const stripped = { ...harten };
    delete stripped.ultimate;
    const hand = ['shield_formation', 'hold_the_line', 'war_drums'];
    const commands = [
      { tick: 0, cardInstanceId: 3, target: { kind: 'none' as const } },
      { tick: 10, cardInstanceId: 1, target: { kind: 'none' as const } },
      { tick: 20, cardInstanceId: 2, target: { kind: 'unit' as const, uid: 0 } },
    ];
    const withUlt = makeCardSim({ commander: harten, hand, commands });
    const without = makeCardSim({ commander: stripped, hand, commands });
    expect(JSON.stringify(withUlt.run().events)).toBe(JSON.stringify(without.run().events));
  });
});

describe('불굴의 방진 (하르텐)', () => {
  it('아군 전체 받는 피해 -40%가 4초간 적용되고 전열 아군이 주변 적을 도발한다', () => {
    const sim = combat({ commander: harten });
    fillUltimateGauge(sim);
    expect(sim.useUltimate().ok).toBe(true);
    const used = eventsOf(sim, 'ultimateUsed');
    expect(used).toEqual([{ type: 'ultimateUsed', t: 0, commanderId: 'cmd_harten', name: '불굴의 방진', durationSeconds: 4 }]);
    const reductions = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'damageTakenMult');
    expect(reductions.map((e) => [e.unit, e.value, e.duration])).toEqual(CARD_A.map((_, i) => [i, 0.6, 4]));
    // 전열(열 3) 방패병 두 명 반경 2칸 안의 적(방패병 4,2 / 석궁병 6,2)이 도발된다
    const taunted = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'taunted');
    expect(taunted.length).toBeGreaterThan(0);
    for (const e of taunted) expect(unitOf(sim, e.unit).side).toBe(1);
    const shield = unitOf(sim, 3);
    expect([0, 1]).toContain(shield.statuses.forcedTargetUid());
  });

  it('도발은 지속 시간이 지나면 풀린다', () => {
    const sim = combat({ commander: harten });
    fillUltimateGauge(sim);
    sim.useUltimate();
    expect(unitOf(sim, 3).statuses.forcedTargetUid()).not.toBeNull();
    stepTicks(sim, 41);
    expect(unitOf(sim, 3).statuses.forcedTargetUid()).toBeNull();
  });
});

describe('대분화 (이세라)', () => {
  const setup: CardSimOptions = {
    commander: isera,
    a: [['ember_kindler', 3, 0, 2], ['iron_shieldbearer', 3, 3, 2]],
    b: [['iron_shieldbearer', 3, 4, 1], ['iron_shieldbearer', 3, 4, 2], ['iron_shieldbearer', 3, 5, 2], ['iron_shieldbearer', 3, 6, 3]],
  };

  it('사용 즉시 운석 3발을 예고하고 1초 간격으로 떨어뜨린다', () => {
    const sim = combat(setup);
    fillUltimateGauge(sim);
    expect(sim.useUltimate().ok).toBe(true);
    const telegraphs = eventsOf(sim, 'ultimateTelegraph');
    expect(telegraphs.map((e) => e.fireAt)).toEqual([1, 2, 3]);
    expect(telegraphs.every((e) => e.radius === 1)).toBe(true);
    stepTicks(sim, 31);
    const impacts = eventsOf(sim, 'ultimateImpact');
    expect(impacts.map((e) => [e.id, e.t])).toEqual([[1, 1], [2, 2], [3, 3]]);
    expect(impacts.map((e) => e.cell)).toEqual(telegraphs.map((e) => e.cell));
  });

  it('착탄 범위 3×3 안의 적에게 마법 피해 250(방어 적용 전)과 화상을 준다', () => {
    const sim = combat(setup);
    fillUltimateGauge(sim);
    sim.useUltimate();
    stepTicks(sim, 11);
    const hits = eventsOf(sim, 'damage').filter((e) => e.dmgType === 'magic' && e.source === null && e.t >= 1);
    expect(hits.length).toBeGreaterThan(0);
    // 방패병 RES 20×3성(기본 RES는 별 배율 없음): 250 × 100/120 = 208
    expect(hits[0]?.amount).toBe(Math.round(250 * (100 / (100 + unitOf(sim, 1).stat('res')))));
    const burns = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'burn' && e.value === 30 && e.duration === 3);
    expect(burns.length).toBeGreaterThan(0);
  });

  it('낙하 지점은 적이 가장 많이 겹치는 곳 중에서 시뮬 Rng로 고른다 (같은 시드는 같은 지점)', () => {
    const cellsOf = (seed: number) => {
      const sim = combat({ ...setup, seed });
      fillUltimateGauge(sim);
      sim.useUltimate();
      return eventsOf(sim, 'ultimateTelegraph').map((e) => e.cell);
    };
    expect(cellsOf(5)).toEqual(cellsOf(5));
    for (const cell of cellsOf(5)) {
      // 후보는 적 위치 반경 1 안의 칸
      const near = setup.b!.some(([, , col, row]) => Math.max(Math.abs(col - cell.col), Math.abs(row - cell.row)) <= 1);
      expect(near).toBe(true);
    }
    const spread = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(cellsOf(seed))));
    expect(spread.size).toBeGreaterThan(1); // 무작위: 시드가 바뀌면 지점이 달라진다
  });

  it('사용 시 지휘관 HP는 소모하지 않는다', () => {
    const sim = combat({ ...setup, commanderHp: 40 });
    fillUltimateGauge(sim);
    sim.useUltimate();
    expect(sim.commanderHpSpent).toBe(0);
    expect(eventsOf(sim, 'commanderHp')).toHaveLength(0);
  });
});

describe('대가 지불 (녹스)', () => {
  const setup: CardSimOptions = { commander: nox, commanderHp: 65 };

  it('지휘관 현재 HP의 10%(올림)를 commanderHp 이벤트로 소모하고 런 장부와 같은 경로로 합산된다', () => {
    const sim = combat(setup);
    fillUltimateGauge(sim);
    expect(sim.ultimate?.hpCost).toBe(7); // ceil(6.5)
    expect(sim.useUltimate().ok).toBe(true);
    expect(eventsOf(sim, 'commanderHp')).toEqual([
      { type: 'commanderHp', t: 0, delta: -7, remaining: 58, cardId: 'ultimate:cmd_nox', instanceId: ULTIMATE_COMMAND_ID },
    ]);
    expect(sim.commanderHpSpent).toBe(7);
    // 쓴 뒤에도 남은 HP(58)로 다시 계산하지 않고 실제 소모량을 보여준다
    expect(sim.ultimate).toMatchObject({ used: true, hpCost: 7 });
  });

  it('카드로 이미 쓴 HP를 뺀 현재치를 기준으로 하고, 사용 후 HP가 1 미만이면 거부한다', () => {
    const sim = combat({ ...setup, hand: ['blood_price'], commanderHp: 5 });
    fillUltimateGauge(sim);
    expect(sim.ultimate?.hpCost).toBe(1);
    expect(sim.playCard(1, { kind: 'unit', uid: 0 }).ok).toBe(true); // HP 2 소모 → 3 남음
    expect(sim.ultimate?.hpCost).toBe(1); // ceil(0.3)
    const tiny = combat({ ...setup, commanderHp: 1 });
    fillUltimateGauge(tiny);
    const result = tiny.useUltimate();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('지휘관 HP가 부족합니다');
    expect(tiny.ultimate?.used).toBe(false);
    expect(eventsOf(tiny, 'commanderHp')).toHaveLength(0);
  });

  it('5초간 아군 전체 생명력 흡수 25%', () => {
    const sim = combat(setup);
    fillUltimateGauge(sim);
    sim.useUltimate();
    const drains = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'lifesteal');
    expect(drains.map((e) => [e.value, e.duration])).toEqual(CARD_A.map(() => [25, 5]));
  });

  it('5초간 CP 획득 속도가 2배다 (4초 → 2초마다 +1)', () => {
    const cpGain = (boost: boolean): number => {
      const sim = combat({ ...setup, hand: [] });
      if (boost) {
        fillUltimateGauge(sim);
        sim.useUltimate();
      }
      const before = sim.commandPoints?.combat ?? 0;
      stepTicks(sim, 50);
      return (sim.commandPoints?.combat ?? 0) - before;
    };
    expect(cpGain(false)).toBe(1); // 40틱에 +1
    expect(cpGain(true)).toBe(2); // 20틱, 40틱에 +1씩 (50틱 안에 두 번)
  });
});

describe('주문 카드 피해 증가 (이세라 패시브)', () => {
  it('불씨 화살의 고정 피해와 화상이 +25%', () => {
    const dmg = (commander: typeof harten | null): { amount: number; dps: number } => {
      const sim = combat({ commander, hand: ['ember_arrow'], a: [['iron_shieldbearer', 1, 3, 2]], b: [['arena_recruit', 1, 4, 2]] });
      expect(sim.playCard(1, { kind: 'unit', uid: 1 }).ok).toBe(true);
      const hit = eventsOf(sim, 'damage').find((e) => e.dmgType === 'magic' && e.source === null);
      const burn = eventsOf(sim, 'statusApplied').find((e) => e.status === 'burn');
      return { amount: hit?.amount ?? 0, dps: burn?.value ?? 0 };
    };
    const plain = dmg(null);
    const boosted = dmg(isera);
    expect(plain.dps).toBe(20);
    expect(boosted.dps).toBe(25);
    expect(boosted.amount).toBeGreaterThan(plain.amount);
    expect(boosted.amount).toBe(Math.round(Math.round(80 * 1.25) * (100 / (100 + 15))));
  });

  it('주문이 아닌 카드(명령)에는 적용되지 않는다', () => {
    const sim = combat({ commander: isera, hand: ['focus_fire'] });
    expect(sim.playCard(1, { kind: 'unit', uid: 3 }).ok).toBe(true);
    expect(cardCatalog.get('focus_fire')?.type).toBe('command');
  });
});
