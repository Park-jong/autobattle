import { describe, expect, it } from 'vitest';
import { CommanderHealth, defeatDamage } from './commanderHealth';

describe('패배 피해 공식: ceil((2 + 생존 적 등급 합 + floor(층/3)) × 배율)', () => {
  it('일반 전투: 층 보정은 3층마다 1', () => {
    expect(defeatDamage({ survivorTierSum: 0, floor: 1, kind: 'normal' })).toBe(2);
    expect(defeatDamage({ survivorTierSum: 3, floor: 1, kind: 'normal' })).toBe(5);
    expect(defeatDamage({ survivorTierSum: 3, floor: 2, kind: 'normal' })).toBe(5);
    expect(defeatDamage({ survivorTierSum: 3, floor: 3, kind: 'normal' })).toBe(6);
    expect(defeatDamage({ survivorTierSum: 4, floor: 11, kind: 'normal' })).toBe(2 + 4 + 3);
  });

  it('정예 ×1.5는 올림, 보스 ×2', () => {
    expect(defeatDamage({ survivorTierSum: 3, floor: 4, kind: 'elite' })).toBe(Math.ceil((2 + 3 + 1) * 1.5)); // 9
    expect(defeatDamage({ survivorTierSum: 2, floor: 4, kind: 'elite' })).toBe(Math.ceil((2 + 2 + 1) * 1.5)); // 7.5 → 8
    expect(defeatDamage({ survivorTierSum: 2, floor: 3, kind: 'elite' })).toBe(Math.ceil((2 + 2 + 1) * 1.5));
    expect(defeatDamage({ survivorTierSum: 5, floor: 13, kind: 'boss' })).toBe((2 + 5 + 4) * 2); // 22
  });
});

describe('지휘관 HP', () => {
  it('피해는 0 미만으로 내려가지 않고 0이면 사망이다', () => {
    const hp = new CommanderHealth(80);
    expect(hp.damage(30)).toBe(30);
    expect(hp.hp).toBe(50);
    expect(hp.damage(100)).toBe(50);
    expect(hp.hp).toBe(0);
    expect(hp.dead).toBe(true);
  });

  it('회복은 최대치까지만, 이벤트 피해는 사망시키지 않는다', () => {
    const hp = new CommanderHealth(80, 70);
    expect(hp.heal(24)).toBe(10);
    expect(hp.hp).toBe(80);
    expect(hp.damageNonLethal(500)).toBe(79);
    expect(hp.hp).toBe(1);
    expect(hp.dead).toBe(false);
  });

  it('잘못된 값은 거부하고 저장/복원이 된다', () => {
    expect(() => new CommanderHealth(0)).toThrow();
    expect(() => new CommanderHealth(10, 11)).toThrow();
    expect(() => new CommanderHealth(10).damage(-1)).toThrow();
    const restored = CommanderHealth.restore(new CommanderHealth(80, 33).serialize(), 'health');
    expect(restored.hp).toBe(33);
    expect(restored.max).toBe(80);
    expect(() => CommanderHealth.restore({ hp: 90, maxHp: 80 }, 'health')).toThrow(/health\.hp/);
  });
});
