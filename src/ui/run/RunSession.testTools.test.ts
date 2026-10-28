import { describe, expect, it } from 'vitest';
import { createHarness, gameData, playBattle } from './testSupport';

const bossGate = { commanderId: 'cmd_nox', startAct: 2, startPosition: 'bossGate' as const, gold: 50, relics: ['old_baton', 'fat_purse', 'twin_mirror'] };

describe('RunSession 플레이 테스트 도구', () => {
  it('시작 화면은 테스트 시작 선택지(유물·카드·유닛)를 제공하고 보스 전용 유닛은 뺀다', () => {
    const h = createHarness();
    const catalog = h.session.snapshot().start!.testCatalog;
    expect(catalog.relics).toHaveLength(gameData.run.relics.relics.length);
    expect(catalog.cards.map((c) => c.id)).toContain('blood_price');
    expect(catalog.units.length).toBeGreaterThan(0);
    expect(catalog.units.every((u) => !gameData.units.get(u.id)?.boss)).toBe(true);
    expect(catalog.relics[0]).toMatchObject({ name: expect.any(String), rarityLabel: expect.any(String), text: expect.any(String) });
  });

  it('테스트 런을 시작하면 HUD에 배지가 붙고 테스트 도구 정보가 나온다', () => {
    const h = createHarness();
    h.session.startTestRun(7, bossGate);
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ act: 2, gold: 50, test: expect.stringContaining('액트 2 보스 직전') });
    expect(snap.hud!.relics).toHaveLength(3);
    expect(snap.map!.availableIds).toHaveLength(1);
    expect(snap.testTools).toMatchObject({ gold: 50, level: 3, commanderId: 'cmd_nox', availability: { edit: null, move: null } });
    expect(snap.testTools!.availability.battle).not.toBeNull();
    expect(snap.testTools!.ownedRelics).toHaveLength(3);
    expect(h.storage.read()).toContain('"test"');
  });

  it('잘못된 테스트 설정은 알림만 띄우고 시작 화면에 남는다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startAct: 9 });
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().notice?.message).toContain('테스트 런을 만들 수 없습니다');
    h.session.startTestRun(Number.NaN, {});
    expect(h.session.snapshot().notice?.message).toContain('시드');
  });

  it('일반 런에서는 테스트 도구가 없고 명령은 거부된다', () => {
    const h = createHarness();
    h.session.newRun(3);
    expect(h.session.snapshot().testTools).toBeNull();
    expect(h.session.snapshot().hud!.test).toBeNull();
    h.session.testCommand({ kind: 'addGold', amount: 100 });
    expect(h.session.snapshot().hud!.gold).toBe(10);
    expect(h.session.snapshot().notice?.message).toContain('테스트 런에서만');
  });

  it('값·유물·카드·유닛 명령이 적용되고 저장된다', () => {
    const h = createHarness();
    h.session.startTestRun(7, {});
    h.session.testCommand({ kind: 'addGold', amount: 90 });
    h.session.testCommand({ kind: 'setHp', hp: 21, maxHp: 70 });
    h.session.testCommand({ kind: 'addRelic', relicId: 'old_baton' });
    h.session.testCommand({ kind: 'addCard', cardId: 'war_drums', upgraded: true, count: 2 });
    h.session.testCommand({ kind: 'grantUnit', unitId: 'grove_druid', star: 3, place: 'bench' });
    const snap = h.session.snapshot();
    expect(snap.hud).toMatchObject({ gold: 100, hp: 21, maxHp: 70 });
    expect(snap.testTools!.ownedRelics.map((r) => r.id)).toEqual(['old_baton']);
    expect(snap.testTools!.deck.filter((c) => c.cardId === 'war_drums' && c.upgraded)).toHaveLength(2);
    const saved = JSON.parse(h.storage.read()!);
    expect(saved.test).toEqual({ startAct: 1, startPosition: 'actStart' });
    expect(saved.forces.economy.balance).toBe(100);
    h.session.testCommand({ kind: 'removeRelic', relicId: 'old_baton' });
    expect(h.session.snapshot().hud!.relics).toHaveLength(0);
  });

  it('전투 준비 중 값을 바꾸면 준비 화면이 새 상태로 다시 만들어진다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startPosition: 'bossGate' });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    expect(h.session.snapshot().screen).toBe('battle');
    h.session.testCommand({ kind: 'addGold', amount: 40 });
    expect(h.session.snapshot().screen).toBe('battle');
    expect(h.session.snapshot().battle!.stage).toBe('prep');
    expect(h.battle.snapshot().economy.gold).toBe(50);
    h.session.testCommand({ kind: 'grantUnit', unitId: 'grove_druid', star: 1, place: 'board' });
    expect(h.battle.snapshot().management!.state.board.some((u) => u.unitId === 'grove_druid')).toBe(true);
  });

  it('보스 직전 이동·다음 액트 이동 명령', () => {
    const h = createHarness();
    h.session.startTestRun(7, {});
    h.session.testCommand({ kind: 'jumpToBoss', viaCamp: true });
    expect(h.session.snapshot().screen).toBe('camp');
    h.session.testCommand({ kind: 'jumpToBoss', viaCamp: false });
    expect(h.session.snapshot().screen).toBe('battle');
    expect(h.session.snapshot().battle!.plan.kindLabel).toContain('보스');
    h.session.testCommand({ kind: 'nextAct', withBossRelic: true });
    expect(h.session.snapshot().screen).toBe('bossRelic');
    h.session.claimBossRelic(0);
    expect(h.session.snapshot().screen).toBe('actIntro');
    expect(h.session.snapshot().hud!.act).toBe(2);
    h.session.testCommand({ kind: 'setGold', amount: 5 });
    expect(h.session.snapshot().notice?.message).toContain('단계에서만');
  });

  it('강제 승리: 전투 결과 화면을 거쳐 보스 유물 선택, 액트 소개로 이어진다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { ...bossGate, relics: [] });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    expect(h.session.snapshot().battle!.stage).toBe('prep');
    h.session.testCommand({ kind: 'forceResult', result: 'win' });
    let snap = h.session.snapshot();
    expect(snap.screen).toBe('battle');
    expect(snap.battle!.stage).toBe('result');
    expect(snap.battle!.settlement).toMatchObject({ outcome: 'win' });
    // 결과 확인 중에는 다른 테스트 명령이 막힌다
    expect(snap.testTools!.availability.edit).toContain('계속');
    h.session.testCommand({ kind: 'addGold', amount: 1 });
    expect(h.session.snapshot().notice?.message).toContain('계속');
    h.session.continueAfterBattle();
    snap = h.session.snapshot();
    expect(snap.screen).toBe('bossRelic');
    expect(snap.bossRelic!.relics.length).toBeGreaterThan(0);
    h.session.claimBossRelic(0);
    snap = h.session.snapshot();
    expect(snap.screen).toBe('actIntro');
    expect(snap.hud!.test).not.toBeNull();
    h.session.continueAct();
    snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud!.act).toBe(3);
  });

  it('재생 중인 전투도 강제 패배로 끝낼 수 있고 보스 재도전 준비로 돌아온다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startPosition: 'bossGate' });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    h.session.startBattle();
    expect(h.session.snapshot().battle!.stage).toBe('playing');
    h.session.testCommand({ kind: 'forceResult', result: 'loss' });
    expect(h.session.snapshot().battle!.stage).toBe('result');
    expect(h.session.snapshot().battle!.settlement).toMatchObject({ outcome: 'loss' });
    h.session.continueAfterBattle();
    expect(h.session.snapshot().screen).toBe('battle');
    expect(h.session.snapshot().battle).toMatchObject({ stage: 'prep', attempt: 2 });
  });

  it('테스트 런 종료 화면: 승리해도 건너뛴 구간 기록은 통계에서 빠지고 테스트 런 표시가 붙는다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startAct: 3, startPosition: 'bossGate' });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    h.session.testCommand({ kind: 'forceResult', result: 'win' });
    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.ended).toMatchObject({ outcome: 'victory', battles: { played: 1, wins: 1, losses: 0, draws: 0 } });
    expect(snap.ended!.testRun).toMatchObject({ badge: expect.stringContaining('테스트 런'), skippedRecords: expect.any(Number) });
    expect(snap.ended!.testRun!.skippedRecords).toBeGreaterThanOrEqual(20);
  });

  it('테스트 런 종료 화면: 사망해도 실제로 치른 전투만 센다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startAct: 2, startPosition: 'bossGate', hp: 1 });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    h.session.testCommand({ kind: 'forceResult', result: 'loss' });
    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.ended).toMatchObject({ outcome: 'dead', battles: { played: 1, wins: 0, losses: 1, draws: 0 } });
    expect(snap.ended!.testRun!.skippedRecords).toBeGreaterThan(10);
  });

  it('일반 런 종료 화면에는 테스트 런 표시가 없다', () => {
    const h = createHarness();
    h.session.newRun(3);
    expect(h.session.snapshot().ended).toBeNull();
  });

  it('강제 결과는 전투가 없을 때 사유와 함께 거부된다', () => {
    const h = createHarness();
    h.session.startTestRun(7, {});
    h.session.testCommand({ kind: 'forceResult', result: 'win' });
    expect(h.session.snapshot().notice?.message).toContain('전투');
    expect(h.session.snapshot().screen).toBe('map');
  });

  it('시작 화면으로 나갔다 이어하면 테스트 표시와 상태가 유지되고, 요약에 테스트 런이 표시된다', () => {
    const h = createHarness();
    h.session.startTestRun(7, bossGate);
    h.session.toStart();
    const status = h.session.snapshot().start!.save;
    expect(status.kind === 'ok' && status.summary.test).toBe(true);
    h.session.continueRun();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ act: 2, gold: 50, test: expect.any(String) });
    expect(snap.testTools).not.toBeNull();
  });

  it('일반 전투 흐름은 테스트 런에서도 그대로 정산된다', () => {
    const h = createHarness();
    h.session.startTestRun(7, {});
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    playBattle(h);
    expect(h.session.snapshot().battle!.settlement).not.toBeNull();
  });
});
