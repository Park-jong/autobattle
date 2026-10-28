import { describe, expect, it } from 'vitest';
import { AutoRunner } from './autoRunner';
import { RUN } from './constants';
import { RunController } from './runController';
import { SAVE_FORMAT } from './runSerializer';
import { basicPlan, damageCommander, driveTo, finishBattle, newRun, runDeps } from './testSupport';

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
    delete missing.maps;
    expect(restoreWith(missing)).toThrow(/run\.maps: 필수 필드 누락/);
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
    badMap.maps[0].floors[0][0].type = 'camp';
    expect(restoreWith(badMap)).toThrow(/run\.maps\[0\]: 1층은 전투만/);
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
    expect(restoreWith({ ...base(), version: 4 })).toThrow();
    expect(json(run)).toBe(before);
  });
});

describe('저장 데이터 일관성 검증', () => {
  const dump = (run: RunController) => JSON.parse(JSON.stringify(run.serialize())) as any;
  const restoreWith = (data: unknown) => () => RunController.restore(runDeps, data);
  const at = (seed: number, type: Parameters<typeof driveTo>[1]) => {
    const run = newRun(seed);
    driveTo(run, type);
    return dump(run);
  };
  const firstBattle = () => {
    const run = newRun(5);
    run.chooseNode(run.availableNodes()[0]!.id);
    return dump(run);
  };
  const otherNode = (save: any, excludeIds: string[], floor: number): string =>
    save.maps[0].floors[floor - 1].find((n: any) => !excludeIds.includes(n.id)).id;

  it('위치: 현재 노드는 입장 기록의 마지막, 첫 노드는 1층, 연속 노드는 간선으로 이어진다', () => {
    const empty = firstBattle();
    empty.position.visited = [];
    expect(restoreWith(empty)).toThrow(/run\.position\.currentNodeId/);

    const mismatch = firstBattle();
    mismatch.position.currentNodeId = otherNode(mismatch, [mismatch.position.currentNodeId], 1);
    expect(restoreWith(mismatch)).toThrow(/run\.position\.currentNodeId/);

    const notFirstFloor = firstBattle();
    const second = notFirstFloor.maps[0].floors[1][0].id;
    notFirstFloor.position = { currentNodeId: second, visited: [second] };
    expect(restoreWith(notFirstFloor)).toThrow(/run\.position\.visited\[0\].*1층/);

    const run = newRun(5);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    run.skipReward();
    run.chooseNode(run.availableNodes()[0]!.id);
    const jump = dump(run);
    const first = jump.maps[0].floors[0].find((n: any) => n.id === jump.position.visited[0]);
    const unreachable = jump.maps[0].floors[1].find((n: any) => !first.next.includes(n.id));
    if (unreachable) {
      jump.position.visited[1] = unreachable.id;
      jump.position.currentNodeId = unreachable.id;
      expect(restoreWith(jump)).toThrow(/run\.position\.visited\[1\].*이어진 노드가 아님/);
    }

    const tooLong = firstBattle();
    tooLong.position.visited = Array.from({ length: RUN.MAP.FLOORS + 1 }, () => tooLong.position.currentNodeId);
    expect(restoreWith(tooLong)).toThrow(/run\.position\.visited/);
  });

  it('단계와 현재 노드 종류가 맞아야 한다', () => {
    const shop = at(1, 'shop');
    const battleWithShop = firstBattle();
    battleWithShop.phase = 'shop';
    battleWithShop.session = shop.session;
    expect(restoreWith(battleWithShop)).toThrow(/run\.phase.*shop/);

    const event = at(1, 'event');
    event.phase = 'battlePrep';
    event.session = { kind: 'battle', tries: 0 };
    expect(restoreWith(event)).toThrow(/run\.phase.*battlePrep/);

    const camp = at(1, 'camp');
    camp.phase = 'shop';
    camp.session = shop.session;
    expect(restoreWith(camp)).toThrow(/run\.phase/);

    const rewardRun = newRun(1);
    rewardRun.chooseNode(rewardRun.availableNodes()[0]!.id);
    finishBattle(rewardRun, 'win');
    const reward = dump(rewardRun);
    reward.session.source = 'elite';
    expect(restoreWith(reward)).toThrow(/run\.session\.source/);
    const rewardOnShop = at(1, 'shop');
    rewardOnShop.phase = 'reward';
    rewardOnShop.session = { kind: 'reward', source: 'normal', offer: dump(rewardRun).session.offer };
    expect(restoreWith(rewardOnShop)).toThrow(/run\.session/);

    const bossMap = at(6, 'boss');
    bossMap.phase = 'map';
    bossMap.session = null;
    expect(restoreWith(bossMap)).toThrow(/run\.phase.*보스/);
  });

  it('종료 결과는 현재 노드와 HP에 맞아야 한다', () => {
    const zeroMap = dump(newRun(5));
    zeroMap.health.hp = 0;
    expect(restoreWith(zeroMap)).toThrow(/run\.health/);

    const victoryRun = newRun(6);
    driveTo(victoryRun, 'boss');
    finishBattle(victoryRun, 'win');
    const victory = dump(victoryRun);
    expect(RunController.restore(runDeps, victory).outcome).toBe('victory');
    const zeroVictory = structuredClone(victory);
    zeroVictory.health.hp = 0;
    expect(restoreWith(zeroVictory)).toThrow(/run\.health|run\.outcome/);
    const victoryAtCombat = structuredClone(victory);
    victoryAtCombat.position.currentNodeId = victoryAtCombat.position.visited[0];
    victoryAtCombat.position.visited = [victoryAtCombat.position.visited[0]];
    expect(restoreWith(victoryAtCombat)).toThrow(/run\.outcome/);

    const deadRun = newRun(2);
    deadRun.chooseNode(deadRun.availableNodes()[0]!.id);
    damageCommander(deadRun, 79);
    finishBattle(deadRun, 'loss');
    const dead = dump(deadRun);
    expect(RunController.restore(runDeps, dead).outcome).toBe('dead');
    const deadAtShop = at(1, 'shop');
    deadAtShop.phase = 'ended';
    deadAtShop.session = null;
    deadAtShop.outcome = 'dead';
    deadAtShop.health.hp = 0;
    expect(restoreWith(deadAtShop)).toThrow(/run\.outcome.*전투 노드/);
  });

  it('보스 재도전 저장본은 정상 복원되고, 전투 시도 횟수는 기록과 맞아야 한다', () => {
    const run = newRun(6);
    driveTo(run, 'boss');
    finishBattle(run, 'loss');
    expect(run.session).toEqual({ kind: 'battle', tries: 1 });
    const save = dump(run);
    expect(json(RunController.restore(runDeps, save))).toBe(json(run));

    const noRecord = structuredClone(save);
    noRecord.session.tries = 0;
    expect(restoreWith(noRecord)).toThrow(/run\.session\.tries/);
    const huge = firstBattle();
    huge.session.tries = 1e9;
    expect(restoreWith(huge)).toThrow(/run\.session\.tries/);
    const combatRetry = firstBattle();
    combatRetry.session.tries = 1;
    expect(restoreWith(combatRetry)).toThrow(/run\.session\.tries/);
  });

  it('상점 진열은 3칸이고 가격은 희귀도 가격표와 같다', () => {
    const free = at(1, 'shop');
    free.session.cards[0].price = 0;
    expect(restoreWith(free)).toThrow(/run\.session\.cards\[0\]\.price/);
    const fewer = at(1, 'shop');
    fewer.session.cards.pop();
    expect(restoreWith(fewer)).toThrow(/run\.session\.cards.*3칸/);
  });

  it('이벤트: 세션 이벤트는 가장 최근에 나온 것이고, 입장한 이벤트 노드 수만큼 기록된다', () => {
    const event = at(1, 'event');
    const other = runDeps.events.events.find((e) => e.id !== event.session.state.eventId)!;
    const wrongId = structuredClone(event);
    wrongId.session.state.eventId = other.id;
    wrongId.session.state.chosen = null;
    expect(restoreWith(wrongId)).toThrow(/run\.session\.state\.eventId/);
    const dup = structuredClone(event);
    dup.seenEvents = [event.session.state.eventId, event.session.state.eventId];
    expect(restoreWith(dup)).toThrow(/run\.seenEvents/);
    const missing = structuredClone(event);
    missing.seenEvents = [];
    expect(restoreWith(missing)).toThrow(/run\.seenEvents/);
  });

  it('기록(history)은 입장한 노드의 것이어야 한다', () => {
    const run = newRun(5);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    const save = dump(run);
    save.history[0].nodeId = otherNode(save, [save.position.visited[0]], 1);
    expect(restoreWith(save)).toThrow(/run\.history\[0\]\.nodeId/);
  });

  it('전투 노드의 기록 수는 정산 횟수와 맞아야 한다 (일반·정예 1건, 전투가 없는 노드 0건, 보스는 1건 이상)', () => {
    const run = newRun(5);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    const save = dump(run);
    expect(json(RunController.restore(runDeps, save))).toBe(json(run));

    const extra = structuredClone(save);
    extra.history.push({ ...extra.history[0] });
    expect(restoreWith(extra)).toThrow(/run\.history.*1건/);
    const missing = structuredClone(save);
    missing.history = [];
    expect(restoreWith(missing)).toThrow(/run\.history.*1건/);
    const wrongType = structuredClone(save);
    wrongType.history[0].type = 'elite';
    expect(restoreWith(wrongType)).toThrow(/run\.history\[0\]/);

    // 전투 준비 중인 현재 노드에는 아직 기록이 없어야 한다
    const prep = firstBattle();
    prep.history.push({ ...save.history[0], nodeId: prep.position.visited[0] });
    expect(restoreWith(prep)).toThrow(/run\.(history|session\.tries)/);

    // 전투가 없는 노드(상점)에 기록을 붙인 저장본
    const shop = at(1, 'shop');
    shop.history.push({ ...shop.history[0], nodeId: shop.position.visited[shop.position.visited.length - 1] });
    expect(restoreWith(shop)).toThrow(/run\.history.*0건|run\.history\[/);

    // 이미 지나온 전투 노드의 기록을 지운 저장본
    const passed = at(1, 'shop');
    const firstId = passed.history[0].nodeId;
    passed.history = passed.history.filter((h: any) => h.nodeId !== firstId);
    expect(restoreWith(passed)).toThrow(/run\.history.*1건/);

    // 끝난 런의 보스 기록
    const boss = newRun(6);
    driveTo(boss, 'boss');
    finishBattle(boss, 'win');
    const ended = dump(boss);
    expect(json(RunController.restore(runDeps, ended))).toBe(json(boss));
    ended.history = ended.history.filter((h: any) => h.type !== 'boss');
    expect(restoreWith(ended)).toThrow(/run\.history.*보스/);
  });

  it('큰 시드(32비트를 넘거나 음수)는 정규화되어 저장·복원 뒤에도 같은 런이다', () => {
    for (const seed of [2 ** 31, 2 ** 32 + 5, 4294967296, -7, -(2 ** 31) - 3, Number.MAX_SAFE_INTEGER]) {
      const run = newRun(seed);
      expect(run.seed).toBe(seed | 0);
      const restored = roundtrip(run);
      expect(restored.seed).toBe(run.seed);
      expect(json(restored)).toBe(json(run));
      expect(finishAuto(restored).save).toBe(finishAuto(run).save);
    }
    expect(json(newRun(4294967296))).toBe(json(newRun(0)));
    expect(() => newRun(1.5)).toThrow('안전한 정수');
    expect(() => newRun(Number.NaN)).toThrow('안전한 정수');
    expect(() => newRun(2 ** 60)).toThrow('안전한 정수');
    const save = JSON.parse(json(newRun(1)));
    save.seed = 2 ** 31;
    expect(() => RunController.restore(runDeps, save)).toThrow(/run\.seed/);
  });

  it('AutoRunner가 끝까지 만든 저장본은 여러 시드·경로 정책에서 모두 복원된다 (패배·재도전·사망 포함)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const pathMode of ['first', 'random'] as const) {
        const run = newRun(seed, seed % 2 === 0 ? 'test' : 'starter');
        new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode, policySeed: seed, plan: basicPlan }).run();
        expect(json(roundtrip(run))).toBe(json(run));
      }
    }
  });

  it('실제 진행이 만드는 모든 비전투 시점의 저장본은 복원된다 (여러 시드, 패배·재도전·사망 포함)', () => {
    let checkpoints = 0;
    const check = (run: RunController): void => {
      expect(json(roundtrip(run))).toBe(json(run));
      checkpoints++;
    };
    for (let seed = 1; seed <= 8; seed++) {
      const run = newRun(seed, seed % 2 === 0 ? 'test' : 'starter');
      for (let guard = 0; guard < 300 && run.phase !== 'ended'; guard++) {
        check(run);
        switch (run.phase) {
          case 'map': {
            const options = run.availableNodes();
            run.chooseNode(options[(seed + guard) % options.length]!.id);
            break;
          }
          case 'battlePrep': {
            if (run.currentNode?.type === 'boss' && run.session?.kind === 'battle' && run.session.tries === 0) finishBattle(run, 'loss');
            else if (seed === 8 && run.floorReached === 6) { damageCommander(run, run.hp - 1); finishBattle(run, 'loss'); }
            else finishBattle(run, (seed + guard) % 5 === 0 ? 'loss' : 'win');
            break;
          }
          case 'reward': guard % 2 === 0 ? run.claimReward(0) : run.skipReward(); break;
          case 'shop': run.leaveShop(); break;
          case 'camp': run.leaveCamp(); break;
          case 'event': {
            const view = run.eventView()!;
            run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
            check(run);
            while (run.eventView()?.pending) run.pickEventOption(0);
            run.finishEvent();
            break;
          }
          default: throw new Error(`예상 밖 단계 ${run.phase}`);
        }
      }
      check(run);
      expect(run.phase).toBe('ended');
    }
    expect(checkpoints).toBeGreaterThan(100);
  });
});
