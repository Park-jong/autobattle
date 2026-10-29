import { describe, expect, it } from 'vitest';
import { fixtureCard, fixtureCatalog } from '../cards/testSupport';
import { assertCardUnitReferences } from '../cards';
import { EffectValidator } from './effectValidator';
import { FieldReader } from './fieldReader';
import { units } from '../combat/testSupport';

/** M5-4 2부-A 새 효과·카드 필드의 검증기 거부/허용 사례 */

const errorOf = (card: Record<string, unknown>): string => {
  try { fixtureCatalog([card]); } catch (e) { return (e as Error).message; }
  throw new Error('에러가 발생해야 함');
};
const ok = (card: Record<string, unknown>): void => { expect(() => fixtureCatalog([card])).not.toThrow(); };
const withEffects = (effects: unknown[], extra: Record<string, unknown> = {}) => fixtureCard('x', { effects, ...extra });

/** 스킬·특성처럼 카드 전용 효과가 허용되지 않는 검증기 */
function skillError(effect: Record<string, unknown>): string {
  const root = FieldReader.of({ effects: [effect] }, 'unit');
  try { new EffectValidator({ allowStarArrays: true }).validateList(root, 'effects'); } catch (e) { return (e as Error).message; }
  throw new Error('에러가 발생해야 함');
}

describe('새 카드 전용 효과는 스킬·특성에서 거부', () => {
  it.each([
    [{ kind: 'handCostCut', selector: 'allAllies', amount: 1 }, 'handCostCut'],
    [{ kind: 'spellDamageBoost', selector: 'allAllies', pct: 20 }, 'spellDamageBoost'],
    [{ kind: 'ultimateGain', selector: 'allAllies', amount: 10 }, 'ultimateGain'],
    [{ kind: 'startCp', selector: 'allAllies', amount: 1 }, 'startCp'],
    [{ kind: 'commanderHeal', selector: 'allAllies', amount: 1 }, 'commanderHeal'],
    [{ kind: 'damageZone', selector: 'enemiesInTargetArea', amount: 1, dmgType: 'magic', duration: 5, intervalSeconds: 1 }, 'damageZone'],
    [{ kind: 'reviveOnce', selector: 'self', hpPct: 40 }, 'reviveOnce'],
    [{ kind: 'summon', selector: 'allAllies', count: 1, unitId: 'iron_shieldbearer' }, 'summon'],
  ])('%j', (effect, kind) => {
    expect(skillError(effect)).toContain(kind);
  });

  it('스킬의 flatDamage에 카드 전용 필드를, 지연 타격에 targetArea를 쓸 수 없다', () => {
    expect(skillError({ kind: 'flatDamage', selector: 'target', amount: 1, dmgType: 'magic', bonusIfBurning: 5 })).toContain('bonusIfBurning: 카드 전용 필드');
    expect(skillError({ kind: 'delayedStrike', selector: 'allAllies', delay: 2, area: 'targetArea', effects: [{ kind: 'stun', selector: 'allEnemies', duration: 1 }] })).toContain('카드 전용');
  });
});

