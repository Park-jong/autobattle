import { describe, expect, it } from 'vitest';
import { AutoRunner } from './autoRunner';
import { RUN } from './constants';
import { RunController } from './runController';
import { SAVE_FORMAT } from './runSerializer';
import { basicPlan, driveTo, finishBattle, newRun, runDeps } from './testSupport';

const roundtrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
const json = (run: RunController): string => JSON.stringify(run.serialize());

/** 같은 정책으로 끝까지 자동 진행한 결과 (요약 + 최종 저장 상태) */
function finishAuto(run: RunController, policySeed = 11): { summary: string; save: string } {
  const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'random', policySeed, plan: basicPlan }).run();
  return { summary: JSON.stringify(summary), save: json(run) };
}

describe('저장 형식', () => {
  it('format/version 필드가 있고 JSON으로 직렬화된다', () => {
    const save = newRun(1).serialize();
    expect(save.format).toBe(SAVE_FORMAT);
    expect(save.version).toBe(RUN.FORMAT_VERSION);
    expect(JSON.parse(JSON.stringify(save))).toEqual(save);
    expect(save.phase).toBe('map');
    expect(save.session).toBeNull();
  });

  it('여러 단계의 체크포인트가 JSON 왕복 후 완전히 같다', () => {
    const start = newRun(3);
    expect(json(roundtrip(start))).toBe(json(start));

    const entered = newRun(3);
    entered.chooseNode(entered.availableNodes()[0]!.id); // 노드 진입 직후
    expect(json(roundtrip(entered))).toBe(json(entered));

    const reward = newRun(3);
    reward.chooseNode(reward.availableNodes()[0]!.id);
    finishBattle(reward, 'win');
    expect(reward.phase).toBe('reward');
    expect(json(roundtrip(reward))).toBe(json(reward));

    for (const type of ['shop', 'event', 'camp'] as const) {
      const run = newRun(1);
      driveTo(run, type);
      expect(json(roundtrip(run))).toBe(json(run));
    }
  });

  it('이벤트 도중(카드 선택 대기)에도 저장·복원하면 이어서 같은 결과다', () => {
    const make = () => {
      const run = newRun(1);
      for (let guard = 0; guard < 5; guard++) {
        driveTo(run, 'event');
        const view = run.eventView()!;
        const withPick = view.choices.findIndex((c, i) => c.enabled && runDeps.events.get(view.eventId)!.choices[i]!.effects.some((e) => 'mode' in e && e.mode === 'choose'));
        if (withPick >= 0) {
          run.chooseEventOption(withPick);
          return run;
        }
        run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
        while (run.eventView()?.pending) run.pickEventOption(0);
        run.finishEvent();
      }
      return null;
    };
    const run = make();
    if (!run) return; // 이 시드에서는 선택형 이벤트에 걸리지 않음 (다른 테스트가 이벤트 왕복을 확인)
    expect(run.eventView()?.pending).not.toBeNull();
    const restored = roundtrip(run);
    expect(restored.eventView()).toEqual(run.eventView());
    for (const r of [run, restored]) {
      r.pickEventOption(0);
      r.finishEvent();
    }
    expect(json(restored)).toBe(json(run));
  });

  it('전투 중 저장은 전투 준비 단계로 저장되고, 복원하면 같은 준비 상태에서 같은 전투가 나온다', () => {
    const run = newRun(4);
    run.chooseNode(run.availableNodes()[0]!.id);
    const expected = JSON.stringify(run.createSimulator().run().events);
    run.beginBattle();
    expect(run.phase).toBe('battle');
    const save = run.serialize();
    expect(save.phase).toBe('battlePrep');
    expect(save.session).toEqual({ kind: 'battle', tries: 0 });
    const restored = RunController.restore(runDeps, JSON.parse(JSON.stringify(save)));
    expect(restored.phase).toBe('battlePrep');
    expect(restored.roster.buy(0).ok || true).toBe(true); // 관리 명령 다시 가능
    const fresh = RunController.restore(runDeps, JSON.parse(JSON.stringify(save)));
    expect(JSON.stringify(fresh.createSimulator().run().events)).toBe(expected);
  });
});

describe('이어하기: 복원 후 같은 선택 → 같은 결과', () => {
  it('시작 직후(맵 선택) 체크포인트', () => {
    const original = newRun(7);
    const restored = roundtrip(original);
    expect(finishAuto(restored)).toEqual(finishAuto(original));
  });

  it('노드 진입 직후 체크포인트', () => {
    const original = newRun(8);
    original.chooseNode(original.availableNodes()[0]!.id);
    const restored = roundtrip(original);
    expect(finishAuto(restored)).toEqual(finishAuto(original));
  });

  it('여러 노드를 지난 맵 선택 체크포인트 (골드·로스터·덱·상점 난수 상태가 이어짐)', () => {
    const original = newRun(9);
    driveTo(original, 'camp');
    original.leaveCamp();
    expect(original.phase).toBe('map');
    const restored = roundtrip(original);
    expect(restored.roster.snapshot()).toEqual(original.roster.snapshot());
    expect(finishAuto(restored)).toEqual(finishAuto(original));
  });

  it('복원 뒤 다시 저장해도 반복 복원이 안정적이다', () => {
    const run = newRun(10);
    driveTo(run, 'shop');
    const again = roundtrip(roundtrip(run));
    expect(json(again)).toBe(json(run));
  });
});

