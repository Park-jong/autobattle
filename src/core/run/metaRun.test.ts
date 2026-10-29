import { describe, expect, it } from 'vitest';
import metaJson from '../../../data/meta.json';
import { loadMeta } from '../data/metaLoader';
import { MetaProgress, type RunUnlocks } from '../meta';
import { Rng } from '../rng';
import { AutoRunner } from './autoRunner';
import { RelicRewardGenerator } from './relicRewards';
import { RunController } from './runController';
import { RunSerializer } from './runSerializer';
import { basicPlan, driveTo, finishBattle, forceEvent, grantRelic, newRun, runDeps } from './testSupport';

const metaCatalog = loadMeta(metaJson, runDeps.commanders, runDeps.relics);
const allCommanders = runDeps.commanders.commanders.map((c) => c.id);
const allRelics = runDeps.relics.relics.map((r) => r.id);

/** 메타 진행이 처음인 플레이어의 허용 집합 */
const freshUnlocks = (): RunUnlocks => new MetaProgress(metaCatalog).runUnlocks(allCommanders, allRelics);
const only = (...relics: string[]): RunUnlocks => ({ commanders: allCommanders, relics });

const create = (unlocks: RunUnlocks | undefined, extra: { runId?: string; seed?: number; acts?: number; commanderId?: string } = {}): RunController =>
  RunController.create(runDeps, { seed: extra.seed ?? 1, acts: extra.acts ?? 1, ...(extra.commanderId ? { commanderId: extra.commanderId } : {}), ...(unlocks ? { unlocks } : {}), ...(extra.runId ? { runId: extra.runId } : {}) });

const roundTrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));

describe('잠긴 지휘관 거부', () => {
  it('잠긴 지휘관으로 일반 런을 만들 수 없고 해금된 지휘관은 된다', () => {
    const unlocks = freshUnlocks();
    expect(unlocks.commanders).toEqual(['cmd_harten']);
    expect(() => create(unlocks, { commanderId: 'cmd_isera' })).toThrow('아직 해금하지 않은 지휘관입니다');
    expect(() => create(unlocks, { commanderId: 'cmd_nox' })).toThrow('아직 해금하지 않은 지휘관입니다');
    expect(create(unlocks, { commanderId: 'cmd_harten' }).commander.id).toBe('cmd_harten');
    expect(create({ commanders: allCommanders, relics: allRelics }, { commanderId: 'cmd_nox' }).commander.id).toBe('cmd_nox');
  });
});

describe('테스트 환경은 메타를 무시한다', () => {
  it('옵션이 없으면 모두 허용(null)이고 모든 지휘관으로 만들 수 있다', () => {
    for (const id of allCommanders) expect(create(undefined, { commanderId: id }).allowedRelics).toBeNull();
    expect(newRun(1).allowedRelics).toBeNull();
  });

  it('테스트 런은 모든 지휘관·유물을 쓰고 메타 정산에서 제외된다', () => {
    for (const commanderId of ['cmd_isera', 'cmd_nox']) {
      const run = RunController.createTest(runDeps, { seed: 1, commanderId, relics: ['iron_heart', 'war_record'] });
      expect(run.commander.id).toBe(commanderId);
      expect(run.allowedRelics).toBeNull();
      expect(run.relics.map((r) => r.id)).toEqual(['iron_heart', 'war_record']);
      expect(run.runSummary().test).toBe(true);
      expect(new MetaProgress(metaCatalog).settleRun({ ...run.runSummary(), runId: 'x', outcome: 'victory' })).toMatchObject({ ok: false });
    }
  });

  it('옵션 없는 일반 런은 어떤 유물도 후보가 될 수 있다 (헤드리스 AutoRunner 포함)', () => {
    const run = create(undefined, { commanderId: 'cmd_nox', seed: 2 });
    const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: 2, plan: basicPlan, relics: true }).run();
    expect(summary.outcome).not.toBeNull();
    expect(run.allowedRelics).toBeNull();
  });
});

