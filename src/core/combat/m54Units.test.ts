import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fanRays } from './board';
import type { Placement } from './testSupport';
import { eventsOf, fillMana, makeCardSim, makeSim, stepTicks, stepUntil, traits, unitOf, units } from './testSupport';
import type { CombatSimulator } from './sim';

/** CHARACTERS.md 4장 능력치 표(U01~U30)를 그대로 읽어 units.json과 대조한다 */
describe('M5-4 유닛 30종: 문서 수치 대조', () => {
  const markdown = readFileSync(new URL('../../../CHARACTERS.md', import.meta.url), 'utf8');
  const rows = markdown
    .split('\n')
    .map((line) => line.match(/^\| (U\d\d) \| (.+?) \| (\w+) \| (\d) \| (.+?) \| (.+?) \| (\d+) \| (\d+) \| ([\d.]+) \| (\d) \| (\d+) \| (\d+) \| (\d+) \|$/))
    .filter((m): m is RegExpMatchArray => m !== null);
  const traitIdByName = new Map(traits.traits.map((t) => [t.name, t.id]));

  it('표에서 30행을 읽는다', () => {
    expect(rows).toHaveLength(30);
  });

  it.each(rows.map((m) => [m[1], m[2], m] as const))('%s %s: 이름·등급·기원·직업·능력치가 문서와 같다', (_num, _name, m) => {
    const [, , name, id, tier, origin, job, hp, atk, as, rng, arm, res, mana] = m as string[] as [string, string, string, string, string, string, string, string, string, string, string, string, string, string];
    const def = units.get(id);
    expect(def, `${id} 없음`).toBeDefined();
    expect(def).toMatchObject({
      name,
      tier: Number(tier),
      origin: traitIdByName.get(origin),
      job: traitIdByName.get(job),
      stats: { hp: Number(hp), atk: Number(atk), as: Number(as), rng: Number(rng), arm: Number(arm), res: Number(res), mana: Number(mana) },
    });
    expect(def?.boss).toBeUndefined();
  });

  it('신규 16종 모두 스킬 설명 텍스트가 데이터에 있고 보스 전용이 아니다', () => {
    const added = ['bear_warrior', 'shadow_panther', 'battle_chaplain', 'ember_smith', 'ember_bladedancer', 'rift_stalker', 'void_sniper', 'wind_hunter',
      'legion_centurion', 'siege_bombardier', 'magma_champion', 'abyss_sentinel', 'void_hierophant', 'volcano_oracle', 'muhon', 'elder_treeking'];
    for (const id of added) {
      const def = units.get(id);
      expect(def?.skill.text.length, id).toBeGreaterThan(10);
      expect(def?.boss, id).toBeUndefined();
    }
  });
});

/** 마지막 skillCast가 일어난 시각 (cast() 직후 world.now는 한 틱 뒤다) */
const castTimeOf = (sim: CombatSimulator): number => eventsOf(sim, 'skillCast').at(-1)?.t ?? -1;

/** 스킬을 한 번 쓰게 한다: 마나를 채우고 skillCast가 나올 때까지 진행 */
function cast(sim: CombatSimulator, uid: number, maxTicks = 30): void {
  const before = eventsOf(sim, 'skillCast').length;
  fillMana(sim, uid);
  expect(stepUntil(sim, () => eventsOf(sim, 'skillCast').length > before, maxTicks)).toBe(true);
}

const statuses = (sim: CombatSimulator, status: string) => eventsOf(sim, 'statusApplied').filter((e) => e.status === status);

