import type { CardType } from '../../core/data/card';
import type { CardFaceSpec } from './cardFace';

/** 카드 목록 창의 한 줄: 카드 모양 표시 정보 + 같은 카드 장수 (덱·더미 목록이 공통으로 쓴다) */
export interface CardListEntry extends CardFaceSpec {
  cardId: string;
  count: number;
}

const TYPE_ORDER: Readonly<Record<CardType, number>> = { operation: 0, command: 1, spell: 2, equipment: 3, curse: 4 };

/**
 * 읽기 쉬운 순서로 정렬한 복사본: 종류(작전·명령·주문·장비·저주) → 비용 → 이름 → 강화 안 한 것이 먼저.
 * 뽑을 더미의 실제 순서를 드러내지 않는다 (카드 내용만으로 정해진다).
 */
export function sortCardEntries<T extends CardListEntry>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.cost - b.cost ||
      a.name.localeCompare(b.name, 'ko') ||
      Number(a.upgraded) - Number(b.upgraded),
  );
}

/** 목록 전체 장수 */
export function cardListTotal(entries: readonly CardListEntry[]): number {
  return entries.reduce((sum, e) => sum + e.count, 0);
}
