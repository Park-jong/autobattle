import type { CardCatalog } from '../data/cardLoader';
import { DataValidationError } from '../data/errors';
import { FieldReader } from '../data/fieldReader';
import type { CardInstance } from './cardInstance';
import type { DeckSnapshot } from './deck';

const PILES = ['draw', 'hand', 'discard', 'exhaust'] as const;

/**
 * 저장된 덱 상태(JSON)를 검증해 DeckSnapshot으로 읽는다.
 * 형식 오류·중복 인스턴스 ID·알 수 없는 카드·강화 버전이 없는 강화 카드는 위치가 담긴 DataValidationError.
 */
export function parseDeckSnapshot(data: unknown, path: string, catalog: CardCatalog): DeckSnapshot {
  const r = FieldReader.of(data, path);
  r.onlyKeys(['nextInstanceId', 'draw', 'hand', 'discard', 'exhaust', 'rngState']);
  const nextInstanceId = r.int('nextInstanceId', 1);
  const seen = new Set<number>();
  const piles = {} as Record<(typeof PILES)[number], CardInstance[]>;
  for (const pile of PILES) {
    piles[pile] = r.array(pile).map((raw, i) => {
      const c = FieldReader.of(raw, `${path}.${pile}[${i}]`);
      c.onlyKeys(['instanceId', 'cardId', 'upgraded', 'grantedBy']);
      const instanceId = c.int('instanceId', 1);
      if (instanceId >= nextInstanceId) c.fail('instanceId', `nextInstanceId(${nextInstanceId})보다 작아야 함`);
      if (seen.has(instanceId)) c.fail('instanceId', `중복된 카드 인스턴스 ID ${instanceId}`);
      seen.add(instanceId);
      const cardId = c.string('cardId');
      const def = catalog.get(cardId);
      if (!def) c.fail('cardId', `cards.json에 없는 카드 id "${cardId}"`);
      const upgraded = c.boolean('upgraded');
      if (upgraded && !def?.upgrade) c.fail('upgraded', `카드 "${cardId}"에는 강화 버전이 없음`);
      const card: CardInstance = { instanceId, cardId, upgraded };
      if (c.has('grantedBy')) card.grantedBy = c.string('grantedBy');
      return card;
    });
  }
  const rngState = r.number('rngState');
  if (!Number.isInteger(rngState)) throw new DataValidationError(`${path}.rngState`, `정수여야 함 (실제: ${rngState})`);
  return { nextInstanceId, draw: piles.draw, hand: piles.hand, discard: piles.discard, exhaust: piles.exhaust, rngState };
}
