import { resolveEffect } from '../data/effect';
import type { RelicEffect } from '../data/relic';
import type { CombatCommandPoints } from './combatCp';
import type { EffectExecutor } from './effects';
import type { CombatWorld } from './world';

/**
 * 보유 유물 중 전투가 읽는 효과 묶음. 합산이 필요한 수치는 getter로, 트리거가 필요한 것은 install로 연결한다.
 * 전투와 무관한 효과(경제·덱·런)는 무시한다. 유물이 없으면 모든 getter가 0이고 install은 아무것도 하지 않는다.
 */
export class RelicCombatRules {
  constructor(private readonly effects: readonly RelicEffect[]) {}

  private sum(pick: (e: RelicEffect) => number): number {
    return this.effects.reduce((total, e) => total + pick(e), 0);
  }

  /** 전투 시작 CP 보정 */
  get startCp(): number {
    return this.sum((e) => (e.kind === 'startCp' ? e.amount : 0));
  }

  /** 궁극기 충전 배율 (1 = 보정 없음) */
  get ultimateChargeMult(): number {
    return 1 + this.sum((e) => (e.kind === 'ultimateCharge' ? e.pct : 0)) / 100;
  }

  /** 지휘관 HP 카드 비용 감소량 */
  get hpCostReduction(): number {
    return this.sum((e) => (e.kind === 'hpCostReduction' ? e.amount : 0));
  }

  /** 주문 카드 피해 증가(%) */
  get spellDamagePct(): number {
    return this.sum((e) => (e.kind === 'spellDamage' ? e.pct : 0));
  }

  /** 손패 상한 증가 */
  get handLimitBonus(): number {
    return this.sum((e) => (e.kind === 'handLimit' ? e.amount : 0));
  }

  /** 특성 단계 +1에 필요한 같은 특성 유닛 수 (없으면 null; 여러 개면 가장 작은 값) */
  get traitBonusMinUnits(): number | null {
    const values = this.effects.flatMap((e) => (e.kind === 'traitTierBonus' ? [e.minUnits] : []));
    return values.length === 0 ? null : Math.min(...values);
  }

  /** 전투 시작 효과(보호막 등)와 사망/처치 트리거를 설치한다. 특성·패시브 다음, 준비 CP 지급 전에 부른다 */
  install(world: CombatWorld, executor: EffectExecutor, cp: CombatCommandPoints | null): void {
    for (const effect of this.effects) {
      if (effect.kind === 'combatStart') {
        executor.execute(effect.effects.map((e) => resolveEffect(e, 0)), { side: 0, caster: null, targets: [] });
      } else if (effect.kind === 'allyDeathCp' && cp) {
        let gained = 0;
        world.bus.on('onDeath', ({ unit }) => {
          if (unit.side !== 0 || unit.temporary || gained >= effect.maxPerCombat) return;
          gained += cp.gainCp(Math.min(effect.amount, effect.maxPerCombat - gained), 'effect');
        });
      } else if (effect.kind === 'killMana') {
        world.bus.on('onKill', ({ killer }) => {
          if (killer?.alive && killer.side === 0) world.addMana(killer, effect.amount);
        });
      }
    }
  }
}

