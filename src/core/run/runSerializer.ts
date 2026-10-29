import type { DeckPreset } from '../cards';
import { isCardAllowedFor } from '../data/card';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderCatalog } from '../data/commanderLoader';
import { FieldReader } from '../data/fieldReader';
import type { EventCatalog } from '../data/eventLoader';
import type { RelicCatalog } from '../data/relicLoader';
import type { ThreatCatalog } from '../data/threatLoader';
import { ThreatRules } from './threatRules';
import type { UnitCatalog } from '../data/unitLoader';
import type { BattleOutcome } from '../economy';
import { cardPrice } from './cardMarket';
import type { ContentMigrations } from './contentMigration';
import type { RewardRarity } from './cardRewards';
import { CommanderHealth } from './commanderHealth';
import type { RelicInventoryState } from './relicInventory';
import { relicPrice, type DroppableRarity } from './relicRewards';
import { RUN } from './constants';
import type { EventSessionState, PendingPick } from './eventDirector';
import { PlayerForces, type ForcesState } from './forces';
import { NODE_TYPES, RunMap, type MapNode, type SerializedMap } from './runMap';
import { RunState, RUN_PHASES, TEST_START_POSITIONS, emptyRunStats, type RunStats, type NodeSession, type RunOutcome, type RunPhase, type RunRecord, type TestRunInfo } from './runState';

export const SAVE_FORMAT = 'autochess-run';

/** 저장 가능한 단계 (battle은 battlePrep으로 저장한다) */
type SavedPhase = Exclude<RunPhase, 'battle'>;

/** 노드 단위 체크포인트 JSON. 전투 중간 상태는 저장하지 않는다 */
export interface RunSave {
  format: typeof SAVE_FORMAT;
  version: number;
  /** 저장할 때의 콘텐츠 데이터 버전 (data/migrations.json). 없으면 0 — 콘텐츠 마이그레이션이 이 값 뒤의 변경을 적용한다 */
  contentVersion?: number;
  seed: number;
  commanderId: string;
  deckPreset: DeckPreset;
  /** v3부터. 전체 액트 수 (v1·v2 저장본은 읽을 때 정한다: 승리로 끝난 저장본은 1, 그 외 3) */
  totalActs: number;
  /** v3부터. 액트 1부터 지금 액트까지의 맵 (마지막이 지금 맵). v1·v2의 단일 `map`은 액트 1 하나로 읽는다 */
  maps: SerializedMap[];
  position: { currentNodeId: string | null; visited: string[] };
  health: { hp: number; maxHp: number };
  forces: ForcesState;
  /** v2부터. v1 저장본에는 없고, 읽을 때 유물 없음으로 취급한다 */
  relics: RelicInventoryState;
  removals: number;
  seenEvents: string[];
  phase: SavedPhase;
  session: NodeSession | null;
  outcome: RunOutcome | null;
  history: RunRecord[];
  /** v3의 선택 필드. 있으면 플레이 테스트 런이다 (일반 런 저장본에는 이 필드가 없다) */
  test?: TestRunInfo;
  /** v3의 선택 필드(메타 진행). 메타 정산용 런 통계 — 없으면 0·false로 시작한다 (기본값이면 저장하지 않음) */
  stats?: RunStats;
  /** v3의 선택 필드. 메타 정산 중복 방지용 런 식별자 */
  runId?: string;
  /** v3의 선택 필드. 런 시작 때 허용된 유물 id(메타 해금). 없으면 모든 유물 허용. 카탈로그에 없는 id는 복원할 때 무시한다 */
  allowedRelics?: string[];
  /** v3의 선택 필드. 위협 레벨 1~10 (0이면 저장하지 않고, 없는 저장본은 0으로 읽는다) */
  threatLevel?: number;
}

/** 복원에 필요한 데이터 카탈로그 */
export interface SerializerDeps {
  units: UnitCatalog;
  cards: CardCatalog;
  commanders: CommanderCatalog;
  events: EventCatalog;
  relics: RelicCatalog;
  migrations: ContentMigrations;
  threat: ThreatCatalog;
}

const isDefaultStats = (stats: RunStats): boolean => {
  const empty = emptyRunStats();
  return stats.ultimateUses === empty.ultimateUses && stats.bossEntryGold === empty.bossEntryGold && stats.unitStar3 === empty.unitStar3;
};

const SESSION_BY_PHASE: Readonly<Record<SavedPhase, NodeSession['kind'] | null>> = {
  map: null, battlePrep: 'battle', reward: 'reward', bossRelic: 'bossRelic', actIntro: 'actIntro', shop: 'shop', event: 'event', camp: 'camp', ended: null,
};

/** RunState ⇄ JSON. 복원은 모든 필드를 검증하고, 틀리면 위치가 담긴 한국어 오류를 던진다 */
export class RunSerializer {
  constructor(private readonly deps: SerializerDeps) {}

