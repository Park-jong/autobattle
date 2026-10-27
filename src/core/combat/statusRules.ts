import { chebyshev } from './board';
import { COMBAT } from './constants';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/**
 * 상태 효과의 시간 경과 규칙.
 * - 만료 제거 (statusRemoved 이벤트)
 * - 화상·회복 오라의 주기 피해/회복
 * - refreshOnKill 버프: 처치 트리거에서 지속 시간 초기화 (트리거 버스 구독)
 */
export class StatusRules {
  constructor(private readonly world: CombatWorld) {
    world.bus.on('onKill', ({ killer }) => {
      if (!killer || !killer.alive) return;
      for (const { status, duration, value } of killer.statuses.refreshOnKill()) {
        world.emit({ type: 'statusApplied', unit: killer.uid, status, duration, source: killer.uid, ...(value === undefined ? {} : { value }) });
      }
    });
  }

  /** 모든 유닛의 만료 상태 제거 (사망자 포함 uid 순) */
  expireAll(): void {
    for (const unit of this.world.units) {
      for (const status of unit.statuses.expire()) {
        if (unit.alive) this.world.emit({ type: 'statusRemoved', unit: unit.uid, status });
      }
    }
  }

  /** 한 유닛의 주기적 효과(화상 피해, 회복 오라) 처리 */
  processPeriodic(unit: CombatUnit): void {
    if (!unit.alive) return;
    const world = this.world;

    const burn = unit.statuses.takeDueBurn();
    if (burn) {
      const source = burn.sourceUid === null ? null : (world.unitByUid(burn.sourceUid) ?? null);
      world.dealDamage({ source, target: unit, raw: burn.dps * COMBAT.BURN_INTERVAL_SECONDS, type: 'magic' });
      if (!unit.alive) return;
    }

    for (const aura of unit.statuses.takeDueAuras()) {
      for (const ally of world.alliesOf(unit.side)) {
        if (ally !== unit && chebyshev(ally.cell, unit.cell) <= aura.radius) {
          world.heal(unit, ally, aura.perSecond * COMBAT.HEAL_AURA_INTERVAL_SECONDS);
        }
      }
    }
  }
}
