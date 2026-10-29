import { effectiveCard } from '../../core/cards';
import type { CombatPhase } from '../../core/combat';
import type { Card } from '../../core/data/card';

/** 카드를 지금 쓸 수 있는지 판단하는 데 필요한 전투 상태 */
export interface AvailabilityContext {
  /** 시뮬 진행 단계: 준비 / 전투 / 종료 */
  phase: CombatPhase;
  prepCp: number;
  combatCp: number;
  /** 이번 전투에서 이 카드(id)를 쓴 횟수 */
  usesOf(cardId: string): number;
  cardsPlayed?: number;
  /** 이 카드의 비용 조정(방해 변이 +, 주술사 특성 −). 실제 비용은 기본 비용 + 조정, 최소 0 */
  costAdjust?: number;
}

/**
 * 손패 카드를 흐리게 보일지 판단하고 이유를 한국어로 돌려준다 (사용 가능하면 null).
 * core(CardPlayer)의 검증 순서(단계 → 전투당 제한 → CP)와 같다. 대상 관련 실패는 사용 시 sim이 알려준다.
 */
export function explainUnplayable(card: Card, upgraded: boolean, ctx: AvailabilityContext): string | null {
  if (ctx.phase === 'ended') return '전투가 끝났습니다';
  // 저주: 기본은 사용 불가. 써서 없앨 수 있는 저주(curse.playable)는 전투 중에 비용을 내고 쓴다
  if (card.type === 'curse' && !card.curse?.playable) return '저주 카드는 사용할 수 없습니다 (손패 한 칸을 차지합니다)';
  const prepCard = card.type === 'operation' || card.type === 'equipment';
  if (prepCard && ctx.phase !== 'prep') return '작전·장비 카드는 준비 단계에서만 사용할 수 있습니다';
  if (!prepCard && ctx.phase !== 'combat') return '명령·주문 카드는 전투 중에만 사용할 수 있습니다';

  const perCombat = card.limits?.perCombat;
  if (perCombat !== undefined && ctx.usesOf(card.id) >= perCombat) return `전투당 ${perCombat}회만 사용할 수 있습니다`;

  const cost = Math.max(0, effectiveCard(card, upgraded, ctx.cardsPlayed).cost + (ctx.costAdjust ?? 0));
  const pool = prepCard ? ctx.prepCp : ctx.combatCp;
  if (pool < cost) {
    const label = prepCard ? '준비 CP' : 'CP';
    return `${label} 부족 (필요 ${cost}, 보유 ${pool})`;
  }
  return null;
}