  serialize(state: RunState): RunSave {
    return {
      format: SAVE_FORMAT,
      version: RUN.FORMAT_VERSION,
      contentVersion: this.deps.migrations.current,
      seed: state.seed,
      commanderId: state.commanderId,
      deckPreset: state.deckPreset,
      totalActs: state.totalActs,
      maps: state.maps.map((map) => map.toJSON()),
      position: { currentNodeId: state.currentNodeId, visited: [...state.visited] },
      health: state.health.serialize(),
      forces: state.forces.serialize(),
      relics: state.forces.relics.serialize(),
      removals: state.removals,
      seenEvents: [...state.seenEvents],
      phase: state.phase === 'battle' ? 'battlePrep' : state.phase,
      session: state.session ? structuredClone(state.session) : null,
      outcome: state.outcome,
      history: state.history.map((record) => ({ ...record })),
      ...(state.test ? { test: { ...state.test } } : {}),
      ...(isDefaultStats(state.stats) ? {} : { stats: { ...state.stats } }),
      ...(state.runId !== null ? { runId: state.runId } : {}),
      ...(state.allowedRelics !== null ? { allowedRelics: [...state.allowedRelics] } : {}),
      ...(state.threatLevel !== 0 ? { threatLevel: state.threatLevel } : {}),
    };
  }

  parse(data: unknown): RunState {
    const r = FieldReader.of(data, 'run');
    if (r.rawValue('format') !== SAVE_FORMAT) r.fail('format', `"${SAVE_FORMAT}"여야 함 (런 저장 파일이 아님)`);
    const version = r.int('version', 1);
    if (version < RUN.MIN_FORMAT_VERSION || version > RUN.FORMAT_VERSION) {
      r.fail('version', `지원하지 않는 저장 버전 ${version} (지원: ${RUN.MIN_FORMAT_VERSION}~${RUN.FORMAT_VERSION})`);
    }
    // v1에는 유물 필드가 없다: 하르텐(commanderId는 v1에도 있음)·유물 없음으로 읽는다.
    // v1·v2에는 액트 필드가 없다: 단일 `map`을 액트 1의 맵으로 읽는다 (v3는 `maps`와 `totalActs`)
    const keys = ['format', 'version', 'contentVersion', 'seed', 'commanderId', 'deckPreset', 'position', 'health', 'forces', 'removals', 'seenEvents', 'phase', 'session', 'outcome', 'history'];
    r.onlyKeys([...keys, ...(version >= 2 ? ['relics'] : []), ...(version >= 3 ? ['maps', 'totalActs', 'test', 'stats', 'runId', 'allowedRelics', 'threatLevel'] : ['map'])]);

    if (r.has('contentVersion') && r.int('contentVersion', 0) > this.deps.migrations.current) {
      r.fail('contentVersion', `현재 게임의 콘텐츠 버전(${this.deps.migrations.current})보다 높음`);
    }
    const seed = r.number('seed');
    if (!Number.isInteger(seed) || seed !== (seed | 0)) r.fail('seed', `부호 있는 32비트 정수여야 함 (실제: ${seed})`);
    const commanderId = r.string('commanderId');
    if (!this.deps.commanders.get(commanderId)) r.fail('commanderId', `commanders.json에 없는 지휘관 "${commanderId}"`);
    const deckPreset = r.enum('deckPreset', ['starter', 'test'] as const);

    const maps = this.parseMaps(r, version);
    const health = CommanderHealth.restore(r.rawValue('health'), 'run.health');
    const forces = PlayerForces.restore(this.deps.units, this.deps.cards, r.rawValue('forces'), 'run.forces', this.deps.relics);
    if (version >= 2) forces.relics.load(r.rawValue('relics'), 'run.relics');
    forces.syncRelicEffects();
    const phase = r.enum('phase', RUN_PHASES);
    const outcome = r.rawValue('outcome');
    const totalActs = this.parseTotalActs(r, version, maps.length, phase, outcome);
    const state = new RunState(seed, commanderId, deckPreset, maps, health, forces, totalActs);
    if (r.has('test')) state.test = this.parseTestInfo(r.object('test'), totalActs, maps.length);
    if (r.has('stats')) state.stats = this.parseStats(r.object('stats'));
    if (r.has('runId')) state.runId = r.string('runId');
    if (r.has('allowedRelics')) state.allowedRelics = this.parseAllowedRelics(r);
    if (r.has('threatLevel')) {
      const level = r.int('threatLevel', 0);
      if (level > this.deps.threat.maxLevel) r.fail('threatLevel', `0~${this.deps.threat.maxLevel}이어야 함 (실제: ${level})`);
      state.threatLevel = level;
    }

    const position = r.object('position');
    position.onlyKeys(['currentNodeId', 'visited']);
    const current = position.rawValue('currentNodeId');
    if (current !== null) {
      state.currentNodeId = position.string('currentNodeId');
      if (!state.findNode(state.currentNodeId)) position.fail('currentNodeId', `맵에 없는 노드 "${state.currentNodeId}"`);
    }
    state.visited = position.array('visited').map((id, i) => {
      if (typeof id !== 'string' || !state.findNode(id)) position.fail(`visited[${i}]`, `맵에 없는 노드 ${JSON.stringify(id)}`);
      return id as string;
    });

    state.removals = r.int('removals', 0);
    state.seenEvents = r.array('seenEvents').map((id, i) => {
      if (typeof id !== 'string' || !this.deps.events.get(id)) r.fail(`seenEvents[${i}]`, `events.json에 없는 이벤트 ${JSON.stringify(id)}`);
      return id as string;
    });

    if (phase === 'battle') r.fail('phase', '전투 중 상태는 저장되지 않음 (battlePrep으로 저장해야 함)');
    state.phase = phase;
    const sessionRaw = r.rawValue('session');
    state.session = sessionRaw === null ? null : this.parseSession(sessionRaw, 'run.session');
    const expected = SESSION_BY_PHASE[phase as SavedPhase];
    if ((state.session?.kind ?? null) !== expected) r.fail('session', `phase "${phase}"에는 ${expected ?? '없음'} 세션이 필요함 (실제: ${state.session?.kind ?? '없음'})`);
    if (phase !== 'map' && state.currentNodeId === null && phase !== 'ended') r.fail('position', `phase "${phase}"에는 현재 노드가 필요함`);

    if (outcome !== null && outcome !== 'victory' && outcome !== 'dead') r.fail('outcome', `"victory" 또는 "dead"여야 함`);
    state.outcome = outcome as RunOutcome | null;
    if ((phase === 'ended') !== (state.outcome !== null)) r.fail('outcome', 'ended 단계와 결과(outcome)가 맞지 않음');
    if (state.outcome === 'dead' && !health.dead) r.fail('outcome', '사망 결과인데 지휘관 HP가 0이 아님');

    state.history = r.array('history').map((raw, i) => this.parseRecord(raw, `run.history[${i}]`, state));
    this.checkConsistency(r, position, state);
    return state;
  }

