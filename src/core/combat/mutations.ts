import { Rng } from '../rng';
import type { Deck } from '../cards/deck';
import { chebyshev } from './board';
import type { CardPlayer } from './cardPlayer';
import { MUTATION } from './constants';
import type { EffectExecutor } from './effects';
import type { CombatWorld } from './world';

/** 정예 변이 종류 (DESIGN 7-2) */
export const MUTATION_IDS = ['armored', 'rage', 'contagion', 'disrupt'] as const;
export type MutationId = (typeof MUTATION_IDS)[number];

/** UI·미리보기용 표시 정보 */
export const MUTATION_INFO: Readonly<Record<MutationId, { name: string; text: string }>> = {
  armored: { name: '장갑', text: `적 전원의 ARM +${MUTATION.ARMORED_ARM} (마법 피해가 유리)` },
  rage: { name: '분노', text: `적이 HP ${MUTATION.RAGE_HP_PCT}% 이하가 되면 공격 속도 ×${1 + MUTATION.RAGE_AS_PCT / 100}` },
  contagion: { name: '전파', text: `적이 죽으면 주변 ${MUTATION.CONTAGION_RADIUS}칸의 적이 최대 HP의 ${MUTATION.CONTAGION_HEAL_PCT}% 회복` },
  disrupt: { name: '방해', text: `${MUTATION.DISRUPT_INTERVAL_SECONDS}초마다 손패 무작위 1장의 비용 +${MUTATION.DISRUPT_COST} (이번 전투)` },
};

export function isMutationId(value: unknown): value is MutationId {
  return typeof value === 'string' && (MUTATION_IDS as readonly string[]).includes(value);
}

/** 방해 변이가 쓰는 협력 객체 (카드 시스템이 없으면 null) */
export interface DisruptTarget {
  deck: Deck;
  player: CardPlayer;
}

/**
 * 정예 변이: 적(side 1) 진영에 전투 시작 시 한 번 설치되는 규칙 묶음.
 * 가능한 한 공통 효과 실행기(statAdd/statMod)와 트리거 버스(onDamageTaken/onDeath/onTick)로 구현하고,
 * 설치 사실과 방해 결과는 이벤트 로그(mutation, cardCost)에 남긴다.
 * 방해의 무작위 선택은 전투 Rng를 건드리지 않도록 시드에서 파생한 별도 Rng를 쓴다.
 */
export class MutationSystem {
  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
    private readonly mutations: readonly MutationId[],
    private readonly seed: number,
    private readonly disrupt: DisruptTarget | null,
  ) {}

  install(): void {
    for (const id of new Set(this.mutations)) {
      this.world.emit({ type: 'mutation', id });
      switch (id) {
        case 'armored': this.installArmored(); break;
        case 'rage': this.installRage(); break;
        case 'contagion': this.installContagion(); break;
        case 'disrupt': this.installDisrupt(); break;
      }
    }
  }

  private installArmored(): void {
    this.executor.execute(
      [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: MUTATION.ARMORED_ARM, duration: 'combat' }],
      { side: 1, caster: null, targets: [] },
    );
  }

  private installRage(): void {
    const raged = new Set<number>();
    this.world.bus.on('onDamageTaken', ({ unit }) => {
      if (unit.side !== 1 || raged.has(unit.uid) || unit.hp <= 0) return;
      if (unit.hp > (unit.maxHp * MUTATION.RAGE_HP_PCT) / 100) return;
      raged.add(unit.uid);
      this.executor.execute(
        [{ kind: 'statMod', selector: 'target', stat: 'as', pct: MUTATION.RAGE_AS_PCT, duration: 'combat' }],
        { side: 1, caster: null, targets: [unit] },
      );
    });
  }

  private installContagion(): void {
    this.world.bus.on('onDeath', ({ unit }) => {
      if (unit.side !== 1) return;
      for (const ally of this.world.alliesOf(1)) {
        if (chebyshev(ally.cell, unit.cell) > MUTATION.CONTAGION_RADIUS) continue;
        this.world.heal(null, ally, (ally.maxHp * MUTATION.CONTAGION_HEAL_PCT) / 100);
      }
    });
  }

  private installDisrupt(): void {
    const target = this.disrupt;
    if (!target) return;
    const rng = new Rng((this.seed ^ 0x6d2b79f5) >>> 0);
    const interval = MUTATION.DISRUPT_INTERVAL_SECONDS * 10;
    this.world.bus.on('onTick', ({ tick }) => {
      if (tick === 0 || tick % interval !== 0) return;
      const hand = target.deck.hand;
      if (hand.length === 0) return;
      const card = rng.pick(hand);
      const surcharge = target.player.addSurcharge(card.instanceId, MUTATION.DISRUPT_COST);
      this.world.emit({ type: 'cardCost', instanceId: card.instanceId, cardId: card.cardId, surcharge });
    });
  }
}
