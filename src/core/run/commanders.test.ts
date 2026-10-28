import { describe, expect, it } from 'vitest';
import { deckCards } from '../cards';
import { parseCardPlan, ULTIMATE_COMMAND_ID } from '../combat';
import { fillUltimateGauge } from '../combat/testSupport';
import hartenPlanJson from '../../../tools/plans/harten-basic.json';
import iseraPlanJson from '../../../tools/plans/isera-basic.json';
import noxPlanJson from '../../../tools/plans/nox-basic.json';
import { AutoRunner } from './autoRunner';
import { RunController } from './runController';
import { driveTo, finishBattle, forceResult, newRunAs, runDeps } from './testSupport';

const PLANS = {
  cmd_harten: parseCardPlan(hartenPlanJson, 'harten'),
  cmd_isera: parseCardPlan(iseraPlanJson, 'isera'),
  cmd_nox: parseCardPlan(noxPlanJson, 'nox'),
};
const COMMANDER_IDS = ['cmd_harten', 'cmd_isera', 'cmd_nox'] as const;

describe('지휘관 선택', () => {
  it('commanderId를 생략하면 하르텐', () => {
    const run = RunController.create(runDeps, { seed: 1 });
    expect(run.commander.id).toBe('cmd_harten');
  });

  it.each([
    ['cmd_harten', 80, ['iron_shieldbearer', 'iron_shieldbearer']],
    ['cmd_isera', 70, ['ember_kindler', 'grove_archer']],
    ['cmd_nox', 65, ['shade_dagger', 'shade_dagger']],
  ] as const)('%s: 시작 HP %i, 시작 유닛, 시작 덱 10장, 10G, 유물 없음', (id, hp, unitIds) => {
    const run = newRunAs(id, 3);
    expect(run.commander.id).toBe(id);
    expect([run.hp, run.maxHp]).toEqual([hp, hp]);
    expect(run.roster.snapshot().board.map((u) => u.unitId).sort()).toEqual([...unitIds].sort());
    expect(deckCards(run.deck)).toHaveLength(10);
    expect(run.gold).toBe(10);
    expect(run.relics).toEqual([]);
    expect(run.serialize().commanderId).toBe(id);
  });

  it('전투 입력에 시작 덱·패시브·궁극기가 반영된다 (이세라: 시작 CP +1, 궁극기 존재)', () => {
    for (const id of COMMANDER_IDS) {
      const run = newRunAs(id, 5);
      run.chooseNode(run.availableNodes()[0]!.id);
      const sim = run.createSimulator();
      expect(sim.deck?.hand).toHaveLength(5);
      expect(sim.ultimate?.name).toBe(run.commander.ultimate?.name);
      sim.startCombat();
      expect(sim.commandPoints?.combat).toBe(id === 'cmd_isera' ? 3 : 2);
    }
  });

  it('녹스 패시브: 전투 승리 시 남은 CP 1당 1G (정산 영수증과 별도로 합산)', () => {
    const run = newRunAs('cmd_nox', 2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const before = run.gold;
    const settle = finishBattle(run, 'win');
    expect(settle.ok).toBe(true);
    if (!settle.ok) return;
    expect(settle.settlement.passiveGold).toBe(2); // 전투 시작 CP 2가 그대로 남아 있다
    expect(run.gold).toBe(before + settle.settlement.reward.total + 2);
    expect(run.history.at(-1)?.goldAfter).toBe(run.gold); // 기록의 잔고에도 패시브 골드가 들어 있다
  });

  it('녹스 패시브는 패배에는 적용되지 않고, 다른 지휘관은 받지 않는다', () => {
    const loss = newRunAs('cmd_nox', 2);
    loss.chooseNode(loss.availableNodes()[0]!.id);
    const lost = finishBattle(loss, 'loss');
    expect(lost.ok && lost.settlement.passiveGold).toBe(0);
    const harten = newRunAs('cmd_harten', 2);
    harten.chooseNode(harten.availableNodes()[0]!.id);
    const won = finishBattle(harten, 'win');
    expect(won.ok && won.settlement.passiveGold).toBe(0);
  });

  it('궁극기의 지휘관 HP 소모는 카드 HP 비용과 같은 경로로 정산된다 (녹스: 현재 HP의 10% 올림)', () => {
    const run = newRunAs('cmd_nox', 4);
    run.chooseNode(run.availableNodes()[0]!.id);
    const sim = run.createSimulator();
    run.beginBattle();
    sim.startCombat();
    fillUltimateGauge(sim);
    expect(sim.useUltimate().ok).toBe(true);
    expect(sim.commandLog.at(-1)?.cardInstanceId).toBe(ULTIMATE_COMMAND_ID);
    forceResult(sim, 'win');
    const settle = run.completeBattle(sim);
    expect(settle.ok).toBe(true);
    if (!settle.ok) return;
    expect(settle.settlement.cardHpLost).toBe(7); // ceil(65 × 10%)
    expect(settle.settlement.hpAfter).toBe(65 - 7);
    expect(run.hp).toBe(58);
  });

  it('HP가 모자라면 녹스 궁극기는 거부되고 HP는 그대로다', () => {
    const run = newRunAs('cmd_nox', 4);
    run.chooseNode(run.availableNodes()[0]!.id);
    // 지휘관 HP를 1로 만든다 (정산 전이므로 시뮬 입력만 영향)
    (run as unknown as { state: { health: { damage(n: number): number } } }).state.health.damage(64);
    const sim = run.createSimulator();
    run.beginBattle();
    sim.startCombat();
    fillUltimateGauge(sim);
    const result = sim.useUltimate();
    expect(result.ok).toBe(false);
    expect(sim.commanderHpSpent).toBe(0);
  });
});

describe('지휘관별 자동 런 (유물·궁극기 정책 포함)', () => {
  const runAll = (id: keyof typeof PLANS, seeds: number[], options: { relics: boolean; ultimate: boolean }) =>
    seeds.map((seed) =>
      new AutoRunner(newRunAs(id, seed), runDeps.cards, runDeps.units, {
        pathMode: 'random', policySeed: seed, plan: PLANS[id], ...options,
      }).run(),
    );

  it.each(COMMANDER_IDS)('%s: 시드 여러 개가 끝까지 진행되고 궁극기를 쓰며 유물을 얻는다', (id) => {
    const summaries = runAll(id, [1, 2, 3, 4, 5, 6], { relics: true, ultimate: true });
    for (const summary of summaries) {
      expect(['victory', 'dead']).toContain(summary.outcome);
      expect(summary.battles).toBeGreaterThan(0);
    }
    expect(summaries.reduce((sum, s) => sum + s.ultimatesUsed, 0)).toBeGreaterThan(0);
    expect(summaries.reduce((sum, s) => sum + s.relics, 0)).toBeGreaterThan(0);
  });

  it('같은 시드·정책이면 결과가 같다 (결정론)', () => {
    const a = runAll('cmd_isera', [3], { relics: true, ultimate: true });
    const b = runAll('cmd_isera', [3], { relics: true, ultimate: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('유물·궁극기 정책을 끄면 유물 0개, 궁극기 0회', () => {
    const [summary] = runAll('cmd_harten', [2], { relics: false, ultimate: false });
    expect(summary).toMatchObject({ relics: 0, ultimatesUsed: 0 });
  });

  it('정예 노드까지 가면 유물 정책이 정예 보상 유물을 받는다', () => {
    const run = newRunAs('cmd_nox', 1);
    driveTo(run, 'elite');
    finishBattle(run, 'win');
    const runner = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: 1, plan: null, relics: true });
    runner.run();
    expect(run.relics.length).toBeGreaterThanOrEqual(1);
  });
});