describe('유물 후보는 허용된 유물만', () => {
  it('정예 보상: 허용 유물이 하나뿐이면 그것만 나오고, 받은 뒤에는 유물이 없다', () => {
    const run = create(only('old_baton'));
    driveTo(run, 'elite');
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.relicOffer).toBe('old_baton');
    expect(run.claimRelic()).toEqual({ ok: true });
    expect(run.relics.map((r) => r.id)).toEqual(['old_baton']);
    // 이미 가진 유물은 허용돼 있어도 후보에서 빠진다
    expect(new RelicRewardGenerator(runDeps.relics, ['old_baton']).offerElite(['old_baton'], new Rng(1))).toBeNull();
  });

  it('허용 유물이 없으면 정예 보상에 유물이 없다 (카드 보상은 그대로)', () => {
    const run = create(only());
    driveTo(run, 'elite');
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.relicOffer).toBeNull();
    expect(settle.ok && settle.settlement.cardOffer).not.toBeNull();
  });

  it('상점 진열은 허용된 유물만, 모자라면 있는 만큼만 나온다', () => {
    const run = create(only('old_baton', 'merchants_scale'));
    driveTo(run, 'shop');
    expect(run.shopView()!.relics.map((s) => s.relicId).sort()).toEqual(['merchants_scale', 'old_baton']);
    const none = create(only());
    driveTo(none, 'shop');
    expect(none.shopView()!.relics).toEqual([]);
  });

  it('이벤트 gainRelic: 허용된 유물만 주고 후보가 없으면 선택 불가', () => {
    const run = create(only('old_baton'));
    driveTo(run, 'event');
    forceEvent(run, 'gate_smith');
    const index = run.eventView()!.choices.findIndex((c) => c.grantsRelic);
    expect(run.chooseEventOption(index)).toEqual({ ok: true });
    expect(run.relics.map((r) => r.id)).toEqual(['old_baton']);

    const blocked = create(only());
    driveTo(blocked, 'event');
    forceEvent(blocked, 'gate_smith');
    const choice = blocked.eventView()!.choices.find((c) => c.grantsRelic)!;
    expect(choice.enabled).toBe(false);
    expect(choice.reason).toBe('더 받을 수 있는 유물이 없습니다');
  });

  it('보스 유물 후보: 해금된 보스 유물만 제시, 하나도 없으면 선택 단계를 건너뛰고 액트 소개로', () => {
    const open = create(only('iron_heart', 'rift_heart'), { acts: 2 });
    driveTo(open, 'boss');
    const settle = finishBattle(open, 'win');
    expect(settle.ok && settle.settlement.bossRelicOffer?.slice().sort()).toEqual(['iron_heart', 'rift_heart']);
    expect(open.phase).toBe('bossRelic');

    const shut = create(only('old_baton'), { acts: 2 });
    driveTo(shut, 'boss');
    const skipped = finishBattle(shut, 'win');
    expect(skipped.ok && skipped.settlement.bossRelicOffer).toBeNull();
    expect(shut.phase).toBe('actIntro');
  });

  it('마지막 액트 승리 후 종료 화면의 후보(bossRelicOffer)도 허용된 유물만', () => {
    const run = create(only('legion_seal'));
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.outcome).toBe('victory');
    expect(run.bossRelicOffer()).toEqual(['legion_seal']);
  });

  it('새 런을 해금 전 상태로 시작하면 잠긴 유물이 후보에 나오지 않는다', () => {
    const unlocks = freshUnlocks();
    const locked = new Set(allRelics.filter((id) => !unlocks.relics.includes(id)));
    expect(locked.size).toBe(12);
    for (let seed = 1; seed <= 4; seed++) {
      const run = create(unlocks, { seed });
      driveTo(run, 'shop');
      for (const slot of run.shopView()!.relics) expect(locked.has(slot.relicId)).toBe(false);
    }
  });
});

