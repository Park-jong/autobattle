import type { CommanderDef } from '../data/commander';
import type { DeckCardSpec } from './cardInstance';

export type DeckPreset = 'starter' | 'test';

/** M2 플레이테스트용 10장. 새 카드 5종과 기존 지원 카드를 함께 사용한다. */
const TEST_CARDS = [
  'firestorm', 'mana_infusion', 'tactical_reorganization', 'ember_arrow', 'marching_song',
  'war_drums', 'forged_blade', 'hold_the_line', 'focus_fire', 'call_reserves',
] as const;

/** 지휘관의 시작 덱을 장 단위 명세로 펼친다 (강화 없음) */
export function startingDeckSpecs(commander: CommanderDef, preset: DeckPreset = 'starter'): DeckCardSpec[] {
  if (preset === 'test') return TEST_CARDS.map((cardId) => ({ cardId }));
  return commander.startingDeck.flatMap((entry) =>
    Array.from({ length: entry.count }, () => ({ cardId: entry.cardId })),
  );
}
