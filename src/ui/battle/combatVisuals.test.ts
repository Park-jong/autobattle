import { describe, expect, it } from 'vitest';
import unitsJson from '../../../data/units.json';
import { loadUnits } from '../../core/data/unitLoader';
import type { CombatEvent } from '../../core/combat/events';
import { ReplayState } from '../replay/ReplayState';
import { attackProfile, buildCombatVisualFrame, damageLabels, projectilePoint } from './combatVisuals';

const units = loadUnits(unitsJson);
const resolve = (id: string) => attackProfile(units.get(id));
const spawn = (unit: number, col: number): CombatEvent => ({ type: 'spawn', t: 0, unit,
  unitId: unit === 0 ? 'grove_archer' : 'iron_shieldbearer', side: unit === 0 ? 0 : 1,
  star: 1, cell: { col, row: 1 }, hp: 100, maxHp: 100, mana: 0, maxMana: 50 });

function fixture(time: number) {
  const replay = new ReplayState([spawn(0, 0), spawn(1, 4),
    { type: 'attack', t: 1, unit: 0, target: 1, shots: 2 },
    { type: 'damage', t: 1, unit: 1, source: 0, amount: 15, absorbed: 5, hp: 90, dmgType: 'physical' },
    { type: 'moveStart', t: 1.1, unit: 1, from: { col: 4, row: 1 }, to: { col: 5, row: 1 }, duration: 1 },
  ]);
  replay.advanceTo(time);
  const effects = replay.recentEffects(2.5), views = new Map(replay.views().map(v => [v.uid, v]));
  return { replay, effects, views };
}

describe('전투 연출 시간과 원화 모션', () => {
  it('동시 연타 숫자는 합치되 보호막·치명타는 구별하며 실제 HP 피해만 표시한다', () => {
    const { effects, views } = fixture(1.4);
    const extended = [...effects,
      { kind: 'damage', seq: 8, t: 1, unit: 1, source: 0, amount: 20, absorbed: 10, dmgType: 'physical' } as const,
      { kind: 'damage', seq: 9, t: 1, unit: 1, source: 0, amount: 30, absorbed: 0, dmgType: 'physical', crit: true } as const,
    ];
    const frame = buildCombatVisualFrame(1.4, extended, views, resolve);
    const labels = damageLabels(1.4, extended, frame);
    expect(labels).toHaveLength(2);
    expect(labels.find(l => !l.crit)).toMatchObject({ amount: 20, absorbed: 15 });
    expect(labels.find(l => l.crit)).toMatchObject({ amount: 30, absorbed: 0 });
  });
  it('실제 유닛 데이터의 근접·암살·활·화염·마력·포탄을 구분한다', () => {
    expect(resolve('iron_shieldbearer').style).toBe('slash');
    expect(resolve('shade_dagger').style).toBe('claw');
    expect(resolve('grove_archer').style).toBe('arrow');
    expect(resolve('ember_kindler').style).toBe('ember');
    expect(resolve('abyss_whisperer').style).toBe('orb');
    expect(resolve('siege_bombardier').style).toBe('shell');
  });

  it('투사체 착탄 전에는 피해 숫자·피격 반동을 보류하고 착탄 때 함께 보여 준다', () => {
    const { effects, views } = fixture(1.02);
    const early = buildCombatVisualFrame(1.02, effects, views, resolve);
    expect(early.attacks).toHaveLength(1);
    expect(early.hits).toHaveLength(0);
    expect(early.damageAges.get(3)).toBeLessThan(0);
    const impact = early.attacks[0]!.impactAt;
    const hit = buildCombatVisualFrame(1 + impact + 0.01, effects, views, resolve);
    expect(hit.hits).toHaveLength(1);
    expect(hit.poses.get(1)?.flash).toBe(true);
    expect(hit.damageAges.get(3)).toBeCloseTo(0.01);
  });

  it('이동하는 대상의 착탄 좌표는 발사 시점에 고정하고 코어 위치는 건드리지 않는다', () => {
    const { effects, views } = fixture(1.25);
    const before = JSON.stringify([...views.values()]);
    const frame = buildCombatVisualFrame(1.25, effects, views, resolve);
    expect(frame.attacks[0]?.to).toEqual({ col: 4, row: 1 });
    expect(views.get(1)?.pos.col).toBeGreaterThan(4);
    expect(JSON.stringify([...views.values()])).toBe(before);
  });

  it('같은 재생 시각이면 반복 호출해도 모습이 같고, 종료 뒤에는 연출이 남지 않는다', () => {
    const { effects, views } = fixture(1.2);
    expect(buildCombatVisualFrame(1.2, effects, views, resolve)).toEqual(buildCombatVisualFrame(1.2, effects, views, resolve));
    const end = buildCombatVisualFrame(4, effects, views, resolve);
    expect(end.attacks).toHaveLength(0);
    expect(end.hits).toHaveLength(0);
  });

  it('간결 연출은 반동·섬광·회전을 없애도 투사체와 명중 시각은 유지한다', () => {
    const { effects, views } = fixture(1.25);
    const full = buildCombatVisualFrame(1.25, effects, views, resolve);
    const reduced = buildCombatVisualFrame(1.25, effects, views, resolve, true);
    expect(reduced.attacks).toEqual(full.attacks);
    expect(reduced.damageAges).toEqual(full.damageAges);
    for (const pose of reduced.poses.values()) expect(pose).toEqual({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, flash: false, hurt: false });
  });

  it('포탄은 가운데에서 위로 솟고 출발·도착 좌표에 정확히 닿는다', () => {
    const { effects, views } = fixture(1.2);
    const frame = buildCombatVisualFrame(1.2, effects, views, () => resolve('siege_bombardier'));
    const shot = frame.attacks[0]!;
    expect(projectilePoint(shot, 0)).toEqual(shot.from);
    expect(projectilePoint(shot, 1)).toEqual(shot.to);
    expect(projectilePoint(shot, 0.5).row).toBeLessThan(shot.from.row);
  });
});
