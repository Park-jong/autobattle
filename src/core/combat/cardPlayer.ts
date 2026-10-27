import type { CpPool } from '../cards/commandPoints';
import type { Deck } from '../cards/deck';
import { effectiveCard } from '../cards/effectiveCard';
import type { Card, CardTarget } from '../data/card';
import type { CardCatalog } from '../data/cardLoader';
import { resolveEffect, type EffectDef, type ResolvedEffect } from '../data/effect';
import { isInsideBoard, type Side } from './board';
import type { PlayResult, PlayTarget } from './cardCommand';
import type { CombatCommandPoints } from './combatCp';
import type { EffectContext, EffectExecutor } from './effects';
import type { ActiveTrait } from './traits';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/** 전투 진행 단계. 준비(전투 시작 전) → 전투 → 종료 */
export type CombatPhase = 'prep' | 'combat' | 'ended';

/** 카드를 쓰는 진영. 적 진영은 카드를 쓰지 않는다 */
const PLAYER_SIDE: Side = 0;

/** 대상 검증 결과: 실행 문맥의 일부이거나 실패 사유 */
type TargetResolution = { ok: true; ctx: EffectContext } | { ok: false; reason: string };

/**
 * 카드 사용: 검증 → CP 차감 → 손패 분리 → 이벤트 → 효과 실행 → 버린/소모 더미 이동.
 * 실패하면 아무것도 바뀌지 않는다 (CP·카드·이벤트 로그 모두 그대로, 사유만 반환).
 *
 * 효과 실행 순서: 기본 효과 → 공명(해당 특성이 아군 진영에서 단계 1 이상) → 연쇄(앞서 카드를 쓴 적이 있으면).
 * "앞서 쓴 카드"에는 준비 단계에 쓴 작전 카드도 포함한다. perCombat 제한은 카드 id 단위(같은 카드 여러 장이 합산)로 센다.
 */
