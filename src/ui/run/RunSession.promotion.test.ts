import { describe, expect, it } from 'vitest';
import { createHarness } from './testSupport';

function camp(gold = 100, star = 1) {
  const h = createHarness();
  h.session.startTestRun(1, { gold, units: [{ unitId: 'moss_warden', star, place: 'bench' }] });
  h.session.testCommand({ kind: 'jumpToBoss', viaCamp: true });
  expect(h.session.snapshot().screen).toBe('camp');
  return h;
}

describe('유닛 승급 연출 알림', () => {
  it.each([1, 2])('%i성 승급은 확정된 성급과 실제 지불 비용을 한 번 기록한다', star => {
    const h = camp(100, star);
    const before = h.session.snapshot();
    const target = before.camp!.promotions.find(unit => unit.unitId === 'moss_warden')!;
    expect(before.unitPromotion).toBeNull();
    h.session.campPromote(target.id);
    const after = h.session.snapshot();
    expect(after.screen).toBe('map');
    expect(after.unitPromotion).toMatchObject({
      ownedId: target.id, unitId: target.unitId, unitName: target.unitName,
      fromStar: star, star: star + 1, cost: before.hud!.gold - after.hud!.gold,
    });
    expect(after.unitPromotion!.cost).toBe(target.cost);
    // Rejected repeat commands must not trigger another success animation.
    h.session.campPromote(target.id);
    expect(h.session.snapshot().unitPromotion).toEqual(after.unitPromotion);
    const saved = JSON.parse(h.storage.read()!);
    const owned = saved.forces.management.owned.find((unit: { id: number }) => unit.id === target.id);
    expect(owned.star).toBe(star + 1);
  });

  it('골드 부족·존재하지 않는 유닛은 성공 연출을 만들지 않는다', () => {
    const h = camp(0);
    const target = h.session.snapshot().camp!.promotions[0]!;
    h.session.campPromote(target.id);
    expect(h.session.snapshot().screen).toBe('camp');
    expect(h.session.snapshot().unitPromotion).toBeNull();
    h.session.campPromote(-1);
    expect(h.session.snapshot().unitPromotion).toBeNull();
  });

  it('저장본에서 이어 하거나 시작 화면으로 나가면 옛 연출을 재생하지 않는다', () => {
    const h = camp();
    h.session.campPromote(h.session.snapshot().camp!.promotions[0]!.id);
    expect(h.session.snapshot().unitPromotion).not.toBeNull();
    const restored = createHarness(h.storage);
    restored.session.continueRun();
    expect(restored.session.snapshot().screen).toBe('map');
    expect(restored.session.snapshot().unitPromotion).toBeNull();
    h.session.toStart();
    expect(h.session.snapshot().unitPromotion).toBeNull();
  });
});
