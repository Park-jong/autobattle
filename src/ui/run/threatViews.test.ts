import { describe, expect, it } from 'vitest';
import { MetaProgress } from '../../core/meta';
import { buildEndMetaView, buildMetaStartView } from './metaViews';
import { buildThreatPicker, clampThreatLevel, threatLabel, threatName } from './threatViews';
import { gameData } from './testSupport';

const { run: deps, meta: catalog } = gameData;

describe('buildThreatPicker', () => {
  it('레벨 0~10 열한 칸을 만들고 해금된 레벨까지만 고를 수 있다', () => {
    const picker = buildThreatPicker(deps.threat, 2, 10);
    expect(picker.rows).toHaveLength(11);
    expect(picker.maxSelectable).toBe(2);
    expect(picker.rows.map((r) => r.selectable)).toEqual([true, true, true, false, false, false, false, false, false, false, false]);
    expect(picker.rows[0]).toMatchObject({ label: '레벨 0 — 기본', lockText: '', penalties: [], bonusPct: 0, bonusText: '전공 보너스 없음' });
    expect(picker.rows[3]).toMatchObject({ lockText: '레벨 2 승리 시 해금', bonusPct: 30, bonusText: '전공 포인트 +30%' });
    expect(picker.rows[3]!.label).toBe('레벨 3 — 날 선 칼날');
  });

  it('패널티 목록은 1~N 레벨을 누적한다', () => {
    const picker = buildThreatPicker(deps.threat, 10, 10);
    expect(picker.rows[1]!.penalties.map((p) => p.level)).toEqual([1]);
    expect(picker.rows[5]!.penalties.map((p) => p.level)).toEqual([1, 2, 3, 4, 5]);
    expect(picker.rows[10]!.penalties).toHaveLength(10);
    expect(picker.rows[10]!.penalties[0]).toEqual({ level: 1, name: '단단한 적', text: '모든 적의 HP가 10% 늘어난다.' });
  });

  it('모두 연 선택지(테스트용)는 잠긴 칸이 없다', () => {
    expect(buildThreatPicker(deps.threat, deps.threat.maxLevel, 0).rows.every((r) => r.selectable)).toBe(true);
    expect(buildThreatPicker(deps.threat, 99, 10).maxSelectable).toBe(10);
  });

  it('clampThreatLevel: 해금 범위로 맞추고 잘못된 값은 0', () => {
    const picker = buildThreatPicker(deps.threat, 3, 10);
    expect(clampThreatLevel(2, picker)).toBe(2);
    expect(clampThreatLevel(9, picker)).toBe(3);
    expect(clampThreatLevel(-1, picker)).toBe(0);
    expect(clampThreatLevel(1.5, picker)).toBe(0);
    expect(clampThreatLevel(Number.NaN, picker)).toBe(0);
  });

  it('이름·라벨', () => {
    expect(threatName(deps.threat, 0)).toBe('기본');
    expect(threatLabel(deps.threat, 7)).toBe('위협 레벨 7 — 지친 지휘관');
  });
});

describe('종료 화면 정산: 위협 레벨', () => {
  const summary = (threatLevel: number) => ({
    runId: 'r', threatLevel, test: false, commanderId: 'cmd_harten', outcome: 'victory' as const, floorsReached: 39, bossActsKilled: [1, 2, 3],
    eliteKills: 4, ultimateUses: 0, shopVisits: 0, unitStar3: false, bossEntryGold: 0, deckSize: 10,
  });

  it('레벨이 있으면 보너스 줄과 새로 열린 레벨을 보여 준다', () => {
    const meta = new MetaProgress(catalog);
    const s = summary(2);
    const result = meta.settleRun(s);
    if (!result.ok) throw new Error(result.reason);
    const view = buildEndMetaView({ kind: 'settled', summary: s, earned: result.earned, newUnlocks: [], balance: result.balance, threatUnlocked: result.threatUnlocked }, catalog, deps.commanders, deps.relics, deps.threat);
    if (view.kind !== 'settled') throw new Error('settled여야 함');
    expect(view.rows.find((r) => r.label === '위협 레벨 2 보너스')).toEqual({ label: '위협 레벨 2 보너스', value: `+${result.earned.threat} (×20%)` });
    expect(view.total).toBe(result.earned.total);
  });

  it('레벨 0은 보너스 줄이 없고, 새 레벨이 열리면 이름과 함께 나온다', () => {
    const meta = new MetaProgress(catalog);
    const s = summary(0);
    const result = meta.settleRun(s);
    if (!result.ok) throw new Error(result.reason);
    const view = buildEndMetaView({ kind: 'settled', summary: s, earned: result.earned, newUnlocks: [], balance: result.balance, threatUnlocked: result.threatUnlocked }, catalog, deps.commanders, deps.relics, deps.threat);
    if (view.kind !== 'settled') throw new Error('settled여야 함');
    expect(view.rows.some((r) => r.label.includes('위협'))).toBe(false);
    expect(view.newThreat).toEqual({ level: 1, name: '단단한 적' });
  });

  it('시작 화면 통계에 해금한 최고 위협 레벨이 나온다', () => {
    const meta = new MetaProgress(catalog);
    meta.settleRun(summary(0));
    const view = buildMetaStartView({ kind: 'ok', progress: meta }, catalog, deps.commanders, deps.relics);
    expect(view.statLines).toContain('해금한 최고 위협 레벨 1');
  });
});