describe('U14 곰 전사: 곰의 포효', () => {
  it('주변 1칸 적만 2초 도발하고 자신에게 보호막 200 (3성 500)', () => {
    const sim = makeSim([['bear_warrior', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 6, 0]]);
    cast(sim, 0);
    expect(statuses(sim, 'taunted').map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(statuses(sim, 'taunted')[0]).toMatchObject({ duration: 2 });
    expect(eventsOf(sim, 'shield').find((e) => e.unit === 0)).toMatchObject({ amount: 200, duration: 'combat' });
    const three = makeSim([['bear_warrior', 3, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    cast(three, 0);
    expect(eventsOf(three, 'shield').find((e) => e.unit === 0)?.amount).toBe(500);
  });
});

describe('U16 그림자표범: 덮치기', () => {
  it('가장 먼 적 옆으로 도약해 ATK 180% + 기절 1초', () => {
    const sim = makeSim([['shadow_panther', 1, 0, 0]], [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 7, 4]]);
    cast(sim, 0);
    expect(eventsOf(sim, 'skillCast')[0]).toMatchObject({ unit: 0, targets: [2] });
    const jump = eventsOf(sim, 'teleport')[0];
    expect(jump).toMatchObject({ unit: 0, from: { col: 0, row: 0 } });
    // 대상(7,4)에 인접한 빈 칸 중 시전자에서 가까운 쪽 열(6)로 착지한다
    expect(jump?.to.col).toBe(6);
    expect(Math.max(Math.abs((jump?.to.col ?? 0) - 7), Math.abs((jump?.to.row ?? 0) - 4))).toBe(1);
    const hit = eventsOf(sim, 'damage').find((e) => e.source === 0 && e.unit === 2);
    expect(hit?.amount).toBe(Math.round((64 * 1.8 * 100) / (100 + unitOf(sim, 2).stat('arm')))); // 강철군단 2종 ARM +15 포함
    expect(statuses(sim, 'stun').find((e) => e.unit === 2)).toMatchObject({ duration: 1 });
  });
});

describe('U17 전투 사제: 축복의 기도', () => {
  it('HP 비율이 가장 낮은 아군 2명을 200 회복하고 해로운 효과를 제거한다', () => {
    const sim = makeSim(
      [['battle_chaplain', 1, 3, 2], ['arena_recruit', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3], ['legion_crossbow', 1, 2, 2]],
      [['iron_shieldbearer', 1, 7, 0]],
    );
    unitOf(sim, 1).hp = 100; // 100/580
    unitOf(sim, 2).hp = 50; // 50/650 (가장 낮음)
    unitOf(sim, 3).hp = 300; // 300/450
    unitOf(sim, 2).statuses.addStun(sim.world.now + 5);
    unitOf(sim, 2).statuses.addTakenMult(1.3, sim.world.now + 5);
    cast(sim, 0);
    expect(eventsOf(sim, 'skillCast')[0]?.targets).toEqual([2, 1]);
    expect(eventsOf(sim, 'heal').filter((e) => e.source === 0).map((e) => [e.unit, e.amount]).sort()).toEqual([[1, 200], [2, 200]]);
    expect(unitOf(sim, 2).statuses.isStunned()).toBe(false);
    expect(unitOf(sim, 2).statuses.takenMultiplier()).toBe(1);
    expect(eventsOf(sim, 'statusRemoved').filter((e) => e.unit === 2).map((e) => e.status)).toEqual(expect.arrayContaining(['stun', 'damageTakenMult']));
    expect(unitOf(sim, 3).hp).toBe(300);
  });

  it('3성은 3명을 500 회복한다', () => {
    const sim = makeSim(
      [['battle_chaplain', 3, 3, 2], ['arena_recruit', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3]],
      [['iron_shieldbearer', 1, 7, 0]],
    );
    unitOf(sim, 1).hp = 10;
    unitOf(sim, 2).hp = 10;
    cast(sim, 0);
    expect(eventsOf(sim, 'skillCast')[0]?.targets).toHaveLength(3);
    expect(eventsOf(sim, 'heal').filter((e) => e.source === 0 && e.amount === 500).length).toBeGreaterThanOrEqual(2);
  });
});

describe('U18 잿불 대장장이: 담금질', () => {
  it('자신과 인접 아군 ATK +15%는 최대 2중첩, 자신 보호막 250', () => {
    const sim = makeSim(
      [['ember_smith', 1, 3, 2], ['arena_recruit', 1, 3, 3], ['legion_crossbow', 1, 0, 0]],
      [['iron_shieldbearer', 1, 7, 0]],
    );
    const baseSmith = unitOf(sim, 0).stat('atk');
    cast(sim, 0);
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(baseSmith * 1.15);
    expect(unitOf(sim, 1).stat('atk')).toBeCloseTo(52 * 1.15);
    expect(unitOf(sim, 2).stat('atk')).toBeCloseTo(50);
    expect(eventsOf(sim, 'shield').find((e) => e.unit === 0)).toMatchObject({ amount: 250, duration: 'combat' });
    cast(sim, 0);
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(baseSmith * 1.3);
    cast(sim, 0);
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(baseSmith * 1.3); // 3번째는 중첩되지 않는다
    expect(statuses(sim, 'statMod:atk').filter((e) => e.unit === 0)).toHaveLength(2);
  });
});

describe('U19 잿불 칼날무희: 불꽃 칼춤', () => {
  it('0.4초마다 5번 주변 1칸 적에게 마법 피해 50, 지속 중 물리 피해만 50% 감소', () => {
    const sim = makeSim([['ember_bladedancer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 7, 4]]);
    unitOf(sim, 2).statuses.addStun(100); // 먼 적이 다가오지 않게 묶어 둔다
    cast(sim, 0);
    const castTime = castTimeOf(sim);
    // 지속 중: 물리 피해는 절반, 마법 피해는 그대로
    const dancer = unitOf(sim, 0);
    sim.world.dealDamage({ source: null, target: dancer, raw: 100, type: 'physical' });
    sim.world.dealDamage({ source: null, target: dancer, raw: 100, type: 'magic' });
    const mine = eventsOf(sim, 'damage').filter((e) => e.unit === 0 && e.source === null);
    expect(mine[0]?.amount).toBe(Math.round((100 * 0.5 * 100) / 120)); // ARM 20
    expect(mine[1]?.amount).toBe(Math.round((100 * 100) / 120)); // RES 20
    stepTicks(sim, 40);
    const pulses = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.unit === 1 && e.dmgType === 'magic');
    expect(pulses).toHaveLength(5);
    expect(pulses.every((e) => e.amount === Math.round((50 * 100) / 120))).toBe(true); // RES 20
    expect(pulses[0]?.t).toBeCloseTo(castTime + 0.4);
    expect(pulses[4]?.t).toBeCloseTo(castTime + 2.0);
    expect(eventsOf(sim, 'damage').some((e) => e.unit === 2 && e.source === 0 && e.dmgType === 'magic')).toBe(false); // 멀리 있는 적은 제외
    // 2초가 지나면 물리 피해 감소도 끝난다
    expect(unitOf(sim, 0).statuses.takenMultiplier('physical')).toBe(1);
  });
});

describe('U20 균열 추적자: 균열 도약', () => {
  it('적 후열로 순간이동하고 다음 공격이 ATK 300%, 처치하면 마나 50% 회복', () => {
    const sim = makeSim([['rift_stalker', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 6, 2]]);
    cast(sim, 0);
    expect(eventsOf(sim, 'teleport')[0]).toMatchObject({ unit: 0, to: { col: 7, row: 2 } });
    expect(statuses(sim, 'empoweredAttack')).toHaveLength(1);
    expect(stepUntil(sim, () => eventsOf(sim, 'attack').some((e) => e.unit === 0), 30)).toBe(true);
    const first = eventsOf(sim, 'damage').find((e) => e.source === 0);
    const target = unitOf(sim, first?.unit ?? -1);
    expect(first?.amount).toBe(Math.round((75 * 3 * 100) / (100 + target.stat('arm')))); // 강철군단 2종 ARM +15 포함
    expect(eventsOf(sim, 'statusRemoved').some((e) => e.unit === 0 && e.status === 'empoweredAttack')).toBe(true);
    stepTicks(sim, 15);
    const second = eventsOf(sim, 'damage').filter((e) => e.source === 0)[1];
    if (second) expect(second.amount).toBe(Math.round((75 * 100) / (100 + unitOf(sim, second.unit).stat('arm')))); // 평소 공격
  });

  it('그 공격으로 대상이 죽으면 최대 마나의 50%를 회복한다', () => {
    const sim = makeSim([['rift_stalker', 1, 3, 2]], [['legion_crossbow', 1, 6, 2]]);
    unitOf(sim, 1).hp = 20;
    unitOf(sim, 1).statuses.addStun(100); // 적이 반격해 마나를 주지 않게 한다
    cast(sim, 0);
    expect(stepUntil(sim, () => !unitOf(sim, 1).alive, 40)).toBe(true);
    // 공격 시 +10 후 처치 보상 65 × 50% = 32.5 (스킬 시전 직후 마나는 0)
    expect(unitOf(sim, 0).mana).toBeCloseTo(10 + 32.5);
  });
});

describe('U21 공허 저격수: 공허탄', () => {
  it('HP가 가장 많은 적에게 ARM을 무시하고 ATK 350% 물리 피해', () => {
    const sim = makeSim([['void_sniper', 1, 0, 2]], [['iron_shieldbearer', 1, 4, 2], ['legion_crossbow', 1, 6, 0], ['ember_kindler', 1, 7, 4]]);
    cast(sim, 0);
    expect(eventsOf(sim, 'skillCast')[0]).toMatchObject({ unit: 0, targets: [1] }); // 방패병 650이 최대
    const hit = eventsOf(sim, 'damage').find((e) => e.source === 0 && e.unit === 1);
    expect(hit?.amount).toBe(Math.round(85 * 3.5)); // ARM 40 무시
  });
});

describe('U22 바람 사냥꾼: 폭풍 화살', () => {
  it('부채꼴 직선은 5개이고 대상 방향이 가운데다', () => {
    const rays = fanRays({ col: 0, row: 2 }, { col: 4, row: 2 });
    expect(rays).toHaveLength(5);
    expect(rays[2]?.map((c) => c.row)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(rays[0]?.at(-1)?.row).toBeLessThan(2);
    expect(rays[4]?.at(-1)?.row).toBeGreaterThan(2);
    for (const ray of rays) expect(ray.every((c) => c.col >= 0 && c.col < 8 && c.row >= 0 && c.row < 5)).toBe(true);
  });

  it('화살마다 처음 맞는 적에게 ATK 70% 물리 피해, 맞은 적은 AS -20%를 한 번만 받는다', () => {
    const enemies: Placement[] = [['iron_shieldbearer', 1, 4, 0], ['iron_shieldbearer', 1, 4, 1], ['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 4, 4]];
    const sim = makeSim([['wind_hunter', 1, 1, 2]], enemies);
    cast(sim, 0);
    const arrows = eventsOf(sim, 'damage').filter((e) => e.source === 0);
    expect(arrows.length).toBeGreaterThanOrEqual(3);
    expect(arrows.length).toBeLessThanOrEqual(5);
    expect(arrows.every((e) => e.amount === Math.round((64 * 0.7 * 100) / 140))).toBe(true); // ARM 40
    const slowed = statuses(sim, 'statMod:as').filter((e) => e.value === -20);
    expect(slowed.every((e) => e.duration === 3)).toBe(true);
    expect(new Set(slowed.map((e) => e.unit)).size).toBe(slowed.length); // 한 적에게 한 번만
    expect(new Set(slowed.map((e) => e.unit))).toEqual(new Set(arrows.map((e) => e.unit)));
  });
});

describe('U23 군단 백인대장: 백인대 명령', () => {
  it('주변 2칸 아군(자신 포함) ATK +20%, 주변 2칸 적을 2초 도발', () => {
    const sim = makeSim(
      [['legion_centurion', 1, 3, 2], ['arena_recruit', 1, 3, 1], ['legion_crossbow', 1, 1, 2], ['iron_shieldbearer', 1, 0, 2]],
      [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 3], ['iron_shieldbearer', 1, 7, 4]],
    );
    cast(sim, 0);
    const buffed = statuses(sim, 'statMod:atk').filter((e) => e.value === 20);
    expect(buffed.map((e) => e.unit).sort()).toEqual([0, 1, 2]);
    expect(buffed.every((e) => e.duration === 5)).toBe(true);
    expect(statuses(sim, 'taunted').map((e) => e.unit).sort()).toEqual([4, 5]);
    expect(statuses(sim, 'taunted')[0]).toMatchObject({ duration: 2 });
  });
});

describe('U24 공성 포병: 포격', () => {
  // 범위는 시전 시점에 정해지므로, 적이 걸어 나가지 않게 모두 묶어 둔다
  const make = () => {
    const sim = makeSim(
      [['siege_bombardier', 1, 0, 2]],
      [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 5, 2], ['iron_shieldbearer', 1, 7, 0]],
    );
    for (const uid of [1, 2, 3, 4]) unitOf(sim, uid).statuses.addStun(100);
    return sim;
  };

  it('2초 예고 후 적이 가장 밀집한 3×3에 ATK 250% 물리 피해', () => {
    const sim = make();
    cast(sim, 0);
    const telegraph = eventsOf(sim, 'telegraph')[0];
    expect(telegraph).toMatchObject({ source: 0, pattern: 'skill', label: '포격' });
    expect(telegraph?.fireAt).toBeCloseTo(castTimeOf(sim) + 2);
    expect(telegraph?.cells).toHaveLength(9);
    expect(telegraph?.cells).toContainEqual({ col: 4, row: 2 });
    expect(eventsOf(sim, 'damage').some((e) => e.source === 0)).toBe(false); // 예고 중에는 피해 없음
    expect(stepUntil(sim, () => eventsOf(sim, 'strike').length > 0, 30)).toBe(true);
    expect(eventsOf(sim, 'strike')[0]).toMatchObject({ id: telegraph?.id, source: 0 });
    const hits = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.unit !== 0 && e.dmgType === 'physical' && e.t >= (telegraph?.fireAt ?? 0) - 1e-9);
    expect(hits.map((e) => e.unit).sort()).toEqual([1, 2, 3]);
    expect(hits[0]?.amount).toBe(Math.round((95 * 2.5 * 100) / 140));
    expect(unitOf(sim, 4).hp).toBe(650); // 멀리 있는 적은 맞지 않는다
  });

  it('시전자가 예고 중에 죽으면 발동하지 않고 취소 표시만 남는다', () => {
    const sim = makeSim(
      [['siege_bombardier', 1, 0, 2], ['iron_shieldbearer', 1, 0, 4]],
      [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 5, 2]],
    );
    cast(sim, 0);
    sim.world.dealDamage({ source: null, target: unitOf(sim, 0), raw: 99999, type: 'magic' });
    stepTicks(sim, 25);
    const strike = eventsOf(sim, 'strike')[0];
    expect(strike).toMatchObject({ cancelled: true });
    expect(eventsOf(sim, 'damage').filter((e) => e.source === 0)).toHaveLength(0);
  });
});

describe('U25 용암 챔피언: 용암 강타', () => {
  it('주변 1칸 적에게 마법 200 + 기절 1초 + 화상, 먼 적은 제외', () => {
    const sim = makeSim([['magma_champion', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 7, 0]]);
    cast(sim, 0);
    const magic = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic' && e.t === 0);
    expect(magic.map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(magic[0]?.amount).toBe(Math.round((200 * 100) / 120));
    expect(statuses(sim, 'stun').map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(statuses(sim, 'burn').map((e) => e.unit).sort()).toEqual([1, 2]);
  });
});

describe('U26 심연 감시자: 심연의 시선', () => {
  it('주변 2칸 적 3초 도발, 받는 피해 -40%, 받은 피해의 20% 반사 (반사는 다시 반사되지 않는다)', () => {
    const sim = makeSim([['abyss_sentinel', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 2], ['iron_shieldbearer', 1, 7, 4]]);
    cast(sim, 0);
    expect(statuses(sim, 'taunted').map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(statuses(sim, 'damageTakenMult')[0]).toMatchObject({ unit: 0, value: 0.6, duration: 3 });
    const sentinel = unitOf(sim, 0);
    const attacker = unitOf(sim, 1);
    const hpBefore = attacker.hp;
    const taken = sim.world.dealDamage({ source: attacker, target: sentinel, raw: 200, type: 'physical' });
    expect(taken).toBe(Math.round((200 * 0.6 * 100) / 155)); // ARM 55
    const reflected = eventsOf(sim, 'damage').filter((e) => e.unit === 1 && e.source === 0).at(-1);
    expect(reflected?.amount).toBe(Math.round(taken * 0.2)); // 방어 무시
    expect(attacker.hp).toBe(hpBefore - (reflected?.amount ?? 0));
    // 서로 반사하는 두 감시자도 무한히 되돌리지 않는다
    const a = makeSim([['abyss_sentinel', 1, 3, 2]], [['abyss_sentinel', 1, 4, 2]]);
    unitOf(a, 0).statuses.addReflect(20, 100);
    unitOf(a, 1).statuses.addReflect(20, 100);
    const before = eventsOf(a, 'damage').length;
    a.world.dealDamage({ source: unitOf(a, 0), target: unitOf(a, 1), raw: 500, type: 'physical' });
    expect(eventsOf(a, 'damage').length - before).toBe(2); // 맞은 피해 + 반사 1번
  });
});

describe('U27 공허 대사제: 공허 개방', () => {
  const caster = (cards: boolean) => {
    const a: Placement[] = [['void_hierophant', 1, 3, 2]];
    const b: Placement[] = [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 4, 3], ['iron_shieldbearer', 1, 7, 0]];
    return cards ? makeCardSim({ a, b, hand: [] }) : makeSim(a, b);
  };

  it('대상 중심 3×3 적에게 마법 150, CP +1은 시전 유닛당 전투 2회', () => {
    const sim = caster(true);
    sim.startCombat();
    const cp = () => eventsOf(sim, 'cp').filter((e) => e.reason === 'effect');
    cast(sim, 0);
    const magic = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic');
    expect(magic.map((e) => e.unit).sort()).toEqual([1, 2]);
    expect(magic[0]?.amount).toBe(Math.round((150 * 100) / 120)); // 방패병 RES 20
    expect(cp()).toHaveLength(1);
    cast(sim, 0);
    expect(cp()).toHaveLength(2);
    cast(sim, 0);
    expect(cp()).toHaveLength(2); // 3번째는 CP를 주지 않는다
    expect(cp().every((e) => e.delta === 1 && e.pool === 'combat')).toBe(true);
  });

  it('카드 시스템이 없는 전투에서는 CP 없이 피해만 준다', () => {
    const sim = caster(false);
    cast(sim, 0);
    expect(eventsOf(sim, 'cp')).toHaveLength(0);
    expect(eventsOf(sim, 'damage').some((e) => e.source === 0 && e.dmgType === 'magic')).toBe(true);
  });
});

describe('U28 화산 예언자: 대분화의 예언', () => {
  it('4초 예고 후 적 전체에 마법 300 + 화상', () => {
    const sim = makeSim([['volcano_oracle', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 0], ['iron_shieldbearer', 1, 7, 4]]);
    cast(sim, 0);
    const telegraph = eventsOf(sim, 'telegraph')[0];
    expect(telegraph?.cells).toHaveLength(20); // 적 진영 전체
    expect(telegraph?.fireAt).toBeCloseTo(castTimeOf(sim) + 4);
    expect(stepUntil(sim, () => eventsOf(sim, 'strike').length > 0, 60)).toBe(true);
    const hits = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.dmgType === 'magic' && e.t >= (telegraph?.fireAt ?? 0) - 1e-9);
    expect(hits.map((e) => e.unit).sort()).toEqual([1, 2, 3]);
    expect(hits[0]?.amount).toBe(Math.round((300 * 100) / 120)); // RES 20
    expect(statuses(sim, 'burn').map((e) => e.unit).sort()).toEqual([1, 2, 3]);
  });
});

describe('U29 무혼: 무명의 일섬', () => {
  it('직선상의 적을 모두 관통해 ATK 300% 피해, 처치 1명당 마나 30, 직선 끝으로 질주', () => {
    const sim = makeSim([['muhon', 1, 3, 2]], [['legion_crossbow', 1, 4, 2], ['legion_crossbow', 1, 5, 2], ['iron_shieldbearer', 1, 6, 2]]);
    unitOf(sim, 1).hp = 10;
    unitOf(sim, 2).hp = 10;
    cast(sim, 0);
    const hits = eventsOf(sim, 'damage').filter((e) => e.source === 0 && e.t === 0);
    expect(hits.map((e) => e.unit).sort()).toEqual([1, 2, 3]);
    expect(unitOf(sim, 1).alive).toBe(false);
    expect(unitOf(sim, 2).alive).toBe(false);
    expect(unitOf(sim, 3).hp).toBeLessThan(650);
    expect(unitOf(sim, 0).mana).toBeGreaterThanOrEqual(60);
    expect(eventsOf(sim, 'teleport').at(-1)).toMatchObject({ unit: 0, to: { col: 7, row: 2 } });
  });
});

describe('U30 태고의 수목왕: 태고의 숨결', () => {
  it('아군 전체 최대 HP 20% 보호막, 5초간 초당 2% 회복, 자신 3초 도발', () => {
    const sim = makeSim(
      [['elder_treeking', 1, 3, 2], ['arena_recruit', 1, 2, 2]],
      [['iron_shieldbearer', 1, 4, 2]],
    );
    unitOf(sim, 1).hp = 100;
    cast(sim, 0);
    const shields = eventsOf(sim, 'shield').filter((e) => e.duration === 'combat');
    expect(shields.map((e) => [e.unit, e.amount]).sort()).toEqual([[0, 300], [1, 116]]);
    expect(statuses(sim, 'taunted').map((e) => e.unit)).toEqual([2]);
    expect(statuses(sim, 'regen')).toHaveLength(2);
    const healed = (uid: number) => eventsOf(sim, 'heal').filter((e) => e.unit === uid && e.source === uid);
    stepTicks(sim, 55);
    expect(healed(1).length).toBe(5); // 5번(초당 1번)
    expect(healed(1)[0]?.amount).toBe(Math.round(580 * 0.02));
    stepTicks(sim, 30);
    expect(healed(1).length).toBe(5); // 5초가 지나면 멈춘다
  });
});
