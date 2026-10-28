import { describe, expect, it } from 'vitest';
import { RunController, type RunSave } from './index';
import { driveTo, finishBattle, newRun, runDeps } from './testSupport';

const roundTrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
/** 저장 → 복원 → 다시 저장한 결과가 같은지 (상태가 저장에 모두 담겨 있고 검증을 통과함) */
const expectStable = (run: RunController): void => {
  const saved = JSON.parse(JSON.stringify(run.serialize()));
  expect(JSON.parse(JSON.stringify(RunController.restore(runDeps, saved).serialize()))).toEqual(saved);
};

const create = (setup: Partial<Parameters<typeof RunController.createTest>[1]> = {}): RunController =>
  RunController.createTest(runDeps, { seed: 11, ...setup });

describe('테스트 런 생성', () => {
  it('설정이 없으면 일반 새 런과 같은 상태에 테스트 표시만 붙는다', () => {
    const test = create();
    const normal = RunController.create(runDeps, { seed: 11 });
    expect(test.testInfo).toEqual({ startAct: 1, startPosition: 'actStart' });
    expect(normal.testInfo).toBeNull();
    const { test: marker, ...rest } = test.serialize();
    expect(marker).toEqual({ startAct: 1, startPosition: 'actStart' });
    expect(rest).toEqual(normal.serialize());
  });

  it('액트 2 처음: 액트 1을 보스까지 지나온 것으로 기록하고 액트 2의 1층에서 시작한다', () => {
    const run = create({ startAct: 2 });
    expect(run.act).toBe(2);
    expect(run.phase).toBe('map');
    expect(run.totalActs).toBe(3);
    expect(run.availableNodes().every((n) => n.floor === 1 && n.id.startsWith('a2-'))).toBe(true);
    // 액트 1의 경로: 1층부터 보스까지 13개
    expect(run.visited).toHaveLength(13);
    expect(run.history.filter((r) => r.type === 'boss')).toHaveLength(1);
    expect(run.history.every((r) => r.outcome === 'win')).toBe(true);
    expectStable(run);
    // 이어서 일반 진행이 된다
    const node = run.availableNodes()[0]!;
    expect(run.chooseNode(node.id).ok).toBe(true);
    expectStable(run);
  });

  it('액트 3 처음: 지난 두 액트가 기록된다', () => {
    const run = create({ startAct: 3 });
    expect(run.act).toBe(3);
    expect(run.visited).toHaveLength(26);
    expect(run.actInfo.name).toBe('몰락한 수도 아스트라');
    expectStable(run);
  });

  it('액트 2 보스 직전: 12층 야영지를 지난 맵 단계에서 보스만 고를 수 있다', () => {
    const run = create({ startAct: 2, startPosition: 'bossGate' });
    expect(run.phase).toBe('map');
    expect(run.currentNode?.floor).toBe(12);
    expect(run.currentNode?.type).toBe('camp');
    const next = run.availableNodes();
    expect(next).toHaveLength(1);
    expect(next[0]!.type).toBe('boss');
    expect(run.floorReached).toBe(12);
    expectStable(run);
    expect(run.chooseNode(next[0]!.id).ok).toBe(true);
    expect(run.phase).toBe('battlePrep');
    expectStable(run);
  });

  it('액트 1 보스 직전도 만들 수 있다', () => {
    const run = create({ startPosition: 'bossGate' });
    expect(run.act).toBe(1);
    expect(run.availableNodes()[0]!.type).toBe('boss');
    expectStable(run);
  });

  it('골드·HP·레벨·유물·카드·유닛이 적용된다', () => {
    const run = create({
      commanderId: 'cmd_nox', startAct: 2, startPosition: 'bossGate',
      gold: 123, hp: 30, maxHp: 90, level: 5,
      relics: ['old_baton', 'fat_purse', 'twin_mirror'],
      cards: [{ cardId: 'hold_the_line', count: 2, upgraded: true }, { cardId: 'war_drums' }],
      units: [{ unitId: 'grove_druid', star: 3, place: 'board' }, { unitId: 'ember_kindler', star: 2 }],
    });
    expect(run.gold).toBe(123);
    expect(run.hp).toBe(30);
    expect(run.maxHp).toBe(90);
    expect(run.relics.map((r) => r.id)).toEqual(['old_baton', 'fat_purse', 'twin_mirror']);
    const cards = run.deck.draw.concat(run.deck.hand, run.deck.discard);
    expect(cards.filter((c) => c.cardId === 'hold_the_line' && c.upgraded)).toHaveLength(2);
    expect(cards.filter((c) => c.cardId === 'war_drums')).toHaveLength(1);
    const board = run.roster.snapshot();
    expect(board.level).toBe(5);
    expect(board.board.find((u) => u.unitId === 'grove_druid')?.star).toBe(3);
    expect(board.bench.find((u) => u?.unitId === 'ember_kindler')?.star).toBe(2);
    expectStable(run);
  });

  it('유물의 최대 HP 보정 뒤에 HP를 지정하지 않으면 최대 HP로 시작한다', () => {
    const run = create({ relics: ['iron_heart'] });
    expect(run.maxHp).toBeGreaterThan(run.commander.maxHp!);
    expect(run.hp).toBe(run.maxHp);
  });

  it('잘못된 설정은 한국어 오류로 거부된다', () => {
    expect(() => create({ startAct: 4 })).toThrow('시작 액트');
    expect(() => create({ gold: -1 })).toThrow('골드');
    expect(() => create({ hp: 100, maxHp: 50 })).toThrow('현재 HP');
    expect(() => create({ level: 2 })).toThrow('레벨');
    expect(() => create({ relics: ['nope'] })).toThrow('알 수 없는 유물');
    expect(() => create({ relics: ['old_baton', 'old_baton'] })).toThrow('두 번');
    expect(() => create({ cards: [{ cardId: 'blood_price' }] })).toThrow('다른 지휘관');
    expect(() => create({ cards: [{ cardId: 'nope' }] })).toThrow('알 수 없는 카드');
    expect(() => create({ units: [{ unitId: 'nope' }] })).toThrow('받을 수 없는 유닛');
    expect(() => create({ units: [{ unitId: 'grove_druid', star: 4 }] })).toThrow('성급');
    expect(() => create({ units: [{ unitId: 'grove_druid', place: 'board' }, { unitId: 'moss_warden', place: 'board' }] })).toThrow('인구 한도');
  });
});

