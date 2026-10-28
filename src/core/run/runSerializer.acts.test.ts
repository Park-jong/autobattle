import { describe, expect, it } from 'vitest';
import { RUN } from './constants';
import { RunController } from './runController';
import { driveTo, finishBattle, newRun, runDeps } from './testSupport';

/* eslint-disable @typescript-eslint/no-explicit-any */
const dump = (run: RunController): any => JSON.parse(JSON.stringify(run.serialize()));
const json = (run: RunController): string => JSON.stringify(run.serialize());
const restoreWith = (data: unknown) => () => RunController.restore(runDeps, data);

/** v3 저장본을 v1·v2 시절 형식으로 되돌린다 (단일 map, 액트 필드 없음) */
function toLegacy(save: any, version: 1 | 2): any {
  const legacy = structuredClone(save);
  legacy.version = version;
  legacy.map = legacy.maps[0];
  delete legacy.maps;
  delete legacy.totalActs;
  if (version === 1) {
    delete legacy.relics;
    if (legacy.session?.kind === 'reward') delete legacy.session.relic;
    if (legacy.session?.kind === 'shop') delete legacy.session.relics;
  }
  return legacy;
}

describe('저장 v3 마이그레이션: v1·v2는 3액트 런의 액트 1로 읽는다', () => {
  it('v2 저장본(진행 중)은 액트 1·전체 3액트로 복원되고 다시 저장하면 v3가 된다', () => {
    const phases: string[] = [];
    const run = newRun(21);
    for (let guard = 0; guard < 60 && run.phase !== 'ended'; guard++) {
      const legacy = toLegacy(dump(run), 2);
      const restored = RunController.restore(runDeps, legacy);
      expect([restored.act, restored.totalActs]).toEqual([1, 3]);
      expect(restored.phase).toBe(run.phase);
      const save = restored.serialize();
      expect(save.version).toBe(RUN.FORMAT_VERSION);
      expect(save.maps).toHaveLength(1);
      expect(save.totalActs).toBe(3);
      expect(JSON.stringify(save.maps[0])).toBe(JSON.stringify(run.map.toJSON()));
      phases.push(run.phase);
      switch (run.phase) {
        case 'map': run.chooseNode(run.availableNodes()[0]!.id); break;
        case 'battlePrep': finishBattle(run, 'win'); break;
        case 'reward': run.claimReward(0); break;
        case 'shop': run.leaveShop(); break;
        case 'camp': run.leaveCamp(); break;
        case 'event': {
          const view = run.eventView()!;
          run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
          while (run.eventView()?.pending) run.pickEventOption(0);
          run.finishEvent();
          break;
        }
        default: throw new Error(`예상 밖 단계 ${run.phase}`);
      }
    }
    expect(new Set(phases)).toEqual(new Set(['map', 'battlePrep', 'reward', 'shop', 'camp', 'event']));
  });

  it('v2 저장본에서 이어간 런은 액트 1 보스 처치 뒤 액트 2로 넘어간다', () => {
    const run = newRun(22);
    driveTo(run, 'boss');
    const restored = RunController.restore(runDeps, toLegacy(dump(run), 2));
    expect(restored.totalActs).toBe(3);
    const result = finishBattle(restored, 'win');
    expect(result.ok && result.settlement.actCleared).toBe(1);
    expect(restored.phase).toBe('bossRelic');
  });

  it('v2에서 이미 승리로 끝난 저장본은 1액트 런으로 남아 승리가 유효하다', () => {
    const run = newRun(23);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.outcome).toBe('victory');
    const restored = RunController.restore(runDeps, toLegacy(dump(run), 2));
    expect(restored.totalActs).toBe(1);
    expect(restored.outcome).toBe('victory');
    expect(json(RunController.restore(runDeps, dump(restored)))).toBe(json(restored));
  });

  it('v1·v2에 v3 필드가 섞여 있거나 v3에 옛 필드가 있으면 거부한다', () => {
    const save = dump(newRun(24));
    const mixed = toLegacy(save, 2);
    mixed.totalActs = 3;
    expect(restoreWith(mixed)).toThrow(/run\.totalActs: 알 수 없는 필드/);
    const mixed2 = toLegacy(save, 2);
    mixed2.maps = [mixed2.map];
    expect(restoreWith(mixed2)).toThrow(/run\.maps: 알 수 없는 필드/);
    const old = structuredClone(save);
    old.map = old.maps[0];
    expect(restoreWith(old)).toThrow(/run\.map: 알 수 없는 필드/);
  });
});

