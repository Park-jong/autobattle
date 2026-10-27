import type { CommanderDef } from '../data/commander';
import type { DeckCardSpec } from './cardInstance';

/** 지휘관의 시작 덱을 장 단위 명세로 펼친다 (강화 없음) */
export function startingDeckSpecs(commander: CommanderDef): DeckCardSpec[] {
  return commander.startingDeck.flatMap((entry) =>
    Array.from({ length: entry.count }, () => ({ cardId: entry.cardId })),
  );
}
