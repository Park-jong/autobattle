import type { DeckPreset } from '../cards';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderCatalog } from '../data/commanderLoader';
import { FieldReader } from '../data/fieldReader';
import type { EventCatalog } from '../data/eventLoader';
import type { UnitCatalog } from '../data/unitLoader';
import type { BattleOutcome } from '../economy';
import { cardPrice } from './cardMarket';
import type { RewardRarity } from './cardRewards';
import { CommanderHealth } from './commanderHealth';
import { RUN } from './constants';
import type { EventSessionState, PendingPick } from './eventDirector';
import { PlayerForces, type ForcesState } from './forces';
import { NODE_TYPES, RunMap, type MapNode, type SerializedMap } from './runMap';
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
    if (!Number.isInteger(seed) || seed !== (seed | 0)) r.fail('seed', `부호 있는 32비트 정수여야 함 (실제: ${seed})`);
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
    this.checkConsistency(r, position, state);
    return state;
  }

  // ---- 필드 간 일관성 ----

  /** 각 필드가 따로는 올바르지만 서로 모순되는 저장본(실제 진행으로는 만들어질 수 없는 상태)을 거부한다 */
  private checkConsistency(r: FieldReader, position: FieldReader, state: RunState): void {
    const { map, visited, session } = state;
    const current = state.currentNodeId === null ? undefined : map.node(state.currentNodeId);

    // 위치: 입장한 노드는 1층부터 간선을 따라 한 층씩 이어진다
    if (visited.length > RUN.MAP.FLOORS) position.fail('visited', `${RUN.MAP.FLOORS}개 이하여야 함 (실제: ${visited.length})`);
    if (visited.length === 0 ? state.currentNodeId !== null : state.currentNodeId !== visited[visited.length - 1]) {
      position.fail('currentNodeId', '입장 기록(visited)의 마지막 노드와 같아야 함 (기록이 비면 null)');
    }
    visited.forEach((id, i) => {
      const node = map.node(id) as MapNode;
      if (i === 0 && node.floor !== 1) position.fail('visited[0]', `1층 노드여야 함 (실제: ${id}는 ${node.floor}층)`);
      const previous = i === 0 ? undefined : map.node(visited[i - 1] as string);
      if (previous && !previous.next.includes(id)) position.fail(`visited[${i}]`, `이전 노드 ${previous.id}에서 이어진 노드가 아님 (${id})`);
    });

    // 단계 ↔ 현재 노드 종류
    const phase = state.phase;
    const type = current?.type;
    const battleNode = type === 'combat' || type === 'elite' || type === 'boss';
    if (phase === 'map' && type === 'boss') r.fail('phase', '보스 노드 다음에는 맵 단계가 있을 수 없음');
    if (phase === 'battlePrep' && !battleNode) r.fail('phase', `battlePrep은 전투 노드에서만 가능함 (현재 노드: ${type ?? '없음'})`);
    if ((phase === 'shop' || phase === 'event' || phase === 'camp') && type !== phase) r.fail('phase', `${phase} 단계의 현재 노드는 ${phase}여야 함 (실제: ${type ?? '없음'})`);
    if (session?.kind === 'reward') {
      if (type !== 'combat' && type !== 'elite') r.fail('session', `카드 보상은 일반·정예 전투 노드에서만 가능함 (현재 노드: ${type ?? '없음'})`);
      if (session.source !== (type === 'elite' ? 'elite' : 'normal')) r.fail('session.source', `현재 노드(${type})와 보상 종류(${session.source})가 맞지 않음`);
    }
    if (phase === 'ended') {
      if (state.outcome === 'victory' && type !== 'boss') r.fail('outcome', '승리는 보스 노드에서만 가능함');
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
    }

    // 이벤트: 입장한 이벤트 노드마다 id가 하나씩 쌓이고, 모두 본 뒤에야 되풀이된다
    const eventNodes = visited.filter((id) => map.node(id)?.type === 'event').length;
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
      const node = map.node(record.nodeId) as MapNode;
      if (record.type !== node.type || record.floor !== node.floor) r.fail(`history[${i}]`, `노드 ${node.id}(${node.floor}층 ${node.type})와 기록(${record.floor}층 ${record.type})이 맞지 않음`);
    });

    // 전투 노드는 정산할 때마다 기록이 하나 쌓인다: 일반·정예는 정산을 마친 노드마다 1건(전투 준비 중인 현재 노드는 0건),
    // 보스는 질 때마다 한 건씩(재도전 중이면 시도 수와 같고 위의 전투 시도 검사가 확인, 끝난 런은 1건 이상). 그 밖의 노드는 0건
    for (const id of visited) {
      const node = map.node(id) as MapNode;
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