  private parseStats(s: FieldReader): RunStats {
    s.onlyKeys(['ultimateUses', 'bossEntryGold', 'unitStar3']);
    return { ultimateUses: s.int('ultimateUses', 0), bossEntryGold: s.int('bossEntryGold', 0), unitStar3: s.boolean('unitStar3') };
  }

  /** 허용 유물: 문자열 배열(중복 불가). 현재 relics.json에 없는 id는 무시한다 (콘텐츠 변경으로 사라진 유물이 저장본을 막지 않게) */
  private parseAllowedRelics(r: FieldReader): string[] {
    const seen = new Set<string>();
    const ids = r.array('allowedRelics').map((id, i) => {
      if (typeof id !== 'string' || id === '') r.fail(`allowedRelics[${i}]`, `비어 있지 않은 문자열이어야 함 (실제: ${JSON.stringify(id)})`);
      if (seen.has(id as string)) r.fail(`allowedRelics[${i}]`, `중복된 유물 "${id as string}"`);
      seen.add(id as string);
      return id as string;
    });
    return ids.filter((id) => this.deps.relics.get(id) !== undefined);
  }

  /** 테스트 런 표시: 시작 액트는 전체 액트 수 이하이고 지금 액트보다 뒤일 수 없다 */
  private parseTestInfo(t: FieldReader, totalActs: number, act: number): TestRunInfo {
    t.onlyKeys(['startAct', 'startPosition']);
    const startAct = t.int('startAct', 1);
    if (startAct > totalActs || startAct > act) t.fail('startAct', `전체 액트 수(${totalActs})와 지금 액트(${act}) 이하여야 함 (실제: ${startAct})`);
    return { startAct, startPosition: t.enum('startPosition', TEST_START_POSITIONS) };
  }

  /** v3는 `maps`(액트 순서대로, 액트마다 id 접두사가 다른 맵), v1·v2는 단일 `map`을 액트 1로 읽는다 */
  private parseMaps(r: FieldReader, version: number): RunMap[] {
    if (version < 3) return [RunMap.parse(r.rawValue('map'), 'run.map', 1)];
    const raw = r.array('maps');
    if (raw.length < 1 || raw.length > RUN.ACTS.COUNT) r.fail('maps', `맵은 1~${RUN.ACTS.COUNT}개여야 함 (실제: ${raw.length})`);
    return raw.map((map, i) => RunMap.parse(map, `run.maps[${i}]`, i + 1));
  }

