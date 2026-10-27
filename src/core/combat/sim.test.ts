import { describe, expect, it } from 'vitest';
import { loadUnits } from '../data';
import { COMBAT } from './constants';
import { EffectExecutor } from './effects';
import {
  eventsOf,
  fillMana,
  makeSim,
  stepTicks,
  stepUntil,
  traits,
  unitOf,
  type Placement,
} from './testSupport';

const A_MIRROR: Placement[] = [
  ['iron_shieldbearer', 1, 3, 1],
  ['moss_warden', 1, 3, 3],
  ['arena_recruit', 1, 2, 2],
  ['legion_crossbow', 1, 1, 1],
  ['grove_archer', 1, 0, 3],
];
const B_MIRROR: Placement[] = [
  ['arena_recruit', 1, 4, 1],
  ['iron_shieldbearer', 1, 4, 3],
  ['shade_dagger', 1, 5, 2],
  ['grove_archer', 1, 6, 1],
  ['legion_crossbow', 1, 7, 3],
];

describe('결정론', () => {
  it('같은 시드·편성이면 이벤트 로그가 완전히 일치', () => {
    const r1 = makeSim(A_MIRROR, B_MIRROR, 42).run();
    const r2 = makeSim(A_MIRROR, B_MIRROR, 42).run();
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
    expect(r1.winner).toBe(r2.winner);
    expect(r1.endTime).toBe(r2.endTime);
  });

  it('다른 시드에서도 정상 종료', () => {
    for (const seed of [1, 2, 3, 7, 12345, 4294967295]) {
      const result = makeSim(A_MIRROR, B_MIRROR, seed).run();
      expect(['draw', 0, 1]).toContain(result.winner);
      expect(result.endTime).toBeLessThanOrEqual(COMBAT.HARD_LIMIT_SECONDS);
      expect(result.events.at(-1)?.type).toBe('end');
    }
  });

  it('이벤트는 시각 순서대로이고 spawn이 먼저', () => {
    const { events } = makeSim(A_MIRROR, B_MIRROR, 5).run();
    for (let i = 1; i < events.length; i++) {
      expect((events[i] as { t: number }).t).toBeGreaterThanOrEqual((events[i - 1] as { t: number }).t);
    }
    expect(events.slice(0, 10).every((e) => e.type === 'spawn')).toBe(true);
  });
});

describe('보드 불변식', () => {
  it('모든 틱에서 두 유닛이 같은 칸을 점유하거나 같은 칸을 향해 이동하지 않는다', () => {
    for (const seed of [1, 2, 3]) {
      const sim = makeSim(A_MIRROR, B_MIRROR, seed);
      while (!sim.finished) {
        sim.step();
        const occupied = new Set<string>();
        const destinations = new Set<string>();
        for (const unit of sim.world.aliveUnits()) {
          const key = `${unit.cell.col},${unit.cell.row}`;
          expect(occupied.has(key), `틱 ${sim.world.tick} 칸 ${key} 중복 점유`).toBe(false);
          occupied.add(key);
          expect(sim.world.board.occupantAt(unit.cell)).toBe(unit.uid);
          if (unit.moving) {
            const dest = `${unit.moving.to.col},${unit.moving.to.row}`;
            expect(destinations.has(dest), `틱 ${sim.world.tick} 목적 칸 ${dest} 중복 예약`).toBe(false);
            destinations.add(dest);
          }
        }
        for (const dest of destinations) expect(occupied.has(dest), `목적 칸 ${dest}가 이미 점유됨`).toBe(false);
      }
    }
  });

  it('유닛은 보드 안에서만 움직이고 한 번에 1칸(8방향)만 이동', () => {
    const { events } = makeSim(A_MIRROR, B_MIRROR, 9).run();
    for (const e of events) {
      if (e.type !== 'moveStart') continue;
      expect(Math.max(Math.abs(e.to.col - e.from.col), Math.abs(e.to.row - e.from.row))).toBe(1);
      expect(e.to.col).toBeGreaterThanOrEqual(0);
      expect(e.to.col).toBeLessThan(8);
      expect(e.duration).toBe(COMBAT.MOVE_SECONDS_PER_CELL);
    }
  });
});

