import { resolveEffect } from '../data/effect';
import type { TraitCatalog } from '../data/traitLoader';
import type { UnitDef } from '../data/unit';
import type { Side } from './board';
import type { EffectExecutor } from './effects';

/** 한 진영에서 활성 후보가 된 특성 */
export interface ActiveTrait {
  traitId: string;
  /** 서로 다른 유닛 종류 수 */
  count: number;
  /** 0 = 미달, 1~3 = 단계 */
  tier: 0 | 1 | 2 | 3;
}

/**
 * 특성 단계 계산과 적용.
 * 단계는 진영별로 "서로 다른 유닛 종류 수"로 센다 (같은 유닛 여러 기는 1).
 */
export class TraitEngine {
  constructor(private readonly traits: TraitCatalog) {}

  /** 편성(유닛 정의 목록, 중복 포함)에서 특성별 종류 수와 단계를 계산. 1종 이상 있는 특성만 반환 */
  compute(defs: readonly UnitDef[]): ActiveTrait[] {
    const distinct = new Map<string, UnitDef>();
    for (const def of defs) distinct.set(def.id, def);

    const counts = new Map<string, number>();
    for (const def of distinct.values()) {
      for (const traitId of new Set([def.origin, def.job])) {
        counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
      }
    }

    const result: ActiveTrait[] = [];
    for (const trait of this.traits.traits) {
      const count = counts.get(trait.id);
      if (count === undefined) continue;
      const tier = trait.thresholds.filter((threshold) => count >= threshold).length as 0 | 1 | 2 | 3;
      result.push({ traitId: trait.id, count, tier });
    }
    return result;
  }

  /** 단계에 도달한 특성의 효과를 해당 진영에 적용한다 (전투 시작 시 1회). */
  apply(side: Side, defs: readonly UnitDef[], executor: EffectExecutor): ActiveTrait[] {
    const active = this.compute(defs);
    for (const { traitId, tier } of active) {
      if (tier === 0) continue;
      const trait = this.traits.get(traitId);
      if (!trait?.effects) continue;
      const resolved = trait.effects.map((e) => resolveEffect(e, tier - 1));
      executor.execute(resolved, { side, caster: null, targets: [] });
    }
    return active;
  }
}