  /**
   * 전체 액트 수. v3는 저장된 값을 쓴다. v1·v2(1액트 시절) 저장본은 3액트 런의 액트 1로 읽되,
   * 이미 보스를 쓰러뜨려 승리로 끝난 저장본만 1액트 런으로 남긴다 (그 승리가 유효하도록).
   */
  private parseTotalActs(r: FieldReader, version: number, actCount: number, phase: RunPhase, outcome: unknown): number {
    if (version < 3) return phase === 'ended' && outcome === 'victory' ? 1 : RUN.ACTS.COUNT;
    const total = r.int('totalActs', 1);
    if (total > RUN.ACTS.COUNT) r.fail('totalActs', `${RUN.ACTS.COUNT} 이하여야 함 (실제: ${total})`);
    if (actCount > total) r.fail('maps', `맵 수(${actCount})가 전체 액트 수(${total})를 넘음`);
    return total;
  }

  // ---- 필드 간 일관성 ----

  /** 각 필드가 따로는 올바르지만 서로 모순되는 저장본(실제 진행으로는 만들어질 수 없는 상태)을 거부한다 */
  private checkConsistency(r: FieldReader, position: FieldReader, state: RunState): void {
    const { visited, session } = state;
    const found = state.currentNodeId === null ? undefined : state.findNode(state.currentNodeId);
    const current = found?.node;
    /** 현재 노드가 속한 액트 (노드가 없으면 0) */
    const currentAct = found?.act ?? 0;
    const act = state.act;

    // 유물: 최대 HP는 지휘관 기본값 + 보유 유물의 최대 HP 증가의 합
    const commander = this.deps.commanders.get(state.commanderId);
    const threat = new ThreatRules(this.deps.threat, state.threatLevel);
    const expectedMax = threat.maxHp(commander?.maxHp ?? RUN.START_HP) + state.forces.relics.sum('maxHp', (e) => e.amount);
    // 테스트 런은 최대 HP를 직접 정할 수 있어 기본값과 같을 필요가 없다 (1 이상은 CommanderHealth가 확인)
    if (state.test === null && state.health.max !== expectedMax) r.fail('health.maxHp', `지휘관 기본 최대 HP와 보유 유물에서 계산한 ${expectedMax}여야 함 (실제: ${state.health.max})`);

    this.checkCommanderCards(r, state);

    // 위치: 입장한 노드는 액트 1의 1층부터 간선을 따라 한 층씩 이어지고, 액트 보스 다음에는 다음 액트의 1층으로 넘어간다
    if (visited.length > RUN.MAP.FLOORS * act) position.fail('visited', `${RUN.MAP.FLOORS * act}개 이하여야 함 (실제: ${visited.length})`);
    if (visited.length === 0 ? state.currentNodeId !== null : state.currentNodeId !== visited[visited.length - 1]) {
      position.fail('currentNodeId', '입장 기록(visited)의 마지막 노드와 같아야 함 (기록이 비면 null)');
    }
    visited.forEach((id, i) => {
      const here = state.findNode(id) as { node: MapNode; act: number };
      const previous = i === 0 ? undefined : (state.findNode(visited[i - 1] as string) as { node: MapNode; act: number });
      if (i === 0 && (here.node.floor !== 1 || here.act !== 1)) position.fail('visited[0]', `액트 1의 1층 노드여야 함 (실제: ${id}는 액트 ${here.act} ${here.node.floor}층)`);
      if (!previous) return;
      if (previous.act === here.act) {
        if (!previous.node.next.includes(id)) position.fail(`visited[${i}]`, `이전 노드 ${previous.node.id}에서 이어진 노드가 아님 (${id})`);
      } else if (here.act !== previous.act + 1 || here.node.floor !== 1 || previous.node.type !== 'boss') {
        position.fail(`visited[${i}]`, `다른 액트로 넘어가려면 이전 액트의 보스(${previous.node.id}) 다음에 다음 액트 1층이어야 함 (${id})`);
      }
    });
    // 지난 액트는 보스까지 끝낸 것이어야 한다 (다음 맵은 보스를 쓰러뜨린 뒤에만 만들어진다)
    state.maps.forEach((map, i) => {
      if (i === act - 1) return;
      if (!visited.includes(map.bossNode.id)) r.fail('maps', `지난 액트 ${i + 1}의 보스(${map.bossNode.id})를 쓰러뜨리지 않았는데 다음 액트의 맵이 있음`);
    });

    // 단계 ↔ 현재 노드 종류
    const phase = state.phase;
    const type = current?.type;
    const battleNode = type === 'combat' || type === 'elite' || type === 'boss';
    if (phase === 'map' && type === 'boss' && currentAct === act) r.fail('phase', '보스 노드 다음에는 맵 단계가 있을 수 없음 (다음 액트로 넘어가거나 런이 끝나야 함)');
    if (phase === 'map' && current && currentAct !== act && !(type === 'boss' && currentAct === act - 1)) r.fail('phase', '다른 액트의 노드에서 맵 단계가 이어질 수 없음');
    if (phase === 'map' && act > 1 && currentAct === act - 1 && visited.some((id) => state.findNode(id)?.act === act)) r.fail('position', '새 액트의 노드를 방문한 기록이 있는데 현재 노드가 지난 액트의 노드임');
    if (phase === 'battlePrep' && !battleNode) r.fail('phase', `battlePrep은 전투 노드에서만 가능함 (현재 노드: ${type ?? '없음'})`);
    if ((phase === 'shop' || phase === 'event' || phase === 'camp') && type !== phase) r.fail('phase', `${phase} 단계의 현재 노드는 ${phase}여야 함 (실제: ${type ?? '없음'})`);
    if (['battlePrep', 'reward', 'bossRelic', 'shop', 'event', 'camp'].includes(phase) && currentAct !== act) r.fail('phase', `${phase} 단계의 현재 노드는 지금 액트(${act})의 노드여야 함 (실제: 액트 ${currentAct})`);
    if (session?.kind === 'reward') {
      if (type !== 'combat' && type !== 'elite') r.fail('session', `카드 보상은 일반·정예 전투 노드에서만 가능함 (현재 노드: ${type ?? '없음'})`);
      if (session.source !== (type === 'elite' ? 'elite' : 'normal')) r.fail('session.source', `현재 노드(${type})와 보상 종류(${session.source})가 맞지 않음`);
      if (session.relic !== null && session.source !== 'elite') r.fail('session.relic', '유물 보상은 정예 전투에서만 나옴');
    }
    if (phase === 'bossRelic') {
      if (type !== 'boss') r.fail('phase', `bossRelic 단계의 현재 노드는 보스여야 함 (실제: ${type ?? '없음'})`);
      if (act >= state.totalActs) r.fail('phase', '마지막 액트의 보스 다음에는 보스 유물 선택이 없음 (런이 끝남)');
    }
    if (session?.kind === 'bossRelic') {
      const seen = new Set<string>();
      if (session.offer.length < 1 || session.offer.length > RUN.RELIC.BOSS_CHOICES) r.fail('session.offer', `보스 유물 후보는 1~${RUN.RELIC.BOSS_CHOICES}개여야 함 (실제: ${session.offer.length})`);
      session.offer.forEach((id, i) => {
        if (this.deps.relics.get(id)?.rarity !== 'boss') r.fail(`session.offer[${i}]`, `보스 유물이 아님 ("${id}")`);
        if (seen.has(id)) r.fail(`session.offer[${i}]`, `같은 유물이 두 번 제시됨 ("${id}")`);
        seen.add(id);
        if (state.forces.relics.has(id)) r.fail(`session.offer[${i}]`, `이미 가진 유물이 후보에 있음 ("${id}")`);
      });
    }
    if (phase === 'actIntro') {
      if (act < 2 || currentAct !== act - 1 || type !== 'boss') r.fail('phase', 'actIntro 단계는 지난 액트의 보스 노드에서 다음 액트로 넘어온 직후여야 함');
    }
    if (session?.kind === 'actIntro') {
      const maxHeal = Math.ceil((state.health.max * threat.actHealPct()) / 100);
      if (session.healed > maxHeal) r.fail('session.healed', `액트 전환 회복량은 ${maxHeal} 이하여야 함 (실제: ${session.healed})`);
      if (session.hpBefore + session.healed !== state.health.hp) r.fail('session', `회복 전 HP(${session.hpBefore})와 회복량(${session.healed})의 합이 현재 HP(${state.health.hp})와 같아야 함`);
    }
    if (phase === 'ended') {
      if (state.outcome === 'victory' && (type !== 'boss' || currentAct !== state.totalActs || act !== state.totalActs)) {
        r.fail('outcome', `승리는 마지막 액트(${state.totalActs})의 보스 노드에서만 가능함`);
      }
      if (state.outcome === 'dead' && !battleNode) r.fail('outcome', '사망은 전투 노드에서만 가능함');
    }

    // 지휘관 HP: 사망은 곧 종료
    if (phase !== 'ended' && state.health.dead) r.fail('health', `종료되지 않은 런(${phase})인데 지휘관 HP가 0임`);
    if (state.outcome === 'victory' && state.health.dead) r.fail('health', '승리한 런인데 지휘관 HP가 0임');

    // 전투 시도 횟수: 보스에서 질 때마다 기록이 하나 쌓이며 1씩 오른다
    if (session?.kind === 'battle') {
      const records = state.history.filter((record) => record.nodeId === state.currentNodeId).length;
      if (session.tries !== records) r.fail('session.tries', `이 노드의 전투 기록 수(${records})와 같아야 함 (실제: ${session.tries})`);
    }

    // 상점: 3칸, 가격은 희귀도 가격표와 같다
    if (session?.kind === 'shop') {
      if (session.cards.length !== RUN.SHOP.CARD_SLOTS) r.fail('session.cards', `${RUN.SHOP.CARD_SLOTS}칸이어야 함 (실제: ${session.cards.length})`);
      session.cards.forEach((slot, i) => {
        const rarity = this.deps.cards.get(slot.cardId)?.rarity;
        if (rarity !== 'common' && rarity !== 'rare' && rarity !== 'epic') r.fail(`session.cards[${i}].cardId`, `상점에 진열할 수 없는 카드 "${slot.cardId}"`);
        const price = cardPrice(rarity as RewardRarity);
        if (slot.price !== price) r.fail(`session.cards[${i}].price`, `희귀도 ${rarity}의 가격 ${price}G여야 함 (실제: ${slot.price})`);
      });
      if (session.relics.length > RUN.RELIC.SHOP_SLOTS) r.fail('session.relics', `${RUN.RELIC.SHOP_SLOTS}칸 이하여야 함 (실제: ${session.relics.length})`);
      const shelved = new Set<string>();
      session.relics.forEach((slot, i) => {
        const rarity = this.deps.relics.get(slot.relicId)?.rarity;
        if (rarity !== 'common' && rarity !== 'rare') r.fail(`session.relics[${i}].relicId`, `상점에 진열할 수 없는 유물 "${slot.relicId}"`);
        if (shelved.has(slot.relicId)) r.fail(`session.relics[${i}].relicId`, `같은 유물이 두 칸에 진열됨 ("${slot.relicId}")`);
        shelved.add(slot.relicId);
        const price = relicPrice(rarity as DroppableRarity);
        if (slot.price !== price) r.fail(`session.relics[${i}].price`, `희귀도 ${rarity}의 가격 ${price}G여야 함 (실제: ${slot.price})`);
        if (slot.sold !== state.forces.relics.has(slot.relicId)) {
          r.fail(`session.relics[${i}].sold`, slot.sold ? '구매했다면 보유 유물에 있어야 함' : '아직 팔리지 않은 유물을 이미 보유하고 있음');
        }
      });
    }

    // 이벤트: 입장한 이벤트 노드마다 id가 하나씩 쌓이고, 모두 본 뒤에야 되풀이된다
    const eventNodes = visited.filter((id) => state.findNode(id)?.node.type === 'event').length;
    if (state.seenEvents.length !== eventNodes) r.fail('seenEvents', `입장한 이벤트 노드 수(${eventNodes})와 같아야 함 (실제: ${state.seenEvents.length})`);
    state.seenEvents.forEach((id, i) => {
      const before = new Set(state.seenEvents.slice(0, i));
      if (before.has(id) && before.size < this.deps.events.events.length) r.fail(`seenEvents[${i}]`, `다른 이벤트를 모두 보기 전에 "${id}"가 되풀이됨`);
    });
    if (session?.kind === 'event' && session.state.eventId !== state.seenEvents[state.seenEvents.length - 1]) {
      r.fail('session.state.eventId', '가장 최근에 나온 이벤트(seenEvents의 마지막)와 같아야 함');
    }

    // 기록은 입장한 노드의 것이다
    state.history.forEach((record, i) => {
      if (!visited.includes(record.nodeId)) r.fail(`history[${i}].nodeId`, `입장하지 않은 노드 "${record.nodeId}"`);
      const node = (state.findNode(record.nodeId) as { node: MapNode }).node;
      if (record.type !== node.type || record.floor !== node.floor) r.fail(`history[${i}]`, `노드 ${node.id}(${node.floor}층 ${node.type})와 기록(${record.floor}층 ${record.type})이 맞지 않음`);
    });

    // 전투 노드는 정산할 때마다 기록이 하나 쌓인다: 일반·정예는 정산을 마친 노드마다 1건(전투 준비 중인 현재 노드는 0건),
    // 보스는 질 때마다 한 건씩(재도전 중이면 시도 수와 같고 위의 전투 시도 검사가 확인, 끝난 런은 1건 이상). 그 밖의 노드는 0건
    for (const id of visited) {
      const node = (state.findNode(id) as { node: MapNode }).node;
      const count = state.history.filter((record) => record.nodeId === id).length;
      const preparing = phase === 'battlePrep' && id === state.currentNodeId;
      if (node.type === 'combat' || node.type === 'elite') {
        const expected = preparing ? 0 : 1;
        if (count !== expected) r.fail('history', `${node.floor}층 ${node.type} 노드 ${id}의 전투 기록은 ${expected}건이어야 함 (실제: ${count}건)`);
      } else if (node.type === 'boss') {
        if (!preparing && count < 1) r.fail('history', `보스 노드 ${id}에 입장해 전투를 마쳤으므로 기록이 1건 이상이어야 함 (실제: ${count}건)`);
      } else if (count !== 0) {
        r.fail('history', `전투가 없는 ${node.type} 노드 ${id}에 전투 기록이 ${count}건 있음`);
      }
    }
    // 쓰러뜨린 보스(다음 액트로 넘어갔거나 보스 유물·액트 소개 단계, 승리한 런)의 마지막 기록은 승리다
    const defeated = new Set(state.maps.filter((_, i) => i < act - 1).map((map) => map.bossNode.id));
    if (phase === 'bossRelic' || phase === 'actIntro' || state.outcome === 'victory') {
      if (state.currentNodeId !== null) defeated.add(state.currentNodeId);
    }
    for (const id of defeated) {
      const last = [...state.history].reverse().find((record) => record.nodeId === id);
      if (last?.outcome !== 'win') r.fail('history', `보스 ${id}를 쓰러뜨렸으므로 마지막 전투 기록이 승리여야 함 (실제: ${last?.outcome ?? '기록 없음'})`);
    }
  }

