import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../../core/combat/events';
import { makeCardSim, makeSim, type Placement } from '../../core/combat/testSupport';
import { ReplayState } from './ReplayState';

const A: Placement[] = [
  ['iron_shieldbearer', 1, 3, 1],
  ['moss_warden', 1, 3, 3],
  ['arena_recruit', 1, 2, 2],
  ['legion_crossbow', 1, 1, 1],
  ['grove_archer', 1, 0, 3],
];
const B: Placement[] = [
  ['arena_recruit', 1, 4, 1],
  ['iron_shieldbearer', 1, 4, 3],
  ['shade_dagger', 1, 5, 2],
  ['grove_archer', 1, 6, 1],
  ['legion_crossbow', 1, 7, 3],
];

function spawn(unit: number, col: number, row: number, extra: Partial<CombatEvent> = {}): CombatEvent {
  return {
    t: 0,
    type: 'spawn',
    unit,
    unitId: 'iron_shieldbearer',
    side: 0,
    star: 1,
    cell: { col, row },
    hp: 100,
    maxHp: 100,
    mana: 0,
    maxMana: 50,
    ...extra,
  } as CombatEvent;
}

describe('ReplayState (실제 sim 로그)', () => {
  it('종료 시각의 HP·생존이 sim 결과와 일치한다', () => {
    for (const seed of [1, 2, 3]) {
      const result = makeSim(A, B, seed).run();
      const replay = new ReplayState(result.events);
      replay.advanceTo(result.endTime);

      const alive = replay.views().filter((v) => v.alive);
      expect(alive.map((v) => v.uid).sort((a, b) => a - b)).toEqual(result.survivors.map((s) => s.uid));
      for (const s of result.survivors) {
        const v = replay.viewOf(s.uid);
        expect(v?.hp).toBe(s.hp);
        expect(v?.maxHp).toBe(s.maxHp);
        expect(v?.cell).toEqual(s.cell);
      }
      for (const v of replay.views().filter((x) => !x.alive)) expect(v.hp).toBe(0);
      expect(replay.result?.winner).toBe(result.winner);
    }
  });

  it('reset 후 다시 재생해도 같은 결과이고, 되돌리기는 거부한다', () => {
    const result = makeSim(A, B, 4).run();
    const replay = new ReplayState(result.events);
    replay.advanceTo(10);
    expect(() => replay.advanceTo(5)).toThrow();
    replay.reset();
    expect(replay.time).toBe(0);
    expect(replay.views().every((v) => v.alive)).toBe(true);
    expect(replay.recentEffects(0).every((e) => e.t === 0)).toBe(true);
    replay.advanceTo(result.endTime);
    expect(replay.views().filter((v) => v.alive)).toHaveLength(result.survivors.length);
  });
});

describe('ReplayState (손으로 만든 로그)', () => {
  it('이동 중간값을 보간한다', () => {
    const replay = new ReplayState([
      spawn(0, 1, 1),
      { t: 1, type: 'moveStart', unit: 0, from: { col: 1, row: 1 }, to: { col: 2, row: 2 }, duration: 0.5 },
      { t: 1.5, type: 'moveEnd', unit: 0, cell: { col: 2, row: 2 } },
    ]);
    replay.advanceTo(1.25);
    const mid = replay.viewOf(0);
    expect(mid?.moveProgress).toBeCloseTo(0.5);
    expect(mid?.moveFrom).toEqual({ col: 1, row: 1 });
    expect(mid?.moveTo).toEqual({ col: 2, row: 2 });
    expect(mid?.pos.col).toBeCloseTo(1.5);
    expect(mid?.pos.row).toBeCloseTo(1.5);
    replay.advanceTo(2);
    const end = replay.viewOf(0);
    expect(end?.moveProgress).toBe(0);
    expect(end?.pos).toEqual({ col: 2, row: 2 });
  });

  it('피해·회복·보호막·마나·사망을 반영한다', () => {
    const replay = new ReplayState([
      spawn(0, 1, 1),
      spawn(1, 4, 1, { side: 1 }),
      { t: 1, type: 'shield', unit: 0, amount: 30, duration: 2 },
      { t: 2, type: 'damage', unit: 0, source: 1, amount: 40, absorbed: 30, dmgType: 'physical', hp: 90 },
      { t: 2, type: 'mana', unit: 0, mana: 10 },
      { t: 3, type: 'heal', unit: 0, source: null, amount: 5, hp: 95 },
      { t: 4, type: 'damage', unit: 0, source: 1, amount: 95, absorbed: 0, dmgType: 'magic', hp: 0 },
      { t: 4, type: 'death', unit: 0, killer: 1 },
    ]);
    replay.advanceTo(1.5);
    expect(replay.viewOf(0)?.shield).toBe(30);
    replay.advanceTo(2);
    expect(replay.viewOf(0)).toMatchObject({ shield: 0, hp: 90, mana: 10 });
    replay.advanceTo(3);
    expect(replay.viewOf(0)?.hp).toBe(95);
    replay.advanceTo(4);
    expect(replay.viewOf(0)).toMatchObject({ alive: false, hp: 0, deadAt: 4 });
    const kinds = replay.recentEffects(10).map((e) => e.kind);
    expect(kinds).toEqual(['damage', 'heal', 'damage', 'death']);
  });

  it('보호막은 만료 시각이 지나면 사라진다', () => {
    const replay = new ReplayState([spawn(0, 1, 1), { t: 1, type: 'shield', unit: 0, amount: 30, duration: 2 }]);
    replay.advanceTo(2.9);
    expect(replay.viewOf(0)?.shield).toBe(30);
    replay.advanceTo(3.1);
    expect(replay.viewOf(0)?.shield).toBe(0);
  });

  it('상태 적용·해제와 남은 시간을 계산한다', () => {
    const replay = new ReplayState([
      spawn(0, 1, 1),
      { t: 1, type: 'statusApplied', unit: 0, status: 'stun', duration: 1.5, source: null },
      { t: 1, type: 'statusApplied', unit: 0, status: 'burn', duration: 'combat', source: null, value: 12 },
      { t: 2.5, type: 'statusRemoved', unit: 0, status: 'stun' },
    ]);
    replay.advanceTo(1.5);
    const v = replay.viewOf(0);
    const stun = v?.statuses.find((s) => s.name === 'stun');
    expect(stun?.remaining).toBeCloseTo(1);
    expect(v?.statuses.find((s) => s.name === 'burn')).toMatchObject({ value: 12, remaining: Infinity });
    replay.advanceTo(2.5);
    expect(replay.viewOf(0)?.statuses.map((s) => s.name)).toEqual(['burn']);
  });

  it('연출 이벤트는 최근 maxAge초 안의 것만 돌려준다', () => {
    const replay = new ReplayState([
      spawn(0, 1, 1),
      spawn(1, 2, 1, { side: 1 }),
      { t: 1, type: 'attack', unit: 0, target: 1, shots: 1 },
      { t: 2, type: 'skillCast', unit: 0, skill: '테스트', targets: [1] },
      { t: 3, type: 'overheat' },
    ]);
    replay.advanceTo(2.2);
    expect(replay.recentEffects(0.5).map((e) => e.kind)).toEqual(['skill']);
    expect(replay.recentEffects(5).map((e) => e.kind)).toEqual(['attack', 'skill']);
    expect(replay.overheating).toBe(false);
    replay.advanceTo(3);
    expect(replay.overheating).toBe(true);
  });
});