describe('카드에서의 새 효과 검증', () => {
  it('selector가 allAllies여야 하는 효과', () => {
    for (const kind of ['handCostCut', 'ultimateGain', 'commanderHeal']) {
      expect(errorOf(withEffects([{ kind, selector: 'target', amount: 1 }], { target: { kind: 'allyUnit' } }))).toContain(`${kind}는 selector가 allAllies여야 함`);
    }
    expect(errorOf(withEffects([{ kind: 'spellDamageBoost', selector: 'self', pct: 10 }]))).toContain('selector');
  });

  it('수치 범위: amount ≥ 1 정수, reviveOnce hpPct 1~100, 징집 별 1~3', () => {
    expect(errorOf(withEffects([{ kind: 'ultimateGain', selector: 'allAllies', amount: 0 }]))).toContain('effects[0].amount');
    expect(errorOf(withEffects([{ kind: 'ultimateGain', selector: 'allAllies', amount: 1.5 }]))).toContain('정수');
    expect(errorOf(fixtureCard('x', { type: 'equipment', target: { kind: 'allyUnit' }, effects: [{ kind: 'reviveOnce', selector: 'target', hpPct: 101 }] }))).toContain('hpPct');
    expect(errorOf(withEffects([{ kind: 'summon', selector: 'allAllies', count: 1, unitId: 'a', star: 4 }]))).toContain('star');
  });

  it('startCp는 작전 카드만, reviveOnce는 장비 카드만', () => {
    expect(errorOf(withEffects([{ kind: 'startCp', selector: 'allAllies', amount: 1 }]))).toContain('작전 카드에서만');
    ok(fixtureCard('x', { type: 'operation', effects: [{ kind: 'startCp', selector: 'allAllies', amount: 1 }] }));
    expect(errorOf(withEffects([{ kind: 'reviveOnce', selector: 'allAllies', hpPct: 40 }]))).toContain('장비 카드에서만');
    ok(fixtureCard('x', { type: 'equipment', target: { kind: 'allyUnit' }, effects: [{ kind: 'reviveOnce', selector: 'target', hpPct: 40 }] }));
  });

  it('summon: tier와 unitId는 정확히 하나, 부가 필드는 unitId와 함께만', () => {
    expect(errorOf(withEffects([{ kind: 'summon', selector: 'allAllies', count: 1 }]))).toContain('정확히 하나');
    expect(errorOf(withEffects([{ kind: 'summon', selector: 'allAllies', count: 1, tier: 1, unitId: 'a' }]))).toContain('정확히 하나');
    expect(errorOf(withEffects([{ kind: 'summon', selector: 'allAllies', count: 1, tier: 1, star: 2 }]))).toContain('unitId가 있을 때만');
    expect(errorOf(withEffects([{ kind: 'summon', selector: 'allAllies', count: 1, unitId: 'a', placement: 'middle' }]))).toContain('placement');
    ok(withEffects([{ kind: 'summon', selector: 'allAllies', count: 2, unitId: 'a', star: 2, placement: 'enemyBack', manaFull: true }]));
  });

  it('flatDamage 조건부 필드: hpBelowPct와 belowMult는 함께, 1~100', () => {
    const dmg = (extra: Record<string, unknown>) => withEffects([{ kind: 'flatDamage', selector: 'allAllies', amount: 1, dmgType: 'magic', ...extra }]);
    expect(errorOf(dmg({ hpBelowPct: 30 }))).toContain('belowMult');
    expect(errorOf(dmg({ belowMult: 2 }))).toContain('hpBelowPct');
    expect(errorOf(dmg({ hpBelowPct: 130, belowMult: 2 }))).toContain('1~100');
    ok(dmg({ hpBelowPct: 30, belowMult: 2, bonusIfBurning: 10, killCp: 2 }));
  });

  it('damageZone: selector enemiesInTargetArea + 범위 지정 카드', () => {
    const zone = { kind: 'damageZone', amount: 40, dmgType: 'magic', duration: 5, intervalSeconds: 1 };
    expect(errorOf(withEffects([{ ...zone, selector: 'allEnemies' }]))).toContain('enemiesInTargetArea여야 함');
    expect(errorOf(withEffects([{ ...zone, selector: 'enemiesInTargetArea' }]))).toContain('칸/범위를 지정하는 대상에서만');
    ok(withEffects([{ ...zone, selector: 'enemiesInTargetArea' }], { type: 'spell', target: { kind: 'area3x3' } }));
  });

  it('targetArea 지연 타격: 범위 지정 카드만, 중첩 효과도 검사, 스킬용 범위는 카드에서 거부', () => {
    const strike = (nested: unknown[], area = 'targetArea') => ({ kind: 'delayedStrike', selector: 'allAllies', delay: 3, area, effects: nested });
    const hit = { kind: 'flatDamage', selector: 'enemiesInTargetArea', amount: 400, dmgType: 'magic' };
    expect(errorOf(withEffects([strike([hit])]))).toContain('targetArea 지연 타격은 칸/범위를 지정하는 카드에서만');
    expect(errorOf(withEffects([strike([{ ...hit, selector: 'self' }])], { type: 'spell', target: { kind: 'area3x3' } }))).toContain('effects[0].effects[0].selector');
    expect(errorOf(withEffects([{ ...strike([hit], 'densestEnemies3x3'), selector: 'self' }], { type: 'spell', target: { kind: 'area3x3' } }))).toContain('스킬 전용');
    ok(withEffects([strike([hit])], { type: 'spell', target: { kind: 'area3x3' } }));
  });

  it('cpOnKill·empoweredAttack·onAttackBurn·lifesteal(combat)을 카드에서 쓸 수 있다', () => {
    ok(withEffects([{ kind: 'cpOnKill', selector: 'allAllies', amount: 1, maxPerCombat: 3 }]));
    ok(withEffects([{ kind: 'empoweredAttack', selector: 'target', pctAtk: 200, dmgType: 'physical' }], { target: { kind: 'allyUnit' } }));
    ok(withEffects([{ kind: 'onAttackBurn', selector: 'allAllies', pctAtk: 10, duration: 3 }], { type: 'operation' }));
    ok(withEffects([{ kind: 'lifesteal', selector: 'target', pct: 10, duration: 'combat' }], { type: 'equipment', target: { kind: 'allyUnit' } }));
  });

  it('manaGain·alliesBackRow는 카드와 스킬 모두에서 허용', () => {
    ok(withEffects([{ kind: 'manaGain', selector: 'allAllies', amount: 40 }]));
    ok(withEffects([{ kind: 'statMod', selector: 'alliesBackRow', stat: 'atk', pct: 10, duration: 'combat' }], { type: 'operation' }));
  });
});