  /**
   * 지휘관 고유 카드: 다른 지휘관의 고유 카드는 이 런에서 얻을 길이 없다.
   * 덱(시작 덱은 자기 지휘관 것만, 이후 보상·상점·이벤트 풀은 공용 + 자기 지휘관 고유 카드)과 제시된 보상·진열 카드를 확인한다.
   * 테스트 덱(deckPreset test)의 10장은 모두 공용 카드다. 콘텐츠 데이터가 바뀌어 생긴 불일치(카드 소유자 변경 등)는
   * 복원 전에 contentMigration이 저장본을 고쳐 두므로 여기서는 예외 없이 거부한다.
   * 시작 덱 프리셋이면 카드를 한 장도 제거한 적이 없을 때(상점 제거 0회, 제거 선택지가 있는 이벤트를 본 적 없음)
   * 시작 덱의 모든 카드가 (강화 여부와 무관하게) 장수 이상 덱에 남아 있어야 한다. 이세라처럼 고유 카드가 없는
   * 지휘관을 다른 지휘관 저장본으로 바꾼 조작은 이 검사로 걸러진다. 카드를 한 번이라도 제거했다면 판별할 수 없어 건너뛴다.
   */
  private checkCommanderCards(r: FieldReader, state: RunState): void {
    const foreign = (cardId: string): boolean => {
      const card = this.deps.cards.get(cardId);
      return card !== undefined && !isCardAllowedFor(card, state.commanderId);
    };
    const deck = state.forces.deck;
    const piles = { draw: deck.draw, hand: deck.hand, discard: deck.discard, exhaust: deck.exhaust };
    for (const [pile, cards] of Object.entries(piles)) {
      cards.forEach((card, i) => {
        if (foreign(card.cardId)) r.fail(`forces.carryDeck.${pile}[${i}].cardId`, `다른 지휘관의 고유 카드 "${card.cardId}"는 ${state.commanderId}의 덱에 있을 수 없음`);
      });
    }
    const commander = this.deps.commanders.get(state.commanderId);
    const removalEvents = state.seenEvents.some((id) => this.deps.events.get(id)?.choices.some((c) => c.effects.some((e) => e.kind === 'removeCard')));
    // 테스트 런은 카드를 자유롭게 빼고 넣을 수 있어 시작 덱 보존을 확인하지 않는다 (다른 지휘관 고유 카드 금지는 그대로)
    if (state.test === null && commander && state.deckPreset === 'starter' && state.removals === 0 && !removalEvents) {
      const owned = new Map<string, number>();
      for (const cards of Object.values(piles)) for (const card of cards) owned.set(card.cardId, (owned.get(card.cardId) ?? 0) + 1);
      for (const entry of commander.startingDeck) {
        if ((owned.get(entry.cardId) ?? 0) < entry.count) {
          r.fail('forces.carryDeck', `카드를 제거한 적이 없는데 ${state.commanderId}의 시작 덱 카드 "${entry.cardId}"가 ${entry.count}장보다 적음 (실제: ${owned.get(entry.cardId) ?? 0}장)`);
        }
      }
    }
    const session = state.session;
    const offered = session?.kind === 'reward' ? { key: 'session.offer', ids: session.offer }
      : session?.kind === 'shop' ? { key: 'session.cards', ids: session.cards.map((slot) => slot.cardId) }
        : null;
    offered?.ids.forEach((id, i) => {
      const card = this.deps.cards.get(id);
      if (card !== undefined && !isCardAllowedFor(card, state.commanderId)) {
        r.fail(`${offered.key}[${i}]`, `다른 지휘관의 고유 카드 "${id}"는 ${state.commanderId}의 보상·상점 풀에 나올 수 없음`);
      }
    });
  }