describe('저장 v3 일관성 검증: 액트 구조', () => {
  const atBossRelic = (): any => {
    const run = newRun(31, 'starter', 3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    return dump(run);
  };
  const atActIntro = (): any => {
    const run = newRun(31, 'starter', 3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    run.claimBossRelic(0);
    return dump(run);
  };

  it('정상 저장본은 복원된다 (보스 유물 선택 중, 액트 소개 중)', () => {
    expect(RunController.restore(runDeps, atBossRelic()).phase).toBe('bossRelic');
    expect(RunController.restore(runDeps, atActIntro()).phase).toBe('actIntro');
  });

  it('맵 수·전체 액트 수가 맞지 않으면 거부한다', () => {
    const save = atActIntro();
    save.totalActs = 1;
    expect(restoreWith(save)).toThrow(/run\.maps: 맵 수\(2\)가 전체 액트 수\(1\)를 넘음/);
    const big = atActIntro();
    big.totalActs = 4;
    expect(restoreWith(big)).toThrow(/run\.totalActs: 3 이하여야 함/);
    const empty = atActIntro();
    empty.maps = [];
    expect(restoreWith(empty)).toThrow(/run\.maps: 맵은 1~3개여야 함/);
  });

  it('액트 맵의 노드 id는 액트 접두사와 맞아야 한다', () => {
    const save = atActIntro();
    save.maps[1] = structuredClone(save.maps[0]);
    expect(restoreWith(save)).toThrow(/run\.maps\[1\].*id\/floor\/index가 위치와 맞지 않음/);
  });

  it('다음 액트 맵이 있는데 지난 액트 보스를 쓰러뜨리지 않은 저장본은 거부한다', () => {
    const run = newRun(32, 'starter', 3);
    run.chooseNode(run.availableNodes()[0]!.id);
    const save = dump(run);
    save.maps.push(atActIntro().maps[1]);
    expect(restoreWith(save)).toThrow(/지난 액트 1의 보스.*쓰러뜨리지 않았는데/);
  });

  it('입장 기록이 액트를 보스 없이 건너뛰면 거부한다', () => {
    const jump = atActIntro();
    jump.position.visited.push('a2-1-0');
    jump.position.currentNodeId = 'a2-1-0';
    expect(restoreWith(jump)).toThrow(/run\.(phase|position)/);
  });

  it('보스 유물 선택 중 후보는 보유하지 않은 보스 유물이어야 하고 1~3개여야 한다', () => {
    const notBoss = atBossRelic();
    notBoss.session.offer = ['old_baton'];
    expect(restoreWith(notBoss)).toThrow(/run\.session\.offer\[0\]: 보스 유물이 아님/);
    const dup = atBossRelic();
    dup.session.offer = ['rift_heart', 'rift_heart'];
    expect(restoreWith(dup)).toThrow(/같은 유물이 두 번 제시됨/);
    const none = atBossRelic();
    none.session.offer = [];
    expect(restoreWith(none)).toThrow(/보스 유물 후보는 1~3개/);
    const owned = atBossRelic();
    owned.relics.owned = ['rift_heart'];
    expect(restoreWith(owned)).toThrow(/이미 가진 유물이 후보에 있음/);
    const early = atBossRelic();
    early.maps.push(atActIntro().maps[1]); // 보스 유물을 고르기 전에는 다음 액트의 맵이 없다
    expect(restoreWith(early)).toThrow(/bossRelic 단계의 현재 노드는 지금 액트\(2\)의 노드여야 함/);
  });

  it('마지막 액트의 보스 다음에는 보스 유물 선택 단계가 없다', () => {
    const save = atBossRelic();
    save.totalActs = 1;
    expect(restoreWith(save)).toThrow(/마지막 액트의 보스 다음에는 보스 유물 선택이 없음/);
  });

  it('액트 소개의 회복량·HP는 서로 맞아야 한다', () => {
    const hp = atActIntro();
    hp.health.hp -= 1;
    expect(restoreWith(hp)).toThrow(/회복 전 HP.*현재 HP.*같아야 함/);
    const heal = atActIntro();
    heal.session.healed = 999;
    expect(restoreWith(heal)).toThrow(/run\.session\.healed: 액트 전환 회복량은/);
  });

  it('승리는 마지막 액트의 보스에서만 가능하다', () => {
    const run = newRun(33, 'starter', 3);
    toWin(run);
    const save = dump(run);
    expect(RunController.restore(runDeps, save).outcome).toBe('victory');
    const wrong = structuredClone(save);
    wrong.totalActs = 2; // 3번째 맵이 있는데 2액트 런
    expect(restoreWith(wrong)).toThrow(/run\.maps: 맵 수\(3\)가 전체 액트 수\(2\)를 넘음/);
    // 액트 1에서 보스를 쓰러뜨린 1액트 런의 승리 저장본에 totalActs만 3으로 바꾸면 모순이다
    const oneAct = newRun(34);
    driveTo(oneAct, 'boss');
    finishBattle(oneAct, 'win');
    const fake = dump(oneAct);
    fake.totalActs = 3;
    expect(restoreWith(fake)).toThrow(/승리는 마지막 액트\(3\)의 보스 노드에서만 가능함/);
  });

  it('쓰러뜨린 보스의 마지막 전투 기록이 승리가 아니면 거부한다', () => {
    const save = atActIntro();
    const last = save.history.at(-1);
    last.outcome = 'loss';
    expect(restoreWith(save)).toThrow(/마지막 전투 기록이 승리여야 함/);
  });
});

function toWin(run: RunController): void {
  for (let act = 1; act <= 3; act++) {
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    if (run.phase === 'bossRelic') run.claimBossRelic(0);
    if (run.phase === 'actIntro') run.continueAct();
  }
}