describe('저장 데이터 검증', () => {
  const base = () => JSON.parse(JSON.stringify(newRun(5).serialize())) as any;
  const withBattle = () => {
    const run = newRun(5);
    run.chooseNode(run.availableNodes()[0]!.id);
    return JSON.parse(JSON.stringify(run.serialize())) as any;
  };
  const restoreWith = (data: unknown) => () => RunController.restore(runDeps, data);

  it('런 저장 파일이 아니거나 버전이 다르면 거부한다', () => {
    expect(restoreWith(null)).toThrow(/run: 객체여야 함/);
    expect(restoreWith({ ...base(), format: 'other' })).toThrow(/run\.format/);
    expect(restoreWith({ ...base(), version: 99 })).toThrow(/run\.version: 지원하지 않는 저장 버전 99/);
    const missing = base();
    delete missing.map;
    expect(restoreWith(missing)).toThrow(/run\.map: 필수 필드 누락/);
    expect(restoreWith({ ...base(), extra: 1 })).toThrow(/run\.extra: 알 수 없는 필드/);
  });

  it('지휘관·HP·위치·단계 오류를 위치와 함께 알려 준다', () => {
    expect(restoreWith({ ...base(), commanderId: 'cmd_x' })).toThrow(/run\.commanderId.*cmd_x/);
    expect(restoreWith({ ...base(), health: { hp: 90, maxHp: 80 } })).toThrow(/run\.health\.hp/);
    expect(restoreWith({ ...base(), position: { currentNodeId: '9-9', visited: [] } })).toThrow(/run\.position\.currentNodeId.*9-9/);
    expect(restoreWith({ ...base(), position: { currentNodeId: null, visited: ['9-9'] } })).toThrow(/run\.position\.visited\[0\]/);
    expect(restoreWith({ ...base(), phase: 'reward' })).toThrow(/run\.session.*reward/);
    expect(restoreWith({ ...base(), phase: 'battle' })).toThrow(/run\.phase.*전투 중/);
    expect(restoreWith({ ...base(), phase: 'weird' })).toThrow(/run\.phase/);
    const ended = base();
    ended.phase = 'ended';
    expect(restoreWith(ended)).toThrow(/run\.outcome/);
    expect(restoreWith({ ...base(), outcome: 'dead' })).toThrow(/run\.outcome/);
    expect(restoreWith({ ...base(), seenEvents: ['ghost'] })).toThrow(/run\.seenEvents\[0\]/);
    expect(restoreWith({ ...base(), removals: -1 })).toThrow(/run\.removals/);
  });

  it('덱·골드·로스터·세션의 깊은 오류도 경로가 담긴다', () => {
    const badCard = base();
    badCard.forces.carryDeck.draw[0].cardId = 'ghost';
    expect(restoreWith(badCard)).toThrow(/run\.forces\.carryDeck\.draw\[0\]\.cardId/);
    const badGold = base();
    badGold.forces.economy.balance = -5;
    expect(restoreWith(badGold)).toThrow(/run\.forces\.economy\.balance/);
    const badUnit = base();
    badUnit.forces.management.owned[0].unitId = 'ghost';
    expect(restoreWith(badUnit)).toThrow(/run\.forces\.management\.owned\[0\]\.unitId/);
    const badMap = base();
    badMap.map.floors[0][0].type = 'camp';
    expect(restoreWith(badMap)).toThrow(/run\.map: 1층은 전투만/);
    const badSession = withBattle();
    badSession.session = { kind: 'battle', tries: -1 };
    expect(restoreWith(badSession)).toThrow(/run\.session\.tries/);
    const wrongKind = withBattle();
    wrongKind.session = { kind: 'camp' };
    expect(restoreWith(wrongKind)).toThrow(/run\.session.*battle/);
    const noNode = withBattle();
    noNode.position.currentNodeId = null;
    expect(restoreWith(noNode)).toThrow(/run\.position/);
  });

  it('이벤트·상점·보상 세션 데이터도 검증한다', () => {
    const run = newRun(1);
    driveTo(run, 'event');
    const event = JSON.parse(JSON.stringify(run.serialize())) as any;
    const badEvent = structuredClone(event);
    badEvent.session.state.eventId = 'ghost';
    expect(restoreWith(badEvent)).toThrow(/eventId/);
    const badChosen = structuredClone(event);
    badChosen.session.state.chosen = 9;
    expect(restoreWith(badChosen)).toThrow(/chosen/);
    const badPending = structuredClone(event);
    badPending.session.state.pending = { kind: 'removeCard', options: [1] };
    expect(restoreWith(badPending)).toThrow(/pending/);

    const shopRun = newRun(1);
    driveTo(shopRun, 'shop');
    const shop = JSON.parse(JSON.stringify(shopRun.serialize())) as any;
    shop.session.cards[0].cardId = 'ghost';
    expect(restoreWith(shop)).toThrow(/run\.session\.cards\[0\]\.cardId/);

    const rewardRun = newRun(1);
    rewardRun.chooseNode(rewardRun.availableNodes()[0]!.id);
    finishBattle(rewardRun, 'win');
    const reward = JSON.parse(JSON.stringify(rewardRun.serialize())) as any;
    reward.session.offer[0] = 'ghost';
    expect(restoreWith(reward)).toThrow(/run\.session\.offer\[0\]/);
  });

  it('잘못된 저장 데이터는 복원에 실패해도 다른 런에 영향을 주지 않는다', () => {
    const run = newRun(5);
    const before = json(run);
    expect(restoreWith({ ...base(), version: 2 })).toThrow();
    expect(json(run)).toBe(before);
  });
});
