import { describe, expect, it } from 'vitest';
import { CombatSimulator } from './sim';
import { cardCatalog, eventsOf, formation, handSnapshot, traits, unitOf, units, type Placement } from './testSupport';

const ALLY: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['arena_recruit', 1, 2, 2]];
const LORD: readonly Placement[] = [['legion_lord', 1, 4, 2]];
const BOSS_UID = ALLY.length;

function make(b: readonly Placement[] = LORD, enemy?: { hpMult: number; atkMult: number }, hand: readonly string[] = []): CombatSimulator {
  return new CombatSimulator(
    { seed: 4, formations: [formation(ALLY), formation(b)], cards: { commander: null, deck: handSnapshot(hand) }, ...(enemy ? { enemy } : {}) },
    units, traits, cardCatalog,
  );
}

/** 보스 HP를 최대 HP의 pct%로 맞춘다 (피해 이벤트 없이) */
function setHpPct(sim: CombatSimulator, pct: number): void {
  const boss = unitOf(sim, BOSS_UID);
  boss.hp = Math.round((boss.maxHp * pct) / 100);
}

describe('군단의 군주 바르칸 (phaseSummon)', () => {
  it('데이터: 보스 전용 유닛이며 HP 66%·33%에서 전환하는 페이즈 2개를 가진다', () => {
    const lord = units.get('legion_lord')!;
    expect(lord.boss).toBe(true);
    expect(lord.pattern?.kind).toBe('phaseSummon');
    if (lord.pattern?.kind !== 'phaseSummon') return;
    expect(lord.pattern.phases.map((p) => p.hpPct)).toEqual([66, 33]);
    expect(lord.pattern.phases.map((p) => p.summon.length)).toEqual([2, 3]);
  });

  it('HP가 66% 아래로 내려가면 다음 틱에 2페이즈: bossPhase 이벤트 → 증원 spawn(temporary, 성급·보정 적용)', () => {
    const sim = make(LORD, { hpMult: 2, atkMult: 1.5 });
    sim.runUntil(5);
    setHpPct(sim, 66);
    sim.runUntil(6); // 아직 처리 전 (피해를 받은 틱이 아니라 다음 틱 시작에 처리)
    expect(eventsOf(sim, 'bossPhase')).toHaveLength(1);
    const [phase] = eventsOf(sim, 'bossPhase');
    expect(phase).toMatchObject({ unit: BOSS_UID, phase: 2, hpPct: 66, dispelled: 0 });
    expect(phase?.summoned).toHaveLength(2);
    const spawned = phase!.summoned.map((uid) => unitOf(sim, uid));
    expect(spawned.map((u) => [u.def.id, u.star, u.side, u.temporary, u.cell])).toEqual([
      ['legion_crossbow', 2, 1, true, { col: 7, row: 1 }],
      ['legion_crossbow', 2, 1, true, { col: 7, row: 3 }],
    ]);
    // 적 보정 배율이 증원에도 적용된다: 석궁병 450 × 2성 1.8 × 2
    expect(spawned[0]?.maxHp).toBe(Math.round(450 * 1.8 * 2));
    expect(spawned[0]?.stat('atk')).toBe(Math.round(50 * 1.8 * 1.5));
    const spawnEvents = eventsOf(sim, 'spawn').filter((e) => e.unit >= ALLY.length + 1);
    expect(spawnEvents.map((e) => [e.unit, e.star])).toEqual(phase!.summoned.map((uid) => [uid, 2]));
    // 전환은 한 번뿐이다
    sim.runUntil(40);
    expect(eventsOf(sim, 'bossPhase')).toHaveLength(1);
  });

  it('HP가 33% 아래로 내려가면 3페이즈, 한 번에 두 임계치를 넘으면 같은 틱에 순서대로 모두 처리한다', () => {
    const sim = make();
    sim.runUntil(3);
    setHpPct(sim, 20);
    sim.runUntil(5);
    const phases = eventsOf(sim, 'bossPhase');
    expect(phases.map((e) => [e.phase, e.hpPct, e.summoned.length, e.t])).toEqual([[2, 66, 2, 0.3], [3, 33, 3, 0.3]]);
    // 66% 바로 위에서는 전환하지 않는다
    const calm = make();
    calm.runUntil(3);
    setHpPct(calm, 67);
    calm.runUntil(4);
    expect(eventsOf(calm, 'bossPhase')).toHaveLength(0);
  });

  it('증원 칸이 차 있으면 같은 진영의 가까운 빈 칸에 소환된다', () => {
    const sim = make([...LORD, ['iron_shieldbearer', 1, 7, 1]]);
    sim.runUntil(2);
    sim.world.units.forEach((u) => { u.moving = null; });
    setHpPct(sim, 60);
    sim.runUntil(4);
    const [phase] = eventsOf(sim, 'bossPhase');
    const cells = phase!.summoned.map((uid) => unitOf(sim, uid).cell);
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => c.col >= 4)).toBe(true);
    expect(new Set(cells.map((c) => `${c.col},${c.row}`)).size).toBe(2);
    expect(cells.some((c) => c.col === 7 && c.row === 1)).toBe(false);
  });

  it('전환 때 아군의 보호막과 시간제 버프를 해제하고, 불리한 상태와 전투 내내 지속되는 효과는 남긴다', () => {
    const sim = make();
    sim.runUntil(2);
    const target = unitOf(sim, 0);
    const other = unitOf(sim, 1);
    const now = sim.world.now;
    const baseArm = target.statuses.statBonus('arm').flat; // 특성이 이미 준 영구 ARM
    target.statuses.addShield(300, Infinity);
    target.statuses.addStatMod({ stat: 'atk', pct: 30, flat: 0, until: now + 20, duration: 20, refreshOnKill: false });
    target.statuses.addStatMod({ stat: 'arm', pct: 0, flat: 40, until: Infinity, duration: Infinity, refreshOnKill: false }); // 특성·장비 같은 영구 효과
    target.statuses.addStatMod({ stat: 'as', pct: -20, flat: 0, until: now + 20, duration: 20, refreshOnKill: false }); // 약화
    target.statuses.addTakenMult(0.5, now + 20); // 받는 피해 감소 (이로움)
    target.statuses.addTakenMult(1.3, now + 20); // 받는 피해 증가 (불리)
    target.statuses.addStun(now + 20);
    target.statuses.addExtraShots(2);
    other.statuses.addUndying(now + 20);
    setHpPct(sim, 60);
    sim.runUntil(4);
    expect(target.statuses.shieldTotal()).toBe(0);
    expect(target.statuses.statBonus('atk')).toEqual({ flat: 0, pct: 0 });
    expect(target.statuses.statBonus('arm')).toEqual({ flat: baseArm + 40, pct: 0 });
    expect(target.statuses.statBonus('as')).toEqual({ flat: 0, pct: -20 });
    expect(target.statuses.takenMultiplier()).toBeCloseTo(1.3);
    expect(target.statuses.isStunned()).toBe(true);
    expect(target.statuses.extraShots).toBe(0);
    expect(other.statuses.isUndying()).toBe(false);
    const dispels = eventsOf(sim, 'dispel');
    const first = dispels.find((e) => e.unit === 0);
    expect(first?.statuses.sort()).toEqual(['damageTakenMult', 'extraShots', 'shield', 'statMod:atk']);
    expect(dispels.find((e) => e.unit === 1)?.statuses).toEqual(['undying']);
    expect(eventsOf(sim, 'bossPhase')[0]?.dispelled).toBe(2);
  });

  it('카드로 건 방어 버프(진형 유지)도 페이즈 전환에 풀린다 — 연쇄·징집·궁극기로 흐름을 되찾아야 한다', () => {
    const sim = make(LORD, undefined, ['shield_formation']);
    sim.startCombat();
    sim.commandPoints?.gainCp(6, 'effect');
    const before = sim.world.alliesOf(0).reduce((sum, u) => sum + u.statuses.shieldTotal(), 0);
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
    const shielded = sim.world.alliesOf(0).reduce((sum, u) => sum + u.statuses.shieldTotal(), 0);
    expect(shielded).toBeGreaterThan(before);
    setHpPct(sim, 60);
    sim.runUntil(3);
    expect(sim.world.alliesOf(0).reduce((sum, u) => sum + u.statuses.shieldTotal(), 0)).toBe(0);
  });

  it('보스가 이미 죽었으면 전환하지 않는다', () => {
    const sim = make([...LORD, ['iron_shieldbearer', 1, 4, 1]]);
    sim.runUntil(2);
    setHpPct(sim, 50);
    sim.world.dealDamage({ source: null, target: unitOf(sim, BOSS_UID), raw: 1e9, type: 'magic' });
    sim.runUntil(10);
    expect(eventsOf(sim, 'bossPhase')).toHaveLength(0);
  });

  it('증원 유닛은 temporary라 생존 집계에 표시되고(패배 피해에서는 제외) 같은 입력이면 로그가 같다', () => {
    const run = (): string => {
      const sim = make([...LORD, ['iron_shieldbearer', 1, 4, 1]]);
      sim.runUntil(2);
      setHpPct(sim, 30);
      sim.runUntil(8);
      return JSON.stringify(sim.world.events);
    };
    expect(run()).toBe(run());
    const sim = make();
    sim.runUntil(2);
    setHpPct(sim, 30);
    sim.runUntil(4);
    const summoned = sim.world.units.filter((u) => u.uid > BOSS_UID);
    expect(summoned).toHaveLength(5);
    expect(summoned.every((u) => u.temporary)).toBe(true);
  });
});
