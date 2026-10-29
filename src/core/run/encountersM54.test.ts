import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import encountersJson from '../../../data/encounters.json';
import { runDeps } from './testSupport';

type Raw = { id: string; kind: string; minFloor: number; maxFloor: number; units: { unitId: string; star: number; col: number; row: number }[] };
const encounters = encountersJson.encounters as Raw[];
const sha1 = (list: Raw[]) => createHash('sha1').update(JSON.stringify(list)).digest('hex');
const NEW_UNITS = new Set(['bear_warrior', 'shadow_panther', 'battle_chaplain', 'ember_smith', 'ember_bladedancer', 'rift_stalker', 'void_sniper', 'wind_hunter',
  'legion_centurion', 'siege_bombardier', 'magma_champion', 'abyss_sentinel', 'void_hierophant', 'volcano_oracle', 'muhon', 'elder_treeking']);
const defOf = (id: string) => runDeps.units.get(id)!;

describe('적 편성 재구성 (M5-4)', () => {
  it('액트 1 편성과 보스 편성(보스 유닛·호위)은 바뀌지 않았다 (4b33a11과 같은 내용)', () => {
    expect(sha1(encounters.filter((e) => e.maxFloor <= 13))).toBe('80223682c4a14629bb0b5b90b566a4825fe58cb4');
    expect(sha1(encounters.filter((e) => e.kind === 'boss'))).toBe('5b4b239bd652a9aaf7fe6df9ad3826d3f5928773');
  });

  it('액트 2는 일반 8·정예 3, 액트 3은 일반 8·정예 3이고 층 범위는 그대로다 (loadRunDeps 층 커버리지 통과)', () => {
    const act = (min: number, max: number) => encounters.filter((e) => e.minFloor >= min && e.maxFloor <= max && e.kind !== 'boss');
    expect(act(14, 26).filter((e) => e.kind === 'normal')).toHaveLength(8);
    expect(act(14, 26).filter((e) => e.kind === 'elite')).toHaveLength(3);
    expect(act(27, 39).filter((e) => e.kind === 'normal')).toHaveLength(8);
    expect(act(27, 39).filter((e) => e.kind === 'elite')).toHaveLength(3);
    expect(runDeps.encounters.encounters.length).toBe(encounters.length);
  });

  it('액트 2는 잿불·주술사 중심, 액트 3은 강철군단·심연 중심이며 신규 유닛이 쓰인다', () => {
    const second = encounters.filter((e) => e.minFloor >= 14 && e.maxFloor <= 26 && e.kind !== 'boss');
    const third = encounters.filter((e) => e.minFloor >= 27 && e.maxFloor <= 39 && e.kind !== 'boss');
    const themed = (e: Raw, origins: string[], jobs: string[]) =>
      e.units.filter((u) => origins.includes(defOf(u.unitId).origin) || jobs.includes(defOf(u.unitId).job)).length;
    // 변화를 주려고 숲 편성(highland_hunters) 하나만 테마 밖이다
    expect(second.filter((e) => themed(e, ['ember'], ['mystic']) >= 3).map((e) => e.id).sort()).toEqual(second.map((e) => e.id).filter((id) => id !== 'highland_hunters').sort());
    for (const e of third) expect(themed(e, ['iron_legion', 'abyss'], []), e.id).toBeGreaterThanOrEqual(3);
    for (const group of [second, third]) {
      const newUnitCount = group.filter((e) => e.units.some((u) => NEW_UNITS.has(u.unitId))).length;
      expect(newUnitCount).toBeGreaterThanOrEqual(group.length - 1); // 거의 모든 편성에 신규 유닛이 들어간다
      expect(new Set(group.flatMap((e) => e.units.map((u) => u.unitId)).filter((id) => NEW_UNITS.has(id))).size).toBeGreaterThanOrEqual(8);
    }
  });

  it('난이도 목표: 액트 2·3 편성의 대략적인 전력(유닛 전력 합)이 이전 편성과 비슷한 범위에 있다', () => {
    // 전력 지표: 성급 배율 × sqrt(ATK·AS·HP·(1 + (ARM+RES)/200)). 정밀 밸런스가 아니라 극단값을 막는 안전망이다
    const mult = [1, 1.8, 3.2];
    const power = (e: Raw) => e.units.reduce((sum, u) => {
      const s = defOf(u.unitId).stats;
      return sum + (mult[u.star - 1] ?? 1) * Math.sqrt(s.atk * s.as * s.hp * (1 + (s.arm + s.res) / 200));
    }, 0);
    const bands: Record<string, [number, number]> = {
      ash_vanguard: [754, 0.15], cinder_ritualists: [593, 0.15], highland_hunters: [884, 0.15], pyre_guards: [1106, 0.15], ash_walkers: [827, 0.15],
      scorched_pilgrims: [1115, 0.15], ember_phalanx: [1118, 0.15], twin_acolytes: [1429, 0.15], elite_ember_pyre: [1404, 0.15], elite_ash_wardens: [1442, 0.15],
      elite_cinder_blades: [1758, 0.15], fallen_sentries: [1205, 0.15], rift_stalkers: [1371, 0.15], legion_remnants: [1315, 0.15], abyssal_pack: [1270, 0.15],
      iron_vanguard: [1750, 0.15], ruined_court: [1706, 0.15], hollow_legion: [2393, 0.15], capital_garrison: [2264, 0.15], elite_legion_wall: [2033, 0.15],
      elite_abyss_court: [1838, 0.15], elite_oathbreakers: [2052, 0.15],
    };
    for (const [id, [before, tolerance]] of Object.entries(bands)) {
      const e = encounters.find((x) => x.id === id)!;
      expect(Math.abs(power(e) / before - 1), id).toBeLessThanOrEqual(tolerance);
    }
  });
});
