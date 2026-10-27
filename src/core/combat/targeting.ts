import type { SkillTargeting } from '../data/unit';
import { chebyshev } from './board';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/**
 * 기본 공격 대상 선택.
 * forceTarget 상태가 있으면 그 적, 아니면 가장 가까운 적(Chebyshev),
 * 동률이면 HP 낮은 쪽, 그래도 같으면 유닛 인스턴스 id가 작은 쪽.
 */
export class TargetSelector {
  pick(unit: CombatUnit, world: CombatWorld): CombatUnit | null {
    const forcedUid = unit.statuses.forcedTargetUid();
    if (forcedUid !== null) {
      const forced = world.unitByUid(forcedUid);
      if (forced && forced.alive && forced.side !== unit.side) return forced;
    }

    let best: CombatUnit | null = null;
    let bestDistance = Infinity;
    for (const enemy of world.enemiesOf(unit.side)) {
      const distance = chebyshev(unit.cell, enemy.cell);
      if (
        best === null ||
        distance < bestDistance ||
        (distance === bestDistance && (enemy.hp < best.hp || (enemy.hp === best.hp && enemy.uid < best.uid)))
      ) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }
}

/** 스킬 시전 대상 선택 전략 */
export interface SkillTargetResolver {
  /** true면 대상이 기본 공격 사거리 안에 있어야 시전 가능 */
  readonly requiresRange: boolean;
  /** 대상 목록 (비어 있으면 시전 불가). attackTarget은 현재 기본 공격 대상 */
  resolve(caster: CombatUnit, attackTarget: CombatUnit, world: CombatWorld): CombatUnit[];
}

const selfResolver: SkillTargetResolver = {
  requiresRange: false,
  resolve: (caster) => [caster],
};

const currentTargetResolver: SkillTargetResolver = {
  requiresRange: true,
  resolve: (_caster, attackTarget) => [attackTarget],
};

/** HP(현재 체력)가 가장 낮은 적. 동률이면 uid 작은 쪽 */
const lowestHpEnemyResolver: SkillTargetResolver = {
  requiresRange: false,
  resolve: (caster, _attackTarget, world) => {
    let best: CombatUnit | null = null;
    for (const enemy of world.enemiesOf(caster.side)) {
      if (best === null || enemy.hp < best.hp) best = enemy;
    }
    return best ? [best] : [];
  },
};

/** 새 targeting 종류는 여기에 전략을 추가한다 */
export const SKILL_TARGET_RESOLVERS: Record<SkillTargeting, SkillTargetResolver> = {
  self: selfResolver,
  currentTarget: currentTargetResolver,
  lowestHpEnemy: lowestHpEnemyResolver,
  randomEnemies: {
    requiresRange: false,
    resolve: (caster, _target, world) => {
      const count = caster.def.skill.targetCount ?? 1;
      return world.rng.shuffle(world.enemiesOf(caster.side)).slice(0, Array.isArray(count) ? count[caster.star - 1] : count as number);
    },
  },
};
