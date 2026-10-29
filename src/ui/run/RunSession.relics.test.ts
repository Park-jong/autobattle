import { describe, expect, it } from 'vitest';
import { driveTo, grantGold } from '../../core/run/testSupport';
import { allUnlockedMeta, createHarness } from './testSupport';

describe('RunSession: 지휘관 선택', () => {
  it('시작 화면 스냅샷에 지휘관 3명이 나오고 기본은 하르텐', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    const start = h.session.snapshot().start!;
    expect(start.commanders.map((c) => c.id)).toEqual(['cmd_harten', 'cmd_isera', 'cmd_nox']);
    expect(start.defaultCommanderId).toBe('cmd_harten');
  });

  it.each([
    ['cmd_harten', 80], ['cmd_isera', 70], ['cmd_nox', 65],
  ] as const)('newRun(seed, %s)로 그 지휘관의 런이 열린다', (id, hp) => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(5, id);
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ hp, maxHp: hp, relics: [] });
    expect(JSON.parse(h.storage.read()!)).toMatchObject({ commanderId: id, version: 3 });
  });

  it('지휘관을 생략하면 기본 지휘관, 모르는 지휘관은 알림 오류', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(5);
    expect(h.session.snapshot().hud!.commanderName).toContain('하르텐');
    const bad = createHarness(undefined, 42, allUnlockedMeta());
    bad.session.newRun(5, 'cmd_nope');
    expect(bad.session.snapshot().screen).toBe('start');
    expect(bad.session.snapshot().notice?.message).toContain('알 수 없는 지휘관');
  });

  it('선택한 지휘관의 전투 화면: 궁극기 이름이 손패 패널에 나온다', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(5, 'cmd_isera');
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    expect(h.battle.cardView().ultimate).toMatchObject({ name: '대분화', charge: 0 });
    expect(h.battle.cardView().commanderName).toContain('이세라');
  });
});

describe('RunSession: 유물', () => {
  it('정예 보상 화면에서 유물 받기 → HUD에 표시, 카드를 고르면 남은 유물도 함께 받는다', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(1, 'cmd_nox');
    const run = (h.session as unknown as { controller: Parameters<typeof driveTo>[0] }).controller;
    driveTo(run, 'elite');
    (h.session as unknown as { afterChange(): void }).afterChange();
    // 정예 전투 준비 화면: 승리시키는 대신 코어로 정산해 보상 화면을 만든다
    const sim = run.createSimulator();
    run.beginBattle();
    sim.startCombat();
    for (const unit of sim.world.units) if (unit.side === 1) sim.world.dealDamage({ source: null, target: unit, raw: 1e9, type: 'magic' });
    sim.step();
    expect(run.completeBattle(sim).ok).toBe(true);
    (h.session as unknown as { afterChange(): void }).afterChange();

    let snap = h.session.snapshot();
    expect(snap.screen).toBe('reward');
    expect(snap.reward!.relic).not.toBeNull();
    expect(snap.reward!.relicClaimed).toBe(false);
    const relicName = snap.reward!.relic!.name;
    h.session.claimRelic();
    snap = h.session.snapshot();
    expect(snap.reward!.relicClaimed).toBe(true);
    expect(snap.hud!.relics.map((r) => r.name)).toEqual([relicName]);

    // 다른 쪽 흐름: 유물을 따로 받지 않고 카드만 골라도 유물이 따라온다
    const h2 = createHarness(undefined, 42, allUnlockedMeta());
    h2.session.newRun(1, 'cmd_nox');
    const run2 = (h2.session as unknown as { controller: Parameters<typeof driveTo>[0] }).controller;
    driveTo(run2, 'elite');
    const sim2 = run2.createSimulator();
    run2.beginBattle();
    sim2.startCombat();
    for (const unit of sim2.world.units) if (unit.side === 1) sim2.world.dealDamage({ source: null, target: unit, raw: 1e9, type: 'magic' });
    sim2.step();
    run2.completeBattle(sim2);
    (h2.session as unknown as { afterChange(): void }).afterChange();
    expect(h2.session.snapshot().hud!.relics).toHaveLength(0);
    h2.session.claimReward(0);
    expect(h2.session.snapshot().screen).toBe('map');
    expect(h2.session.snapshot().hud!.relics).toHaveLength(1);
    const saved = JSON.parse(h2.storage.read()!);
    expect(saved.relics.owned).toHaveLength(1);
  });

  it('상점에서 유물을 사면 골드가 줄고 HUD·저장에 반영된다', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(5);
    const run = (h.session as unknown as { controller: Parameters<typeof driveTo>[0] }).controller;
    driveTo(run, 'shop');
    grantGold(run, 100);
    (h.session as unknown as { afterChange(): void }).afterChange();
    const shop = h.session.snapshot().shop!;
    expect(shop.relics).toHaveLength(2);
    const first = shop.relics[0]!;
    const gold = h.session.snapshot().hud!.gold;
    h.session.buyShopRelic(0);
    const after = h.session.snapshot();
    expect(after.hud!.gold).toBe(gold - first.price);
    expect(after.hud!.relics.map((r) => r.id)).toEqual([first.relic.id]);
    expect(after.shop!.relics[0]!.sold).toBe(true);
    expect(JSON.parse(h.storage.read()!).relics.owned).toEqual([first.relic.id]);
    h.session.buyShopRelic(0);
    expect(h.session.snapshot().notice?.message).toBe('이미 구매한 유물입니다');
  });

  it('이어하기: 지휘관과 유물이 저장에서 그대로 복원된다', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(5, 'cmd_isera');
    const run = (h.session as unknown as { controller: Parameters<typeof driveTo>[0] }).controller;
    driveTo(run, 'shop');
    grantGold(run, 100);
    (h.session as unknown as { afterChange(): void }).afterChange();
    h.session.buyShopRelic(1);
    const bought = h.session.snapshot().hud!.relics.map((r) => r.id);
    const h2 = createHarness(h.storage);
    expect(h2.session.snapshot().start!.save.kind).toBe('ok');
    h2.session.continueRun();
    const snap = h2.session.snapshot();
    expect(snap.hud!.commanderName).toContain('이세라');
    expect(snap.hud!.relics.map((r) => r.id)).toEqual(bought);
    expect(snap.shop!.relics[1]!.sold).toBe(true);
  });
});
