import { describe, expect, it } from 'vitest';
import raw from '../../../data/units.json';
import { loadUnits } from '../../core/data/unitLoader';
import type { CombatEvent } from '../../core/combat/events';
import { ReplayState } from '../replay/ReplayState';
import { MODERN_UNITS } from '../skin/modernRoster';
import { COMBAT_FX } from '../theme';
import { attackProfile, buildCombatVisualFrame, impactTime, projectilePoint } from './combatVisuals';

const units = loadUnits(raw);
const resolve = (id: string) => attackProfile(units.get(id), 'modern');
function fixture(from = 0, to = 4) {
  const events: CombatEvent[] = [
    { type: 'spawn', t: 0, unit: 0, unitId: 'legion_crossbow', side: 0, star: 1, cell: { col: from, row: 1 }, hp: 100, maxHp: 100, mana: 0, maxMana: 50 },
    { type: 'spawn', t: 0, unit: 1, unitId: 'iron_shieldbearer', side: 1, star: 1, cell: { col: to, row: 1 }, hp: 100, maxHp: 100, mana: 0, maxMana: 50 },
    { type: 'attack', t: 1, unit: 0, target: 1, shots: 1 },
    { type: 'damage', t: 1, unit: 1, source: 0, amount: 15, absorbed: 0, hp: 85, dmgType: 'physical' },
  ];
  const replay = new ReplayState(events); replay.advanceTo(1.02);
  return { events, effects: replay.recentEffects(2.5), views: new Map(replay.views().map(v => [v.uid, v])) };
}

describe('현대전 사격 표시', () => {
  it('30명의 무기를 설정과 동일하게 표시하고 기본 스킨 표현을 유지한다', () => {
    for (const row of Object.values(MODERN_UNITS)) {
      const p = resolve(row.id);
      expect(p.modern).toBe(true); expect(p.style).toBe(row.weapon === 'blade' ? 'slash' : row.weapon);
      expect(p.ranged).toBe(row.weapon !== 'blade'); expect(p.burst).toBeGreaterThan(0);
    }
    expect(attackProfile(units.get('legion_crossbow'), 'academy').style).toBe('arrow');
    expect(resolve('legion_crossbow').style).toBe('rifle');
    expect(resolve('siege_bombardier').style).toBe('rocket');
  });

  it('점사 마지막 탄의 착탄에 맞춰 피격을 표시하며 코어 이벤트와 HP를 수정하지 않는다', () => {
    const { events, effects, views } = fixture();
    const before = JSON.stringify({ events, views: [...views] });
    const p = resolve('legion_crossbow'); const delay = impactTime(p, { col: 0, row: 1 }, { col: 4, row: 1 });
    expect(delay).toBeGreaterThan(COMBAT_FX.WINDUP + COMBAT_FX.BURST_INTERVAL);
    const early = buildCombatVisualFrame(1.02, effects, views, resolve);
    expect(early.hits).toHaveLength(0);
    const hit = buildCombatVisualFrame(1 + delay + 0.01, effects, views, resolve);
    expect(hit.hits).toHaveLength(1); expect(hit.damageAges.get(3)).toBeCloseTo(0.01);
    expect(JSON.stringify({ events, views: [...views] })).toBe(before);
  });

  it('좌우 사격 방향·정지·간결 모드에도 같은 재생 시각과 착탄 위치를 유지한다', () => {
    const { effects, views } = fixture(5, 1);
    const time = 1 + COMBAT_FX.WINDUP + 0.01;
    const frame = buildCombatVisualFrame(time, effects, views, resolve);
    expect(frame.poses.get(0)?.facing).toBe(-1); expect(frame.poses.get(0)!.x).toBeGreaterThan(0);
    expect(buildCombatVisualFrame(time, effects, views, resolve)).toEqual(frame);
    const reduced = buildCombatVisualFrame(time, effects, views, resolve, true);
    expect(reduced.attacks).toEqual(frame.attacks); expect(reduced.damageAges).toEqual(frame.damageAges);
    expect(reduced.poses.get(0)?.x).toBe(0); expect(reduced.poses.get(0)?.facing).toBe(-1);
  });

  it('유탄은 곡사, 로켓은 직사이며 정확한 출발·도착 지점을 쓴다', () => {
    const { effects, views } = fixture();
    for (const id of ['ember_kindler', 'siege_bombardier']) {
      const shot = buildCombatVisualFrame(1.02, effects, views, () => resolve(id)).attacks[0]!;
      expect(projectilePoint(shot, 0)).toEqual(shot.from); expect(projectilePoint(shot, 1)).toEqual(shot.to);
      if (id === 'ember_kindler') expect(projectilePoint(shot, 0.5).row).toBeLessThan(1);
      else expect(projectilePoint(shot, 0.5).row).toBe(1);
    }
  });
});
