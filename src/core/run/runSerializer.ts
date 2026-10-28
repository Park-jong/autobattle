import type { DeckPreset } from '../cards';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderCatalog } from '../data/commanderLoader';
import { FieldReader } from '../data/fieldReader';
import type { EventCatalog } from '../data/eventLoader';
import type { UnitCatalog } from '../data/unitLoader';
import type { BattleOutcome } from '../economy';
import { CommanderHealth } from './commanderHealth';
import { RUN } from './constants';
import type { EventSessionState, PendingPick } from './eventDirector';
import { PlayerForces, type ForcesState } from './forces';
import { NODE_TYPES, RunMap, type SerializedMap } from './runMap';
import { RunState, RUN_PHASES, type NodeSession, type RunOutcome, type RunPhase, type RunRecord } from './runState';

export const SAVE_FORMAT = 'autochess-run';

/** 저장 가능한 단계 (battle은 battlePrep으로 저장한다) */
type SavedPhase = Exclude<RunPhase, 'battle'>;

/** 노드 단위 체크포인트 JSON. 전투 중간 상태는 저장하지 않는다 */
export interface RunSave {
  format: typeof SAVE_FORMAT;
  version: number;
  seed: number;
  commanderId: string;
  deckPreset: DeckPreset;
  map: SerializedMap;
  position: { currentNodeId: string | null; visited: string[] };
  health: { hp: number; maxHp: number };
  forces: ForcesState;
  removals: number;
  seenEvents: string[];
  phase: SavedPhase;
  session: NodeSession | null;
  outcome: RunOutcome | null;
  history: RunRecord[];
}

/** 복원에 필요한 데이터 카탈로그 */
export interface SerializerDeps {
  units: UnitCatalog;
  cards: CardCatalog;
  commanders: CommanderCatalog;
  events: EventCatalog;
}

const SESSION_BY_PHASE: Readonly<Record<SavedPhase, NodeSession['kind'] | null>> = {
  map: null, battlePrep: 'battle', reward: 'reward', shop: 'shop', event: 'event', camp: 'camp', ended: null,
};

/** RunState ⇄ JSON. 복원은 모든 필드를 검증하고, 틀리면 위치가 담긴 한국어 오류를 던진다 */
export class RunSerializer {
  constructor(private readonly deps: SerializerDeps) {}

  serialize(state: RunState): RunSave {
    return {
      format: SAVE_FORMAT,
      version: RUN.FORMAT_VERSION,
      seed: state.seed,
      commanderId: state.commanderId,
      deckPreset: state.deckPreset,
      map: state.map.toJSON(),
      position: { currentNodeId: state.currentNodeId, visited: [...state.visited] },
      health: state.health.serialize(),
      forces: state.forces.serialize(),
      removals: state.removals,
      seenEvents: [...state.seenEvents],
      phase: state.phase === 'battle' ? 'battlePrep' : state.phase,
      session: state.session ? structuredClone(state.session) : null,
      outcome: state.outcome,
      history: state.history.map((record) => ({ ...record })),
    };
  }

