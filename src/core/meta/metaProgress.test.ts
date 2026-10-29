import { describe, expect, it } from 'vitest';
import metaJson from '../../../data/meta.json';
import { loadMeta } from '../data/metaLoader';
import { runDeps } from '../run/testSupport';
import { conditionProgress, emptyStats } from './conditions';
import { META_SETTLED_RUNS_LIMIT, MetaProgress, calculateRunPoints } from './metaProgress';
import type { RunSummary } from './runSummary';

const catalog = loadMeta(metaJson, runDeps.commanders, runDeps.relics);
const newMeta = (): MetaProgress => new MetaProgress(catalog);

const summary = (patch: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'run-1', test: false, commanderId: 'cmd_harten', outcome: 'dead', floorsReached: 5, bossActsKilled: [],
  eliteKills: 0, ultimateUses: 0, shopVisits: 0, unitStar3: false, bossEntryGold: 0, deckSize: 10, ...patch,
});

describe('조건 판정과 진행도', () => {
  const stats = { ...emptyStats(), runsCompleted: 2, eliteKills: 3, ultimateUses: 4, shopVisits: 5, bossActsKilled: [1], unitStar3: true, bestCompletedDeckSize: 12, bestBossEntryGold: 30 };

  it('조건 종류마다 현재/목표/달성을 계산한다 (현재 값은 목표를 넘지 않게 표시)', () => {
    expect(conditionProgress({ type: 'runsCompleted', count: 1 }, stats)).toEqual({ current: 1, target: 1, met: true });
    expect(conditionProgress({ type: 'runsCompleted', count: 5 }, stats)).toEqual({ current: 2, target: 5, met: false });
    expect(conditionProgress({ type: 'bossKilled', act: 1 }, stats).met).toBe(true);
    expect(conditionProgress({ type: 'bossKilled', act: 2 }, stats)).toEqual({ current: 0, target: 1, met: false });
    expect(conditionProgress({ type: 'eliteKills', count: 5 }, stats)).toEqual({ current: 3, target: 5, met: false });
    expect(conditionProgress({ type: 'unitStar3' }, stats).met).toBe(true);
    expect(conditionProgress({ type: 'unitStar3' }, emptyStats())).toEqual({ current: 0, target: 1, met: false });
    expect(conditionProgress({ type: 'runCompletedWithDeckSize', minSize: 20 }, stats)).toEqual({ current: 12, target: 20, met: false });
    expect(conditionProgress({ type: 'ultimateUses', count: 10 }, stats)).toEqual({ current: 4, target: 10, met: false });
    expect(conditionProgress({ type: 'reachBossWithGold', gold: 50 }, stats)).toEqual({ current: 30, target: 50, met: false });
    expect(conditionProgress({ type: 'shopVisits', count: 5 }, stats)).toEqual({ current: 5, target: 5, met: true });
  });
});

describe('MetaProgress 기본 상태', () => {
  it('처음에는 포인트 0이고 하르텐·조건 없는 유물은 열려 있고 이세라·녹스·조건 유물 11개는 잠겨 있다', () => {
    const meta = newMeta();
    expect(meta.points).toBe(0);
    expect(meta.isUnlocked('cmd_harten')).toBe(true);
    expect(meta.isUnlocked('old_baton')).toBe(true);
    expect(meta.isUnlocked('cmd_isera')).toBe(false);
    expect(meta.isUnlocked('cmd_nox')).toBe(false);
    expect(meta.items().filter((i) => !i.unlocked)).toHaveLength(13);
    const unlocks = meta.runUnlocks(runDeps.commanders.commanders.map((c) => c.id), runDeps.relics.relics.map((r) => r.id));
    expect(unlocks.commanders).toEqual(['cmd_harten']);
    expect(unlocks.relics).toHaveLength(9);
    expect(meta.progress('cmd_harten')).toBeNull();
    expect(meta.progress('cmd_isera')).toEqual({ current: 0, target: 1, met: false });
  });
});