  // ---- 세션 ----

  private parseSession(raw: unknown, path: string): NodeSession {
    const r = FieldReader.of(raw, path);
    const kind = r.enum('kind', ['battle', 'reward', 'bossRelic', 'actIntro', 'shop', 'event', 'camp'] as const);
    switch (kind) {
      case 'battle':
        r.onlyKeys(['kind', 'tries']);
        return { kind, tries: r.int('tries', 0) };
      case 'camp':
        r.onlyKeys(['kind']);
        return { kind };
      case 'bossRelic': {
        r.onlyKeys(['kind', 'offer']);
        const offer = r.array('offer').map((id, i) => {
          if (typeof id !== 'string' || !this.deps.relics.get(id)) r.fail(`offer[${i}]`, `relics.json에 없는 유물 id ${JSON.stringify(id)}`);
          return id as string;
        });
        return { kind, offer };
      }
      case 'actIntro':
        r.onlyKeys(['kind', 'hpBefore', 'healed']);
        return { kind, hpBefore: r.int('hpBefore', 0), healed: r.int('healed', 0) };
      case 'reward': {
        r.onlyKeys(['kind', 'source', 'offer', 'relic']);
        let relic: string | null = null;
        if (r.has('relic') && r.rawValue('relic') !== null) {
          relic = r.string('relic');
          if (!this.deps.relics.get(relic)) r.fail('relic', `relics.json에 없는 유물 id "${relic}"`);
        }
        return { kind, source: r.enum('source', ['normal', 'elite'] as const), offer: this.cardIds(r, 'offer'), relic };
      }
      case 'shop': {
        r.onlyKeys(['kind', 'cards', 'relics']);
        const cards = r.array('cards').map((slot, i) => {
          const s = FieldReader.of(slot, `${path}.cards[${i}]`);
          s.onlyKeys(['cardId', 'price', 'sold']);
          const cardId = s.string('cardId');
          if (!this.deps.cards.get(cardId)) s.fail('cardId', `cards.json에 없는 카드 id "${cardId}"`);
          return { cardId, price: s.int('price', 0), sold: s.boolean('sold') };
        });
        const relics = (r.has('relics') ? r.array('relics') : []).map((slot, i) => {
          const s = FieldReader.of(slot, `${path}.relics[${i}]`);
          s.onlyKeys(['relicId', 'price', 'sold']);
          const relicId = s.string('relicId');
          if (!this.deps.relics.get(relicId)) s.fail('relicId', `relics.json에 없는 유물 id "${relicId}"`);
          return { relicId, price: s.int('price', 0), sold: s.boolean('sold') };
        });
        return { kind, cards, relics };
      }
      case 'event': {
        r.onlyKeys(['kind', 'state']);
        return { kind, state: this.parseEventState(r.object('state')) };
      }
    }
  }

