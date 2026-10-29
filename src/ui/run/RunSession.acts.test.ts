import { describe, expect, it } from 'vitest';
import { RunController } from '../../core/run';
import { driveTo, finishBattle } from '../../core/run/testSupport';
import { buildActIntroView, buildBossRelicView, buildEndView, buildHud, buildMapView, buildSettlementView } from './runViews';
import { MemoryRunStorage } from './RunStorage';
import { createHarness, gameData } from './testSupport';

/** 코어로 만든 런을 저장소에 넣고 이어하기로 연다 */
function openSaved(run: RunController) {
  const storage = new MemoryRunStorage();
  storage.write(JSON.stringify(run.serialize()));
  const h = createHarness(storage);
  h.session.continueRun();
  return h;
}

const newThreeActRun = (seed: number): RunController => RunController.create(gameData.run, { seed, commanderId: 'cmd_harten', acts: 3 });

describe('RunSession: 액트 전환 화면', () => {
  it('보스 유물 선택 → 액트 소개 → 액트 2 맵까지 화면이 이어지고 단계마다 v3로 저장된다', () => {
    const run = newThreeActRun(51);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const h = openSaved(run);
    let snap = h.session.snapshot();
    expect(snap.screen).toBe('bossRelic');
    expect(snap.bossRelic!.relics).toHaveLength(3); // 보스 유물 11개 중 무작위 3개
    expect(snap.bossRelic!.relics.every((r) => gameData.run.relics.get(r.id)?.rarity === 'boss')).toBe(true);
    expect(snap.bossRelic).toMatchObject({ act: 1, actName: '회색 관문', actCount: 3 });
    expect(snap.hud).toMatchObject({ act: 1, actName: '회색 관문', actCount: 3 });

    h.session.claimBossRelic(0);
    snap = h.session.snapshot();
    expect(snap.screen).toBe('actIntro');
    expect(snap.actIntro).toMatchObject({ act: 2, actCount: 3, name: '잿불 고원' });
    expect(snap.actIntro!.hpAfter).toBe(snap.hud!.hp);
    expect(snap.actIntro!.boss!.name).toBe('쌍둥이 주술사 세르·미르');
    expect(snap.actIntro!.boss!.bossPatterns.map((p) => p.title)).toEqual(['쌍둥이 부활']);
    expect(snap.hud!.relics).toHaveLength(1);
    const saved = JSON.parse(h.storage.read()!);
    expect(saved).toMatchObject({ version: 3, phase: 'actIntro', totalActs: 3 });
    expect(saved.maps).toHaveLength(2);

    h.session.continueAct();
    snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.map).toMatchObject({ act: 2, actName: '잿불 고원', actCount: 3 });
    expect(snap.hud).toMatchObject({ act: 2, floor: 0, floorCount: 13 });
    expect(snap.map!.floors[0]![0]!.id.startsWith('a2-')).toBe(true);
    expect(snap.map!.availableIds.length).toBeGreaterThan(0);
    expect(snap.map!.floors.flat().every((n) => n.state !== 'visited' && n.state !== 'current')).toBe(true);
  });

  it('새로 연 세션(새로고침)도 보스 유물 선택·액트 소개 화면에서 그대로 이어진다', () => {
    const run = newThreeActRun(52);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const first = openSaved(run);
    first.session.claimBossRelic(1);
    expect(first.session.snapshot().screen).toBe('actIntro');
    const second = createHarness(first.storage);
    expect(second.session.snapshot().start!.save).toMatchObject({ kind: 'ok', summary: { act: 2 } });
    second.session.continueRun();
    expect(second.session.snapshot().screen).toBe('actIntro');
    expect(second.session.snapshot().hud!.relics.map((r) => r.id)).toEqual(first.session.snapshot().hud!.relics.map((r) => r.id));
  });

  it('보스 유물을 건너뛰면 유물 없이 액트 소개로 간다', () => {
    const run = newThreeActRun(53);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const h = openSaved(run);
    h.session.skipBossRelic();
    expect(h.session.snapshot().screen).toBe('actIntro');
    expect(h.session.snapshot().hud!.relics).toHaveLength(0);
  });

  it('단계가 맞지 않는 명령은 알림만 내고 화면은 그대로다', () => {
    const run = newThreeActRun(54);
    const h = openSaved(run);
    h.session.claimBossRelic(0);
    h.session.continueAct();
    expect(h.session.snapshot().screen).toBe('map');
    expect(h.session.snapshot().notice?.kind).toBe('error');
  });

  it('액트 3 보스를 쓰러뜨리면 종료 화면에 도달 액트·층이 나온다', () => {
    const run = newThreeActRun(55);
    for (let act = 1; act <= 3; act++) {
      driveTo(run, 'boss');
      finishBattle(run, 'win');
      if (run.phase === 'bossRelic') run.claimBossRelic(0);
      if (run.phase === 'actIntro') run.continueAct();
    }
    expect(run.phase).toBe('ended');
    const end = buildEndView(run, gameData.cards, gameData.units, gameData.run.relics);
    expect(end).toMatchObject({ outcome: 'victory', title: '3액트 돌파', act: 3, actCount: 3, actName: '몰락한 수도 아스트라', floorReached: 13 });
    expect(end.bossRelicOffer).toHaveLength(3); // 이미 2개를 받았어도 남은 보스 유물 중 3개
  });
});

