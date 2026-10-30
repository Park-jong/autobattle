import { describe, expect, it } from 'vitest';
import { formation } from '../../core/combat/testSupport';
import { loadGameData } from '../gameData';
import { BattleSession } from './BattleSession';
import { LAYOUT } from '../theme';
import type { ActionCue } from '../feedback/ActionCue';

const data = loadGameData();
function session() {
  const session = new BattleSession(data.units, data.traits, data.defaultFormations, {
    cards: data.cards, commanders: data.commanders, defaultCommanderId: data.defaultCommanderId,
    seriesStages: [{ name: '피드백 확인', enemy: formation([['arena_recruit', 1, 4, 2]]) }],
  });
  session.setSeed(3); session.startManagementRun('test');
  return session;
}

describe('action feedback follows successful game commands', () => {
  it('emits the actual sale value once, with no cue for a missing or locked unit', () => {
    const s = session(), cues: ActionCue[] = [];
    s.subscribeActionFeedback((cue) => cues.push(cue));
    const unit = s.snapshot().management!.state.board[0]!;
    const before = s.snapshot().economy.gold;
    s.sellManagedUnit(unit.id);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'sale', unitId: unit.unitId, amount: s.snapshot().economy.gold - before, origin: unit.cell });
    s.sellManagedUnit(unit.id);
    s.start(3);
    s.sellManagedUnit(s.snapshot().management!.state.board[0]!.id);
    expect(cues).toHaveLength(1);
  });
  it('emits equipment feedback at the selected unit, and operation feedback during preparation', () => {
    const s = session(), cues: ActionCue[] = [];
    s.subscribeActionFeedback((cue) => cues.push(cue));
    const equipment = s.cardView().hand.find((card) => card.cardId === 'forged_blade')!;
    s.beginCard(equipment.instanceId, 'click');
    s.pointerDown(LAYOUT.BOARD_X + 3.5 * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + 1.5 * LAYOUT.CELL_SIZE, false);
    expect(cues[0]).toMatchObject({ kind: 'equipment', instanceId: equipment.instanceId, targets: [{ col: 3, row: 1 }] });
    const operation = s.cardView().hand.find((card) => card.cardId === 'war_drums')!;
    s.useCardNow(operation.instanceId);
    expect(cues[1]).toMatchObject({ kind: 'card', instanceId: operation.instanceId });
    expect(cues[1]!.targets).toHaveLength(s.views().filter((unit) => unit.side === 0).length);
    s.useCardNow(operation.instanceId);
    expect(cues).toHaveLength(2);
  });
  it('does not animate selection, cancellation, or failed targeting, and allows unsubscribe', () => {
    const s = session(), cues: ActionCue[] = [];
    const unsubscribe = s.subscribeActionFeedback((cue) => cues.push(cue));
    const equipment = s.cardView().hand.find((card) => card.cardId === 'forged_blade')!;
    s.beginCard(equipment.instanceId, 'click'); s.dropCard(null); s.cancelCard();
    expect(cues).toHaveLength(0);
    unsubscribe();
    s.sellManagedUnit(s.snapshot().management!.state.board[0]!.id);
    expect(cues).toHaveLength(0);
  });
});
