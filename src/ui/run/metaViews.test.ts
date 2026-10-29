import { describe, expect, it } from 'vitest';
import { MetaProgress, type RunSummary } from '../../core/meta';
import { buildEndMetaView, buildMetaStartView, type EndSettlement } from './metaViews';
import { gameData } from './testSupport';

const { meta: catalog, run: deps } = gameData;

const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
  runId: 'r1', threatLevel: 0, test: false, commanderId: 'cmd_harten', outcome: 'dead', floorsReached: 5, bossActsKilled: [], eliteKills: 1,
  ultimateUses: 0, shopVisits: 0, unitStar3: false, bossEntryGold: 0, deckSize: 10, ...over,
});

const startView = (progress: MetaProgress) => buildMetaStartView({ kind: 'ok', progress }, catalog, deps.commanders, deps.relics);

describe('buildMetaStartView', () => {
  it('처음에는 해금 13개가 모두 잠김이고 지휘관 잠금 행에 조건·진행도·구매 불가가 담긴다', () => {
    const view = startView(new MetaProgress(catalog));
    expect(view.status).toBe('ok');
    expect(view.items).toHaveLength(13);
    expect(view.items.every((i) => i.state === 'locked')).toBe(true);
    const isera = view.commanders['cmd_isera']!;
    expect(isera).toMatchObject({ name: expect.stringContaining('이세라'), targetLabel: '지휘관', price: 30, progressText: '0/1', canPurchase: false, shortfall: 30, state: 'locked' });
    expect(isera.conditionText).toContain('런 1회 완료');
    expect(isera.purchaseLabel).toContain('30 부족');
    expect(view.commanders['cmd_harten']).toBeUndefined();
    expect(view.baseText).toContain('하르텐');
  });

  it('런을 한 번 끝내면 런 완료 조건 항목이 자동 해금으로 표시된다', () => {
    const progress = new MetaProgress(catalog);
    progress.settleRun(summary());
    const view = startView(progress);
    expect(view.commanders['cmd_isera']).toMatchObject({ state: 'unlocked', stateLabel: '해금됨 (조건 달성)' });
    expect(view.commanders['cmd_nox']!.state).toBe('locked');
  });

  it('조건 미달이라도 포인트가 충분하면 구매할 수 있고 구매하면 해금됨(구매)이 된다', () => {
    const progress = new MetaProgress(catalog);
    progress.settleRun(summary({ floorsReached: 40 }));
    const relic = startView(progress).items.find((i) => i.id === 'war_record')!;
    expect(relic).toMatchObject({ state: 'locked', canPurchase: true, shortfall: 0, purchaseLabel: '전공 25으로 해금' });
    progress.purchase('war_record');
    expect(startView(progress).items.find((i) => i.id === 'war_record')).toMatchObject({ state: 'unlocked', stateLabel: '해금됨 (구매)' });
  });

  it('손상 상태는 메시지만 담고 목록은 비어 있다', () => {
    const view = buildMetaStartView({ kind: 'broken', message: '깨짐' }, catalog, deps.commanders, deps.relics);
    expect(view).toMatchObject({ status: 'broken', message: '깨짐', items: [] });
  });

  it('통계 줄이 누적값을 반영한다', () => {
    const progress = new MetaProgress(catalog);
    progress.settleRun(summary({ bossActsKilled: [1], unitStar3: true }));
    const view = startView(progress);
    expect(view.statLines).toContain('끝난 런 1회');
    expect(view.statLines).toContain('처치한 보스: 액트 1');
    expect(view.statLines).toContain('유닛 3성 달성: 예');
  });
});

describe('buildEndMetaView', () => {
  it('정산 내역(층·보스·정예·승리)과 합계, 새 해금 이름·조건을 담는다', () => {
    const progress = new MetaProgress(catalog);
    const s = summary({ floorsReached: 13, bossActsKilled: [1], eliteKills: 2, outcome: 'victory' });
    const result = progress.settleRun(s);
    if (!result.ok) throw new Error(result.reason);
    const settlement: EndSettlement = { kind: 'settled', summary: s, earned: result.earned, newUnlocks: result.newUnlocks, balance: result.balance, threatUnlocked: result.threatUnlocked };
    const view = buildEndMetaView(settlement, catalog, deps.commanders, deps.relics, deps.threat);
    if (view.kind !== 'settled') throw new Error('settled여야 함');
    expect(view.rows.map((r) => r.label)).toEqual(['도달 층', '보스 처치', '정예 처치', '승리 보너스']);
    expect(view.total).toBe(13 + 10 + 4 + 30);
    expect(view.balance).toBe(view.total);
    expect(view.unlocks.find((u) => u.name.includes('이세라'))).toMatchObject({ targetLabel: '지휘관', conditionText: expect.stringContaining('런 1회 완료') });
    expect(view.unlocks.length).toBeGreaterThanOrEqual(3); // 런 완료 1회 + 액트 1 보스 + 엘리트 조건 등
  });

  it('테스트 런·실패는 각각 안내 문구를 준다', () => {
    expect(buildEndMetaView({ kind: 'test' }, catalog, deps.commanders, deps.relics, deps.threat)).toEqual({ kind: 'test', message: '테스트 런은 전공에 반영되지 않습니다.' });
    expect(buildEndMetaView({ kind: 'failed', reason: '사유' }, catalog, deps.commanders, deps.relics, deps.threat)).toEqual({ kind: 'failed', reason: '사유' });
  });
});