describe('전공 포인트 공식', () => {
  it('도달 층 + 보스 + 정예 + 승리 보너스', () => {
    const rule = catalog.points;
    expect(calculateRunPoints(rule, summary({ floorsReached: 13, bossActsKilled: [1], eliteKills: 3 }))).toEqual({
      floors: 13 * rule.perFloor, bosses: rule.perBoss, elites: 3 * rule.perElite, victory: 0,
      total: 13 * rule.perFloor + rule.perBoss + 3 * rule.perElite,
    });
    const win = calculateRunPoints(rule, summary({ outcome: 'victory', floorsReached: 39, bossActsKilled: [1, 2, 3], eliteKills: 8 }));
    expect(win.victory).toBe(rule.victoryBonus);
    expect(win.total).toBe(39 * rule.perFloor + 3 * rule.perBoss + 8 * rule.perElite + rule.victoryBonus);
  });

  it('초안 목표: 액트 1 보스까지가 이세라 가격 근처, 3액트 승리 1~2회면 녹스 가격', () => {
    const act1 = calculateRunPoints(catalog.points, summary({ floorsReached: 13, bossActsKilled: [1], eliteKills: 3 })).total;
    expect(act1).toBeGreaterThanOrEqual(catalog.get('cmd_isera')!.price - 5);
    const victory = calculateRunPoints(catalog.points, summary({ outcome: 'victory', floorsReached: 39, bossActsKilled: [1, 2, 3], eliteKills: 8 })).total;
    expect(victory * 2).toBeGreaterThanOrEqual(catalog.get('cmd_nox')!.price);
    expect(victory).toBeLessThan(catalog.get('cmd_nox')!.price * 1.5);
  });
});

