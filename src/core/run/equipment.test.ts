import { describe, expect, it } from 'vitest';
import { deckCards, exhaustCardInDeck, addCardToDeck, returnCardToDeck } from '../cards';
import { RunController } from './runController';
import { driveTo, finishBattle, newRun, runDeps } from './testSupport';

const countOf = (run: RunController, cardId: string, upgraded = false): number =>
  deckCards(run.deck).filter((c) => c.cardId === cardId && c.upgraded === upgraded).length;

/** 보드 첫 유닛에 장비를 끼운다 (장착할 때처럼 카드는 소모 더미에 둔다) */
function equipFirst(run: RunController, item: string): number {
  const forces = (run as unknown as { state: { forces: { management: { setEquipment(id: number, items: string[]): unknown }; carryDeck: unknown } } }).state.forces;
  const upgraded = item.endsWith('+');
  const cardId = upgraded ? item.slice(0, -1) : item;
  let deck = addCardToDeck(run.deck, runDeps.cards, cardId, upgraded);
  deck = exhaustCardInDeck(deck, deck.nextInstanceId - 1);
  forces.carryDeck = deck;
  const unit = run.roster.snapshot().board[0]!;
  forces.management.setEquipment(unit.id, [...unit.equipment, item]);
  return unit.id;
}

describe('장비 장착 해제·판매 시 반환', () => {
  it('returnCardToDeck: 소모 더미의 같은 카드를 되살리고, 없으면 새로 넣는다', () => {
    const run = newRun(1);
    let deck = addCardToDeck(run.deck, runDeps.cards, 'forged_blade');
    const id = deck.nextInstanceId - 1;
    deck = exhaustCardInDeck(deck, id);
    const back = returnCardToDeck(deck, runDeps.cards, 'forged_blade', false);
    expect(back.exhaust).toHaveLength(0);
    expect(back.draw.some((c) => c.instanceId === id)).toBe(true);
    const fresh = returnCardToDeck(run.deck, runDeps.cards, 'forged_blade', true);
    expect(fresh.draw.some((c) => c.cardId === 'forged_blade' && c.upgraded && c.instanceId === run.deck.nextInstanceId)).toBe(true);
  });

  it('unequip: 장비를 장착 해제하면 유닛 장비에서 빠지고 덱에 카드로 돌아온다 (강화 표시 유지, 저장·복원 통과)', () => {
    const run = newRun(2);
    const owned = equipFirst(run, 'forged_blade+');
    expect(countOf(run, 'forged_blade', true)).toBe(0);
    expect(run.unequip(owned, 0)).toEqual({ ok: true });
    expect(run.roster.snapshot().board.find((u) => u.id === owned)!.equipment).toEqual([]);
    expect(countOf(run, 'forged_blade', true)).toBe(1);
    expect(run.unequip(owned, 0)).toMatchObject({ ok: false });
    expect(() => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())))).not.toThrow();
  });

  it('장비를 낀 유닛을 팔면 장비가 카드로 덱에 돌아온다', () => {
    const run = newRun(3);
    driveTo(run, 'combat');
    const owned = equipFirst(run, 'forged_blade');
    const before = countOf(run, 'forged_blade');
    expect(run.roster.sell(owned)).toEqual({ ok: true });
    expect(countOf(run, 'forged_blade')).toBe(before + 1);
  });

  it('전투 중에는 장착 해제할 수 없다', () => {
    const run = newRun(4);
    driveTo(run, 'combat');
    const owned = equipFirst(run, 'forged_blade');
    run.beginBattle();
    expect(run.unequip(owned, 0)).toEqual({ ok: false, reason: '전투 중에는 장비를 장착 해제할 수 없습니다' });
    finishBattle(run, 'win');
  });
});
