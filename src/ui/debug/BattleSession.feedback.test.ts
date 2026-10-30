import { describe, expect, it } from 'vitest';
import { formation } from '../../core/combat/testSupport';
import { loadGameData } from '../gameData';
import { BattleSession } from './BattleSession';
import { LAYOUT } from '../theme';
import type { ActionCue } from '../feedback/ActionCue';
import { RunController } from '../../core/run';
import { RunBattleAdapter } from '../run/RunBattleAdapter';

const data = loadGameData();
function session(seed = 3) {
  const session = new BattleSession(data.units, data.traits, data.defaultFormations, {
    cards: data.cards, commanders: data.commanders, defaultCommanderId: data.defaultCommanderId,
    seriesStages: [{ name: '피드백 확인', enemy: formation([['arena_recruit', 1, 4, 2]]) }],
  });
  session.setSeed(seed); session.startManagementRun('test');
  return session;
}

describe('action feedback follows successful game commands', () => {
  it('summons a selected unit card once without spending gold or drawing a tactical card', () => {
    const s = session(), cues: ActionCue[] = [];
    const slot = s.snapshot().management!.state.offers.findIndex(offer => offer && offer.unitId !== 'iron_shieldbearer');
    s.buyUnit(slot);
    const before = s.snapshot().management!.state;
    const card = before.bench.find(unit => unit !== null)!;
    const hand = s.cardView().hand.map(card => card.instanceId);
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.selectManagedUnit(card.id);
    s.pointerDown(LAYOUT.BOARD_X + .5 * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + .5 * LAYOUT.CELL_SIZE, false);
    const after = s.snapshot().management!;
    expect(after.state.board.find(unit => unit.id === card.id)?.cell).toEqual({ col: 0, row: 0 });
    expect(after.state.bench.some(unit => unit?.id === card.id)).toBe(false);
    expect(after.state.gold).toBe(before.gold);
    expect(after.selectedUnitId).toBeNull();
    expect(s.cardView().hand.map(card => card.instanceId)).toEqual(hand);
    expect(cues).toMatchObject([{ kind: 'summon', unitId: card.unitId, origin: { col: 0, row: 0 } }]);
    s.pointerDown(LAYOUT.BOARD_X + 1.5 * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + .5 * LAYOUT.CELL_SIZE, false);
    expect(s.snapshot().management!.state.population).toBe(after.state.population);
    expect(cues).toHaveLength(1);
  });
  it('recalls the same unit with its equipment and can summon it again', () => {
    const s = session(), cues: ActionCue[] = [];
    const equipment = s.cardView().hand.find(card => card.cardId === 'forged_blade')!;
    s.beginCard(equipment.instanceId, 'click');
    s.pointerDown(LAYOUT.BOARD_X + 3.5 * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + 1.5 * LAYOUT.CELL_SIZE, false);
    const before = s.snapshot().management!.state;
    const unit = before.board.find(unit => unit.equipment.length > 0)!;
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.moveManagedToBench(unit.id);
    const recalled = s.snapshot().management!.state.bench.find(card => card?.id === unit.id)!;
    expect(recalled).toMatchObject({ id: unit.id, unitId: unit.unitId, star: unit.star, equipment: unit.equipment, cell: null });
    expect(cues[0]).toMatchObject({ kind: 'recall', unitId: unit.unitId, origin: unit.cell });
    s.moveManagedToBoard(unit.id, { col: 0, row: 0 });
    expect(s.snapshot().management!.state.board.find(u => u.id === unit.id)?.equipment).toEqual(unit.equipment);
    expect(s.snapshot().management!.state.gold).toBe(before.gold);
    expect(cues[1]).toMatchObject({ kind: 'summon', unitId: unit.unitId });
  });
  it('keeps unplaced unit cards when a summon fails or combat is already running', () => {
    const s = session(), cues: ActionCue[] = [];
    const initial = s.snapshot().management!.state.board[0]!;
    s.moveManagedToBench(initial.id);
    s.subscribeActionFeedback(cue => cues.push(cue));
    const reserve = s.snapshot().management!.state.bench;
    s.moveManagedToBoard(initial.id, { col: 4, row: 0 });
    expect(s.snapshot().management!.state.bench).toEqual(reserve);
    expect(cues).toEqual([]);
    s.start(3);
    s.moveManagedToBoard(initial.id, { col: 0, row: 0 });
    s.moveManagedToBench(s.snapshot().management!.state.board[0]!.id);
    expect(s.snapshot().management!.state.bench).toEqual(reserve);
    expect(cues).toEqual([]);
  });
  it('sends an ordinary recruit from its purchased offer to the actual bench slot', () => {
    const s = session(), cues: ActionCue[] = [];
    const before = s.snapshot().management!.state;
    const slot = before.offers.findIndex((offer) => offer && offer.unitId !== 'iron_shieldbearer');
    expect(slot).toBeGreaterThanOrEqual(0);
    const offer = before.offers[slot]!;
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.buyUnit(slot);
    const after = s.snapshot().management!.state;
    const benchIndex = after.bench.findIndex(unit => unit?.unitId === offer.unitId);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'purchase', unitId: offer.unitId, shopSlot: slot, benchIndex, amount: offer.cost });
    s.buyUnit(slot);
    s.buyUnit(-1);
    expect(cues).toHaveLength(1);
  });
  it('reports successful rerolls, level ups, and both lock states', () => {
    const s = session(), cues: ActionCue[] = [];
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.rerollShop();
    s.buyExperience();
    s.toggleShopLock();
    s.toggleShopLock();
    expect(cues).toMatchObject([
      { kind: 'reroll', amount: 1 },
      { kind: 'experience', amount: 4, previousLevel: 3, level: 4 },
      { kind: 'shopLock', locked: true },
      { kind: 'shopLock', locked: false },
    ]);
  });
  it('does not celebrate purchases, XP, or rerolls that fail for lack of gold', () => {
    const s = session(), cues: ActionCue[] = [];
    while (s.snapshot().economy.gold > 0) s.rerollShop();
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.rerollShop();
    s.buyExperience();
    s.buyUnit(0);
    expect(cues).toEqual([]);
  });
  it('blocks all shop feedback during combat', () => {
    const s = session(), cues: ActionCue[] = [];
    s.start(3);
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.rerollShop(); s.buyExperience(); s.toggleShopLock(); s.buyUnit(0);
    expect(cues).toEqual([]);
  });
  it('reports a relic free reroll with the actual zero cost', () => {
    const s = session();
    const run = RunController.createTest(data.run, { seed: 1, gold: 0, relics: ['merchants_scale'] });
    run.chooseNode(run.availableNodes()[0]!.id);
    s.attachRun(new RunBattleAdapter(run));
    const cues: ActionCue[] = [];
    s.subscribeActionFeedback(cue => cues.push(cue));
    s.rerollShop();
    expect(cues).toMatchObject([{ kind: 'reroll', amount: 0, label: '무료 리롤' }]);
    s.rerollShop();
    expect(cues).toHaveLength(1);
  });
  it('also detects a committed reward/test-tool merge when the same run is reattached', () => {
    const s = session();
    const run = RunController.createTest(data.run, { seed: 1, gold: 100 });
    run.chooseNode(run.availableNodes()[0]!.id);
    s.attachRun(new RunBattleAdapter(run));
    const cues: ActionCue[] = [];
    s.subscribeActionFeedback((cue) => cues.push(cue));
    expect(run.test.grantUnit('iron_shieldbearer', 1, 'bench').ok).toBe(true);
    s.attachRun(new RunBattleAdapter(run));
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'merge', star: 2, unitId: 'iron_shieldbearer' });
    s.attachRun(new RunBattleAdapter(run));
    expect(cues).toHaveLength(1);
  });
  it('emits three converging copies only after a real purchase completes a merge', () => {
    let s = session(), slot = -1;
    for (let seed = 1; seed <= 100; seed++) {
      s = session(seed);
      slot = s.snapshot().management!.state.offers.findIndex((offer) => offer?.unitId === 'iron_shieldbearer');
      if (slot >= 0) break;
    }
    expect(slot).toBeGreaterThanOrEqual(0);
    const cues: ActionCue[] = [];
    s.subscribeActionFeedback((cue) => cues.push(cue));
    s.buyUnit(slot);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ kind: 'merge', unitId: 'iron_shieldbearer', fromStar: 1, star: 2 });
    expect(cues[0]!.mergeSources).toHaveLength(3);
    expect(cues[0]!.mergeSources!.some((source) => source.shopSlot === slot)).toBe(true);
    s.buyUnit(slot);
    expect(cues).toHaveLength(1);
  });
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