describe('테스트 명령', () => {
  it('일반 런에서는 모든 명령이 거부되고 상태는 그대로다', () => {
    const run = newRun(5, 'starter', 3);
    const before = JSON.stringify(run.serialize());
    const t = run.test;
    const results = [
      t.setGold(50), t.addGold(5), t.setHp(10), t.setLevel(5), t.addRelic('old_baton'), t.removeRelic('old_baton'),
      t.addCard('war_drums'), t.removeCard(1), t.grantUnit('grove_druid'), t.jumpToBoss(true), t.skipToNextAct(true), t.forceBattleResult('win'),
    ];
    for (const result of results) expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('테스트 런에서만') });
    expect(JSON.stringify(run.serialize())).toBe(before);
  });

  it('골드·HP·레벨', () => {
    const run = create();
    expect(run.test.setGold(500).ok).toBe(true);
    expect(run.gold).toBe(500);
    expect(run.test.setGold(7).ok).toBe(true);
    expect(run.gold).toBe(7);
    expect(run.test.addGold(100).ok).toBe(true);
    expect(run.gold).toBe(107);
    expect(run.test.setGold(-1).ok).toBe(false);
    expect(run.test.addGold(0).ok).toBe(false);
    expect(run.test.setHp(20, 60).ok).toBe(true);
    expect([run.hp, run.maxHp]).toEqual([20, 60]);
    expect(run.test.setHp(10).ok).toBe(true);
    expect([run.hp, run.maxHp]).toEqual([10, 60]);
    expect(run.test.setHp(0).ok).toBe(false);
    expect(run.test.setHp(70).ok).toBe(false);
    expect(run.test.setLevel(7).ok).toBe(true);
    expect(run.roster.snapshot().level).toBe(7);
    expect(run.test.setLevel(10).ok).toBe(false);
    expectStable(run);
  });

  it('보드 인원보다 낮은 레벨로는 내릴 수 없다', () => {
    const run = create({ level: 6, units: [{ unitId: 'grove_druid', place: 'board' }, { unitId: 'moss_warden', place: 'board' }] });
    expect(run.roster.snapshot().board.length).toBe(4);
    const result = run.test.setLevel(3);
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('인구 한도') });
    expect(run.roster.snapshot().level).toBe(6);
  });

  it('유물 추가·제거 (최대 HP 유물은 최대 HP도 되돌린다)', () => {
    const run = create();
    const base = run.maxHp;
    expect(run.test.addRelic('iron_heart').ok).toBe(true);
    expect(run.maxHp).toBeGreaterThan(base);
    expect(run.test.addRelic('iron_heart').ok).toBe(false);
    expect(run.test.addRelic('nope').ok).toBe(false);
    expect(run.test.removeRelic('iron_heart').ok).toBe(true);
    expect(run.maxHp).toBe(base);
    expect(run.hp).toBeLessThanOrEqual(base);
    expect(run.relics).toHaveLength(0);
    expect(run.test.removeRelic('iron_heart').ok).toBe(false);
    expectStable(run);
  });

  it('쌍둥이 거울·무료 리롤 유물을 빼도 저장이 유효하다', () => {
    const run = create({ relics: ['twin_mirror', 'merchants_scale'] });
    expect(run.test.removeRelic('twin_mirror').ok).toBe(true);
    expect(run.test.removeRelic('merchants_scale').ok).toBe(true);
    expectStable(run);
  });

  it('카드 추가(강화·장수)·제거', () => {
    const run = create();
    const count = (id: string) => run.deck.draw.concat(run.deck.hand, run.deck.discard).filter((c) => c.cardId === id).length;
    const before = count('hold_the_line');
    expect(run.test.addCard('hold_the_line', true, 3).ok).toBe(true);
    expect(count('hold_the_line')).toBe(before + 3);
    expect(run.test.addCard('blood_price').ok).toBe(false);
    expect(run.test.addCard('nope').ok).toBe(false);
    const target = run.deck.draw.concat(run.deck.hand, run.deck.discard).find((c) => c.cardId === 'hold_the_line')!;
    const removalsBefore = run.removals;
    expect(run.test.removeCard(target.instanceId).ok).toBe(true);
    expect(count('hold_the_line')).toBe(before + 2);
    expect(run.removals).toBe(removalsBefore);
    expect(run.test.removeCard(99999).ok).toBe(false);
    expectStable(run);
  });

  it('시작 덱 카드를 모두 빼도 저장이 유효하다 (일반 런이면 거부되는 상태)', () => {
    const run = create();
    for (const card of run.deck.draw.concat(run.deck.hand, run.deck.discard)) run.test.removeCard(card.instanceId);
    expectStable(run);
  });

  it('유닛 지급: 성급·위치, 보드 인구 한도·벤치 용량 검사', () => {
    const run = create();
    expect(run.test.grantUnit('grove_druid', 3, 'bench').ok).toBe(true);
    expect(run.roster.snapshot().bench.some((u) => u?.unitId === 'grove_druid' && u.star === 3)).toBe(true);
    expect(run.test.grantUnit('moss_warden', 1, 'board').ok).toBe(true);
    expect(run.test.grantUnit('ember_kindler', 1, 'board')).toMatchObject({ ok: false, reason: expect.stringContaining('인구 한도') });
    expect(run.test.grantUnit('nope').ok).toBe(false);
    expect(run.test.grantUnit('grove_druid', 5).ok).toBe(false);
    expectStable(run);
  });

  it('보스 직전 이동: 야영지 경유 / 바로 보스 전투 준비', () => {
    const viaCamp = create({ startAct: 2 });
    expect(viaCamp.test.jumpToBoss(true).ok).toBe(true);
    expect(viaCamp.phase).toBe('camp');
    expect(viaCamp.currentNode?.floor).toBe(12);
    expectStable(viaCamp);
    expect(viaCamp.leaveCamp().ok).toBe(true);
    expect(viaCamp.availableNodes()[0]!.type).toBe('boss');

    const direct = create({ startAct: 2 });
    expect(direct.test.jumpToBoss(false).ok).toBe(true);
    expect(direct.phase).toBe('battlePrep');
    expect(direct.currentNode?.type).toBe('boss');
    expect(direct.currentNode?.id.startsWith('a2-')).toBe(true);
    expectStable(direct);
    // 전투 준비 중에는 이동 명령이 거부된다
    expect(direct.test.jumpToBoss(false)).toMatchObject({ ok: false });
  });

  it('진행 중(상점·이벤트·야영지 노드 안)에서도 보스로 이동할 수 있다', () => {
    const run = create();
    driveTo(run, 'camp');
    expect(run.phase).toBe('camp');
    expect(run.test.jumpToBoss(false).ok).toBe(true);
    expect(run.phase).toBe('battlePrep');
    expectStable(run);
    const mid = create();
    driveTo(mid, 'shop');
    expect(mid.phase).toBe('shop');
    expect(mid.test.jumpToBoss(true).ok).toBe(true);
    expect(mid.phase).toBe('camp');
    expectStable(mid);
  });

  it('전투 준비 중인 노드에서 보스로 이동하면 그 전투는 이긴 것으로 기록된다', () => {
    const run = create();
    driveTo(run, 'elite');
    expect(run.phase).toBe('battlePrep');
    const nodeId = run.currentNode!.id;
    expect(run.test.jumpToBoss(false).ok).toBe(true);
    expect(run.history.filter((r) => r.nodeId === nodeId)).toEqual([expect.objectContaining({ outcome: 'win' })]);
    expect(run.currentNode?.type).toBe('boss');
    expectStable(run);

    const skip = create();
    driveTo(skip, 'combat');
    expect(skip.phase).toBe('battlePrep');
    expect(skip.test.skipToNextAct(false).ok).toBe(true);
    expect(skip.phase).toBe('actIntro');
    expectStable(skip);
  });

  it('보스 전투 준비에서 다음 액트로 넘기면 보스 승리가 기록된다', () => {
    const run = create({ startPosition: 'bossGate' });
    run.chooseNode(run.availableNodes()[0]!.id);
    expect(run.test.skipToNextAct(true).ok).toBe(true);
    expect(run.phase).toBe('bossRelic');
    expect(run.history.at(-1)).toMatchObject({ type: 'boss', outcome: 'win' });
    expectStable(run);
  });

  it('명령 묶음별 사용 가능 사유를 알려 준다', () => {
    const run = create({ startPosition: 'bossGate' });
    expect(run.test.availability()).toEqual({ edit: null, move: null, battle: expect.stringContaining('전투'), nextAct: null });
    run.chooseNode(run.availableNodes()[0]!.id);
    run.beginBattle();
    expect(run.test.availability()).toMatchObject({ edit: expect.any(String), move: expect.any(String), battle: null });
    expect(newRun(1).test.availability().edit).toContain('테스트 런에서만');
    expect(create({ startAct: 3 }).test.availability().nextAct).toContain('마지막 액트');
  });

  it('보스 직전 야영지에서 보스 야영지 경유를 요청해도 바로 보스로 들어간다', () => {
    const run = create({ startPosition: 'bossGate' });
    expect(run.test.jumpToBoss(true).ok).toBe(true);
    expect(run.phase).toBe('battlePrep');
    expect(run.currentNode?.type).toBe('boss');
  });

  it('다음 액트로 넘기기: 보스 유물 선택 / 바로 액트 소개 / 마지막 액트는 거부', () => {
    const withRelic = create({ hp: 40 });
    expect(withRelic.test.skipToNextAct(true).ok).toBe(true);
    expect(withRelic.phase).toBe('bossRelic');
    expect(withRelic.bossRelicChoices().length).toBeGreaterThan(0);
    expectStable(withRelic);
    expect(withRelic.claimBossRelic(0).ok).toBe(true);
    expect(withRelic.phase).toBe('actIntro');
    expect(withRelic.act).toBe(2);
    expect(withRelic.hp).toBeGreaterThan(40);
    expectStable(withRelic);
    expect(withRelic.continueAct().ok).toBe(true);
    expect(withRelic.phase).toBe('map');
    expectStable(withRelic);

    const direct = create();
    expect(direct.test.skipToNextAct(false).ok).toBe(true);
    expect(direct.phase).toBe('actIntro');
    expect(direct.relics).toHaveLength(0);
    expectStable(direct);

    const last = create({ startAct: 3 });
    expect(last.test.skipToNextAct(true)).toMatchObject({ ok: false, reason: expect.stringContaining('마지막 액트') });
  });

  it('편집 명령은 전투 중·보상·액트 전환 단계에서 거부된다', () => {
    const run = create({ startAct: 2, startPosition: 'bossGate' });
    run.chooseNode(run.availableNodes()[0]!.id);
    run.beginBattle();
    expect(run.test.setGold(1)).toMatchObject({ ok: false, reason: expect.stringContaining('단계에서만') });
    expect(run.test.jumpToBoss(true).ok).toBe(false);
    expect(run.test.skipToNextAct(true).ok).toBe(false);
    run.abandonBattle();
    expect(run.test.setGold(1).ok).toBe(true); // 전투 준비에서는 가능

    const intro = create();
    intro.test.skipToNextAct(false);
    expect(intro.phase).toBe('actIntro');
    expect(intro.test.setHp(5).ok).toBe(false);
  });
});

