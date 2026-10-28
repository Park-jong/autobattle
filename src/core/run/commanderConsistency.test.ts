import { describe, expect, it } from 'vitest';
import { AutoRunner } from './autoRunner';
import { RunController } from './runController';
import { basicPlan, driveTo, finishBattle, newRunAs, runDeps } from './testSupport';

const COMMANDERS = ['cmd_harten', 'cmd_isera', 'cmd_nox'] as const;
const dump = (run: RunController) => JSON.parse(JSON.stringify(run.serialize())) as any;
const restoreWith = (data: unknown) => () => RunController.restore(runDeps, data);

describe('저장본의 지휘관 교차 검증', () => {
  it('지휘관을 바꾸고 최대 HP까지 맞춘 조작 저장본은 지휘관 고유 카드로 거부된다', () => {
    const save = dump(newRunAs('cmd_nox', 1));
    save.commanderId = 'cmd_isera';
    save.health = { hp: 70, maxHp: 70 };
    expect(restoreWith(save)).toThrow(/carryDeck\.\w+\[\d+\]\.cardId.*blood_price.*cmd_isera/);

    const harten = dump(newRunAs('cmd_harten', 1));
    harten.commanderId = 'cmd_nox';
    harten.health = { hp: 65, maxHp: 65 };
    expect(restoreWith(harten)).toThrow(/shield_formation.*cmd_nox/);
  });

  it('지휘관만 바꾸면 최대 HP 불일치로 거부된다', () => {
    const save = dump(newRunAs('cmd_nox', 1));
    save.commanderId = 'cmd_harten';
    expect(restoreWith(save)).toThrow(/health\.maxHp/);
  });

  it('보상·상점에 다른 지휘관 고유 카드가 제시된 저장본은 거부된다', () => {
    const reward = newRunAs('cmd_nox', 2);
    driveTo(reward, 'combat');
    finishBattle(reward, 'win');
    const save = dump(reward);
    expect(save.session.kind).toBe('reward');
    save.session.offer[0] = 'shield_formation';
    expect(restoreWith(save)).toThrow(/session\.offer\[0\].*shield_formation/);
  });

  it('덱에서 고유 카드를 제거한 정상 진행 상태(카드 제거 등)는 거부하지 않는다', () => {
    const save = dump(newRunAs('cmd_nox', 1));
    save.removals = 1;
    for (const pile of ['draw', 'hand', 'discard', 'exhaust']) {
      save.forces.carryDeck[pile] = save.forces.carryDeck[pile].filter((c: any) => c.cardId !== 'blood_price');
    }
    expect(restoreWith(save)).not.toThrow();
  });

  it('덱 프리셋을 test로 바꿔도 다른 지휘관의 고유 카드는 거부된다', () => {
    const save = dump(newRunAs('cmd_nox', 1));
    save.commanderId = 'cmd_isera';
    save.health = { hp: 70, maxHp: 70 };
    save.deckPreset = 'test';
    expect(restoreWith(save)).toThrow(/carryDeck\.\w+\[\d+\]\.cardId.*blood_price.*cmd_isera/);
  });

  it('고유 카드가 없는 이세라로 바꾼 조작은 카드를 제거한 적 없는 시작 덱 장수로 거부된다', () => {
    for (const from of ['cmd_harten', 'cmd_nox'] as const) {
      const save = dump(newRunAs(from, 1));
      save.commanderId = 'cmd_isera';
      save.health = { hp: 70, maxHp: 70 };
      expect(restoreWith(save)).toThrow(/forces\.carryDeck/);
    }
    const isera = dump(newRunAs('cmd_isera', 1));
    isera.commanderId = 'cmd_harten';
    isera.health = { hp: 80, maxHp: 80 };
    expect(restoreWith(isera)).toThrow(/forces\.carryDeck|shield_formation/);
  });

  it('카드를 제거한 기록(상점 제거)이 있으면 시작 덱 장수 검사는 건너뛴다', () => {
    const save = dump(newRunAs('cmd_isera', 1));
    save.removals = 1;
    save.forces.carryDeck.draw.pop();
    expect(restoreWith(save)).not.toThrow();
  });

  it('테스트 덱은 지휘관과 무관한 공용 구성이라 어느 지휘관과도 복원된다', () => {
    for (const commanderId of COMMANDERS) {
      const run = RunController.create(runDeps, { seed: 3, commanderId, deckPreset: 'test' });
      expect(restoreWith(dump(run))).not.toThrow();
    }
  });

  it('지휘관 3명 x 여러 시드: 실제 진행의 모든 비전투 시점 저장본이 복원된다', () => {
    let checkpoints = 0;
    for (const commanderId of COMMANDERS) {
      for (let seed = 1; seed <= 4; seed++) {
        const run = newRunAs(commanderId, seed);
        for (let guard = 0; guard < 300 && run.phase !== 'ended'; guard++) {
          expect(JSON.stringify(RunController.restore(runDeps, dump(run)).serialize())).toBe(JSON.stringify(run.serialize()));
          checkpoints++;
          switch (run.phase) {
            case 'map': run.chooseNode(run.availableNodes()[(seed + guard) % run.availableNodes().length]!.id); break;
            case 'battlePrep': finishBattle(run, (seed + guard) % 4 === 0 ? 'loss' : 'win'); break;
            case 'reward':
              if (run.session?.kind === 'reward' && run.session.relic !== null) run.claimRelic();
              guard % 2 === 0 ? run.claimReward(0) : run.skipReward();
              break;
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
        expect(run.phase).toBe('ended');
      }
    }
    expect(checkpoints).toBeGreaterThan(150);
  });

  it('AutoRunner(유물·궁극기 켬)가 끝낸 지휘관별 저장본도 복원된다', () => {
    for (const commanderId of COMMANDERS) {
      for (let seed = 1; seed <= 3; seed++) {
        const run = newRunAs(commanderId, seed);
        new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'random', policySeed: seed, plan: basicPlan, relics: true, ultimate: true }).run();
        expect(restoreWith(dump(run))).not.toThrow();
      }
    }
  });

  it('정상 저장본 스윕: 지휘관 3명 x 덱 starter/test x 경로 first/random x 시드, 모든 비전투 시점 저장본이 복원된다', () => {
    let checkpoints = 0;
    for (const commanderId of COMMANDERS) {
      for (const deckPreset of ['starter', 'test'] as const) {
        for (const pathMode of ['first', 'random'] as const) {
          for (let seed = 1; seed <= 3; seed++) {
            const run = RunController.create(runDeps, { seed, commanderId, deckPreset });
            const check = () => {
              const data = dump(run);
              expect(restoreWith(data)).not.toThrow();
              checkpoints++;
            };
            check();
            new AutoRunner(run, runDeps.cards, runDeps.units, {
              pathMode, policySeed: seed, plan: basicPlan, relics: true, ultimate: true, onStep: check,
            }).run();
            check();
          }
        }
      }
    }
    expect(checkpoints).toBeGreaterThan(100);
  });
});