describe('저주 카드 필드', () => {
  const curse = (extra: Record<string, unknown> = {}) => fixtureCard('c', { type: 'curse', cost: 0, effects: [], ...extra });

  it('효과 없는 사용 불가 저주와 뽑을 때 효과·골드 손실 저주를 읽는다', () => {
    ok(curse());
    ok(curse({ curse: { onDraw: [{ kind: 'statMod', selector: 'randomAlly', stat: 'atk', pct: -10, duration: 'combat' }] } }));
    ok(curse({ keywords: ['exhaust'], cost: 1, curse: { playable: true, goldLossAtEnd: 3 } }));
  });

  it('거부: 대상 지정, curse 필드를 가진 비저주, exhaust 없는 사용 가능 저주, 잘못된 골드', () => {
    expect(errorOf(curse({ target: { kind: 'allyUnit' } }))).toContain('저주 카드는 대상을 지정하지 않음');
    expect(errorOf(fixtureCard('c', { curse: { playable: true } }))).toContain('type이 curse인 카드만');
    expect(errorOf(curse({ curse: { playable: true } }))).toContain('exhaust 키워드');
    expect(errorOf(curse({ curse: { goldLossAtEnd: 0 } }))).toContain('goldLossAtEnd');
    expect(errorOf(curse({ curse: { onDraw: [] } }))).toContain('curse.onDraw'.replace('curse.', ''));
    expect(errorOf(curse({ curse: { surprise: 1 } }))).toContain('알 수 없는 필드');
  });

  it('randomAlly는 저주에서만 쓸 수 있다', () => {
    expect(errorOf(withEffects([{ kind: 'statMod', selector: 'randomAlly', stat: 'atk', pct: -10, duration: 'combat' }]))).toContain('randomAlly는 저주 카드');
  });

  it('저주가 아닌 카드는 효과가 비어 있을 수 없다', () => {
    expect(errorOf(withEffects([]))).toContain('효과가 최소 1개 필요함');
  });
});

describe('징집 유닛 참조 검증', () => {
  it('존재하지 않는 유닛·보스 전용 유닛은 한국어 오류', () => {
    const catalog = (unitId: string) => fixtureCatalog([withEffects([{ kind: 'summon', selector: 'allAllies', count: 1, unitId }])]);
    expect(() => assertCardUnitReferences(catalog('iron_shieldbearer'), units)).not.toThrow();
    expect(() => assertCardUnitReferences(catalog('ghost'), units)).toThrow('징집 유닛 ghost가 units.json에 없습니다');
    const boss = units.units.find((u) => u.boss)!.id;
    expect(() => assertCardUnitReferences(catalog(boss), units)).toThrow('보스 전용');
  });
});