describe('settleRun', () => {
  it('통계를 누적하고 포인트를 주며 조건을 만족한 항목을 자동 해금한다', () => {
    const meta = newMeta();
    const result = meta.settleRun(summary({ floorsReached: 13, bossActsKilled: [1], eliteKills: 5, outcome: 'dead' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.earned.total).toBe(13 + 10 + 10);
    expect(result.balance).toBe(33);
    expect(result.newUnlocks).toEqual(['cmd_isera', 'blood_oath', 'fifth_banner', 'heralds_bag', 'rift_heart', 'legion_seal', 'iron_heart']);
    expect(meta.isUnlocked('cmd_isera')).toBe(true);
    expect(meta.isUnlocked('cmd_nox')).toBe(false);
    expect(meta.statsView()).toMatchObject({ runsCompleted: 1, eliteKills: 5, bossActsKilled: [1] });
    expect(meta.items().find((i) => i.id === 'cmd_isera')).toMatchObject({ unlocked: true, via: 'condition' });
  });

  it('통계 종류별로 누적·최댓값을 반영해 나머지 조건도 달성한다', () => {
    const meta = newMeta();
    meta.settleRun(summary({ runId: 'a', ultimateUses: 6, shopVisits: 3, bossEntryGold: 40, deckSize: 15 }));
    const second = meta.settleRun(summary({ runId: 'b', ultimateUses: 4, shopVisits: 2, bossEntryGold: 55, deckSize: 20, unitStar3: true, bossActsKilled: [2] }));
    expect(second.ok && second.newUnlocks.sort()).toEqual(['cmd_nox', 'fat_purse', 'tacticians_journal', 'twin_mirror', 'war_record', 'wholesale_voucher'].sort());
    expect(meta.statsView()).toMatchObject({ ultimateUses: 10, shopVisits: 5, bestBossEntryGold: 55, bestCompletedDeckSize: 20, unitStar3: true });
  });

  it('같은 런 id는 한 번만 정산된다 (상태 불변)', () => {
    const meta = newMeta();
    expect(meta.settleRun(summary()).ok).toBe(true);
    const before = JSON.stringify(meta.serialize());
    expect(meta.settleRun(summary({ floorsReached: 30 }))).toEqual({ ok: false, reason: '이미 정산한 런입니다' });
    expect(JSON.stringify(meta.serialize())).toBe(before);
  });

  it('테스트 런·진행 중인 런·식별자 없는 요약은 거부하고 상태를 바꾸지 않는다', () => {
    const meta = newMeta();
    const before = JSON.stringify(meta.serialize());
    expect(meta.settleRun(summary({ test: true }))).toMatchObject({ ok: false, reason: expect.stringContaining('테스트 런') });
    expect(meta.settleRun(summary({ outcome: null }))).toMatchObject({ ok: false });
    expect(meta.settleRun(summary({ runId: null }))).toMatchObject({ ok: false });
    expect(JSON.stringify(meta.serialize())).toBe(before);
  });

  it('기억하는 정산 기록은 최근 N개로 제한된다', () => {
    const meta = newMeta();
    for (let i = 0; i < META_SETTLED_RUNS_LIMIT + 5; i++) meta.settleRun(summary({ runId: `r${i}`, floorsReached: 0 }));
    expect(meta.serialize().settledRuns).toHaveLength(META_SETTLED_RUNS_LIMIT);
    expect(meta.serialize().settledRuns[0]).toBe('r5');
  });
});

describe('purchase', () => {
  const earn = (meta: MetaProgress, floors: number): void => {
    meta.settleRun(summary({ runId: `e${floors}`, floorsReached: floors }));
  };

  it('조건 달성 전이라도 포인트로 구매할 수 있고 포인트가 줄어든다', () => {
    const meta = newMeta();
    expect(meta.points).toBe(0);
    // 런을 완료하지 않고 포인트만 있는 상태를 만들 수는 없으므로 정산(런 완료)로 얻은 포인트로 조건 미달 항목(녹스)을 산다
    earn(meta, 130);
    expect(meta.isUnlocked('cmd_nox')).toBe(false);
    expect(meta.purchase('cmd_nox')).toEqual({ ok: true });
    expect(meta.points).toBe(130 - 120);
    expect(meta.isUnlocked('cmd_nox')).toBe(true);
    expect(meta.items().find((i) => i.id === 'cmd_nox')).toMatchObject({ unlocked: true, via: 'purchase' });
  });

  it('포인트 부족·이미 해금·모르는 id는 사유와 함께 실패하고 상태가 그대로다', () => {
    const meta = newMeta();
    earn(meta, 10);
    const before = JSON.stringify(meta.serialize());
    expect(meta.purchase('cmd_nox')).toMatchObject({ ok: false, reason: expect.stringContaining('부족') });
    expect(meta.purchase('nope')).toMatchObject({ ok: false });
    expect(meta.purchase('cmd_harten')).toMatchObject({ ok: false });
    expect(meta.purchase('cmd_isera')).toEqual({ ok: false, reason: '이미 해금했습니다' }); // 런 완료로 자동 해금됨
    expect(JSON.stringify(meta.serialize())).toBe(before);
  });

  it('구매한 항목은 나중에 조건을 달성해도 구매 기록과 포인트가 유지된다', () => {
    const meta = newMeta();
    earn(meta, 100);
    meta.purchase('rift_heart');
    const points = meta.points;
    const result = meta.settleRun(summary({ runId: 'later', floorsReached: 0, bossActsKilled: [1] }));
    expect(result.ok && result.newUnlocks).not.toContain('rift_heart');
    expect(meta.items().find((i) => i.id === 'rift_heart')!.via).toBe('purchase');
    expect(meta.points).toBe(points + 10);
  });
});

describe('직렬화', () => {
  it('왕복해도 같은 상태이고 JSON 문자열로도 복원된다', () => {
    const meta = newMeta();
    meta.settleRun(summary({ floorsReached: 20, bossActsKilled: [1], eliteKills: 2, unitStar3: true }));
    meta.purchase('cmd_nox');
    const json = JSON.parse(JSON.stringify(meta.serialize()));
    const restored = MetaProgress.restore(catalog, json);
    expect(restored.serialize()).toEqual(meta.serialize());
    expect(restored.points).toBe(meta.points);
    expect(restored.isUnlocked('cmd_nox')).toBe(meta.isUnlocked('cmd_nox'));
    expect(restored.settleRun(summary())).toMatchObject({ ok: false });
  });

  it('손상된 데이터는 위치가 담긴 한국어 오류', () => {
    const good = JSON.parse(JSON.stringify(newMeta().serialize())) as Record<string, any>;
    const bad = (edit: (d: Record<string, any>) => void): string => {
      const d = JSON.parse(JSON.stringify(good));
      edit(d);
      try { MetaProgress.restore(catalog, d); } catch (e) { return (e as Error).message; }
      throw new Error('에러가 발생해야 함');
    };
    expect(bad((d) => { d.format = 'x'; })).toContain('meta.format');
    expect(bad((d) => { d.version = 99; })).toContain('meta.version: 지원하지 않는 저장 버전 99');
    expect(bad((d) => { d.points = -1; })).toContain('meta.points');
    expect(bad((d) => { d.points = 5; })).toContain('번 포인트 합계');
    expect(bad((d) => { d.extra = 1; })).toContain('meta.extra: 알 수 없는 필드');
    expect(bad((d) => { d.stats.runsCompleted = 'many'; })).toContain('meta.stats.runsCompleted');
    expect(bad((d) => { delete d.stats.unitStar3; })).toContain('meta.stats.unitStar3');
    expect(bad((d) => { d.stats.bossActsKilled = [0]; })).toContain('meta.stats.bossActsKilled[0]');
    expect(bad((d) => { d.unlocked = [{ id: 'cmd_isera', via: 'gift' }]; })).toContain('meta.unlocked[0].via');
    expect(bad((d) => { d.unlocked = [{ id: 'cmd_isera', via: 'purchase' }, { id: 'cmd_isera', via: 'purchase' }]; })).toContain('중복된 해금');
    expect(bad((d) => { d.settledRuns = [1]; })).toContain('meta.settledRuns[0]');
    expect(() => MetaProgress.restore(catalog, null)).toThrow('meta: 객체여야 함');
  });

  it('meta.json에서 사라진 해금 id는 무시하고 복원한다', () => {
    const data = newMeta().serialize();
    data.unlocked.push({ id: 'removed_relic', via: 'condition' });
    const restored = MetaProgress.restore(catalog, data);
    expect(restored.serialize().unlocked).toEqual([]);
  });
});