  private cardIds(r: FieldReader, key: string): string[] {
    return r.array(key).map((id, i) => {
      if (typeof id !== 'string' || !this.deps.cards.get(id)) r.fail(`${key}[${i}]`, `cards.json에 없는 카드 id ${JSON.stringify(id)}`);
      return id as string;
    });
  }

  private parseEventState(r: FieldReader): EventSessionState {
    r.onlyKeys(['eventId', 'chosen', 'nextEffect', 'pending', 'messages']);
    const eventId = r.string('eventId');
    const event = this.deps.events.get(eventId);
    if (!event) r.fail('eventId', `events.json에 없는 이벤트 "${eventId}"`);
    const chosen = r.rawValue('chosen') === null ? null : r.int('chosen', 0);
    if (chosen !== null && chosen >= (event?.choices.length ?? 0)) r.fail('chosen', '선택지 범위를 벗어남');
    const nextEffect = r.int('nextEffect', 0);
    if (nextEffect > (chosen === null ? 0 : (event?.choices[chosen]?.effects.length ?? 0))) r.fail('nextEffect', '효과 개수를 넘음');
    let pending: PendingPick | null = null;
    if (r.rawValue('pending') !== null) {
      const p = r.object('pending');
      p.onlyKeys(['kind', 'options']);
      const kind = p.enum('kind', ['gainCard', 'removeCard', 'upgradeCard'] as const);
      if (chosen === null) p.fail('kind', '선택 전에는 추가 선택이 있을 수 없음');
      if (kind === 'gainCard') pending = { kind, options: this.cardIds(p, 'options') };
      else {
        pending = {
          kind,
          options: p.array('options').map((n, i) => {
            if (!Number.isInteger(n) || (n as number) < 1) p.fail(`options[${i}]`, '카드 인스턴스 ID(양의 정수)여야 함');
            return n as number;
          }),
        };
      }
    }
    const messages = r.array('messages').map((m, i) => {
      if (typeof m !== 'string') r.fail(`messages[${i}]`, '문자열이어야 함');
      return m as string;
    });
    return { eventId, chosen, nextEffect, pending, messages };
  }

  private parseRecord(raw: unknown, path: string, state: RunState): RunRecord {
    const r = FieldReader.of(raw, path);
    r.onlyKeys(['nodeId', 'floor', 'type', 'outcome', 'endTime', 'cardsUsed', 'hpAfter', 'goldAfter']);
    const nodeId = r.string('nodeId');
    if (!state.findNode(nodeId)) r.fail('nodeId', `맵에 없는 노드 "${nodeId}"`);
    return {
      nodeId, floor: r.int('floor', 1), type: r.enum('type', NODE_TYPES),
      outcome: r.enum('outcome', ['win', 'loss', 'draw'] as const satisfies readonly BattleOutcome[]),
      endTime: r.number('endTime', 0), cardsUsed: r.int('cardsUsed', 0), hpAfter: r.int('hpAfter', 0), goldAfter: r.int('goldAfter', 0),
    };
  }
}
