import { FieldReader } from '../data/fieldReader';
import type { BattleKind } from '../economy';
import { RUN } from './constants';

export interface DefeatDamageInput {
  /** 전투 종료 시 살아 있는 적 유닛(소환 제외)의 등급 합 */
  survivorTierSum: number;
  floor: number;
  kind: BattleKind;
}

/**
 * 패배 시 지휘관 피해 (DESIGN 7-4): ceil((2 + 생존 적 등급 합 + floor(층 / 3)) × 종류 배율).
 * 배율은 일반 ×1, 정예 ×1.5, 보스 ×2이며 소수는 올림한다. 무승부(시간 초과·동시 전멸)도 패배로 같은 식을 쓴다.
 */
export function defeatDamage(input: DefeatDamageInput): number {
  const base = RUN.DEFEAT.BASE + input.survivorTierSum + Math.floor(input.floor / RUN.DEFEAT.FLOOR_DIVISOR);
  const mult = input.kind === 'boss' ? RUN.DEFEAT.BOSS_MULT : input.kind === 'elite' ? RUN.DEFEAT.ELITE_MULT : 1;
  return Math.ceil(base * mult);
}

/** 지휘관 HP. 0 이하가 되면 런 종료(사망). 최대치를 넘게 회복할 수 없다 */
export class CommanderHealth {
  private current: number;

  constructor(readonly max: number, hp: number = max) {
    if (!Number.isInteger(max) || max < 1) throw new Error('지휘관 최대 HP는 1 이상의 정수여야 합니다');
    if (!Number.isInteger(hp) || hp > max) throw new Error('지휘관 HP가 올바르지 않습니다');
    this.current = hp;
  }

  get hp(): number {
    return this.current;
  }

  get dead(): boolean {
    return this.current <= 0;
  }

  /** 피해를 입는다 (HP는 0 미만으로 내려가지 않음). 실제로 잃은 양 반환 */
  damage(amount: number): number {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('피해량은 0 이상의 정수여야 합니다');
    const lost = Math.min(this.current, amount);
    this.current -= lost;
    return lost;
  }

  /** 이벤트 피해: 사망시키지 않는다 (최소 HP 1 유지). 실제로 잃은 양 반환 */
  damageNonLethal(amount: number): number {
    return this.damage(Math.min(amount, Math.max(0, this.current - 1)));
  }

  /** 최대치까지 회복한다. 실제 회복량 반환 */
  heal(amount: number): number {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('회복량은 0 이상의 정수여야 합니다');
    const gained = Math.min(this.max - this.current, amount);
    this.current += gained;
    return gained;
  }

  serialize(): { hp: number; maxHp: number } {
    return { hp: this.current, maxHp: this.max };
  }

  static restore(data: unknown, path: string): CommanderHealth {
    const r = FieldReader.of(data, path);
    r.onlyKeys(['hp', 'maxHp']);
    const max = r.int('maxHp', 1);
    const hp = r.int('hp', 0);
    if (hp > max) r.fail('hp', `최대 HP(${max}) 이하여야 함 (실제: ${hp})`);
    return new CommanderHealth(max, hp);
  }
}
