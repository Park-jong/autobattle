import { describe, expect, it } from 'vitest';
import { deckCards, removableCards } from '../cards';
import { RunController } from './runController';
import { driveTo, forceEvent, forceResult, grantGold, newRun, runDeps } from './testSupport';

/** M5-4 2부-C: 이벤트로 저주를 얻고(결과 문장), 상점에서 제거하며, 전투에서 동작한다 */

const CURSE_EVENTS = [
  { event: 'abandoned_depot', curse: 'dread', name: '공포' },
  { event: 'wounded_scout', curse: 'wound', name: '부상' },
  { event: 'deserter_camp', curse: 'rotten_supplies', name: '부패한 보급' },
] as const;
const CURSE_CHOICE = 3;

/** 이벤트 노드에 입장한 런 (이벤트는 지정한 것으로 바꾼다) */
function atEvent(eventId: string, seed = 1): RunController {
  const run = newRun(seed);
  driveTo(run, 'event');
  forceEvent(run, eventId);
  return run;
}
const count = (run: RunController, cardId: string) => deckCards(run.deck).filter((c) => c.cardId === cardId).length;

describe('저주 이벤트 선택지', () => {
  for (const { event, curse, name } of CURSE_EVENTS) {
    it(`${event}: 4번째 선택지를 고르면 보상과 함께 저주 [${name}]가 덱에 들어오고 결과 화면에 표시된다`, () => {
      const run = atEvent(event);
      const view = run.eventView()!;
      expect(view.choices).toHaveLength(4);
      expect(view.choices[CURSE_CHOICE]!.text).toContain('저주');
      expect(view.choices[CURSE_CHOICE]!.enabled).toBe(true);
      const deckBefore = deckCards(run.deck).length;
      const goldBefore = run.gold;
      expect(run.chooseEventOption(CURSE_CHOICE).ok).toBe(true);
      while (run.eventView()?.pending) expect(run.pickEventOption(0).ok).toBe(true);
      const after = run.eventView()!;
      expect(after.finished).toBe(true);
      expect(after.messages).toContain(`저주 획득: ${name}`);
      expect(count(run, curse)).toBe(1);
      expect(deckCards(run.deck).length).toBe(event === 'wounded_scout' ? deckBefore + 2 : deckBefore + 1);
      if (event === 'abandoned_depot') expect(run.gold).toBe(goldBefore + 25);
      expect(run.finishEvent().ok).toBe(true);
      expect(run.phase).toBe('map');
    });
  }

  it('부상당한 정찰병: 저주와 함께 희귀 카드 1장을 받는다', () => {
    const run = atEvent('wounded_scout', 3);
    const before = new Set(deckCards(run.deck).map((c) => c.instanceId));
    run.chooseEventOption(CURSE_CHOICE);
    const added = deckCards(run.deck).filter((c) => !before.has(c.instanceId));
    expect(added).toHaveLength(2);
    expect(added.map((c) => runDeps.cards.get(c.cardId)!.rarity).sort()).toEqual(['common', 'rare']); // 저주 rarity는 common
    expect(added.some((c) => c.cardId === 'wound')).toBe(true);
  });

  it('탈영병 야영지: 3등급 유닛 1기를 벤치로 받는다', () => {
    const run = atEvent('deserter_camp', 2);
    const benchBefore = run.roster.snapshot().bench.filter((u) => u !== null).length;
    run.chooseEventOption(CURSE_CHOICE);
    const bench = run.roster.snapshot().bench.filter((u) => u !== null);
    expect(bench.length).toBe(benchBefore + 1);
    expect(runDeps.units.get(bench[bench.length - 1]!.unitId)!.tier).toBe(3);
  });

  it('저주 선택지가 없는 기존 선택지는 저주를 주지 않는다', () => {
    for (const { event } of CURSE_EVENTS) {
      for (const index of [0, 1, 2]) {
        const run = atEvent(event);
        if (!run.eventView()!.choices[index]!.enabled) continue;
        run.chooseEventOption(index);
        while (run.eventView()?.pending) run.pickEventOption(0);
        expect(deckCards(run.deck).filter((c) => runDeps.cards.get(c.cardId)!.type === 'curse')).toHaveLength(0);
        expect(run.eventView()!.messages.join('')).not.toContain('저주 획득');
      }
    }
  });

  it('저주를 얻은 런을 저장·복원해도 덱과 결과 문장이 같다', () => {
    const run = atEvent('abandoned_depot', 4);
    run.chooseEventOption(CURSE_CHOICE);
    const restored = RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
    expect(count(restored, 'dread')).toBe(1);
    expect(restored.eventView()!.messages).toContain('저주 획득: 공포');
    expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(run.serialize()));
  });
});

describe('저주 제거와 전투', () => {
  it('상점의 카드 제거로 저주를 없앨 수 있다 (골드를 쓰고 제거 가격이 오른다)', () => {
    const run = atEvent('abandoned_depot', 5);
    run.chooseEventOption(CURSE_CHOICE);
    run.finishEvent();
    driveTo(run, 'shop');
    grantGold(run, 200);
    const view = run.shopView()!;
    const curse = view.removable.find((c) => c.cardId === 'dread');
    expect(curse).toBeDefined();
    const gold = run.gold;
    expect(run.removeCardForGold(curse!.instanceId).ok).toBe(true);
    expect(count(run, 'dread')).toBe(0);
    expect(run.gold).toBe(gold - view.removalPrice);
  });

  it('저주는 유닛 제공 카드가 아니라 제거 후보(상점·이벤트 제거)에 들어간다', () => {
    const run = atEvent('abandoned_depot', 6);
    run.chooseEventOption(CURSE_CHOICE);
    expect(removableCards(run.deck).some((c) => c.cardId === 'dread')).toBe(true);
  });

  it('덱의 공포는 손패에 와도 쓸 수 없고 부패한 보급은 1CP로 소모할 수 있다', () => {
    const run = RunController.createTest(runDeps, { seed: 8, cards: [{ cardId: 'dread', count: 6 }, { cardId: 'rotten_supplies', count: 6 }] });
    driveTo(run, 'combat');
    const sim = run.createSimulator();
    run.beginBattle();
    sim.startCombat();
    const dread = sim.deck!.hand.find((c) => c.cardId === 'dread');
    const rot = sim.deck!.hand.find((c) => c.cardId === 'rotten_supplies');
    if (dread) expect(sim.playCard(dread.instanceId, { kind: 'none' })).toEqual({ ok: false, reason: '저주 카드는 사용할 수 없습니다' });
    if (rot) {
      expect(sim.playCard(rot.instanceId, { kind: 'none' }).ok).toBe(true);
      expect(sim.deck!.exhaustPile.some((c) => c.instanceId === rot.instanceId)).toBe(true);
    }
    expect(dread ?? rot).toBeDefined();
    forceResult(sim, 'win');
    expect(run.completeBattle(sim).ok).toBe(true);
  });
});
