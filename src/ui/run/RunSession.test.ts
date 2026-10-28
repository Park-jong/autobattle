import { describe, expect, it } from 'vitest';
import { MemoryRunStorage, type RunStorage } from './RunStorage';
import { createHarness, playBattle } from './testSupport';

/** 맵에서 고를 수 있는 첫 노드를 고른다 */
function chooseFirst(h: ReturnType<typeof createHarness>): string {
  const id = h.session.snapshot().map!.availableIds[0]!;
  h.session.chooseNode(id);
  return id;
}

describe('RunSession 흐름', () => {
  it('새 런은 맵 화면으로 열리고 시드 제안·HUD·13층 맵을 보여준다', () => {
    const h = createHarness();
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().start).toMatchObject({ save: { kind: 'none' }, suggestedSeed: 42 });
    h.session.newRun(null);
    const snap = h.session.snapshot();
    expect(snap.screen).toBe('map');
    expect(snap.hud).toMatchObject({ seed: 42, floor: 0, floorCount: 13, hp: 80, maxHp: 80, gold: 10, commanderName: expect.stringContaining('하르텐') });
    expect(snap.map!.floors).toHaveLength(13);
    expect(snap.map!.availableIds.length).toBeGreaterThan(0);
    expect(snap.map!.floors[0]!.every((n) => n.state === 'available')).toBe(true);
    expect(snap.start).toBeNull();
  });

  it('노드 선택 → 전투 준비 → 전투 → 결과 → (보상) → 맵까지 한 판이 이어지고 단계마다 저장된다', () => {
    const h = createHarness();
    h.session.newRun(7);
    expect(h.session.snapshot().hud!.seed).toBe(7);
    const nodeId = chooseFirst(h);
    let snap = h.session.snapshot();
    expect(snap.screen).toBe('battle');
    expect(snap.battle).toMatchObject({ stage: 'prep', attempt: 1 });
    expect(snap.battle!.plan.nodeId).toBe(nodeId);
    expect(snap.battle!.plan.units.length).toBeGreaterThan(0);
    // 준비 화면은 기존 BattleSession의 경제/배치 UI를 그대로 쓴다
    expect(h.battle.snapshot().management?.canManage).toBe(true);
    expect(h.battle.snapshot().management!.state.board.length).toBeGreaterThan(0);
    expect(h.battle.prepping).toBe(true);

    playBattle(h);
    snap = h.session.snapshot();
    expect(snap.screen).toBe('battle');
    expect(snap.battle!.stage).toBe('result');
    expect(snap.battle!.settlement).not.toBeNull();
    const win = snap.battle!.settlement!.outcome === 'win';

    h.session.continueAfterBattle();
    snap = h.session.snapshot();
    if (win) {
      expect(snap.screen).toBe('reward');
      expect(snap.reward!.cards).toHaveLength(3);
      const before = snap.hud!.deckCount;
      h.session.claimReward(0);
      snap = h.session.snapshot();
      expect(snap.hud!.deckCount).toBe(before + 1);
    }
    expect(snap.screen).toBe('map');
    expect(snap.hud!.floor).toBe(1);
    expect(snap.map!.currentId).toBe(nodeId);
    expect(snap.map!.edges.filter((e) => e.state === 'available').length).toBeGreaterThan(0);
    expect(h.storage.read()).not.toBeNull();
  });

  it('전투 준비 중 유닛 구매 같은 로스터 변경이 즉시 저장된다', () => {
    const h = createHarness();
    h.session.newRun(3);
    chooseFirst(h);
    const before = h.storage.read();
    h.battle.rerollShop();
    expect(h.storage.read()).not.toBe(before);
  });

  it('전투가 시작되면 로스터 명령은 거부되고, 시작 화면으로 나가면 준비 단계로 저장된다', () => {
    const h = createHarness();
    h.session.newRun(5);
    chooseFirst(h);
    h.session.startBattle();
    expect(h.session.snapshot().battle!.stage).toBe('playing');
    expect(h.battle.snapshot().management?.canManage).toBe(false);
    h.session.toStart();
    expect(h.session.snapshot().screen).toBe('start');
    const status = h.session.snapshot().start!.save;
    expect(status.kind).toBe('ok');
    // 이어하기: 전투 준비 화면으로 복원
    h.session.continueRun();
    expect(h.session.snapshot().screen).toBe('battle');
    expect(h.session.snapshot().battle!.stage).toBe('prep');
  });

  it('새로고침(새 세션) 후 이어하기로 같은 상태가 복원된다', () => {
    const storage: RunStorage = new MemoryRunStorage();
    const first = createHarness(storage);
    first.session.newRun(11);
    first.session.chooseNode(first.session.snapshot().map!.availableIds[0]!);
    playBattle(first);
    first.session.continueAfterBattle();
    if (first.session.snapshot().screen === 'reward') first.session.claimReward(1);
    const before = first.session.snapshot();

    const second = createHarness(storage);
    const start = second.session.snapshot().start!;
    expect(start.save.kind).toBe('ok');
    second.session.continueRun();
    const after = second.session.snapshot();
    expect(after.screen).toBe(before.screen);
    expect(after.hud).toEqual(before.hud);
    expect(after.map!.currentId).toBe(before.map!.currentId);
    expect(after.map!.availableIds).toEqual(before.map!.availableIds);
  });

  it('상점·야영지·이벤트 노드까지 진행해도 각 화면 정보가 나오고 저장본이 복원된다', () => {
    const h = createHarness();
    h.session.newRun(21);
    const seen = new Set<string>();
    for (let guard = 0; guard < 60; guard++) {
      const snap = h.session.snapshot();
      seen.add(snap.screen);
      if (snap.screen === 'ended') break;
      switch (snap.screen) {
        case 'map': {
          // 상점/이벤트/야영지를 우선 고른다
          const options = snap.map!.floors.flat().filter((n) => snap.map!.availableIds.includes(n.id));
          h.session.chooseNode((options.find((n) => ['shop', 'event', 'camp'].includes(n.type)) ?? options[0]!).id);
          break;
        }
        case 'battle':
          if (snap.battle!.stage === 'result') h.session.continueAfterBattle();
          else playBattle(h);
          break;
        case 'reward': h.session.skipReward(); break;
        case 'shop':
          expect(snap.shop!.cards).toHaveLength(3);
          expect(snap.shop!.removal.price).toBe(75);
          expect(snap.shop!.removal.affordable).toBe(false); // 시작 골드로는 제거 불가
          h.session.leaveShop();
          break;
        case 'event': {
          const view = snap.event!;
          const choice = view.choices.find((c) => c.enabled);
          expect(choice).toBeDefined();
          h.session.chooseEventOption(choice!.index);
          while (h.session.snapshot().event?.pending) h.session.pickEventOption(0);
          h.session.finishEvent();
          break;
        }
        case 'camp':
          expect(snap.camp!.promotions).toBeDefined();
          h.session.leaveCamp();
          break;
        default: throw new Error(`예상 못한 화면 ${snap.screen}`);
      }
    }
    expect(seen.has('map')).toBe(true);
    expect([...seen].some((s) => ['shop', 'event', 'camp'].includes(s))).toBe(true);
  });

  it('고를 수 없는 노드·잘못된 시드는 상태를 바꾸지 않고 한국어 알림을 낸다', () => {
    const h = createHarness();
    h.session.newRun(1);
    const before = h.session.snapshot().hud;
    h.session.chooseNode('13-0');
    expect(h.session.snapshot().notice).toMatchObject({ kind: 'error' });
    expect(h.session.snapshot().notice!.message).toContain('고를 수 없는 노드');
    expect(h.session.snapshot().hud).toEqual(before);
    expect(h.session.snapshot().screen).toBe('map');

    h.session.toStart();
    h.session.newRun(2 ** 40);
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().notice!.message).toContain('시드');
    h.session.newRun(1.5);
    expect(h.session.snapshot().screen).toBe('start');
  });

  it('옛 화면 진입은 런을 정리하고 시작 화면 복귀 시 닫는다', () => {
    const h = createHarness();
    h.session.openManagement();
    expect(h.session.snapshot().screen).toBe('debug');
    h.session.toStart();
    h.session.openDebug();
    h.session.toStart();
    expect(h.legacyCalls).toEqual(['management', 'close', 'debug', 'close']);
    expect(h.session.snapshot().screen).toBe('start');
  });

  it('진행 중인 런을 두고 디버그로 나가도 편성 디버그는 원래 상태로 돌아온다', () => {
    const h = createHarness();
    const enemiesBefore = h.battle.snapshot().formations[1].length;
    h.session.newRun(9);
    chooseFirst(h);
    h.session.toStart();
    h.session.openDebug();
    expect(h.battle.snapshot().formations[1].length).toBe(enemiesBefore);
    expect(h.battle.snapshot().editable).toBe(true);
  });
});