describe('허용 집합의 저장·복원', () => {
  it('저장본에 허용 유물이 담기고, 복원 후 후보가 같다 (런 도중 메타가 바뀌어도 불변)', () => {
    const run = create(only('old_baton', 'merchants_scale', 'bulwark_crest'), { runId: 'run-abc', seed: 7 });
    driveTo(run, 'shop');
    const save = run.serialize();
    expect(save.allowedRelics).toEqual(['old_baton', 'merchants_scale', 'bulwark_crest']);
    expect(save.runId).toBe('run-abc');
    const restored = roundTrip(run);
    expect(restored.allowedRelics).toEqual(['old_baton', 'merchants_scale', 'bulwark_crest']);
    expect(restored.runId).toBe('run-abc');
    expect(restored.shopView()!.relics).toEqual(run.shopView()!.relics);
    expect(restored.serialize()).toEqual(save);

    // 복원한 런에서 이어서 정예 보상을 받아도 원본과 같은 결과 (허용 집합은 저장본이 정한다)
    const cont = (r: RunController): string | null => {
      r.leaveShop();
      driveTo(r, 'elite');
      const s = finishBattle(r, 'win');
      return s.ok ? s.settlement.relicOffer : null;
    };
    const a = cont(run);
    const b = cont(restored);
    expect(a).toBe(b);
    if (a !== null) expect(['old_baton', 'merchants_scale', 'bulwark_crest']).toContain(a);
  });

  it('필드가 없는 기존 저장본은 모두 허용·통계 0으로 읽고, 다시 저장해도 새 필드를 만들지 않는다', () => {
    const run = newRun(3);
    driveTo(run, 'shop');
    const save = run.serialize();
    expect(save).not.toHaveProperty('allowedRelics');
    expect(save).not.toHaveProperty('stats');
    expect(save).not.toHaveProperty('runId');
    const restored = roundTrip(run);
    expect(restored.allowedRelics).toBeNull();
    expect(restored.runId).toBeNull();
    expect(restored.serialize()).toEqual(save);
    grantRelic(restored, 'iron_heart');
    expect(restored.relics.map((r) => r.id)).toEqual(['iron_heart']);
  });

  it('카탈로그에 없는 허용 유물 id는 복원할 때 무시하고, 잘못된 형식은 위치가 담긴 오류', () => {
    const base = JSON.parse(JSON.stringify(create(only('old_baton')).serialize())) as Record<string, unknown>;
    const parse = (edit: (d: Record<string, unknown>) => void): RunController => {
      const d = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      edit(d);
      return RunController.restore(runDeps, d);
    };
    expect(parse((d) => { d.allowedRelics = ['old_baton', 'ghost']; }).allowedRelics).toEqual(['old_baton']);
    expect(() => parse((d) => { d.allowedRelics = ['old_baton', 'old_baton']; })).toThrow('run.allowedRelics[1]');
    expect(() => parse((d) => { d.allowedRelics = [3]; })).toThrow('run.allowedRelics[0]');
    expect(() => parse((d) => { d.stats = { ultimateUses: -1, bossEntryGold: 0, unitStar3: false }; })).toThrow('run.stats.ultimateUses');
    expect(() => parse((d) => { d.stats = { ultimateUses: 0 }; })).toThrow('run.stats.bossEntryGold');
    expect(() => parse((d) => { d.runId = ''; })).toThrow('run.runId');
  });

  it('v1·v2 저장본에는 새 필드를 허용하지 않는다', () => {
    const save = JSON.parse(JSON.stringify(create(undefined).serialize())) as Record<string, unknown>;
    save.version = 2;
    save.allowedRelics = [];
    delete save.maps;
    delete save.totalActs;
    expect(() => new RunSerializer(runDeps).parse(save)).toThrow();
  });
});