describe('승패와 종료', () => {
  it('한쪽 전멸 시 상대가 승자, 생존자는 승자 쪽만', () => {
    const result = makeSim(
      [['iron_shieldbearer', 3, 3, 1], ['iron_shieldbearer', 3, 3, 3]],
      [['grove_archer', 1, 4, 2]],
    ).run();
    expect(result.winner).toBe(0);
    expect(result.reason).toBe('annihilation');
    expect(result.survivors.length).toBeGreaterThan(0);
    expect(result.survivors.every((s) => s.side === 0)).toBe(true);
    expect(result.events.at(-1)).toMatchObject({ type: 'end', winner: 0 });
    expect(eventsOf(makeSim([['grove_archer', 1, 0, 0]], [['grove_archer', 1, 7, 4]]), 'spawn')).toHaveLength(2);
  });

  it('적이 이기면 winner 1', () => {
    const result = makeSim([['grove_archer', 1, 3, 2]], [['iron_shieldbearer', 3, 4, 2]]).run();
    expect(result.winner).toBe(1);
  });

  it('편성이 비어 있으면 즉시 종료', () => {
    const sim = makeSim([['grove_archer', 1, 3, 2]], []);
    expect(sim.finished).toBe(true);
    expect(sim.result().winner).toBe(0);
    expect(sim.result().endTime).toBe(0);
    expect(makeSim([], []).result().winner).toBe('draw');
  });

  it('동시 전멸은 무승부', () => {
    const sim = makeSim([['grove_archer', 1, 0, 0]], [['grove_archer', 1, 7, 4]]); // 서로 사거리 밖
    const [a, b] = [unitOf(sim, 0), unitOf(sim, 1)];
    a.hp = 1;
    b.hp = 1;
    const executor = new EffectExecutor(sim.world);
    for (const [from, to] of [[a, b], [b, a]] as const) {
      executor.execute([{ kind: 'burn', selector: 'target', dpsPctAtk: 100, duration: 1 }], {
        side: from.side,
        caster: from,
        targets: [to],
      });
    }
    const result = sim.run(); // 1초에 화상 피해로 같은 틱에 모두 사망
    expect(result.winner).toBe('draw');
    expect(result.reason).toBe('annihilation');
    expect(result.endTime).toBeCloseTo(1);
    expect(result.survivors).toHaveLength(0);
  });

  it('피해를 못 주는 양측은 90초에 무승부 (안전 장치)', () => {
    const dummy = {
      version: 1,
      units: [
        {
          id: 'dummy',
          name: '허수아비',
          tier: 1,
          origin: 'iron_legion',
          job: 'guardian',
          stats: { hp: 1000000, atk: 0, as: 1, rng: 1, arm: 0, res: 0, mana: 100000 },
          skill: {
            name: '없음',
            text: '-',
            targeting: 'self',
            effects: [{ kind: 'shield', selector: 'self', pctMaxHp: 1, duration: 1 }],
          },
        },
      ],
    };
    const catalog = loadUnits(dummy, traits);
    const result = makeSim([['dummy', 1, 3, 2]], [['dummy', 1, 4, 2]], 1, catalog).run();
    expect(result.winner).toBe('draw');
    expect(result.reason).toBe('timeout');
    expect(result.endTime).toBeCloseTo(COMBAT.HARD_LIMIT_SECONDS);
    expect(result.events.some((e) => e.type === 'overheat')).toBe(true);
  });

  it('잘못된 편성은 한국어 에러', () => {
    expect(() => makeSim([['nope' as never, 1, 0, 0]], [])).toThrow('알 수 없는 유닛');
    expect(() => makeSim([['grove_archer', 1, 4, 0]], [])).toThrow('영역 밖');
    expect(() => makeSim([['grove_archer', 1, 0, 0], ['moss_warden', 1, 0, 0]], [])).toThrow('중복');
  });
});

