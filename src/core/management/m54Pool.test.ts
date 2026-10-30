import { describe, expect, it } from 'vitest';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { loadTraits, loadUnits } from '../data';
import { Economy } from '../economy';
import { Rng } from '../rng';
import { LEVEL_ODDS, MANAGEMENT, Management, rollShopTier } from './management';

const units = loadUnits(unitsJson, loadTraits(traitsJson));
const shopUnits = units.units.filter((u) => !u.boss);

describe('M5-4 상점 유닛 풀 (30종)', () => {
  it('등급별 유닛 수는 8/8/6/5/3이고 풀 개수는 18/16/14/10/9이다', () => {
    expect([1, 2, 3, 4, 5].map((tier) => shopUnits.filter((u) => u.tier === tier).length)).toEqual([8, 8, 6, 5, 3]);
    expect(MANAGEMENT.POOL_COPIES).toEqual({ 1: 18, 2: 16, 3: 14, 4: 10, 5: 9 });
    const manager = new Management(units, new Economy(100), new Rng(1));
    const pool = manager.snapshot().pool;
    expect(Object.keys(pool).sort()).toEqual(shopUnits.map((u) => u.id).sort());
    for (const unit of shopUnits) expect((pool[unit.id] ?? 0) + manager.snapshot().offers.filter((o) => o?.unitId === unit.id).length).toBe(MANAGEMENT.POOL_COPIES[unit.tier]);
  });

  it('보스 전용 유닛은 풀·진열에 나오지 않는다', () => {
    const manager = new Management(units, new Economy(100000), new Rng(2));
    for (let i = 0; i < 300; i++) {
      manager.reroll();
      for (const offer of manager.snapshot().offers) expect(units.get(offer?.unitId ?? 'iron_shieldbearer')?.boss).toBeUndefined();
    }
    for (const boss of units.units.filter((u) => u.boss)) expect(manager.snapshot().pool).not.toHaveProperty(boss.id);
  });

  it.each([7, 8, 9])('레벨 %i: 3~5등급이 확률표대로 등장하고 신규 유닛이 섞인다', (level) => {
    const economy = new Economy(10_000_000);
    const manager = new Management(units, economy, new Rng(40 + level));
    expect(manager.setLevel(level).ok).toBe(true);
    const counts = [0, 0, 0, 0, 0];
    const seen = new Set<string>();
    const rolls = 6000;
    for (let i = 0; i < rolls; i++) {
      manager.reroll();
      for (const offer of manager.snapshot().offers) {
        if (!offer) continue;
        counts[offer.tier - 1] = (counts[offer.tier - 1] ?? 0) + 1;
        seen.add(offer.unitId);
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    const odds = LEVEL_ODDS[level] ?? [];
    // 풀이 줄어들지 않도록 매번 진열을 되돌리므로 확률표와 거의 같다 (등급 풀이 비지 않음)
    counts.forEach((count, i) => expect(Math.abs((count / total) * 100 - (odds[i] ?? 0))).toBeLessThan(1.5));
    for (const id of ['legion_centurion', 'abyss_sentinel', 'volcano_oracle', 'muhon', 'elder_treeking', 'wind_hunter']) expect(seen.has(id)).toBe(true);
  });

  it('등급 확률 재정규화: 데이터에 없는 등급은 빼고 나머지로 나눈다', () => {
    const rng = new Rng(9);
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) {
      const index = (rollShopTier(5, rng, [1, 2, 3, 5]) ?? 1) - 1;
      counts[index] = (counts[index] ?? 0) + 1;
    }
    expect(counts[3]).toBe(0); // 4등급 없음
    const rest = 40 + 35 + 22 + 0; // 레벨 5: 5등급 확률은 0
    expect(Math.abs((counts[0] ?? 0) / 40000 - 40 / rest)).toBeLessThan(0.02);
    expect(counts[4]).toBe(0);
  });
});