export class CardPlayer {
  private readonly usesByCard = new Map<string, number>();
  private playedCount = 0;

  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
    private readonly cp: CombatCommandPoints,
    private readonly deck: Deck,
    private readonly catalog: CardCatalog,
    private readonly activeTraits: readonly ActiveTrait[],
  ) {}

  /** 이번 전투에서 성공한 카드 사용 횟수 */
  get cardsPlayed(): number {
    return this.playedCount;
  }

  /** 이 카드(id)를 이번 전투에서 쓴 횟수 */
  usesOf(cardId: string): number {
    return this.usesByCard.get(cardId) ?? 0;
  }

  play(phase: CombatPhase, instanceId: number, target: PlayTarget): PlayResult {
    const instance = this.deck.findInHand(instanceId);
    if (!instance) return fail('손패에 없는 카드입니다');
    const card = this.catalog.get(instance.cardId);
    if (!card) return fail(`알 수 없는 카드 "${instance.cardId}"입니다`);

    const phaseError = this.checkPhase(card, phase);
    if (phaseError) return fail(phaseError);

    const perCombat = card.limits?.perCombat;
    if (perCombat !== undefined && this.usesOf(card.id) >= perCombat) {
      return fail(`"${card.name}"은(는) 전투당 ${perCombat}회만 사용할 수 있습니다`);
    }

    const view = effectiveCard(card, instance.upgraded, this.playedCount);
    const pool: CpPool = card.type === 'operation' || card.type === 'equipment' ? 'prep' : 'combat';
    if (!this.cp.canSpend(pool, view.cost)) {
      const label = pool === 'prep' ? '준비 단계 작전 CP가' : '지휘력이';
      return fail(`${label} 부족합니다 (필요 ${view.cost}, 보유 ${this.cp.amount(pool)})`);
    }

    const resolution = this.resolveTarget(card.target, target);
    if (!resolution.ok) return fail(resolution.reason);

    const effects = this.collectEffects(view);
    const blocked = this.executor.checkExecutable(effects, resolution.ctx);
    if (blocked) return fail(blocked);

    // ---- 검증 통과: 여기부터 상태 변경 ----
    this.cp.spend(pool, view.cost);
    this.usesByCard.set(card.id, this.usesOf(card.id) + 1);
    this.deck.play(instanceId, () => {
      this.world.emit({
        type: 'cardPlayed',
        cardId: card.id,
        instanceId,
        upgraded: instance.upgraded,
        target: structuredClone(target),
        cp: this.cp.amount(pool),
        pool,
      });
      this.world.bus.emit('onCardPlay', { cardId: card.id, instanceId });
      this.executor.execute(effects, resolution.ctx);
      if (card.type === 'equipment') {
        for (const unit of resolution.ctx.targets) unit.equipment.push(`${card.id}${instance.upgraded ? '+' : ''}`);
      }
    });
    this.playedCount += 1;
    return { ok: true, cp: this.cp.amount(pool), pool };
  }

  // ---- 검증 ----

  private checkPhase(card: Card, phase: CombatPhase): string | null {
    if (phase === 'ended') return '전투가 이미 끝났습니다';
    if (card.type === 'equipment') return phase === 'prep' ? null : '장비 카드는 준비 단계에서만 사용할 수 있습니다';
    if (card.type === 'curse') return '저주 카드는 사용할 수 없습니다';
    if (card.type === 'operation') {
      return phase === 'prep' ? null : '작전 카드는 준비 단계에서만 사용할 수 있습니다';
    }
    return phase === 'combat' ? null : '명령·주문 카드는 전투 중에만 사용할 수 있습니다';
  }

  /** 카드의 target.kind에 맞는 지정값인지 확인하고 실행 문맥을 만든다 */
  private resolveTarget(spec: CardTarget, target: PlayTarget): TargetResolution {
    const noTarget = (reason: string): TargetResolution => ({ ok: false, reason });
    const ok = (targets: readonly CombatUnit[], area?: EffectContext['area']): TargetResolution => ({
      ok: true,
      ctx: { side: PLAYER_SIDE, caster: null, targets, area: area ?? null },
    });

    switch (spec.kind) {
      case 'none':
        return target.kind === 'none' ? ok([]) : noTarget('이 카드는 대상을 지정할 수 없습니다');

      case 'allyUnit':
      case 'enemyUnit': {
        if (target.kind !== 'unit') return noTarget('유닛 1명을 대상으로 지정해야 합니다');
        const unit = this.checkUnit(target.uid, spec.kind === 'allyUnit' ? PLAYER_SIDE : 1);
        return typeof unit === 'string' ? noTarget(unit) : ok([unit]);
      }

      case 'allyUnits': {
        if (target.kind !== 'units') return noTarget('아군 유닛 여러 명을 대상으로 지정해야 합니다');
        const count = spec.count ?? 1;
        if (target.uids.length !== count) return noTarget(`아군 ${count}명을 지정해야 합니다 (지정: ${target.uids.length}명)`);
        if (new Set(target.uids).size !== target.uids.length) return noTarget('같은 유닛을 중복해서 지정할 수 없습니다');
        const units: CombatUnit[] = [];
        for (const uid of target.uids) {
          const unit = this.checkUnit(uid, PLAYER_SIDE);
          if (typeof unit === 'string') return noTarget(unit);
          units.push(unit);
        }
        return ok(units);
      }

      case 'cell':
      case 'area3x3': {
        if (target.kind !== 'cell') return noTarget('칸을 대상으로 지정해야 합니다');
        if (!isInsideBoard(target.cell)) return noTarget('보드 밖의 칸입니다');
        return ok([], { cell: target.cell, radius: spec.kind === 'area3x3' ? 1 : 0 });
      }
    }
    return noTarget('알 수 없는 대상 종류입니다');
  }

  /** 살아 있고 요구한 진영인 유닛이면 그 유닛, 아니면 한국어 사유 */
  private checkUnit(uid: number, side: Side): CombatUnit | string {
    const unit = this.world.unitByUid(uid);
    if (!unit) return `존재하지 않는 유닛입니다 (uid ${uid})`;
    if (!unit.alive) return '이미 쓰러진 유닛은 대상으로 지정할 수 없습니다';
    if (unit.side !== side) return side === PLAYER_SIDE ? '아군 유닛만 지정할 수 있습니다' : '적 유닛만 지정할 수 있습니다';
    return unit;
  }

  // ---- 효과 모으기 ----

  /** 기본 효과 + (공명 활성 시) 공명 효과 + (연쇄 조건 충족 시) 연쇄 효과 */
  private collectEffects(view: ReturnType<typeof effectiveCard>): ResolvedEffect[] {
    const defs: EffectDef[] = [...view.effects];
    if (view.resonance && this.isTraitActive(view.resonance.trait)) defs.push(...view.resonance.effects);
    if (view.chain && this.playedCount > 0) defs.push(...view.chain.effects);
    return defs.map((d) => resolveEffect(d, 0));
  }

  private isTraitActive(traitId: string): boolean {
    return this.activeTraits.some((t) => t.traitId === traitId && t.tier >= 1);
  }
}

function fail(reason: string): PlayResult {
  return { ok: false, reason };
}
