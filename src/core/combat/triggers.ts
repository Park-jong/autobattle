import type { DamageType } from '../data/effect';
import type { CombatUnit } from './unit';

/** 트리거 종류별 페이로드 */
export interface TriggerPayloads {
  onAttack: { attacker: CombatUnit; target: CombatUnit; shots: number };
  onDamageTaken: { unit: CombatUnit; source: CombatUnit | null; amount: number; dmgType: DamageType };
  onKill: { killer: CombatUnit | null; victim: CombatUnit };
  onDeath: { unit: CombatUnit; killer: CombatUnit | null };
  onSkillCast: { caster: CombatUnit; skillName: string; targets: readonly CombatUnit[] };
  onTick: { tick: number; time: number };
  /** 준비 단계가 끝나고 전투가 시작되는 순간 (startCombat). 첫 카드 명령·첫 틱 처리보다 먼저 */
  onCombatStart: Record<string, never>;
  /** 플레이어(side 0)가 카드를 사용했을 때. 효과 실행 전에 발행 */
  onCardPlay: { cardId: string; instanceId: number };
}

export type TriggerType = keyof TriggerPayloads;
export type TriggerHandler<K extends TriggerType> = (payload: TriggerPayloads[K]) => void;

/**
 * 전투 이벤트 버스. 특성·스킬·마나 시스템이 구독한다.
 * 핸들러는 등록한 순서대로 동기 실행된다 (결정론).
 */
export class TriggerBus {
  private readonly handlers: { [K in TriggerType]: TriggerHandler<K>[] } = {
    onAttack: [],
    onDamageTaken: [],
    onKill: [],
    onDeath: [],
    onSkillCast: [],
    onTick: [],
    onCombatStart: [],
    onCardPlay: [],
  };

  /** 구독. 반환된 함수를 호출하면 해제된다. */
  on<K extends TriggerType>(type: K, handler: TriggerHandler<K>): () => void {
    const list = this.handlers[type] as TriggerHandler<K>[];
    list.push(handler);
    return () => {
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    };
  }

  emit<K extends TriggerType>(type: K, payload: TriggerPayloads[K]): void {
    // 핸들러 안에서 구독/해제가 일어나도 안전하도록 복사본을 순회
    for (const handler of [...(this.handlers[type] as TriggerHandler<K>[])]) handler(payload);
  }
}
