import { describe, expect, it } from 'vitest';
import { RunController } from '../../core/run';
import { damageCommander } from '../../core/run/testSupport';
import { MemoryRunStorage } from './RunStorage';
import { allUnlockedMeta, createHarness, gameData, type Harness } from './testSupport';

/** 최고 위협 레벨을 해금해 둔 메타 저장소 (지휘관·유물 해금은 모두 열림) */
function metaWithThreat(maxThreat: number): MemoryRunStorage {
  const save = JSON.parse(allUnlockedMeta().read()!) as Record<string, unknown>;
  return new MemoryRunStorage(JSON.stringify({ ...save, threatUnlocked: maxThreat }));
}

const controllerOf = (h: Harness): RunController => (h.session as unknown as { controller: RunController }).controller;

describe('RunSession: 위협 레벨 선택', () => {
  it('새 메타에서는 레벨 0만 선택 가능하고 잠긴 칸에 해금 안내가 있다', () => {
    const threat = createHarness().session.snapshot().start!.threat;
    expect(threat.maxSelectable).toBe(0);
    expect(threat.rows.filter((r) => r.selectable).map((r) => r.level)).toEqual([0]);
    expect(threat.rows[1]!.lockText).toBe('레벨 0 승리 시 해금');
    expect(threat.rows[10]!.lockText).toBe('레벨 9 승리 시 해금');
  });

  it('해금한 만큼 선택 가능 범위가 넓어진다', () => {
    const h = createHarness(undefined, 42, metaWithThreat(4));
    const threat = h.session.snapshot().start!.threat;
    expect(threat.maxSelectable).toBe(4);
    expect(threat.rows[4]!.selectable).toBe(true);
    expect(threat.rows[5]!.selectable).toBe(false);
    expect(threat.rows[4]!.bonusPct).toBe(40);
  });

  it('잠긴 레벨로 시작하면 거부되고 시작 화면에 머문다', () => {
    const h = createHarness();
    h.session.newRun(5, undefined, 1);
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('start');
    expect(snap.notice).toMatchObject({ kind: 'error', message: expect.stringContaining('아직 해금하지 않은 위협 레벨입니다: 1') });
    expect(h.storage.read()).toBeNull();
    expect(h.runIds).toEqual([]);
  });

  it('범위 밖·정수가 아닌 레벨은 거부한다', () => {
    const h = createHarness(undefined, 42, metaWithThreat(10));
    for (const bad of [-1, 11, 1.5]) {
      h.session.newRun(5, undefined, bad);
      expect(h.session.snapshot().screen).toBe('start');
      expect(h.session.snapshot().notice?.message).toContain('위협 레벨은 0~10');
    }
  });

  it('해금한 레벨로 시작하면 HUD 배지와 저장에 레벨이 담기고 패널티가 적용된다', () => {
    const h = createHarness(undefined, 42, metaWithThreat(7));
    h.session.newRun(5, undefined, 7);
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ threatLevel: 7, threatName: '지친 지휘관', maxHp: 72, gold: 5 });
    expect((JSON.parse(h.storage.read()!) as { threatLevel: number }).threatLevel).toBe(7);
    expect(controllerOf(h).threatLevel).toBe(7);
  });

  it('레벨을 주지 않으면 기본 난이도이고 HUD에 레벨이 없다', () => {
    const h = createHarness();
    h.session.newRun(5);
    expect(h.session.snapshot().hud).toMatchObject({ threatLevel: 0, threatName: null, maxHp: 80, gold: 10 });
    expect(h.storage.read()).not.toContain('threatLevel');
  });

  it('이어하기가 레벨을 유지한다', () => {
    const h = createHarness(undefined, 42, metaWithThreat(3));
    h.session.newRun(5, undefined, 3);
    const again = createHarness(h.storage, 42, h.metaStorage);
    again.session.continueRun();
    expect(again.session.snapshot().hud?.threatLevel).toBe(3);
  });

  it('종료 화면 정산에 위협 레벨 보너스 줄이 나온다 (패배해도 보너스는 반영, 해금은 없음)', () => {
    const h = createHarness(undefined, 42, metaWithThreat(3));
    h.session.newRun(5, undefined, 3);
    h.session.chooseNode(h.session.snapshot().map!.availableIds[0]!);
    damageCommander(controllerOf(h), controllerOf(h).hp - 1);
    h.battle.forceRunResult('loss');
    h.session.continueAfterBattle();
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('ended');
    expect(snap.ended?.threatLevel).toBe(3);
    const meta = snap.endMeta;
    if (meta?.kind !== 'settled') throw new Error('settled여야 함');
    expect(meta.rows.some((r) => r.label === '위협 레벨 3 보너스')).toBe(true);
    expect(meta.newThreat).toBeNull();
    expect(h.meta.progress?.maxThreatLevel).toBe(3);
  });
});

describe('RunSession: 테스트 런은 해금과 무관하다', () => {
  it('메타가 새것이어도 테스트 런은 레벨 10을 고를 수 있고 정산하지 않는다', () => {
    const h = createHarness();
    expect(h.session.snapshot().start!.testCatalog.threat.rows.every((r) => r.selectable)).toBe(true);
    h.session.startTestRun(5, { threatLevel: 10 });
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ threatLevel: 10, threatName: '최후의 시험' });
    expect(snap.hud?.test).not.toBeNull();
    expect(h.meta.progress?.maxThreatLevel).toBe(0);
    expect(gameData.run.threat.maxLevel).toBe(10);
  });

  it('테스트 런의 범위 밖 레벨은 사유와 함께 거부된다', () => {
    const h = createHarness();
    h.session.startTestRun(5, { threatLevel: 11 });
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().notice?.message).toContain('위협 레벨은 0~10');
  });
});
