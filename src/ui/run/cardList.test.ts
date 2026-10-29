import { describe, expect, it } from 'vitest';
import { sortCardEntries, cardListTotal, type CardListEntry } from '../cards/cardListView';
import { buildDeckList } from './runViews';
import { runDeps } from '../../core/run/testSupport';
import { createHarness } from './testSupport';

function entry(over: Partial<CardListEntry>): CardListEntry {
  return {
    cardId: 'x', name: 'x', type: 'command', typeLabel: '명령', targetLabel: '', rarity: 'common', cost: 1, upgraded: false, text: '', tags: [], count: 1, ...over,
  };
}

describe('카드 목록 정렬', () => {
  it('종류 → 비용 → 이름 → 강화 안 한 것 먼저', () => {
    const sorted = sortCardEntries([
      entry({ name: '저주', type: 'curse', cost: 0 }),
      entry({ name: '나', type: 'command', cost: 2 }),
      entry({ name: '가', type: 'command', cost: 2 }),
      entry({ name: '가+', type: 'command', cost: 2, upgraded: true }),
      entry({ name: '주문', type: 'spell', cost: 0 }),
      entry({ name: '작전', type: 'operation', cost: 3 }),
      entry({ name: '싼 명령', type: 'command', cost: 0 }),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['작전', '싼 명령', '가', '가+', '나', '주문', '저주']);
  });

  it('원본을 바꾸지 않고 장수를 합산한다', () => {
    const input = [entry({ name: 'b', count: 2 }), entry({ name: 'a', count: 3 })];
    sortCardEntries(input);
    expect(input.map((e) => e.name)).toEqual(['b', 'a']);
    expect(cardListTotal(input)).toBe(5);
  });
});

describe('buildDeckList', () => {
  const cards = runDeps.cards;
  const ids = cards.cards.filter((c) => c.upgrade).slice(0, 2).map((c) => c.id);

  it('같은 카드·같은 강화 상태는 묶어 장수를 센다', () => {
    const [a, b] = ids as [string, string];
    const list = buildDeckList(cards, [
      { instanceId: 1, cardId: a, upgraded: false },
      { instanceId: 2, cardId: a, upgraded: false },
      { instanceId: 3, cardId: a, upgraded: true },
      { instanceId: 4, cardId: b, upgraded: false },
    ]);
    expect(cardListTotal(list)).toBe(4);
    expect(list).toHaveLength(3);
    expect(list.find((e) => e.cardId === a && !e.upgraded)?.count).toBe(2);
    const up = list.find((e) => e.cardId === a && e.upgraded);
    expect(up?.count).toBe(1);
    expect(up?.name.endsWith('+')).toBe(true);
  });
});

describe('RunSession 덱 목록 캐시', () => {
  it('같은 덱이면 같은 배열 참조, 카드를 더하면 새 배열', () => {
    const h = createHarness();
    h.session.startTestRun(1, {});
    const first = h.session.snapshot().deck;
    expect(first).not.toBeNull();
    expect(h.session.snapshot().deck).toBe(first);
    const cardId = runDeps.cards.cards.find((c) => c.rarity === 'common' && c.owner === 'neutral' && !c.grantOnly)!.id;
    h.session.testCommand({ kind: 'addCard', cardId, upgraded: false, count: 1 });
    expect(h.session.snapshot().notice).toBeNull();
    expect(h.session.snapshot().deck).not.toBe(first);
  });
});