describe('성급 배율', () => {
  it('HP·ATK ×1.8(2성), ×3.2(3성)', () => {
    const sim = makeSim(
      [['iron_shieldbearer', 1, 3, 0], ['iron_shieldbearer', 2, 3, 2], ['iron_shieldbearer', 3, 3, 4]],
      [['grove_archer', 1, 4, 2]],
    );
    expect([0, 1, 2].map((i) => unitOf(sim, i).maxHp)).toEqual([650, 1170, 2080]);
    expect([0, 1, 2].map((i) => unitOf(sim, i).stat('atk'))).toEqual([40, 72, 128]);
  });
});

describe('타겟팅', () => {
  it('가장 가까운 적을 공격, 동률이면 HP 낮은 쪽', () => {
    const sim = makeSim(
      [['arena_recruit', 1, 3, 2]],
      [['moss_warden', 1, 4, 1], ['grove_archer', 1, 4, 3]], // 둘 다 거리 1, 궁수 HP가 더 낮음
    );
    stepUntil(sim, () => eventsOf(sim, 'attack').some((e) => e.unit === 0));
    expect(eventsOf(sim, 'attack').find((e) => e.unit === 0)?.target).toBe(2);
  });

  it('HP도 같으면 uid가 작은 쪽', () => {
    const sim = makeSim(
      [['arena_recruit', 1, 3, 2]],
      [['grove_archer', 1, 4, 1], ['grove_archer', 1, 4, 3]],
    );
    stepUntil(sim, () => eventsOf(sim, 'attack').some((e) => e.unit === 0));
    expect(eventsOf(sim, 'attack').find((e) => e.unit === 0)?.target).toBe(1);
  });

  it('사거리 밖이면 이동하고 사거리 안이면 이동 없이 공격', () => {
    const sim = makeSim([['legion_crossbow', 1, 0, 2]], [['moss_warden', 1, 7, 2]]);
    stepUntil(sim, () => eventsOf(sim, 'attack').some((e) => e.unit === 0));
    const firstAttack = eventsOf(sim, 'attack').find((e) => e.unit === 0)?.t as number;
    stepTicks(sim, 30);
    const moves = eventsOf(sim, 'moveStart').filter((e) => e.unit === 0);
    expect(moves.length).toBeGreaterThanOrEqual(1); // 사거리 밖에서 출발
    expect(moves.every((m) => m.t < firstAttack)).toBe(true); // 공격을 시작한 뒤에는 이동하지 않음
  });
});

describe('마나와 스킬 시전', () => {
  it('공격마다 마나 +10, 가득 차면 다음 행동에서 스킬 시전 후 마나 0', () => {
    const sim = makeSim([['arena_recruit', 1, 3, 2]], [['moss_warden', 1, 4, 2]]);
    sim.world.setMana(unitOf(sim, 0), 50);
    expect(stepUntil(sim, () => eventsOf(sim, 'skillCast').some((e) => e.unit === 0))).toBe(true);
    const log = sim.world.events.filter((e) => 'unit' in e && e.unit === 0);
    const attackIndex = log.findIndex((e) => e.type === 'attack');
    const castIndex = log.findIndex((e) => e.type === 'skillCast');
    expect(attackIndex).toBeGreaterThanOrEqual(0);
    expect(castIndex).toBeGreaterThan(attackIndex);
    expect(log.some((e) => e.type === 'mana' && e.mana === 60)).toBe(true);
    expect(unitOf(sim, 0).mana).toBe(0);
  });

  it('피격 시 받은 피해의 1%가 마나로, 1회 최대 +15', () => {
    const sim = makeSim([['moss_warden', 1, 3, 2]], [['grove_archer', 1, 4, 2]]);
    const target = unitOf(sim, 0);
    target.hp = 100000; // 죽지 않게 (테스트용)
    sim.world.dealDamage({ source: null, target, raw: 1300, type: 'physical' }); // 1000 피해 → +10
    expect(target.mana).toBe(10);
    sim.world.dealDamage({ source: null, target, raw: 13000, type: 'physical' }); // 10000 피해 → 상한 +15
    expect(target.mana).toBe(25);
  });

  it('기절 중에는 마나가 차 있어도 시전하지 않는다', () => {
    const sim = makeSim([['arena_recruit', 1, 3, 2]], [['moss_warden', 1, 4, 2]]);
    fillMana(sim, 0);
    new EffectExecutor(sim.world).execute([{ kind: 'stun', selector: 'target', duration: 2 }], {
      side: 1,
      caster: unitOf(sim, 1),
      targets: [unitOf(sim, 0)],
    });
    stepTicks(sim, 19); // t = 0 ~ 1.8
    expect(eventsOf(sim, 'skillCast')).toHaveLength(0);
    expect(eventsOf(sim, 'attack').filter((e) => e.unit === 0)).toHaveLength(0);
    stepTicks(sim, 3); // t = 2.0 이후
    expect(eventsOf(sim, 'skillCast').filter((e) => e.unit === 0)).toHaveLength(1);
  });

  it('기절 중에는 이동하지 않는다', () => {
    const sim = makeSim([['arena_recruit', 1, 0, 2]], [['moss_warden', 1, 7, 2]]);
    new EffectExecutor(sim.world).execute([{ kind: 'stun', selector: 'target', duration: 2 }], {
      side: 1,
      caster: unitOf(sim, 1),
      targets: [unitOf(sim, 0)],
    });
    stepTicks(sim, 15);
    expect(eventsOf(sim, 'moveStart').filter((e) => e.unit === 0)).toHaveLength(0);
    stepTicks(sim, 10);
    expect(eventsOf(sim, 'moveStart').filter((e) => e.unit === 0).length).toBeGreaterThan(0);
  });
});

