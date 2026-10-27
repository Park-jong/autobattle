import { COMBAT } from './constants';
import type { CombatWorld } from './world';

/** 마나 획득 규칙: 공격 1회 +10, 피격 시 받은 피해의 1% (최대 +15). 트리거 버스를 구독한다. */
export class ManaSystem {
  constructor(private readonly world: CombatWorld) {
    world.bus.on('onAttack', ({ attacker }) => {
      world.addMana(attacker, COMBAT.MANA_PER_ATTACK);
    });
    world.bus.on('onDamageTaken', ({ unit, amount }) => {
      if (unit.hp <= 0) return;
      world.addMana(unit, Math.min(COMBAT.MANA_PER_HIT_CAP, amount * COMBAT.MANA_PER_DAMAGE_RATIO));
    });
  }
}
