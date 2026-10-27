import type { EffectDef, EffectSelector } from './effect';
import type { FieldReader } from './fieldReader';

/**
 * 효과가 실행될 문맥. 카드와 지휘관 패시브는 스킬과 달리 "시전 유닛"이 없고,
 * 선택자 target이 가리킬 대상도 문맥마다 다르다.
 */
export interface EffectUsageContext {
  /** 카드의 target.kind. 대상 지정이 없는 문맥(지휘관 패시브)은 'none' */
  targetKind: 'none' | 'allyUnit' | 'enemyUnit' | 'allyUnits' | 'cell' | 'area3x3';
}

const UNIT_TARGET_KINDS: readonly string[] = ['allyUnit', 'enemyUnit', 'allyUnits'];
const AREA_TARGET_KINDS: readonly string[] = ['cell', 'area3x3'];

/** 시전자(스킬을 쓰는 유닛)가 있어야만 의미가 있는 선택자 */
const CASTER_SELECTORS: readonly EffectSelector[] = ['self', 'lineThroughTarget', 'selfAndAdjacent', 'traitUnits', 'targetArea2x2'];
/** 지정 유닛 대상이 있어야 하는 선택자 */
const UNIT_SELECTORS: readonly EffectSelector[] = ['target', 'targetAndAdjacent'];
const AREA_SELECTORS: readonly EffectSelector[] = ['enemiesInTargetArea', 'alliesInTargetArea'];

/**
 * 시전자 없는 문맥(카드·패시브)에서 효과 목록이 실행 가능한 형태인지 검사한다.
 * 위반하면 `container[key][i].selector` 등 위치가 담긴 DataValidationError를 던진다.
 */
export function assertEffectsUsable(
  container: FieldReader,
  key: string,
  effects: readonly EffectDef[],
  ctx: EffectUsageContext,
): void {
  effects.forEach((effect, i) => {
    const at = `${key}[${i}]`;
    if (effect.kind === 'damage') {
      container.fail(`${at}.kind`, 'damage는 시전자의 ATK가 필요해 쓸 수 없음 (고정 피해는 flatDamage)');
    }
    if (effect.kind === 'burn' && effect.dps === undefined) {
      container.fail(`${at}.dps`, '시전자가 없어 dpsPctAtk 대신 고정 초당 피해 dps를 써야 함');
    }
    if (CASTER_SELECTORS.includes(effect.selector)) {
      container.fail(`${at}.selector`, `"${effect.selector}"는 시전 유닛이 있는 스킬 전용 선택자임`);
    }
    if (UNIT_SELECTORS.includes(effect.selector) && !UNIT_TARGET_KINDS.includes(ctx.targetKind)) {
      container.fail(`${at}.selector`, `"${effect.selector}"는 유닛을 지정하는 대상(target.kind: ${ctx.targetKind})에서는 쓸 수 없음`);
    }
    if (AREA_SELECTORS.includes(effect.selector) && !AREA_TARGET_KINDS.includes(ctx.targetKind)) {
      container.fail(`${at}.selector`, `"${effect.selector}"는 칸/범위를 지정하는 대상에서만 쓸 수 있음 (target.kind: ${ctx.targetKind})`);
    }
    if ((effect.kind === 'forceTarget' || effect.kind === 'teleport') && !UNIT_TARGET_KINDS.includes(ctx.targetKind)) {
      container.fail(`${at}.kind`, `${effect.kind}는 지정 유닛 대상이 필요함 (target.kind: ${ctx.targetKind})`);
    }
    if (effect.kind === 'cpOnKill') {
      container.fail(`${at}.kind`, 'cpOnKill은 특성 전용 효과임');
    }
    if (['onAttackBurn', 'killFeast', 'marksman'].includes(effect.kind)) container.fail(`${at}.kind`, `${effect.kind}는 특성 전용 효과임`);
  });
}