describe('M1 스킬 6종', () => {
  it('방패 밀치기: ATK 150% 물리 피해 + 기절 (1성 1초, 3성 1.5초)', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], [['arena_recruit', 1, 4, 2]]);
    fillMana(sim, 0);
    sim.step();
    expect(eventsOf(sim, 'skillCast')[0]).toMatchObject({ unit: 0, skill: '방패 밀치기', targets: [1] });
    const hit = eventsOf(sim, 'damage').find((e) => e.source === 0);
    expect(hit).toMatchObject({ unit: 1, amount: 48, dmgType: 'physical' }); // 60 × 100/125
    expect(eventsOf(sim, 'statusApplied').find((e) => e.status === 'stun')).toMatchObject({ unit: 1, duration: 1 });
    expect(unitOf(sim, 1).statuses.isStunned()).toBe(true);
    // 기절 중에는 공격하지 않는다 (첫 틱에 이미 공격했을 수 있으므로 t>0만 확인)
    stepTicks(sim, 9);
    expect(eventsOf(sim, 'attack').filter((e) => e.unit === 1 && e.t > 0)).toHaveLength(0);

    const sim3 = makeSim([['iron_shieldbearer', 3, 3, 2]], [['arena_recruit', 1, 4, 2]]);
    fillMana(sim3, 0);
    sim3.step();
    expect(eventsOf(sim3, 'statusApplied').find((e) => e.status === 'stun')?.duration).toBe(1.5);
  });

  it('투지: AS +40% 4초, 처치 시 지속 시간 초기화', () => {
    const sim = makeSim([['arena_recruit', 1, 3, 2]], [['moss_warden', 1, 7, 4]]);
    const recruit = unitOf(sim, 0);
    fillMana(sim, 0);
    sim.step();
    expect(eventsOf(sim, 'skillCast')[0]?.skill).toBe('투지');
    expect(recruit.stat('as')).toBeCloseTo(0.75 * 1.4);

    stepTicks(sim, 20); // t = 2.1
    sim.world.bus.emit('onKill', { killer: recruit, victim: unitOf(sim, 1) }); // 처치 발생
    const refreshed = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:as');
    expect(refreshed).toHaveLength(2);
    expect(refreshed[1]).toMatchObject({ duration: 4 });

    stepTicks(sim, 30); // t = 5.1 — 초기화가 없었다면 이미 4초가 지났다
    expect(recruit.stat('as')).toBeCloseTo(0.75 * 1.4);
    stepTicks(sim, 15); // t = 6.6 (2.1 + 4 = 6.1 이후)
    expect(recruit.stat('as')).toBeCloseTo(0.75);
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.status === 'statMod:as')).toBe(true);
  });

  it('관통 볼트: 직선상의 모든 적에게 ATK 180% 물리 피해', () => {
    const sim = makeSim(
      [['legion_crossbow', 1, 0, 2]],
      [
        ['moss_warden', 1, 4, 2],
        ['grove_archer', 1, 5, 2],
        ['arena_recruit', 1, 7, 2],
        ['shade_dagger', 1, 5, 3], // 직선 밖
      ],
    );
    fillMana(sim, 0);
    sim.step();
    const hits = eventsOf(sim, 'damage').filter((e) => e.source === 0);
    expect(hits.map((h) => h.unit).sort()).toEqual([1, 2, 3]);
    expect(hits.find((h) => h.unit === 1)?.amount).toBe(69); // 90 × 100/130
  });

  it('뿌리내리기: 받는 피해 -50% 3초 + 주변 1칸 아군 초당 20 회복', () => {
    const sim = makeSim(
      [['moss_warden', 1, 3, 2], ['arena_recruit', 1, 3, 3], ['legion_crossbow', 1, 0, 0]],
      [['grove_archer', 1, 7, 0]],
    );
    unitOf(sim, 1).hp = 100;
    unitOf(sim, 2).hp = 100;
    fillMana(sim, 0);
    sim.step();
    expect(unitOf(sim, 0).statuses.takenMultiplier()).toBeCloseTo(0.5);
    stepTicks(sim, 32); // t = 3.2
    const heals = eventsOf(sim, 'heal').filter((e) => e.source === 0);
    expect(heals).toHaveLength(3);
    expect(heals.every((h) => h.unit === 1 && h.amount === 20)).toBe(true);
    expect(heals.map((h) => Math.round(h.t))).toEqual([1, 2, 3]);
    expect(unitOf(sim, 0).statuses.takenMultiplier()).toBe(1);
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.status === 'damageTakenMult')).toBe(true);
  });

  it('연사: 다음 3회 공격이 2발씩', () => {
    const sim = makeSim([['grove_archer', 1, 0, 2]], [['moss_warden', 1, 4, 2]]);
    fillMana(sim, 0);
    stepUntil(sim, () => eventsOf(sim, 'attack').filter((e) => e.unit === 0).length >= 4);
    expect(eventsOf(sim, 'skillCast')[0]?.skill).toBe('연사');
    const shots = eventsOf(sim, 'attack').filter((e) => e.unit === 0).map((e) => e.shots);
    expect(shots.slice(0, 4)).toEqual([2, 2, 2, 1]);
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.status === 'extraShots')).toBe(true);
    // 2발 = 피해 이벤트 2개
    const firstAttackTime = eventsOf(sim, 'attack').find((e) => e.unit === 0)?.t;
    expect(eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.t === firstAttackTime)).toHaveLength(2);
  });

  it('그림자 찌르기: HP가 가장 낮은 적 뒤로 순간이동 + ATK 220% 물리 피해', () => {
    const sim = makeSim(
      [['shade_dagger', 1, 0, 0]],
      [['moss_warden', 1, 4, 2], ['grove_archer', 1, 6, 3]], // 궁수 HP 430이 가장 낮음
    );
    fillMana(sim, 0);
    sim.step();
    expect(eventsOf(sim, 'skillCast')[0]).toMatchObject({ unit: 0, targets: [2] });
    expect(eventsOf(sim, 'teleport')[0]).toMatchObject({ unit: 0, from: { col: 0, row: 0 }, to: { col: 7, row: 3 } });
    expect(unitOf(sim, 0).cell).toEqual({ col: 7, row: 3 });
    const hit = eventsOf(sim, 'damage').find((e) => e.source === 0);
    expect(hit).toMatchObject({ unit: 2, amount: 110, hp: 320 }); // 121 × 100/110
    expect(sim.world.board.occupantAt({ col: 7, row: 3 })).toBe(0);
  });

  describe('시전 전 조건 검사 (순간이동 목적지)', () => {
    // 궁수(HP 최저)가 구석에 있고 인접 칸 3개가 모두 막혀 있다
    const blocked = () =>
      makeSim(
        [['shade_dagger', 1, 0, 2]],
        [['grove_archer', 1, 7, 0], ['moss_warden', 1, 6, 0], ['moss_warden', 1, 6, 1], ['moss_warden', 1, 7, 1]],
      );

    it('목적지가 없으면 스킬 전체를 시전하지 않는다 (마나 유지, 원거리 피해 없음)', () => {
      const sim = blocked();
      fillMana(sim, 0);
      stepTicks(sim, 3);
      expect(eventsOf(sim, 'teleport')).toHaveLength(0);
      expect(eventsOf(sim, 'skillCast')).toHaveLength(0);
      expect(eventsOf(sim, 'damage').filter((e) => e.source === 0)).toHaveLength(0);
      expect(unitOf(sim, 0).mana).toBe(unitOf(sim, 0).maxMana);
    });

    it('목적지가 나중에 비면 이후 틱에 시전된다', () => {
      const sim = blocked();
      fillMana(sim, 0);
      const cast = stepUntil(sim, () => eventsOf(sim, 'skillCast').length > 0, 200);
      expect(cast).toBe(true);
      expect(eventsOf(sim, 'teleport').length).toBeGreaterThan(0);
    });

    it('canExecute: 목적지가 없으면 false, 있으면 true, 순간이동 없는 효과는 항상 true', () => {
      const sim = blocked();
      const executor = new EffectExecutor(sim.world);
      const shade = unitOf(sim, 0);
      const ctx = { side: shade.side, caster: shade, targets: [unitOf(sim, 1)] };
      expect(executor.canExecute(shade.skillEffects, ctx)).toBe(false);
      expect(executor.canExecute(shade.skillEffects, { ...ctx, targets: [] })).toBe(false);
      expect(executor.canExecute(unitOf(sim, 2).skillEffects, ctx)).toBe(true);

      const open = makeSim([['shade_dagger', 1, 0, 0]], [['grove_archer', 1, 6, 3]]);
      const shade2 = unitOf(open, 0);
      expect(
        new EffectExecutor(open.world).canExecute(shade2.skillEffects, {
          side: shade2.side,
          caster: shade2,
          targets: [unitOf(open, 1)],
        }),
      ).toBe(true);
    });
  });
});