  parse(data: unknown): RunState {
    const r = FieldReader.of(data, 'run');
    r.onlyKeys(['format', 'version', 'seed', 'commanderId', 'deckPreset', 'map', 'position', 'health', 'forces', 'removals', 'seenEvents', 'phase', 'session', 'outcome', 'history']);
    if (r.rawValue('format') !== SAVE_FORMAT) r.fail('format', `"${SAVE_FORMAT}"여야 함 (런 저장 파일이 아님)`);
    const version = r.int('version', 1);
    if (version !== RUN.FORMAT_VERSION) r.fail('version', `지원하지 않는 저장 버전 ${version} (지원: ${RUN.FORMAT_VERSION})`);

    const seed = r.number('seed');
    if (!Number.isInteger(seed)) r.fail('seed', `정수여야 함 (실제: ${seed})`);
    const commanderId = r.string('commanderId');
    if (!this.deps.commanders.get(commanderId)) r.fail('commanderId', `commanders.json에 없는 지휘관 "${commanderId}"`);
    const deckPreset = r.enum('deckPreset', ['starter', 'test'] as const);

    const map = RunMap.parse(r.rawValue('map'), 'run.map');
    const health = CommanderHealth.restore(r.rawValue('health'), 'run.health');
    const forces = PlayerForces.restore(this.deps.units, this.deps.cards, r.rawValue('forces'), 'run.forces');
    const state = new RunState(seed, commanderId, deckPreset, map, health, forces);

    const position = r.object('position');
    position.onlyKeys(['currentNodeId', 'visited']);
    const current = position.rawValue('currentNodeId');
    if (current !== null) {
      state.currentNodeId = position.string('currentNodeId');
      if (!map.node(state.currentNodeId)) position.fail('currentNodeId', `맵에 없는 노드 "${state.currentNodeId}"`);
    }
    state.visited = position.array('visited').map((id, i) => {
      if (typeof id !== 'string' || !map.node(id)) position.fail(`visited[${i}]`, `맵에 없는 노드 ${JSON.stringify(id)}`);
      return id as string;
    });

    state.removals = r.int('removals', 0);
    state.seenEvents = r.array('seenEvents').map((id, i) => {
      if (typeof id !== 'string' || !this.deps.events.get(id)) r.fail(`seenEvents[${i}]`, `events.json에 없는 이벤트 ${JSON.stringify(id)}`);
      return id as string;
    });

    const phase = r.enum('phase', RUN_PHASES);
    if (phase === 'battle') r.fail('phase', '전투 중 상태는 저장되지 않음 (battlePrep으로 저장해야 함)');
    state.phase = phase;
    const sessionRaw = r.rawValue('session');
    state.session = sessionRaw === null ? null : this.parseSession(sessionRaw, 'run.session');
    const expected = SESSION_BY_PHASE[phase as SavedPhase];
    if ((state.session?.kind ?? null) !== expected) r.fail('session', `phase "${phase}"에는 ${expected ?? '없음'} 세션이 필요함 (실제: ${state.session?.kind ?? '없음'})`);
    if (phase !== 'map' && state.currentNodeId === null && phase !== 'ended') r.fail('position', `phase "${phase}"에는 현재 노드가 필요함`);

    const outcome = r.rawValue('outcome');
    if (outcome !== null && outcome !== 'victory' && outcome !== 'dead') r.fail('outcome', `"victory" 또는 "dead"여야 함`);
    state.outcome = outcome as RunOutcome | null;
    if ((phase === 'ended') !== (state.outcome !== null)) r.fail('outcome', 'ended 단계와 결과(outcome)가 맞지 않음');
    if (state.outcome === 'dead' && !health.dead) r.fail('outcome', '사망 결과인데 지휘관 HP가 0이 아님');

    state.history = r.array('history').map((raw, i) => this.parseRecord(raw, `run.history[${i}]`, map));
    return state;
  }

  // ---- 세션 ----

  private parseSession(raw: unknown, path: string): NodeSession {
    const r = FieldReader.of(raw, path);
    const kind = r.enum('kind', ['battle', 'reward', 'shop', 'event', 'camp'] as const);
    switch (kind) {
      case 'battle':
        r.onlyKeys(['kind', 'tries']);
        return { kind, tries: r.int('tries', 0) };
      case 'camp':
        r.onlyKeys(['kind']);
        return { kind };
      case 'reward': {
        r.onlyKeys(['kind', 'source', 'offer']);
        return { kind, source: r.enum('source', ['normal', 'elite'] as const), offer: this.cardIds(r, 'offer') };
      }
      case 'shop': {
        r.onlyKeys(['kind', 'cards']);
        const cards = r.array('cards').map((slot, i) => {
          const s = FieldReader.of(slot, `${path}.cards[${i}]`);
          s.onlyKeys(['cardId', 'price', 'sold']);
          const cardId = s.string('cardId');
          if (!this.deps.cards.get(cardId)) s.fail('cardId', `cards.json에 없는 카드 id "${cardId}"`);
          return { cardId, price: s.int('price', 0), sold: s.boolean('sold') };
        });
        return { kind, cards };
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

  private parseRecord(raw: unknown, path: string, map: RunMap): RunRecord {
    const r = FieldReader.of(raw, path);
    r.onlyKeys(['nodeId', 'floor', 'type', 'outcome', 'endTime', 'cardsUsed', 'hpAfter', 'goldAfter']);
    const nodeId = r.string('nodeId');
    if (!map.node(nodeId)) r.fail('nodeId', `맵에 없는 노드 "${nodeId}"`);
    return {
      nodeId, floor: r.int('floor', 1), type: r.enum('type', NODE_TYPES),
      outcome: r.enum('outcome', ['win', 'loss', 'draw'] as const satisfies readonly BattleOutcome[]),
      endTime: r.number('endTime', 0), cardsUsed: r.int('cardsUsed', 0), hpAfter: r.int('hpAfter', 0), goldAfter: r.int('goldAfter', 0),
    };
  }
}
