import type { Card, CardTarget, CardType, Keyword } from '../../core/data/card';

/** 카드 화면에 쓰는 한국어 표기 */
export const CARD_TYPE_LABELS: Record<CardType, string> = {
  operation: '작전',
  command: '명령',
  spell: '주문',
  equipment: '장비',
  curse: '저주',
};

export const KEYWORD_LABELS: Record<Keyword, string> = {
  exhaust: '소모',
  retain: '보존',
  chain: '연쇄',
  conscript: '징집',
};

/** 대상 지정 방식 설명 */
export function targetLabel(target: CardTarget): string {
  switch (target.kind) {
    case 'none':
      return '대상 없음';
    case 'allyUnit':
      return '아군 1명 지정';
    case 'enemyUnit':
      return '적 1명 지정';
    case 'allyUnits':
      return `아군 ${target.count ?? 1}명 지정`;
    case 'cell':
      return '칸 지정';
    case 'area3x3':
      return '3×3 범위 지정';
  }
}

/** 카드에 붙은 키워드(소모·보존…)와 제한(전투당 N회)을 짧은 표기 목록으로 */
export function cardTags(card: Card, upgraded = false): string[] {
  const keywords = upgraded && card.upgrade?.keywords ? card.upgrade.keywords : card.keywords;
  const tags = keywords.map((k) => KEYWORD_LABELS[k]);
  if (card.limits?.perCombat !== undefined) tags.push(`전투당 ${card.limits.perCombat}회`);
  if (card.type === 'curse' && !card.curse?.playable) tags.push('사용 불가');
  return tags;
}
