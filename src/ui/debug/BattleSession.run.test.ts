import { describe, expect, it } from 'vitest';
import { RunController } from '../../core/run';
import { driveTo, newRun, runDeps } from '../../core/run/testSupport';
import { loadGameData } from '../gameData';
import { RunBattleAdapter } from '../run/RunBattleAdapter';
import { BattleSession } from './BattleSession';

const data = loadGameData();

function setup(): { battle: BattleSession; run: RunController; link: RunBattleAdapter } {
  const battle = new BattleSession(data.units, data.traits, data.defaultFormations, {
    cards: data.cards, commanders: data.commanders, defaultCommanderId: data.defaultCommanderId,
    startFormations: data.startFormations, seriesStages: data.seriesStages,
  });
  const run = newRun(3);
  run.chooseNode(run.availableNodes()[0]!.id);
  return { battle, run, link: new RunBattleAdapter(run) };
}

function playOut(battle: BattleSession): void {
  for (let i = 0; i < 400 && battle.phase !== 'finished'; i++) battle.advance(1);
  expect(battle.phase).toBe('finished');
}

describe('BattleSession 런 전투 연결', () => {
  it('연결하면 로스터·준비 손패·적 편성이 런 상태에서 만들어진다', () => {
    const { battle, run, link } = setup();
    battle.attachRun(link);
    const snap = battle.snapshot();
    expect(snap.editable).toBe(false); // 디버그 편성 편집은 잠김
    expect(snap.management?.canManage).toBe(true);
    expect(snap.formations[0]).toEqual(run.roster.formation());
    expect(snap.formations[1]).toEqual(run.battlePlan().formation);
    expect(battle.prepping).toBe(true);
    expect(battle.cardView().visible).toBe(true);
    expect(battle.cardView().hand).toHaveLength(5);
  });

  it('보드의 아군 칸을 클릭하면 그 유닛이 선택되고 다시 클릭하면 해제된다', () => {
    const { battle, link } = setup();
    battle.attachRun(link);
    const unit = battle.snapshot().management!.state.board.find((u) => u.cell)!;
    battle.clickCell(unit.cell!, false);
    expect(battle.snapshot().management?.selectedUnitId).toBe(unit.id);
    battle.clickCell(unit.cell!, false);
    expect(battle.snapshot().management?.selectedUnitId).toBeNull();
  });

  it('로스터를 바꾸면 준비 시뮬을 다시 만들어 마지막으로 발급한 시뮬만 정산할 수 있다', () => {
    const { battle, run, link } = setup();
    battle.attachRun(link);
    const boardBefore = battle.snapshot().management!.state.board.length;
    const unit = battle.snapshot().management!.state.board[0]!;
    battle.moveManagedToBench(unit.id);
    expect(battle.snapshot().management!.state.board.length).toBe(boardBefore - 1);
    expect(battle.snapshot().formations[0]).toHaveLength(boardBefore - 1);
    expect(run.roster.snapshot().board).toHaveLength(boardBefore - 1);
    battle.start(0);
    playOut(battle);
    const settlement = battle.runSettlement();
    expect(settlement).not.toBeNull();
    expect(run.phase).not.toBe('battlePrep');
    // 같은 전투는 한 번만 정산된다 (세션이 다시 정산을 시도해도 결과는 그대로)
    expect(battle.runSettlement()).toBe(settlement);
  });

  it('전투 시작 후에는 관리 명령이 거부되고, 준비로 돌아가면 정산 없이 다시 준비된다', () => {
    const { battle, run, link } = setup();
    battle.attachRun(link);
    const gold = run.gold;
    battle.start(0);
    expect(run.phase).toBe('battle');
    expect(battle.snapshot().management?.canManage).toBe(false);
    battle.advance(2);
    battle.reset();
    expect(run.phase).toBe('battlePrep');
    expect(battle.phase).toBe('edit');
    expect(run.gold).toBe(gold);
    expect(battle.snapshot().management?.canManage).toBe(true);
    expect(battle.runSettlement()).toBeNull();
    // 다시 시작해 끝까지 진행하면 정산된다
    battle.start(0);
    playOut(battle);
    expect(battle.runSettlement()).not.toBeNull();
  });

  it('보스 패배 후 재도전: 연결을 다시 걸면 새 준비 단계가 만들어지고 결과가 비워진다', () => {
    const run = newRun(5);
    driveTo(run, 'boss');
    const battle = new BattleSession(data.units, data.traits, data.defaultFormations, {
      cards: data.cards, commanders: data.commanders, defaultCommanderId: data.defaultCommanderId,
    });
    const link = new RunBattleAdapter(run);
    battle.attachRun(link);
    battle.start(0);
    playOut(battle);
    expect(battle.runSettlement()).not.toBeNull();
    if (run.phase === 'battlePrep') {
      battle.attachRun(link);
      expect(battle.phase).toBe('edit');
      expect(battle.runSettlement()).toBeNull();
    }
  });

  it('연결을 풀면 디버그 편성·지휘관이 원래대로 돌아오고 다시 편집할 수 있다', () => {
    const { battle, link } = setup();
    const before = battle.snapshot();
    battle.attachRun(link);
    battle.detachRun();
    const after = battle.snapshot();
    expect(after.editable).toBe(true);
    expect(after.management).toBeNull();
    expect(after.formations).toEqual(before.formations);
    expect(after.commanderId).toBe(before.commanderId);
  });

  it('전투 중에 연결을 풀면 런의 전투를 취소한다', () => {
    const { battle, run, link } = setup();
    battle.attachRun(link);
    battle.start(0);
    expect(run.phase).toBe('battle');
    battle.detachRun();
    expect(run.phase).toBe('battlePrep');
  });

  it('필요한 데이터가 같은 카탈로그를 공유한다 (gameData.run)', () => {
    expect(data.run.cards).toBe(data.cards);
    expect(runDeps.units.units.length).toBe(data.units.units.length);
  });
});