describe('statusApplied 수치(value)', () => {
  it('특성 statAdd(iron_legion 1단계 ARM +15)는 value 15를 기록', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3]], [['moss_warden', 1, 7, 2]]);
    const arm = eventsOf(sim, 'statusApplied').filter((e) => e.status === 'statMod:arm');
    expect(arm.length).toBeGreaterThan(0);
    expect(arm.every((e) => e.value === 15)).toBe(true);
  });

  it('값이 없는 상태(stun)는 value 키 자체가 없다', () => {
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], [['arena_recruit', 1, 4, 2]]);
    fillMana(sim, 0);
    sim.step();
    const stun = eventsOf(sim, 'statusApplied').find((e) => e.status === 'stun');
    expect(stun).toBeDefined();
    expect(stun).not.toHaveProperty('value');
  });
});

describe('효과 시스템 (카드와 공유)', () => {
  const setup = () => makeSim([['moss_warden', 1, 3, 2], ['grove_archer', 1, 1, 1]], [['arena_recruit', 1, 7, 4]]);

  it('shield: 최대 HP 비례 보호막, 만료 시 제거 이벤트', () => {
    const sim = setup();
    new EffectExecutor(sim.world).execute(
      [{ kind: 'shield', selector: 'alliesFrontRow', pctMaxHp: 15, duration: 3 }],
      { side: 0, caster: null, targets: [] },
    );
    expect(eventsOf(sim, 'shield')).toEqual([{ t: 0, type: 'shield', unit: 0, amount: 105, duration: 3 }]);
    stepTicks(sim, 32);
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.unit === 0 && e.status === 'shield')).toBe(true);
    expect(unitOf(sim, 0).statuses.shieldTotal()).toBe(0);
  });

  it('피해 적용 순서: 배율 → 방어 → 보호막 흡수 → HP', () => {
    const sim = setup();
    const warden = unitOf(sim, 0);
    const exec = new EffectExecutor(sim.world);
    exec.execute([{ kind: 'shield', selector: 'self', pctMaxHp: 100, duration: 'combat' }], {
      side: 0,
      caster: warden,
      targets: [],
    });
    sim.world.addShield(warden, 0, 1); // 0 보호막은 무시됨
    // 보호막 700 중 일부만 흡수: 배율 0.5, ARM 30 → 260×0.5=130 → 100
    exec.execute([{ kind: 'damageTakenMult', selector: 'self', mult: 0.5, duration: 5 }], { side: 0, caster: warden, targets: [] });
    sim.world.dealDamage({ source: null, target: warden, raw: 260, type: 'physical' });
    const hit = eventsOf(sim, 'damage')[0];
    expect(hit).toMatchObject({ amount: 100, absorbed: 100, hp: 700 });
    // 보호막을 넘는 피해: 남은 600 + 초과분 HP
    sim.world.dealDamage({ source: null, target: warden, raw: 260 * 7, type: 'physical' }); // 700 피해
    expect(eventsOf(sim, 'damage')[1]).toMatchObject({ amount: 700, absorbed: 600, hp: 600 });
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.status === 'shield')).toBe(true);
  });

  it('damageTakenMult / statMod: 카드 데이터 형태 그대로 실행', () => {
    const sim = setup();
    const exec = new EffectExecutor(sim.world);
    exec.execute(
      [
        { kind: 'damageTakenMult', selector: 'target', mult: 0.5, duration: 3 },
        { kind: 'statMod', selector: 'allAllies', stat: 'atk', pct: 10, duration: 'combat' },
        { kind: 'statMod', selector: 'alliesMelee', stat: 'as', pct: 30, duration: 4 },
      ],
      { side: 0, caster: null, targets: [unitOf(sim, 1)] },
    );
    expect(unitOf(sim, 1).statuses.takenMultiplier()).toBe(0.5);
    expect(unitOf(sim, 0).statuses.takenMultiplier()).toBe(1);
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(38.5);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(0.55 * 1.3); // 근접
    expect(unitOf(sim, 1).stat('as')).toBeCloseTo(0.75); // 원거리는 제외
    stepTicks(sim, 42);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(0.55); // 4초 후 만료
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(38.5); // 전투 끝까지
  });

  it('undying / forceTarget', () => {
    const sim = makeSim([['arena_recruit', 1, 3, 2]], [['moss_warden', 1, 4, 1], ['grove_archer', 1, 4, 3]]);
    const exec = new EffectExecutor(sim.world);
    // 기본 타겟은 궁수(uid 2, HP 낮음). moss_warden(uid 1)을 우선 공격시킨다.
    exec.execute([{ kind: 'forceTarget', selector: 'allAllies', duration: 3 }], {
      side: 0,
      caster: null,
      targets: [unitOf(sim, 1)],
    });
    sim.step();
    expect(eventsOf(sim, 'attack').find((e) => e.unit === 0)?.target).toBe(1);

    const recruit = unitOf(sim, 0);
    exec.execute([{ kind: 'undying', selector: 'self', duration: 2 }], { side: 0, caster: recruit, targets: [] });
    sim.world.dealDamage({ source: null, target: recruit, raw: 100000, type: 'physical' });
    expect(recruit.alive).toBe(true);
    expect(recruit.hp).toBe(1);
  });

  it('swapPositions: 두 아군의 위치 교환', () => {
    const sim = setup();
    const [a, b] = [unitOf(sim, 0), unitOf(sim, 1)];
    new EffectExecutor(sim.world).execute([{ kind: 'swapPositions', selector: 'target' }], {
      side: 0,
      caster: null,
      targets: [a, b],
    });
    expect(a.cell).toEqual({ col: 1, row: 1 });
    expect(b.cell).toEqual({ col: 3, row: 2 });
    expect(sim.world.board.occupantAt({ col: 1, row: 1 })).toBe(0);
  });

  it('heal: 최대 HP를 넘기지 않음', () => {
    const sim = setup();
    const warden = unitOf(sim, 0);
    warden.hp = 690;
    new EffectExecutor(sim.world).execute([{ kind: 'heal', selector: 'self', amount: 50 }], {
      side: 0,
      caster: warden,
      targets: [],
    });
    expect(eventsOf(sim, 'heal')[0]).toMatchObject({ unit: 0, amount: 10, hp: 700 });
  });
});