describe('강제 전투 결과', () => {
  const prep = (): RunController => {
    const run = create({ startAct: 2, startPosition: 'bossGate', gold: 20 });
    run.chooseNode(run.availableNodes()[0]!.id);
    return run;
  };

  it('강제 승리는 일반 정산 경로와 같은 결과(골드·보상·보스 유물)를 낸다', () => {
    const forced = prep();
    const normal = prep();
    const a = forced.test.forceBattleResult('win');
    const b = finishBattle(normal, 'win');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.settlement).toEqual(b.settlement);
    expect(a.settlement.actCleared).toBe(2);
    expect(a.settlement.bossRelicOffer).not.toBeNull();
    expect(forced.phase).toBe('bossRelic');
    expect(forced.serialize()).toEqual(normal.serialize());
    expectStable(forced);
  });

  it('강제 패배는 패배 피해와 보스 재도전 준비를 일반 경로와 같게 낸다', () => {
    const forced = prep();
    const normal = prep();
    const a = forced.test.forceBattleResult('loss');
    const b = finishBattle(normal, 'loss');
    if (!a.ok || !b.ok) throw new Error('정산 실패');
    expect(a.settlement).toEqual(b.settlement);
    expect(a.settlement.defeatDamage).toBeGreaterThan(0);
    expect(forced.phase).toBe('battlePrep');
    expect(forced.serialize()).toEqual(normal.serialize());
  });

  it('전투 중(battle)에도 쓸 수 있고, 이미 정산했거나 전투가 없으면 거부된다', () => {
    const run = prep();
    run.beginBattle();
    expect(run.phase).toBe('battle');
    const result = run.test.forceBattleResult('win');
    expect(result.ok).toBe(true);
    expect(run.test.forceBattleResult('win')).toMatchObject({ ok: false });
    expect(create().test.forceBattleResult('win')).toMatchObject({ ok: false, reason: expect.stringContaining('전투') });
  });

  it('마지막 액트 보스 강제 승리는 승리로 끝나고, 강제 패배로 HP가 바닥나면 사망한다', () => {
    const win = create({ startAct: 3, startPosition: 'bossGate' });
    win.chooseNode(win.availableNodes()[0]!.id);
    const settled = win.test.forceBattleResult('win');
    expect(settled.ok && settled.settlement.runEnded).toBe('victory');
    expect(win.phase).toBe('ended');

    const lose = create({ startAct: 3, startPosition: 'bossGate', hp: 1 });
    lose.chooseNode(lose.availableNodes()[0]!.id);
    const dead = lose.test.forceBattleResult('loss');
    expect(dead.ok && dead.settlement.runEnded).toBe('dead');
  });
});

