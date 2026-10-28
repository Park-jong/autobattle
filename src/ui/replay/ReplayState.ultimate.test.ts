import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../../core/combat/events';
import { fillUltimateGauge, isera, makeCardSim, nox, harten, stepTicks } from '../../core/combat/testSupport';
import { ReplayState } from './ReplayState';

const cell = { col: 5, row: 2 };
const used = (t: number, durationSeconds: number): CombatEvent => ({ t, type: 'ultimateUsed', commanderId: 'cmd_harten', name: '불굴의 방진', durationSeconds });
const telegraph = (t: number, id: number, fireAt: number): CombatEvent => ({ t, type: 'ultimateTelegraph', id, cell, radius: 1, fireAt });
const impact = (t: number, id: number): CombatEvent => ({ t, type: 'ultimateImpact', id, cell, radius: 1 });

describe('궁극기 표시 상태', () => {
  it('발동 이벤트는 배너 연출로 남고, 지속 효과가 있으면 그 시간 동안 aura가 켜진다', () => {
    const replay = new ReplayState([used(5, 4)]);
    replay.advanceTo(4.9);
    expect(replay.ultimateAura()).toBeNull();
    replay.advanceTo(5);
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toEqual(['ultimate']);
    expect(replay.ultimateAura()).toMatchObject({ commanderId: 'cmd_harten', name: '불굴의 방진', startedAt: 5, until: 9 });
    replay.advanceTo(8.9);
    expect(replay.ultimateAura()).not.toBeNull();
    replay.advanceTo(9);
    expect(replay.ultimateAura()).toBeNull();
  });

  it('지속 효과가 없는 궁극기(운석)는 aura를 켜지 않는다', () => {
    const replay = new ReplayState([{ t: 1, type: 'ultimateUsed', commanderId: 'cmd_isera', name: '대분화', durationSeconds: 0 }]);
    replay.advanceTo(2);
    expect(replay.ultimateAura()).toBeNull();
  });

  it('운석은 예고 시각부터 착탄 직전까지 낙하 진행률과 함께 보이고, 착탄은 연출로 남는다', () => {
    const replay = new ReplayState([telegraph(10, 1, 11), telegraph(10, 2, 12), impact(11, 1), impact(12, 2)]);
    replay.advanceTo(9.9);
    expect(replay.meteors()).toEqual([]);
    replay.advanceTo(10.5);
    expect(replay.meteors().map((m) => [m.id, m.cell, m.radius])).toEqual([[1, cell, 1], [2, cell, 1]]);
    expect(replay.meteors()[0]!.progress).toBeCloseTo(0.5);
    expect(replay.meteors()[1]!.progress).toBeCloseTo(0.25);
    replay.advanceTo(11);
    expect(replay.meteors().map((m) => m.id)).toEqual([2]);
    expect(replay.recentEffects(0.2).map((e) => e.kind)).toContain('impact');
    replay.advanceTo(12);
    expect(replay.meteors()).toEqual([]);
  });

  it('reset하면 운석·aura도 처음 상태로 돌아간다', () => {
    const replay = new ReplayState([used(0, 2), telegraph(0, 1, 2)]);
    replay.advanceTo(1);
    expect(replay.meteors()).toHaveLength(1);
    expect(replay.ultimateAura()).not.toBeNull();
    replay.reset();
    replay.advanceTo(3);
    expect(replay.meteors()).toEqual([]);
    expect(replay.ultimateAura()).toBeNull();
  });

  it('실제 시뮬 로그: 이세라 대분화가 3발을 1초 간격으로 예고·착탄하고, 하르텐 방진은 4초 aura를 켠다', () => {
    const iseraSim = makeCardSim({ commander: isera, a: [['ember_kindler', 3, 0, 2], ['iron_shieldbearer', 3, 3, 2]], b: [['iron_shieldbearer', 3, 4, 2], ['iron_shieldbearer', 3, 5, 1]] });
    iseraSim.startCombat();
    fillUltimateGauge(iseraSim);
    iseraSim.useUltimate();
    const replay = new ReplayState(iseraSim.events);
    replay.advanceTo(0);
    expect(replay.meteors()).toHaveLength(3);
    stepTicks(iseraSim, 31);
    replay.advanceTo(2.5);
    expect(replay.meteors().map((m) => m.id)).toEqual([3]);

    const hartenSim = makeCardSim({ commander: harten });
    hartenSim.startCombat();
    fillUltimateGauge(hartenSim);
    hartenSim.useUltimate();
    const aura = new ReplayState(hartenSim.events);
    aura.advanceTo(1);
    expect(aura.ultimateAura()).toMatchObject({ commanderId: 'cmd_harten', until: 4 });
    void nox;
  });
});