describe('상태이상', () => {
  const burnSim = () => makeSim([['shade_dagger', 1, 0, 0]], [['moss_warden', 1, 7, 4]]);
  const applyBurn = (sim: ReturnType<typeof burnSim>, duration: number) =>
    new EffectExecutor(sim.world).execute([{ kind: 'burn', selector: 'target', dpsPctAtk: 100, duration }], {
      side: 0,
      caster: unitOf(sim, 0),
      targets: [unitOf(sim, 1)],
    });
  const burnHits = (sim: ReturnType<typeof burnSim>) =>
    eventsOf(sim, 'damage').filter((e) => e.dmgType === 'magic' && e.unit === 1);

  it('화상: 1초마다 마법 피해 (ATK × 비율, RES 적용), 지속 후 제거', () => {
    const sim = burnSim();
    applyBurn(sim, 3);
    stepTicks(sim, 45);
    const hits = burnHits(sim);
    expect(hits).toHaveLength(3);
    expect(hits.map((h) => Math.round(h.t))).toEqual([1, 2, 3]);
    expect(hits.every((h) => h.amount === 42 && h.source === 0)).toBe(true); // 55 × 100/130
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.unit === 1 && e.status === 'burn')).toBe(true);
    expect(unitOf(sim, 1).statuses.isBurning()).toBe(false);
  });

  it('화상 재부여는 지속 시간만 갱신 (중첩 없음)', () => {
    const sim = burnSim();
    applyBurn(sim, 3);
    stepTicks(sim, 20);
    applyBurn(sim, 3); // t = 2.0에 갱신 → 5.0까지
    stepTicks(sim, 40);
    expect(burnHits(sim)).toHaveLength(5);
  });

  it('화상으로 사망하면 처치자가 기록됨', () => {
    const sim = burnSim();
    const target = unitOf(sim, 1);
    target.hp = 50;
    applyBurn(sim, 3);
    stepTicks(sim, 25);
    expect(target.alive).toBe(false);
    expect(eventsOf(sim, 'death')[0]).toMatchObject({ unit: 1, killer: 0 });
  });

  it('기절은 중첩 없이 더 늦게 끝나는 쪽으로 갱신', () => {
    const sim = burnSim();
    const target = unitOf(sim, 1);
    target.statuses.addStun(2);
    target.statuses.addStun(1);
    stepTicks(sim, 15);
    expect(target.statuses.isStunned()).toBe(true);
    stepTicks(sim, 10);
    expect(target.statuses.isStunned()).toBe(false);
  });
});

describe('과열', () => {
  it('30초 이후 받는 피해 배율 1 + 0.1 × (경과초 − 30)', () => {
    const sim = makeSim([['moss_warden', 1, 3, 2]], [['grove_archer', 1, 4, 2]]);
    const target = unitOf(sim, 0);
    sim.world.tick = 300;
    sim.world.dealDamage({ source: null, target, raw: 100, type: 'magic' }); // RES 30 → 100×100/130 = 77
    sim.world.tick = 400; // 40초 → ×2
    sim.world.dealDamage({ source: null, target, raw: 100, type: 'magic' }); // 200×100/130 = 154
    const [d1, d2] = eventsOf(sim, 'damage');
    expect(d1?.amount).toBe(77);
    expect(d2?.amount).toBe(154);
  });

  it('과열 이벤트는 30초에 한 번', () => {
    const dummyRun = makeSim([['moss_warden', 1, 3, 2]], [['moss_warden', 1, 4, 2]]).run();
    expect(dummyRun.events.filter((e) => e.type === 'overheat').length).toBeLessThanOrEqual(1);
    expect(dummyRun.endTime).toBeGreaterThan(0);
  });
});
