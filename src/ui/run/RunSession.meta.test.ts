import { describe, expect, it } from 'vitest';
import { RunController } from '../../core/run';
import { damageCommander } from '../../core/run/testSupport';
import { MetaProgress } from '../../core/meta';
import { MemoryRunStorage, type RunStorage } from './RunStorage';
import { allUnlockedMeta, createHarness, gameData, type Harness } from './testSupport';

/** 메타 저장을 항상 실패시키는 저장소 */
class FailingStorage extends MemoryRunStorage {
  override write(): string | null {
    return '저장 공간이 부족합니다';
  }
}

/** 전공 포인트를 미리 쌓아 둔 메타 저장소 (런 완료 1회분 정산: 조건 해금 포함) */
function metaWithPoints(floors: number, settle = true): MemoryRunStorage {
  const progress = new MetaProgress(gameData.meta);
  if (settle) {
    progress.settleRun({
      runId: 'seed-run', threatLevel: 0, test: false, commanderId: 'cmd_harten', outcome: 'dead', floorsReached: floors, bossActsKilled: [], eliteKills: 0,
      ultimateUses: 0, shopVisits: 0, unitStar3: false, bossEntryGold: 0, deckSize: 10,
    });
  }
  return new MemoryRunStorage(JSON.stringify(progress.serialize()));
}

const controllerOf = (h: Harness): RunController => (h.session as unknown as { controller: RunController }).controller;

/** 일반 런의 첫 전투에서 지휘관을 쓰러뜨려 런을 끝낸다 (종료 화면 직전까지) */
function dieInFirstBattle(h: Harness): void {
  h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
  damageCommander(controllerOf(h), controllerOf(h).hp - 1);
  h.battle.forceRunResult('loss');
}

describe('RunSession: 메타 해금과 런 시작', () => {
  it('잠긴 지휘관은 새 런이 거부되고(core 예외에 기대지 않음) 화면은 시작 화면 그대로다', () => {
    const h = createHarness();
    h.session.newRun(5, 'cmd_isera');
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('start');
    expect(snap.notice).toMatchObject({ kind: 'error', message: expect.stringContaining('아직 해금하지 않은 지휘관입니다: ') });
    expect(snap.notice!.message).toContain('이세라');
    expect(h.storage.read()).toBeNull();
    expect(h.runIds).toEqual([]);
  });

  it('해금된 지휘관은 런이 열리고 런 ID와 허용 유물(잠긴 유물 제외)이 저장된다', () => {
    const h = createHarness();
    h.session.newRun(5);
    expect(h.session.snapshot().screen).toBe('map');
    const saved = JSON.parse(h.storage.read()!) as { runId: string; allowedRelics: string[] };
    expect(saved.runId).toBe('run-1');
    expect(saved.allowedRelics).not.toContain('twin_mirror');
    expect(saved.allowedRelics.length).toBe(gameData.run.relics.relics.length - 12); // 잠긴 유물 12개(희귀 8 + 보스 4) 제외
  });

  it('시작 화면 스냅샷에 전공 포인트와 지휘관 잠금 정보가 나온다', () => {
    const start = createHarness().session.snapshot().start!;
    expect(start.meta.points).toBe(0);
    expect(start.meta.commanders['cmd_isera']).toMatchObject({ state: 'locked', canPurchase: false });
    expect(start.meta.commanders['cmd_harten']).toBeUndefined();
    expect(start.commanders).toHaveLength(3);
  });

  it('구매: 포인트가 부족하면 알림, 충분하면 해금되어 저장되고 곧바로 새 런을 시작할 수 있다', () => {
    const h = createHarness(undefined, 42, metaWithPoints(40, false));
    h.session.purchaseUnlock('cmd_isera');
    expect(h.session.snapshot().notice?.kind).toBe('error');
  });

  it('구매 성공 경로: 포인트를 번 뒤 조건 미달 항목을 사면 포인트가 줄고 저장된다', () => {
    const h = createHarness(undefined, 42, metaWithPoints(60));
    const before = h.session.snapshot().start!.meta.points;
    expect(before).toBe(60);
    h.session.purchaseUnlock('war_record');
    const after = h.session.snapshot().start!;
    expect(after.meta.points).toBe(35);
    expect(after.meta.items.find((i) => i.id === 'war_record')!.state).toBe('unlocked');
    expect((JSON.parse(h.metaStorage.read()!) as { points: number }).points).toBe(35);
    h.session.purchaseUnlock('war_record');
    expect(h.session.snapshot().notice?.message).toContain('이미 해금');
  });

  it('조건 달성으로 해금된 지휘관은 곧바로 시작할 수 있다', () => {
    const h = createHarness(undefined, 42, metaWithPoints(5));
    expect(h.session.snapshot().start!.meta.commanders['cmd_isera']!.state).toBe('unlocked');
    h.session.newRun(5, 'cmd_isera');
    expect(h.session.snapshot().screen).toBe('map');
  });
});