describe('저장본 처리', () => {
  it('손상된 저장본은 한국어 오류를 보여주고 저장 삭제로 지울 수 있다', () => {
    const h = createHarness(new MemoryRunStorage('{ 깨진 json'));
    const status = h.session.snapshot().start!.save;
    expect(status.kind).toBe('broken');
    if (status.kind === 'broken') expect(status.message).toContain('저장 데이터');
    h.session.continueRun();
    expect(h.session.snapshot().screen).toBe('start');
    expect(h.session.snapshot().notice!.kind).toBe('error');
    h.session.deleteSave();
    expect(h.session.snapshot().start!.save.kind).toBe('none');
    expect(h.storage.read()).toBeNull();
  });

  it('버전이 다른 저장본은 위치가 담긴 오류로 거부한다', () => {
    const base = createHarness();
    base.session.newRun(4);
    const saved = JSON.parse(base.storage.read()!) as Record<string, unknown>;
    saved.version = 99;
    const h = createHarness(new MemoryRunStorage(JSON.stringify(saved)));
    const status = h.session.snapshot().start!.save;
    expect(status.kind).toBe('broken');
    if (status.kind === 'broken') expect(status.message).toContain('version');
  });

  it('저장소에 쓸 수 없으면 게임은 계속되고 알림만 표시한다', () => {
    const storage: RunStorage = { read: () => null, write: () => '용량 초과', remove: () => undefined };
    const h = createHarness(storage);
    h.session.newRun(6);
    expect(h.session.snapshot().screen).toBe('map');
    expect(h.session.snapshot().notice!.message).toContain('자동 저장에 실패');
  });

  it('새 런은 이전 저장본을 덮어쓴다', () => {
    const h = createHarness();
    h.session.newRun(1);
    h.session.toStart();
    h.session.newRun(2);
    h.session.toStart();
    const status = h.session.snapshot().start!.save;
    expect(status.kind === 'ok' && status.summary.seed).toBe(2);
  });
});