describe('runSummary와 통계', () => {
  it('1액트 승리: 도달 층·보스·정예·상점·덱 크기를 요약하고 메타로 정산된다', () => {
    const run = create(freshUnlocks(), { runId: 'run-1' });
    expect(run.runSummary()).toMatchObject({ runId: 'run-1', test: false, outcome: null, floorsReached: 0, bossActsKilled: [], eliteKills: 0 });
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const summary = run.runSummary();
    expect(summary).toMatchObject({ outcome: 'victory', floorsReached: 13, bossActsKilled: [1], commanderId: 'cmd_harten', deckSize: 10 });
    const elites = run.history.filter((r) => r.type === 'elite' && r.outcome === 'win').length;
    expect(summary.eliteKills).toBe(elites);
    const shops = run.visited.filter((id) => run.map.node(id)?.type === 'shop').length;
    expect(summary.shopVisits).toBe(shops);

    const meta = new MetaProgress(metaCatalog);
    const result = meta.settleRun(summary);
    expect(result.ok && result.earned.total).toBe(13 + 10 + 2 * elites + 30);
    expect(meta.settleRun(summary)).toMatchObject({ ok: false });
    expect(meta.isUnlocked('cmd_isera')).toBe(true);
    // 승리 후 요약은 저장 왕복해도 같다
    expect(roundTrip(run).runSummary()).toEqual(summary);
  });

  it('사망한 런도 결과 dead로 정산할 수 있고 보스는 처치하지 못한 것으로 센다', () => {
    const run = create(undefined, { runId: 'run-2' });
    driveTo(run, 'boss');
    while (run.phase !== 'ended') finishBattle(run, 'loss');
    expect(run.runSummary()).toMatchObject({ outcome: 'dead', floorsReached: 13, bossActsKilled: [] });
    expect(new MetaProgress(metaCatalog).settleRun(run.runSummary())).toMatchObject({ ok: true });
  });

  it('보스 입장 골드는 입장 시점 보유량의 최댓값이고 저장·복원된다', () => {
    const run = create(undefined);
    driveTo(run, 'boss');
    const entry = run.gold;
    expect(run.runSummary().bossEntryGold).toBe(entry);
    expect(roundTrip(run).runSummary().bossEntryGold).toBe(entry);
  });

  it('3액트 런의 보스 처치 액트와 도달 층은 전체 층 기준이다', () => {
    const run = create(undefined, { acts: 3 });
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    run.claimBossRelic(0);
    run.continueAct();
    driveTo(run, 'boss');
    expect(run.runSummary()).toMatchObject({ bossActsKilled: [1], floorsReached: 26, outcome: null });
    finishBattle(run, 'win');
    expect(run.runSummary().bossActsKilled).toEqual([1, 2]);
  });

  it('궁극기 사용 횟수는 정산한 전투에서 센다 (사용이 없으면 0)', () => {
    const run = create(undefined);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.runSummary().ultimateUses).toBe(0);
  });

  it('헤드리스 자동 런(궁극기 정책)은 궁극기 사용을 요약에 남긴다', () => {
    const run = create(undefined, { seed: 1 });
    const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: 1, plan: basicPlan, relics: true, ultimate: true }).run();
    expect(summary.ultimatesUsed).toBeGreaterThan(0);
    expect(run.runSummary().ultimateUses).toBeGreaterThan(0);
  });
});

describe('runId 사후 부여 (M5-5A 이전 저장본 이어하기)', () => {
  it('runId가 없는 일반 런에는 한 번만 붙이고 저장·복원 후에도 유지된다', () => {
    const run = create(undefined);
    expect(run.runId).toBeNull();
    expect(run.assignRunId('late-1')).toEqual({ ok: true });
    expect(run.runId).toBe('late-1');
    expect(roundTrip(run).runId).toBe('late-1');
  });

  it('이미 runId가 있으면 거부하고 값은 그대로다', () => {
    const run = create(undefined, { runId: 'first' });
    expect(run.assignRunId('second')).toMatchObject({ ok: false });
    expect(run.runId).toBe('first');
  });

  it('빈 문자열과 테스트 런은 거부한다', () => {
    expect(create(undefined).assignRunId('')).toMatchObject({ ok: false });
    const test = RunController.createTest(runDeps, { seed: 1 });
    expect(test.assignRunId('x')).toMatchObject({ ok: false });
    expect(test.runId).toBeNull();
  });
});