describe('RunSession: 런 종료 정산', () => {
  it('런이 끝나는 순간 한 번 정산되고 메타 저장 → 런 저장 삭제, 종료 화면에 내역과 새 해금이 나온다', () => {
    const h = createHarness();
    h.session.newRun(7);
    dieInFirstBattle(h);
    // 결과 화면(계속 누르기 전)에서 이미 정산이 끝나 있다
    expect(h.session.snapshot().screen).toBe('battle');
    const saved = JSON.parse(h.metaStorage.read()!) as { points: number; settledRuns: string[]; stats: { runsCompleted: number } };
    expect(saved.settledRuns).toEqual(['run-1']);
    expect(saved.stats.runsCompleted).toBe(1);
    expect(saved.points).toBeGreaterThan(0);
    expect(h.storage.read()).toBeNull();

    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.endMeta).toMatchObject({ kind: 'settled', balance: saved.points });
    if (snap.endMeta?.kind !== 'settled') throw new Error('정산 결과여야 함');
    expect(snap.endMeta.rows.map((r) => r.label)).toEqual(['도달 층', '보스 처치', '정예 처치', '승리 보너스']);
    expect(snap.endMeta.unlocks.some((u) => u.name.includes('이세라'))).toBe(true);

    // 화면을 다시 그리거나 시작 화면에 갔다 와도 중복 정산·중복 표시가 없다
    h.session.snapshot();
    h.session.toStart();
    expect(JSON.parse(h.metaStorage.read()!)).toMatchObject({ points: saved.points, settledRuns: ['run-1'] });
    expect(h.session.snapshot().start!.meta.points).toBe(saved.points);
  });

  it('새로고침(새 세션)해도 정산 결과는 남아 있고 런 저장은 없다', () => {
    const h = createHarness();
    h.session.newRun(7);
    dieInFirstBattle(h);
    const again = createHarness(h.storage, 42, h.metaStorage);
    expect(again.session.snapshot().start!.save.kind).toBe('none');
    expect(again.session.snapshot().start!.meta.commanders['cmd_isera']!.state).toBe('unlocked');
  });

  it('같은 런 ID를 다시 정산하려 하면 core가 거부하고 포인트는 늘지 않는다', () => {
    const h = createHarness();
    h.session.newRun(7);
    dieInFirstBattle(h);
    const run = controllerOf(h);
    const points = h.meta.progress!.points;
    expect(h.meta.progress!.settleRun(run.runSummary())).toMatchObject({ ok: false });
    expect(h.meta.progress!.points).toBe(points);
  });

  it('메타 저장이 실패해도 알림만 띄우고 종료 화면까지 진행된다', () => {
    const h = createHarness(undefined, 42, new FailingStorage());
    h.session.newRun(7);
    dieInFirstBattle(h);
    expect(h.session.snapshot().notice?.message).toContain('전공 기록 저장에 실패');
    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.endMeta?.kind).toBe('settled');
    expect(h.storage.read()).toBeNull();
  });

  it('테스트 런은 정산에서 제외되고 종료 화면에 안내만 나온다', () => {
    const h = createHarness();
    h.session.startTestRun(7, { startAct: 2, startPosition: 'bossGate', hp: 1 });
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    h.session.testCommand({ kind: 'forceResult', result: 'loss' });
    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.endMeta).toEqual({ kind: 'test', message: '테스트 런은 전공에 반영되지 않습니다.' });
    expect(h.metaStorage.read()).toBeNull();
    expect(h.meta.progress!.points).toBe(0);
    expect(h.runIds).toEqual([]);
  });

  it('테스트 런은 잠긴 지휘관·유물도 고를 수 있다 (unlocks를 넘기지 않음)', () => {
    const h = createHarness();
    h.session.startTestRun(7, { commanderId: 'cmd_nox' });
    expect(h.session.snapshot().screen).toBe('map');
    expect(h.session.snapshot().hud!.commanderName).toContain('녹스');
    expect(controllerOf(h).allowedRelics).toBeNull();
    expect(controllerOf(h).runId).toBeNull();
  });

  it('경제 플레이·편성 디버그는 메타와 무관하게 열린다', () => {
    const h = createHarness();
    h.session.openManagement();
    expect(h.legacyCalls).toContain('management');
    expect(h.meta.progress!.points).toBe(0);
  });

  it('전공 기록이 손상되면 새 런이 막히고 초기화하면 열린다 (런 저장본은 그대로)', () => {
    const runStorage = new MemoryRunStorage();
    const first = createHarness(runStorage);
    first.session.newRun(9);
    const runText = runStorage.read();
    const h = createHarness(runStorage, 42, new MemoryRunStorage('{깨진'));
    expect(h.session.snapshot().start!.meta.status).toBe('broken');
    h.session.newRun(5);
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().notice?.message).toContain('전공 기록이 손상');
    h.session.resetMeta();
    expect(h.session.snapshot().start!.meta.status).toBe('ok');
    expect(runStorage.read()).toBe(runText);
    h.session.newRun(5);
    expect(h.session.snapshot().screen).toBe('map');
  });

  it('전공 기록 초기화는 포인트·해금을 지우되 런 저장본은 지우지 않는다', () => {
    const h = createHarness(undefined, 42, metaWithPoints(30));
    h.session.newRun(3);
    const runText = h.storage.read();
    h.session.toStart();
    h.session.resetMeta();
    expect(h.session.snapshot().start!.meta.points).toBe(0);
    expect(h.session.snapshot().start!.meta.commanders['cmd_isera']!.state).toBe('locked');
    expect(h.storage.read()).toBe(runText);
  });
});