describe('ReplayState (진행 중인 로그·카드 연출)', () => {
  it('뒤에 계속 늘어나는 로그를 이어서 소비한다', () => {
    const sim = makeCardSim({ hand: [] });
    const replay = new ReplayState(sim.events);
    sim.runUntil(10);
    replay.advanceTo(0.5);
    expect(replay.time).toBeCloseTo(0.5);
    const hpBefore = replay.views().reduce((sum, v) => sum + v.hp, 0);
    sim.runUntil(60);
    replay.advanceTo(5);
    expect(replay.views().length).toBe(5);
    expect(replay.views().reduce((sum, v) => sum + v.hp, 0)).toBeLessThan(hpBefore);
    expect(() => replay.advanceTo(1)).toThrow();
  });

  it('카드·CP 이벤트는 연출로, 진형 교대는 미끄러지는 위치 이동으로 보인다', () => {
    const sim = makeCardSim({ hand: ['formation_swap'] });
    sim.startCombat();
    const replay = new ReplayState(sim.events);
    const a = replay.viewOf(0)?.cell;
    const b = replay.viewOf(2)?.cell;
    expect(sim.playCard(1, { kind: 'units', uids: [0, 2] }).ok).toBe(true);
    replay.advanceTo(0);
    const kinds = replay.recentEffects(1).map((e) => e.kind);
    expect(kinds).toContain('card');
    expect(kinds).toContain('teleport');
    expect(kinds).toContain('cp');
    // 논리 칸은 이미 교대됨, 표시 위치는 출발 칸에서 시작해 도착 칸으로 이동
    expect(replay.viewOf(0)?.cell).toEqual(b);
    expect(replay.viewOf(0)?.pos).toEqual(a);
    replay.advanceTo(1);
    expect(replay.viewOf(0)?.pos).toEqual(b);
    expect(replay.viewOf(2)?.pos).toEqual(a);
  });

  it('집중 포화로 지정한 적에게 조준 표식이 켜졌다가 꺼진다', () => {
    const sim = makeCardSim({ hand: ['focus_fire'] });
    sim.startCombat();
    const replay = new ReplayState(sim.events);
    expect(sim.playCard(1, { kind: 'unit', uid: 4 }).ok).toBe(true);
    replay.advanceTo(0);
    expect(replay.viewOf(4)?.marked).toBe(true);
    expect(replay.viewOf(3)?.marked).toBe(false);
    replay.advanceTo(3.5);
    expect(replay.viewOf(4)?.marked).toBe(false);
  });

  it('최후의 저항(불사)·보호막이 상태로 보인다', () => {
    const sim = makeCardSim({ hand: ['last_stand', 'shield_formation'], upgraded: [1] });
    sim.startCombat();
    const replay = new ReplayState(sim.events);
    sim.playCard(1, { kind: 'unit', uid: 0 });
    sim.playCard(2, { kind: 'none' });
    replay.advanceTo(0);
    expect(replay.viewOf(0)?.statuses.some((s) => s.name === 'undying')).toBe(true);
    expect(replay.viewOf(0)?.shield).toBeGreaterThan(0);
  });
});
