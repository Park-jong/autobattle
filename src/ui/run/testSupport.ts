/** 런 UI 테스트 공용 도우미 (실제 data/*.json 사용). 프로덕션 코드에서는 쓰지 않는다. */
import { loadGameData } from '../gameData';
import { BattleSession } from '../debug/BattleSession';
import { RunSaveStore } from './RunSaveStore';
import { RunSession, type LegacyModes } from './RunSession';
import { MemoryRunStorage, type RunStorage } from './RunStorage';

export const gameData = loadGameData();

export interface Harness {
  session: RunSession;
  battle: BattleSession;
  storage: RunStorage;
  store: RunSaveStore;
  legacyCalls: string[];
}

export function createHarness(storage: RunStorage = new MemoryRunStorage(), seed = 42): Harness {
  const battle = new BattleSession(gameData.units, gameData.traits, gameData.defaultFormations, {
    cards: gameData.cards,
    commanders: gameData.commanders,
    defaultCommanderId: gameData.defaultCommanderId,
    startFormations: gameData.startFormations,
    seriesStages: gameData.seriesStages,
  });
  const store = new RunSaveStore(storage, gameData.run);
  const legacyCalls: string[] = [];
  const legacy: LegacyModes = {
    openManagement: () => legacyCalls.push('management'),
    openDebug: () => legacyCalls.push('debug'),
    close: () => legacyCalls.push('close'),
  };
  const session = new RunSession({ deps: gameData.run, store, battle, legacy, suggestSeed: () => seed, commanderId: 'cmd_harten' });
  return { session, battle, storage, store, legacyCalls };
}

/** 전투를 시작해 재생이 끝날 때까지 진행한다 */
export function playBattle(h: Harness): void {
  h.session.startBattle();
  for (let i = 0; i < 400 && h.battle.phase !== 'finished'; i++) h.battle.advance(1);
  if (h.battle.phase !== 'finished') throw new Error('전투가 끝나지 않음');
}