describe('RunSession: 이어하기와 런 ID', () => {
  const saveCore = (run: RunController): RunStorage => new MemoryRunStorage(JSON.stringify(run.serialize()));

  it('runId가 없는 옛 저장본은 이어할 때 새 runId를 붙이고 저장한다', () => {
    const legacy = RunController.create(gameData.run, { seed: 11, commanderId: 'cmd_harten', acts: 3 });
    expect(legacy.runId).toBeNull();
    const h = createHarness(saveCore(legacy));
    h.session.continueRun();
    expect(h.runIds).toEqual(['run-1']);
    expect(controllerOf(h).runId).toBe('run-1');
    expect(JSON.parse(h.storage.read()!)).toMatchObject({ runId: 'run-1' });
    // 허용 유물 필드가 없는 저장본은 모든 유물 허용
    expect(controllerOf(h).allowedRelics).toBeNull();
  });

  it('옛 저장본도 끝나면 정산된다', () => {
    const legacy = RunController.create(gameData.run, { seed: 11, commanderId: 'cmd_harten', acts: 3 });
    const h = createHarness(saveCore(legacy));
    h.session.continueRun();
    dieInFirstBattle(h);
    expect(JSON.parse(h.metaStorage.read()!)).toMatchObject({ settledRuns: ['run-1'] });
  });

  it('이미 runId가 있는 저장본은 그대로 쓰고 새로 발급하지 않는다', () => {
    const run = RunController.create(gameData.run, { seed: 12, commanderId: 'cmd_harten', acts: 3, runId: 'keep-me' });
    const h = createHarness(saveCore(run));
    h.session.continueRun();
    expect(h.runIds).toEqual([]);
    expect(controllerOf(h).runId).toBe('keep-me');
  });

  it('테스트 런 저장본은 runId를 붙이지 않는다', () => {
    const test = RunController.createTest(gameData.run, { seed: 13 });
    const h = createHarness(saveCore(test));
    h.session.continueRun();
    expect(h.runIds).toEqual([]);
    expect(controllerOf(h).runId).toBeNull();
  });

  it('잠긴 지휘관으로 시작해 둔 런도(해금을 초기화한 뒤라도) 이어서 끝까지 할 수 있다', () => {
    const h = createHarness(undefined, 42, allUnlockedMeta());
    h.session.newRun(3, 'cmd_nox');
    h.session.toStart();
    h.session.resetMeta();
    h.session.continueRun();
    expect(h.session.snapshot().screen).toBe('map');
    expect(h.session.snapshot().hud!.commanderName).toContain('녹스');
  });
});
