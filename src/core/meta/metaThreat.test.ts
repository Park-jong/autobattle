import { describe, expect, it } from 'vitest';
import metaJson from '../../../data/meta.json';
import { loadMeta } from '../data/metaLoader';
import { runDeps } from '../run/testSupport';
import { MetaProgress, calculateRunPoints, type RunSummary } from '.';

const catalog = loadMeta(metaJson, runDeps.commanders, runDeps.relics);
const newMeta = (): MetaProgress => new MetaProgress(catalog);
let counter = 0;

const summary = (patch: Partial<RunSummary> = {}): RunSummary => ({
  runId: `run-${++counter}`, threatLevel: 0, test: false, commanderId: 'cmd_harten', outcome: 'victory', floorsReached: 39, bossActsKilled: [1, 2, 3],
  eliteKills: 4, ultimateUses: 0, shopVisits: 0, unitStar3: false, bossEntryGold: 0, deckSize: 10, ...patch,
});

describe('위협 레벨 해금', () => {
  it('처음에는 레벨 0만 고를 수 있다', () => {
    expect(newMeta().maxThreatLevel).toBe(0);
    expect(newMeta().runUnlocks(['cmd_harten'], []).maxThreat).toBe(0);
  });

  it('현재 최고 레벨을 승리하면 다음 레벨이 열리고 결과에 새 레벨이 담긴다', () => {
    const meta = newMeta();
    const first = meta.settleRun(summary({ threatLevel: 0 }));
    expect(first).toMatchObject({ ok: true, threatUnlocked: 1 });
    expect(meta.maxThreatLevel).toBe(1);
    expect(meta.runUnlocks([], []).maxThreat).toBe(1);
    expect(meta.settleRun(summary({ threatLevel: 1 }))).toMatchObject({ threatUnlocked: 2 });
    expect(meta.maxThreatLevel).toBe(2);
  });

  it('패배나 낮은 레벨 승리로는 변하지 않는다', () => {
    const meta = newMeta();
    meta.settleRun(summary({ threatLevel: 0 })); // → 1
    meta.settleRun(summary({ threatLevel: 1 })); // → 2
    expect(meta.settleRun(summary({ threatLevel: 2, outcome: 'dead' }))).toMatchObject({ ok: true, threatUnlocked: null });
    expect(meta.settleRun(summary({ threatLevel: 0 }))).toMatchObject({ threatUnlocked: null });
    expect(meta.settleRun(summary({ threatLevel: 1 }))).toMatchObject({ threatUnlocked: null });
    expect(meta.maxThreatLevel).toBe(2);
  });

  it('해금된 최고 레벨보다 높은 레벨의 승리는 여러 레벨을 한 번에 열지 못한다', () => {
    const meta = newMeta();
    expect(meta.settleRun(summary({ threatLevel: 5 }))).toMatchObject({ ok: true, threatUnlocked: null });
    expect(meta.maxThreatLevel).toBe(0);
  });

  it('최대 10을 넘지 않고, 10을 승리해도 새 레벨은 없다', () => {
    const meta = newMeta();
    for (let level = 0; level <= 9; level += 1) meta.settleRun(summary({ threatLevel: level }));
    expect(meta.maxThreatLevel).toBe(10);
    expect(meta.settleRun(summary({ threatLevel: 10 }))).toMatchObject({ ok: true, threatUnlocked: null });
    expect(meta.maxThreatLevel).toBe(10);
  });

  it('테스트 런과 같은 런 중복 정산은 해금하지 않는다', () => {
    const meta = newMeta();
    expect(meta.settleRun(summary({ test: true, threatLevel: 0 }))).toMatchObject({ ok: false });
    expect(meta.maxThreatLevel).toBe(0);
    const s = summary({ threatLevel: 0 });
    meta.settleRun(s);
    expect(meta.settleRun(s)).toMatchObject({ ok: false });
    expect(meta.maxThreatLevel).toBe(1);
  });
});

describe('위협 레벨 전공 보너스', () => {
  const rule = catalog.points;

  it('레벨 0은 보너스가 없고 레벨 N은 합계에 N×10%를 더해 반올림한다', () => {
    const base = 39 * rule.perFloor + 3 * rule.perBoss + 4 * rule.perElite + rule.victoryBonus;
    expect(rule.threatBonusPctPerLevel).toBe(10);
    expect(calculateRunPoints(rule, summary({ threatLevel: 0 }))).toMatchObject({ threat: 0, total: base });
    for (const level of [1, 5, 10]) {
      const bonus = Math.round((base * 10 * level) / 100);
      expect(calculateRunPoints(rule, summary({ threatLevel: level }))).toMatchObject({ threat: bonus, total: base + bonus });
    }
  });

  it('반올림: 합계가 작아도 정수로 떨어진다', () => {
    const small = summary({ outcome: 'dead', floorsReached: 5, bossActsKilled: [], eliteKills: 0, threatLevel: 3 });
    expect(calculateRunPoints(rule, small)).toMatchObject({ threat: Math.round((5 * rule.perFloor * 30) / 100), total: 5 * rule.perFloor + Math.round((5 * 30) / 100) });
  });

  it('정산 잔액에 보너스가 반영된다', () => {
    const meta = newMeta();
    const s = summary({ threatLevel: 4 });
    const expected = calculateRunPoints(rule, s).total;
    const result = meta.settleRun(s);
    expect(result).toMatchObject({ ok: true, balance: expected });
    expect(meta.points).toBe(expected);
    expect(meta.totalEarned).toBe(expected);
  });
});

describe('메타 저장 형식 호환', () => {
  it('해금이 없으면 threatUnlocked를 저장하지 않아 기존 v1 저장과 같다', () => {
    const save = newMeta().serialize() as unknown as Record<string, unknown>;
    expect('threatUnlocked' in save).toBe(false);
    expect(save.version).toBe(1);
  });

  it('해금한 레벨은 저장되고 복원된다', () => {
    const meta = newMeta();
    meta.settleRun(summary({ threatLevel: 0 }));
    meta.settleRun(summary({ threatLevel: 1 }));
    const save = JSON.parse(JSON.stringify(meta.serialize())) as { threatUnlocked: number };
    expect(save.threatUnlocked).toBe(2);
    const back = MetaProgress.restore(catalog, save);
    expect(back.maxThreatLevel).toBe(2);
    expect(JSON.stringify(back.serialize())).toBe(JSON.stringify(meta.serialize()));
  });

  it('필드가 없는 기존 저장본은 레벨 0으로 읽힌다', () => {
    const old = JSON.parse(JSON.stringify(newMeta().serialize())) as Record<string, unknown>;
    expect(MetaProgress.restore(catalog, old).maxThreatLevel).toBe(0);
  });

  it('범위 밖 값은 경로가 담긴 오류로 거부한다', () => {
    const base = JSON.parse(JSON.stringify(newMeta().serialize())) as Record<string, unknown>;
    for (const bad of [11, -1, 1.5]) {
      expect(() => MetaProgress.restore(catalog, { ...base, threatUnlocked: bad })).toThrow(/threatUnlocked/);
    }
  });
});
