import { describe, expect, it } from 'vitest';
import { deckCards } from '../../core/cards';
import { RunController } from '../../core/run';
import { driveTo, newRun } from '../../core/run/testSupport';
import { newlyUpgraded } from './runViews';
import { MemoryRunStorage } from './RunStorage';
import { createHarness } from './testSupport';

/** 코어로 만든 런을 저장소에 넣고 이어하기로 연다 */
function openSaved(run: RunController) {
  const storage = new MemoryRunStorage();
  storage.write(JSON.stringify(run.serialize()));
  const h = createHarness(storage);
  h.session.continueRun();
  return h;
}

describe('강화 결과 창', () => {
  it('야영지 단련으로 강화하면 그 카드의 강화 전/후가 snapshot.upgraded에 나오고, 확인하면 사라진다', () => {
    const run = newRun(6);
    driveTo(run, 'camp');
    const h = openSaved(run);
    expect(h.session.snapshot().upgraded).toBeNull();
    const target = h.session.snapshot().camp!.upgradable[0]!;
    h.session.campUpgrade(target.instanceId);
    const notice = h.session.snapshot().upgraded!;
    expect(notice.cards).toHaveLength(1);
    expect(notice.cards[0]).toMatchObject({ instanceId: target.instanceId, before: { upgraded: false }, after: { upgraded: true } });
    expect(notice.cards[0]!.after.name).toBe(`${notice.cards[0]!.before.name}+`);
    h.session.dismissUpgradeNotice();
    expect(h.session.snapshot().upgraded).toBeNull();
  });

  it('강화가 없는 명령(휴식)에는 창이 뜨지 않는다', () => {
    const run = newRun(6);
    driveTo(run, 'camp');
    const h = openSaved(run);
    h.session.leaveCamp();
    expect(h.session.snapshot().upgraded).toBeNull();
  });

  it('newlyUpgraded: 전에는 강화 전이던 같은 인스턴스만 (새로 들어온 카드·원래 강화된 카드는 제외)', () => {
    const run = newRun(1);
    const before = deckCards(run.deck);
    const [a, b] = before;
    const after = [
      { ...a!, upgraded: true },
      { ...b!, upgraded: false },
      { instanceId: 999, cardId: a!.cardId, upgraded: true },
      ...before.slice(2),
    ];
    expect(newlyUpgraded(before, after).map((c) => c.instanceId)).toEqual([a!.instanceId]);
  });
});