describe('저장 검증', () => {
  it('테스트 런 저장본은 JSON 왕복 후에도 테스트 표시와 상태가 같다', () => {
    const run = create({ commanderId: 'cmd_isera', startAct: 3, startPosition: 'bossGate', gold: 77, hp: 12, maxHp: 55, relics: ['old_baton'] });
    const restored = roundTrip(run);
    expect(restored.testInfo).toEqual({ startAct: 3, startPosition: 'bossGate' });
    expect([restored.gold, restored.hp, restored.maxHp, restored.act]).toEqual([77, 12, 55, 3]);
    expect(restored.test.setGold(1).ok).toBe(true);
  });

  it('일반 런 저장본에서는 테스트 전용 상태(임의 최대 HP·시작 덱 일부 제거)가 계속 거부된다', () => {
    const normal = newRun(3, 'starter', 3);
    const maxHp: RunSave = JSON.parse(JSON.stringify(normal.serialize()));
    maxHp.health = { hp: 20, maxHp: 99 };
    expect(() => RunController.restore(runDeps, maxHp)).toThrow('최대 HP');

    const deckless: RunSave = JSON.parse(JSON.stringify(normal.serialize()));
    deckless.forces.carryDeck.draw = [];
    deckless.forces.carryDeck.hand = [];
    deckless.forces.carryDeck.discard = [];
    expect(() => RunController.restore(runDeps, deckless)).toThrow('시작 덱');

    // 같은 조작에 테스트 표시를 붙이면 테스트 런으로 읽힌다 (표시를 붙인 시점에서 테스트 런으로 취급)
    const marked = { ...maxHp, test: { startAct: 1, startPosition: 'actStart' } };
    expect(RunController.restore(runDeps, marked).testInfo).not.toBeNull();
  });

  it('테스트 런이어도 구조 무결성은 검증된다 (다른 지휘관 카드, 맵 위치, 잘못된 표시)', () => {
    const run = create({ startAct: 2, startPosition: 'bossGate' });
    const base: RunSave = JSON.parse(JSON.stringify(run.serialize()));

    const foreign = structuredClone(base);
    const deck = foreign.forces.carryDeck;
    deck.draw.push({ instanceId: deck.nextInstanceId, cardId: 'blood_price', upgraded: false });
    deck.nextInstanceId += 1;
    expect(() => RunController.restore(runDeps, foreign)).toThrow('고유 카드');

    const skipped = structuredClone(base);
    skipped.position.visited = skipped.position.visited.slice(3);
    expect(() => RunController.restore(runDeps, skipped)).toThrow();

    const futureAct = structuredClone(base);
    futureAct.test = { startAct: 3, startPosition: 'bossGate' };
    expect(() => RunController.restore(runDeps, futureAct)).toThrow('startAct');

    const badPosition = JSON.parse(JSON.stringify(base));
    badPosition.test.startPosition = 'nowhere';
    expect(() => RunController.restore(runDeps, badPosition)).toThrow('startPosition');

    const extra = JSON.parse(JSON.stringify(base));
    extra.test.extra = 1;
    expect(() => RunController.restore(runDeps, extra)).toThrow();

    const noBossRecord = structuredClone(base);
    noBossRecord.history = noBossRecord.history.filter((record) => record.type !== 'boss');
    expect(() => RunController.restore(runDeps, noBossRecord)).toThrow('보스');
  });

  it('이전 버전(v1·v2) 저장본에는 test 필드를 허용하지 않는다', () => {
    const save = JSON.parse(JSON.stringify(newRun(3).serialize()));
    const { maps, totalActs, ...v2 } = { ...save, version: 2, map: save.maps[0], test: { startAct: 1, startPosition: 'actStart' } };
    void maps; void totalActs;
    expect(() => RunController.restore(runDeps, v2)).toThrow();
  });
});
