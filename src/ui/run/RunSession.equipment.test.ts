import { describe, expect, it } from 'vitest';
import { addCardToDeck, exhaustCardInDeck } from '../../core/cards';
import { RunController } from '../../core/run';
import { driveTo, newRun, runDeps } from '../../core/run/testSupport';
import { MemoryRunStorage } from './RunStorage';
import { createHarness } from './testSupport';

/** 보드 첫 유닛에 장비를 끼운 런 (장착할 때처럼 카드는 소모 더미) */
function runWithEquipment(seed: number, item: string): RunController {
  const run = newRun(seed);
  driveTo(run, 'combat');
  const forces = (run as unknown as { state: { forces: { management: { setEquipment(id: number, items: string[]): unknown }; carryDeck: unknown } } }).state.forces;
  const upgraded = item.endsWith('+');
  let deck = addCardToDeck(run.deck, runDeps.cards, upgraded ? item.slice(0, -1) : item, upgraded);
  deck = exhaustCardInDeck(deck, deck.nextInstanceId - 1);
  forces.carryDeck = deck;
  forces.management.setEquipment(run.roster.snapshot().board[0]!.id, [item]);
  return run;
}

function openSaved(run: RunController) {
  const storage = new MemoryRunStorage();
  storage.write(JSON.stringify(run.serialize()));
  const h = createHarness(storage);
  h.session.continueRun();
  return h;
}

describe('덱 보기의 장착 중인 장비', () => {
  it('전투 준비 화면에서 장비 목록이 보이고, 장착 해제하면 덱에 카드로 돌아오며 준비 손패는 그대로다', () => {
    const h = openSaved(runWithEquipment(11, 'forged_blade+'));
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('battle');
    expect(snap.equipment).toMatchObject({ canUnequip: true, reason: null });
    expect(snap.equipment!.items).toHaveLength(1);
    const item = snap.equipment!.items[0]!;
    expect(item.card).toMatchObject({ cardId: 'forged_blade', upgraded: true });
    const before = snap.deck!.find((e) => e.cardId === 'forged_blade' && e.upgraded)?.count ?? 0;
    const hand = h.battle.cardView().hand.map((c) => [c.instanceId, c.cardId]);
    expect(hand.length).toBeGreaterThan(0);
    h.session.unequipItem(item.ownedId, item.index);
    expect(h.battle.cardView().hand.map((c) => [c.instanceId, c.cardId])).toEqual(hand); // 손패를 다시 뽑지 않는다
    const after = h.session.snapshot();
    expect(after.equipment!.items).toHaveLength(0);
    expect(after.deck!.find((e) => e.cardId === 'forged_blade' && e.upgraded)?.count ?? 0).toBe(before + 1);
    expect(after.battle?.stage).toBe('prep');
    expect(h.battle.snapshot().formations[0].every((e) => (e.equipment ?? []).length === 0)).toBe(true); // 준비 시뮬 편성에서도 빠졌다
  });

  it('전투 중에는 장착 해제할 수 없다 (버튼 비활성 사유)', () => {
    const h = openSaved(runWithEquipment(12, 'forged_blade'));
    h.session.startBattle();
    expect(h.session.snapshot().equipment).toMatchObject({ canUnequip: false, reason: '전투 중에는 장비를 장착 해제할 수 없습니다' });
  });
});