describe('runViews: 액트 표시 정보', () => {
  it('HUD·맵에 액트 번호와 이름이 담기고 1액트 런도 같은 구조다', () => {
    const run = RunController.create(gameData.run, { seed: 1, commanderId: 'cmd_nox', acts: 1 });
    expect(buildHud(run)).toMatchObject({ act: 1, actCount: 1, actName: '회색 관문' });
    expect(buildMapView(run)).toMatchObject({ act: 1, actCount: 1, actName: '회색 관문', region: '국경 요새' });
  });

  it('보스 유물·액트 소개 뷰', () => {
    const run = newThreeActRun(56);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const boss = buildBossRelicView(run, gameData.run.relics);
    expect(boss.relics).toHaveLength(3);
    expect(boss.owned).toEqual([]);
    run.claimBossRelic(0);
    const intro = buildActIntroView(run);
    expect(intro).toMatchObject({ act: 2, name: '잿불 고원', region: '남쪽 화산 고원' });
    expect(intro.hpAfter - intro.hpBefore).toBe(intro.healed);
    expect(intro.boss?.kind).toBe('boss');
    expect(buildBossRelicView(run, gameData.run.relics).owned).toHaveLength(1);
  });

  it('전투 결과 버튼 문구: 액트 보스 처치는 보스 유물 선택(후보 없으면 다음 액트)', () => {
    const run = newThreeActRun(57);
    driveTo(run, 'boss');
    const result = finishBattle(run, 'win');
    if (!result.ok) throw new Error(result.reason);
    const view = buildSettlementView(result.settlement);
    expect(view).toMatchObject({ actCleared: 1, runEnded: null, continueLabel: '보스 유물 선택' });
    expect(buildSettlementView({ ...result.settlement, bossRelicOffer: null })).toMatchObject({ continueLabel: '다음 액트로' });
  });

  it('보스 미리보기에 패턴 설명이 있고 액트 번호가 붙는다 (RunSession.previewNode)', () => {
    const run = newThreeActRun(58);
    const h = openSaved(run);
    const bossId = run.map.bossNode.id;
    const preview = h.session.previewNode(bossId)!;
    expect(preview).toMatchObject({ act: 1, floor: 13, kind: 'boss' });
    expect(preview.bossPatterns).toEqual([expect.objectContaining({ title: '열 강타', unitName: '성문 파괴자' })]);
    expect(h.session.previewNode(run.map.floor(1)[0]!.id)!.bossPatterns).toEqual([]);
  });
});

describe('RunSession: 보스 유물 후보가 없는 일반 런 (메타 미해금)', () => {
  it('액트 보스를 이기면 결과 창이 뜨고(예외 없음) "다음 액트로" → 액트 소개 → 액트 2 맵으로 이어진다', () => {
    // 보스 유물 3개는 "액트 1 보스 처치" 해금이라 첫 런에는 후보가 0개 → 선택 단계 없이 곧바로 다음 액트(현재 노드 없음)
    const run = RunController.create(gameData.run, {
      seed: 61, commanderId: 'cmd_harten', acts: 3, unlocks: { commanders: ['cmd_harten'], relics: [], maxThreat: 0 },
    });
    driveTo(run, 'boss');
    const h = openSaved(run);
    expect(h.session.snapshot().battle?.stage).toBe('prep');
    const plan = h.session.snapshot().battle!.plan;

    h.battle.forceRunResult('win');
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('battle');
    expect(snap.battle).toMatchObject({ stage: 'result', plan });
    expect(snap.battle!.settlement).toMatchObject({ actCleared: 1, continueLabel: '다음 액트로' });

    h.session.continueAfterBattle();
    expect(h.session.snapshot().screen).toBe('actIntro');
    h.session.continueAct();
    expect(h.session.snapshot().map).toMatchObject({ act: 2 });
  });
});
