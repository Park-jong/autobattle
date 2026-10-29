/** 런 UI 테스트 공용 도우미 (실제 data/*.json 사용). 프로덕션 코드에서는 쓰지 않는다. */
import { loadGameData } from '../gameData';
import { BattleSession } from '../debug/BattleSession';
import { MetaStore } from './MetaStore';
import { RunSaveStore } from './RunSaveStore';
import { RunSession, type LegacyModes } from './RunSession';
import { MemoryRunStorage, type RunStorage } from './RunStorage';

export const gameData = loadGameData();

export interface Harness {
  session: RunSession;
  battle: BattleSession;
  storage: RunStorage;
  store: RunSaveStore;
  meta: MetaStore;
  metaStorage: RunStorage;
  /** 발급된 런 ID 목록 */
  runIds: string[];
  legacyCalls: string[];
}

export function createHarness(storage: RunStorage = new MemoryRunStorage(), seed = 42, metaStorage: RunStorage = new MemoryRunStorage()): Harness {
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
  const meta = new MetaStore(metaStorage, gameData.meta);
  const runIds: string[] = [];
  const newRunId = (): string => {
    const id = `run-${runIds.length + 1}`;
    runIds.push(id);
    return id;
  };
  const session = new RunSession({ deps: gameData.run, store, meta, newRunId, battle, legacy, suggestSeed: () => seed, commanderId: 'cmd_harten' });
  return { session, battle, storage, store, meta, metaStorage, runIds, legacyCalls };
}

/** 해금 항목이 모두 열려 있는 메타 저장소 (잠금 때문에 지휘관·유물이 막히면 안 되는 테스트용) */
export function allUnlockedMeta(): MemoryRunStorage {
  const unlocked = gameData.meta.unlocks.map((entry) => ({ id: entry.id, via: 'condition' }));
  const stats = { runsCompleted: 0, eliteKills: 0, ultimateUses: 0, shopVisits: 0, bossActsKilled: [], unitStar3: false, bestCompletedDeckSize: 0, bestBossEntryGold: 0 };
  return new MemoryRunStorage(JSON.stringify({ format: 'autochess-meta', version: 1, points: 0, totalEarned: 0, stats, unlocked, settledRuns: [] }));
}

/** 전투를 시작해 재생이 끝날 때까지 진행한다 */
export function playBattle(h: Harness): void {
  h.session.startBattle();
  for (let i = 0; i < 400 && h.battle.phase !== 'finished'; i++) h.battle.advance(1);
  if (h.battle.phase !== 'finished') throw new Error('전투가 끝나지 않음');
}
