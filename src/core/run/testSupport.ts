/** 런 테스트 공용 도우미 (실제 data/*.json 사용). 프로덕션 코드에서는 쓰지 않는다. */
import cardsJson from '../../../data/cards.json';
import commandersJson from '../../../data/commanders.json';
import encountersJson from '../../../data/encounters.json';
import eventsJson from '../../../data/events.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { parseCardPlan, type CombatSimulator } from '../combat';
import hartenPlan from '../../../tools/plans/harten-basic.json';
import { RunController, type SettleResult } from './runController';
import type { MapNode, NodeType } from './runMap';
import { loadRunDeps } from './runData';

export const rawRunData = {
  traits: traitsJson, units: unitsJson, cards: cardsJson,
  commanders: commandersJson, encounters: encountersJson, events: eventsJson,
};

export const runDeps = loadRunDeps(rawRunData);
export const basicPlan = parseCardPlan(hartenPlan, 'harten-basic');

export function newRun(seed = 1, deckPreset: 'starter' | 'test' = 'starter'): RunController {
  return RunController.create(runDeps, { seed, commanderId: 'cmd_harten', deckPreset });
}

// ---- 진행 도우미 ----

/** 테스트 전용: 컨트롤러 내부 상태에 접근 (골드·HP를 직접 만들어 특정 상황을 재현) */
function internals(run: RunController): { state: { forces: { economy: { gain(n: number): void; spend(n: number): boolean; gold: number } }; health: { damage(n: number): number; heal(n: number): number } } } {
  return run as unknown as ReturnType<typeof internals>;
}
export const grantGold = (run: RunController, amount: number): void => internals(run).state.forces.economy.gain(amount);
export const spendAllGold = (run: RunController): void => { internals(run).state.forces.economy.spend(run.gold); };
export const damageCommander = (run: RunController, amount: number): void => { internals(run).state.health.damage(amount); };

/** 전투를 즉시 원하는 결과로 끝낸다 (win: 적 전멸 / loss: 아군 전멸 / draw: 동시 전멸) */
export function forceResult(sim: CombatSimulator, result: 'win' | 'loss' | 'draw'): void {
  sim.startCombat();
  for (const unit of sim.world.units) {
    const kill = (result === 'win' && unit.side === 1) || (result === 'loss' && unit.side === 0) || result === 'draw';
    if (kill && unit.alive) sim.world.dealDamage({ source: null, target: unit, raw: 1e9, type: 'magic' });
  }
  sim.step();
}

/** 전투 준비 단계의 전투를 시작해 원하는 결과로 끝내고 정산한다 */
export function finishBattle(run: RunController, result: 'win' | 'loss' | 'draw'): SettleResult {
  const sim = run.createSimulator();
  run.beginBattle();
  forceResult(sim, result);
  return run.completeBattle(sim);
}

function distanceToType(run: RunController, from: MapNode, type: NodeType): number {
  let frontier = [from];
  for (let d = 0; frontier.length > 0; d++) {
    if (frontier.some((n) => n.type === type)) return d;
    frontier = [...new Map(frontier.flatMap((n) => run.map.nextNodes(n.id)).map((n) => [n.id, n])).values()];
  }
  return Infinity;
}

/**
 * 해당 종류 노드로 갈 때까지 경로를 고르며 진행하고, 그 노드에 입장한 상태로 돌려준다.
 * 도중 전투는 모두 승리로, 보상은 건너뛰고, 상점·야영지는 나가며, 이벤트는 첫 선택지로 처리한다.
 */
export function driveTo(run: RunController, type: NodeType): MapNode {
  for (let guard = 0; guard < 200; guard++) {
    switch (run.phase) {
      case 'map': {
        const options = run.availableNodes();
        const best = [...options].sort((a, b) => distanceToType(run, a, type) - distanceToType(run, b, type))[0];
        if (!best || distanceToType(run, best, type) === Infinity) throw new Error(`${type} 노드에 갈 수 없음`);
        run.chooseNode(best.id);
        if (best.type === type) return best;
        break;
      }
      case 'battlePrep': finishBattle(run, 'win'); break;
      case 'reward': run.skipReward(); break;
      case 'shop': run.leaveShop(); break;
      case 'event': {
        const view = run.eventView()!;
        run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
        while (run.eventView()?.pending) run.pickEventOption(0);
        run.finishEvent();
        break;
      }
      case 'camp': run.leaveCamp(); break;
      default: throw new Error(`진행할 수 없는 단계: ${run.phase}`);
    }
  }
  throw new Error('driveTo가 끝나지 않음');
}
