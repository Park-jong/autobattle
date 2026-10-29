import { describe, expect, it } from 'vitest';
import { EffectValidator } from './effectValidator';
import { assertEffectsUsable } from './effectUsage';
import { FieldReader } from './fieldReader';
import { resolveEffect, type EffectDef } from './effect';

const validate = (raw: unknown, options?: { allowStarArrays: boolean }) =>
  new EffectValidator(options).validateEffect(FieldReader.of(raw, 'effects[0]'));
const error = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('오류가 나야 함');
};

describe('M5-4 새 효과 검증', () => {
  it('유효한 새 효과는 그대로 읽힌다', () => {
    expect(validate({ kind: 'flatShield', selector: 'self', amount: [200, 300, 500], duration: 'combat' })).toMatchObject({ amount: [200, 300, 500] });
    expect(validate({ kind: 'damageAura', selector: 'self', amount: 50, dmgType: 'magic', radius: 1, intervalSeconds: 0.4, count: 5 })).toMatchObject({ count: 5 });
    expect(validate({ kind: 'critical', selector: 'traitUnits', chance: [0.15, 0.35, 0.5], damagePct: 150 })).toMatchObject({ damagePct: 150 });
    expect(validate({ kind: 'statMod', selector: 'alliesAroundSelf', selectorRadius: 2, stat: 'atk', pct: 20, duration: 5, maxStacks: 2 })).toMatchObject({ selectorRadius: 2, maxStacks: 2 });
    expect(validate({ kind: 'damageTakenMult', selector: 'self', mult: 0.5, dmgType: 'physical', duration: 2 })).toMatchObject({ dmgType: 'physical' });
    expect(validate({ kind: 'teleport', selector: 'self', destination: 'enemyBackRow' })).toMatchObject({ destination: 'enemyBackRow' });
  });

  it('잘못된 값은 경로가 담긴 한국어 오류를 낸다', () => {
    expect(error(() => validate({ kind: 'critical', selector: 'traitUnits', chance: [0.15, 1.5, 0.5], damagePct: 150 }))).toContain('effects[0].chance: 0~1 확률이어야 함');
    expect(error(() => validate({ kind: 'flatShield', selector: 'self', amount: 0, duration: 3 }))).toContain('effects[0].amount: 1 이상');
    expect(error(() => validate({ kind: 'flatShield', selector: 'self', amount: 5, duration: 3, extra: 1 }))).toContain('effects[0].extra: 알 수 없는 필드');
    expect(error(() => validate({ kind: 'teleport', selector: 'self', destination: 'nowhere' }))).toContain('effects[0].destination: 알 수 없는 값');
    expect(error(() => validate({ kind: 'cleanse', selector: 'everyone' }))).toContain('effects[0].selector: 알 수 없는 값');
    expect(error(() => validate({ kind: 'stackingStatMod', selector: 'allAllies', stat: 'as', pct: 5, intervalSeconds: 3 }))).toContain('effects[0].maxStacks: 필수 필드 누락');
  });

  it('selectorRadius는 반경 선택자에서만 쓸 수 있다', () => {
    expect(error(() => validate({ kind: 'cleanse', selector: 'self', selectorRadius: 2 }))).toContain('effects[0].selectorRadius: selector self에서는 쓸 수 없음');
    expect(error(() => validate({ kind: 'cleanse', selector: 'alliesAroundSelf', selectorRadius: 0 }))).toContain('selectorRadius');
  });

  it('지연 타격: selector는 self, 효과 1개 이상, 중첩 금지, 중첩 효과도 검증', () => {
    const base = { kind: 'delayedStrike', selector: 'self', delay: 2, area: 'densestEnemies3x3' };
    const inner = { kind: 'damage', selector: 'enemiesInTargetArea', pctAtk: [250, 300, 400], dmgType: 'physical' };
    expect(validate({ ...base, effects: [inner] })).toMatchObject({ effects: [{ kind: 'damage' }] });
    expect(error(() => validate({ ...base, selector: 'target', effects: [inner] }))).toContain('delayedStrike는 selector가 self여야 함');
    expect(error(() => validate({ ...base, effects: [] }))).toContain('효과가 최소 1개 필요함');
    expect(error(() => validate({ ...base, effects: [{ ...base, effects: [inner] }] }))).toContain('effects[0].effects[0].kind: 지연 타격 안에 지연 타격을 중첩할 수 없음');
    expect(error(() => validate({ ...base, effects: [{ ...inner, dmgType: 'fire' }] }))).toContain('effects[0].effects[0].dmgType');
    expect(error(() => validate({ ...base, area: 'everywhere', effects: [inner] }))).toContain('effects[0].area');
  });

  it('성급 배열은 중첩 효과 안에서도 성급 인덱스로 확정된다', () => {
    const def = validate({ kind: 'delayedStrike', selector: 'self', delay: 2, area: 'allEnemies', effects: [{ kind: 'flatDamage', selector: 'allEnemies', amount: [300, 450, 1200], dmgType: 'magic' }] });
    const star3 = resolveEffect(def, 2);
    expect(star3).toMatchObject({ kind: 'delayedStrike', delay: 2, effects: [{ amount: 1200 }] });
  });

  it('카드·패시브에서는 스킬 전용/특성 전용 효과와 시전자 선택자를 거부한다', () => {
    const container = FieldReader.of({}, 'card');
    const check = (effect: EffectDef) => error(() => assertEffectsUsable(container, 'effects', [effect], { targetKind: 'none' }));
    expect(check({ kind: 'damageAura', selector: 'allAllies', amount: 1, dmgType: 'magic', radius: 1, intervalSeconds: 1, count: 1 })).toContain('스킬 전용');
    expect(check({ kind: 'delayedStrike', selector: 'allAllies', delay: 1, area: 'allEnemies', effects: [] })).toContain('스킬 전용');
    expect(check({ kind: 'critical', selector: 'allAllies', chance: 0.1, damagePct: 150 })).toContain('특성 전용');
    expect(check({ kind: 'backRowLeap', selector: 'allAllies' })).toContain('특성 전용');
    expect(check({ kind: 'cleanse', selector: 'alliesAroundSelf' })).toContain('시전 유닛이 있는 스킬 전용 선택자');
    expect(check({ kind: 'cleanse', selector: 'fanTargets' })).toContain('시전 유닛이 있는 스킬 전용 선택자');
    // 시전자가 필요 없는 새 효과는 카드에서도 쓸 수 있다
    expect(() => assertEffectsUsable(container, 'effects', [{ kind: 'cleanse', selector: 'allAllies' }, { kind: 'flatShield', selector: 'allAllies', amount: 100, duration: 3 }], { targetKind: 'none' })).not.toThrow();
  });
});
