import type { CombatSimulator } from '../combat';
import { MANAGEMENT } from '../management';
import type { DeckPreset } from '../cards';
import { removableCards } from '../cards';
import { MapGenerator } from './mapGenerator';
import type { MapNode } from './runMap';
import { RUN } from './constants';
import type { RunDeps, RunResult, SettleResult } from './runController';
import { TEST_START_POSITIONS, type RunPhase, type RunState, type TestRunInfo, type TestStartPosition } from './runState';

/**
 * 플레이 테스트 도구의 core 쪽 (배포판에서 밸런스를 직접 확인하려는 용도).
 * 일반 런과 같은 RunController·저장 형식을 쓰되, 상태에 `test` 표시가 있는 런에서만 명령을 받는다.
 * 일반 런에서 부르면 상태를 바꾸지 않고 `{ ok:false, reason }`을 돌려준다.
 */

/** 테스트 값의 상한 (UI 입력 실수 방지) */
export const TEST_LIMITS = { GOLD_MAX: 99_999, HP_MAX: 9_999, CARD_COUNT_MAX: 20 } as const;

export interface TestCardSpec {
  cardId: string;
  /** 추가할 장수 (기본 1) */
  count?: number;
  /** 강화된 카드로 넣을지 (강화 버전이 있는 카드만) */
  upgraded?: boolean;
}

export interface TestUnitSpec {
  unitId: string;
  /** 성급 1~3 (기본 1) */
  star?: number;
  /** 놓을 곳 (기본 벤치) */
  place?: 'board' | 'bench';
}

/** 테스트 런 시작 설정. 생략한 항목은 일반 새 런과 같다 */
export interface TestRunSetup {
  seed: number;
  commanderId?: string;
  deckPreset?: DeckPreset;
  /** 위협 레벨 0~10 (기본 0). 메타 해금과 무관하게 아무 레벨이나 고를 수 있다 */
  threatLevel?: number;
  /** 시작 액트 1~3 (기본 1). 이전 액트는 맵만 만들고 보스까지 지나간 것으로 처리한다 */
  startAct?: number;
  startPosition?: TestStartPosition;
  gold?: number;
  /** 지휘관 현재 HP (기본: 최대 HP) */
  hp?: number;
  /** 지휘관 최대 HP (기본: 지휘관 기본값 + 보유 유물 보정) */
  maxHp?: number;
  level?: number;
  relics?: readonly string[];
  cards?: readonly TestCardSpec[];
  units?: readonly TestUnitSpec[];
}

export type ForcedResult = 'win' | 'loss';

/** 테스트 명령을 받는 단계: 노드 처리 중이 아닌 안전한 시점 (보상·상점 진열·액트 전환 세션이 편집과 모순되지 않는 곳) */
const EDIT_PHASES: readonly RunPhase[] = ['map', 'battlePrep', 'camp'];
/** 위치를 옮기는 명령을 받는 단계 (노드 화면을 떠나는 것이므로 상점·이벤트·전투 준비도 허용. 전투 준비의 전투는 이긴 것으로 기록) */
const MOVE_PHASES: readonly RunPhase[] = ['map', 'battlePrep', 'shop', 'event', 'camp'];

/** 명령 묶음별로 지금 쓸 수 없는 사유 (쓸 수 있으면 null). UI가 버튼을 끄고 사유를 보여 줄 때 쓴다 */
export interface TestAvailability {
  /** 값·유물·카드·유닛 편집 */
  edit: string | null;
  /** 보스 이동·다음 액트 */
  move: string | null;
  /** 강제 전투 결과 */
  battle: string | null;
  /** 다음 액트로 넘기기만의 추가 사유 (마지막 액트) */
  nextAct: string | null;
  /** "보스 직전 야영지로"만의 추가 사유 (이미 보스 직전 야영지에 있거나 지나왔을 때 등) */
  bossCamp: string | null;
  /** "보스 전투 준비로"만의 추가 사유 (이미 보스 노드에 있을 때 등) */
  boss: string | null;
}

/** RunController가 테스트 도구에 열어 주는 내부 동작 (규칙은 컨트롤러에 그대로 둔다) */
export interface TestRunHooks {
  acquireRelic(relicId: string): void;
  /** 노드에 실제로 입장한다 (chooseNode와 같은 입장 처리) */
  visitNode(node: MapNode): void;
  toMap(): void;
  /** 액트 보스를 쓰러뜨린 뒤 처리: 보스 유물 선택(후보가 있고 offerRelic) 또는 바로 다음 액트 소개 */
  clearActBoss(offerRelic: boolean): void;
  pickEvent(nodeId: string, seen: readonly string[]): string;
  createSimulator(): CombatSimulator;
  beginBattle(): RunResult;
  completeBattle(sim: CombatSimulator): SettleResult;
}

const OK: RunResult = { ok: true };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });
const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/**
 * 테스트 도구가 "지나온 것으로" 만들어 넣은 승리 기록인지 (건너뛴 구간). 실제 전투는 한 틱 이상 진행되므로 endTime이 0일 수 없다.
 * 저장 형식에 표시 필드를 더하지 않고 기록 모양만으로 구분한다.
 */
export function isSkippedRecord(record: { endTime: number; cardsUsed: number }): boolean {
  return record.endTime === 0 && record.cardsUsed === 0;
}

/**
 * 전투를 원하는 결과로 즉시 끝낸다 (win: 적 전멸 / loss: 아군 전멸). 실제 전투와 같은 시뮬 위에서 유닛을 쓰러뜨릴 뿐이라
 * 이후 정산(골드·피해·보상)은 일반 경로를 그대로 탄다. 증원 소환 같은 보스 연출이 있으면 끝날 때까지 몇 틱 더 쓰러뜨린다.
 */
export function forceCombatResult(sim: CombatSimulator, result: ForcedResult): void {
  sim.startCombat();
  // 한 틱 진행한 뒤 끝낸다: 강제 결과의 endTime이 0보다 커서, 건너뛴 구간 기록(endTime 0)과 구분된다
  if (!sim.finished) sim.step();
  for (let guard = 0; guard < 20 && !sim.finished; guard++) {
    for (const unit of sim.world.units) {
      const kill = result === 'win' ? unit.side === 1 : unit.side === 0;
      if (kill && unit.alive) sim.world.dealDamage({ source: null, target: unit, raw: 1e9, type: 'magic' });
    }
    sim.step();
  }
}

/**
 * 테스트 런의 시작 구성과 런 중 명령. 일반 런에서도 인스턴스는 있지만 모든 명령이 거부된다.
 *
 * 이전 액트·건너뛴 구간의 상태 구성: 맵 위의 경로(간선을 따라 1층부터 보스까지)를 실제로 지나온 것으로 기록한다 —
 * 입장 기록(visited), 전투·정예·보스는 승리 기록 1건(history), 이벤트 노드는 이벤트 id(seenEvents).
 * 그래서 저장 일관성 검사는 일반 런과 같은 규칙으로 이 상태를 통과한다.
 */
export class TestRunTools {
  constructor(
    private readonly deps: RunDeps,
    private readonly state: RunState,
    private readonly hooks: TestRunHooks,
  ) {}

  get info(): TestRunInfo | null {
    return this.state.test;
  }

  /** 지금 단계에서 명령 묶음별 사용 가능 여부 */
  availability(): TestAvailability {
    const none = '테스트 런에서만 쓸 수 있습니다';
    const { phase, act, totalActs, test } = this.state;
    if (!test) return { edit: none, move: none, battle: none, nextAct: none, bossCamp: none, boss: none };
    const bossReasons = this.bossJumpReasons();
    return {
      edit: EDIT_PHASES.includes(phase) ? null : '맵·전투 준비·야영지 단계에서만 쓸 수 있습니다 (전투 중·보상·상점·이벤트·액트 전환 중에는 불가)',
      move: MOVE_PHASES.includes(phase) ? null : '맵·전투 준비·상점·이벤트·야영지 단계에서만 쓸 수 있습니다',
      battle: phase === 'battlePrep' || phase === 'battle' ? null : '전투 준비 또는 전투 중에만 쓸 수 있습니다',
      nextAct: act >= totalActs ? '마지막 액트입니다 (다음 액트가 없음)' : null,
      ...bossReasons,
    };
  }

  /**
   * 보스 이동 두 버튼의 위치별 사유. 야영지 경유(viaCamp)는 보스 직전 야영지(보스 바로 앞 노드)까지 아직 가지 않았을 때만 의미가 있다.
   * 이미 그 야영지 안이거나 지나왔으면 "보스 전투 준비로"와 같은 결과가 되므로 거부해 버튼 이름과 동작을 일치시킨다.
   */
  private bossJumpReasons(): Pick<TestAvailability, 'bossCamp' | 'boss'> {
    const { currentNodeId, map } = this.state;
    if (currentNodeId === map.bossNode.id) {
      const atBoss = '이미 보스 노드에 있습니다';
      return { bossCamp: atBoss, boss: atBoss };
    }
    const path = this.pathTo(map.bossNode);
    if (!path) {
      const none = '현재 위치에서 보스로 이어지는 길이 없습니다';
      return { bossCamp: none, boss: none };
    }
    return { bossCamp: path.length >= 2 ? null : '이미 보스 직전 야영지에 있거나 지나왔습니다 ("보스 전투 준비로"를 쓰세요)', boss: null };
  }

  // ---- 시작 구성 ----

  /** 설정을 검증한다. 틀리면 Error(한국어). 런을 만들기 전에 부른다 */
  validateSetup(setup: TestRunSetup): void {
    const { commanders, relics, units } = this.deps;
    const commanderId = setup.commanderId ?? RUN.DEFAULT_COMMANDER_ID;
    if (!commanders.get(commanderId)) throw new Error(`알 수 없는 지휘관 "${commanderId}"`);
    if (setup.startAct !== undefined && !isInt(setup.startAct, 1, RUN.ACTS.COUNT)) throw new Error(`시작 액트는 1~${RUN.ACTS.COUNT}의 정수여야 합니다`);
    if (setup.startPosition !== undefined && !TEST_START_POSITIONS.includes(setup.startPosition)) throw new Error('시작 위치는 액트 처음 또는 보스 직전이어야 합니다');
    if (setup.gold !== undefined && !isInt(setup.gold, 0, TEST_LIMITS.GOLD_MAX)) throw new Error(`골드는 0~${TEST_LIMITS.GOLD_MAX}의 정수여야 합니다`);
    if (setup.level !== undefined && !isInt(setup.level, MANAGEMENT.START_LEVEL, MANAGEMENT.MAX_LEVEL)) {
      throw new Error(`레벨은 ${MANAGEMENT.START_LEVEL}~${MANAGEMENT.MAX_LEVEL}의 정수여야 합니다`);
    }
    if (setup.maxHp !== undefined && !isInt(setup.maxHp, 1, TEST_LIMITS.HP_MAX)) throw new Error(`최대 HP는 1~${TEST_LIMITS.HP_MAX}의 정수여야 합니다`);
    if (setup.hp !== undefined && !isInt(setup.hp, 1, setup.maxHp ?? TEST_LIMITS.HP_MAX)) throw new Error(`현재 HP는 1 이상 최대 HP 이하의 정수여야 합니다`);
    const seen = new Set<string>();
    for (const id of setup.relics ?? []) {
      if (!relics.get(id)) throw new Error(`알 수 없는 유물 "${id}"`);
      if (seen.has(id)) throw new Error(`같은 유물을 두 번 고를 수 없습니다 ("${id}")`);
      seen.add(id);
    }
    for (const spec of setup.cards ?? []) this.assertCardSpec(spec, commanderId);
    for (const spec of setup.units ?? []) {
      const def = units.get(spec.unitId);
      if (!def || def.boss) throw new Error(`받을 수 없는 유닛 "${spec.unitId}"`);
      if (spec.star !== undefined && !isInt(spec.star, 1, 3)) throw new Error('유닛 성급은 1~3이어야 합니다');
      if (spec.place !== undefined && spec.place !== 'board' && spec.place !== 'bench') throw new Error('유닛 위치는 보드 또는 벤치여야 합니다');
    }
  }

  /**
   * 새로 만든 일반 런(액트 1 시작 직후)에 설정을 적용한다. 호출 전에 state.test가 정해져 있어야 한다.
   * 순서: 레벨 → 이전 액트·시작 위치 → 유닛 → 유물 → 카드 → 골드 → HP (HP는 유물의 최대 HP 보정 뒤에 덮어쓴다)
   */
  build(setup: TestRunSetup): void {
    const info = this.state.test;
    if (!info) throw new Error('테스트 런 표시가 없습니다');
    const { forces, health } = this.state;
    if (setup.level !== undefined) this.expect(forces.management.setLevel(setup.level));
    for (let act = 1; act < info.startAct; act++) this.clearActBehind(act);
    if (info.startPosition === 'bossGate') {
      const path = this.pathTo(this.state.map.bossNode) as MapNode[];
      for (const node of path.slice(0, -1)) this.markPassed(node);
    }
    for (const spec of setup.units ?? []) {
      this.expect(forces.management.addOwnedUnit(spec.unitId, (spec.star ?? 1) as 1 | 2 | 3, spec.place ?? 'bench'));
    }
    for (const id of setup.relics ?? []) this.hooks.acquireRelic(id);
    for (const spec of setup.cards ?? []) for (let i = 0; i < (spec.count ?? 1); i++) forces.addCard(spec.cardId, spec.upgraded === true);
    if (setup.gold !== undefined) this.applyGold(setup.gold);
    if (setup.maxHp !== undefined || setup.hp !== undefined) {
      const max = setup.maxHp ?? health.max;
      const hp = setup.hp ?? (setup.maxHp !== undefined ? max : health.hp);
      health.setValues(max, Math.min(hp, max));
    }
  }

  // ---- 런 중 명령: 값 ----

  setGold(amount: number): RunResult {
    return this.edit(() => {
      if (!isInt(amount, 0, TEST_LIMITS.GOLD_MAX)) return fail(`골드는 0~${TEST_LIMITS.GOLD_MAX}의 정수여야 합니다`);
      this.applyGold(amount);
      return OK;
    });
  }

  addGold(amount: number): RunResult {
    return this.edit(() => {
      if (!isInt(amount, 1, TEST_LIMITS.GOLD_MAX)) return fail(`추가할 골드는 1~${TEST_LIMITS.GOLD_MAX}의 정수여야 합니다`);
      const total = this.state.forces.economy.gold + amount;
      if (total > TEST_LIMITS.GOLD_MAX) return fail(`골드는 ${TEST_LIMITS.GOLD_MAX}을 넘을 수 없습니다`);
      this.state.forces.economy.gain(amount);
      return OK;
    });
  }

  /** 지휘관 현재·최대 HP를 정한다. maxHp를 생략하면 현재 최대 HP 유지 */
  setHp(hp: number, maxHp?: number): RunResult {
    return this.edit(() => {
      const max = maxHp ?? this.state.health.max;
      if (!isInt(max, 1, TEST_LIMITS.HP_MAX)) return fail(`최대 HP는 1~${TEST_LIMITS.HP_MAX}의 정수여야 합니다`);
      if (!isInt(hp, 1, max)) return fail(`현재 HP는 1 이상 최대 HP(${max}) 이하의 정수여야 합니다`);
      this.state.health.setValues(max, hp);
      return OK;
    });
  }

  setLevel(level: number): RunResult {
    return this.edit(() => this.state.forces.management.setLevel(level));
  }

  // ---- 런 중 명령: 유물·카드·유닛 ----

  addRelic(relicId: string): RunResult {
    return this.edit(() => {
      const def = this.deps.relics.get(relicId);
      if (!def) return fail('알 수 없는 유물입니다');
      if (this.state.forces.relics.has(relicId)) return fail(`이미 가진 유물입니다: ${def.name}`);
      this.hooks.acquireRelic(relicId);
      return OK;
    });
  }

  /** 유물을 뺀다. 최대 HP 증가 유물이면 그만큼 최대 HP(와 넘치는 현재 HP)를 줄인다 */
  removeRelic(relicId: string): RunResult {
    return this.edit(() => {
      const { forces, health } = this.state;
      if (!forces.relics.has(relicId)) return fail('가지고 있지 않은 유물입니다');
      const def = forces.relics.remove(relicId);
      const lost = def.effects.reduce((sum, e) => (e.kind === 'maxHp' ? sum + e.amount : sum), 0);
      if (lost > 0) {
        const max = Math.max(1, health.max - lost);
        health.setValues(max, Math.min(Math.max(1, health.hp), max));
      }
      forces.syncRelicEffects();
      return OK;
    });
  }

  addCard(cardId: string, upgraded = false, count = 1): RunResult {
    return this.edit(() => {
      try {
        this.assertCardSpec({ cardId, upgraded, count }, this.state.commanderId);
      } catch (e) {
        return fail((e as Error).message);
      }
      for (let i = 0; i < count; i++) this.state.forces.addCard(cardId, upgraded);
      return OK;
    });
  }

  /** 덱에서 카드 1장 제거 (유닛 제공 카드 제외, 상점 제거 횟수·가격에는 영향 없음) */
  removeCard(instanceId: number): RunResult {
    return this.edit(() => {
      if (!removableCards(this.state.forces.deck).some((card) => card.instanceId === instanceId)) return fail('제거할 수 없는 카드입니다');
      this.state.forces.removeCard(instanceId);
      return OK;
    });
  }

  grantUnit(unitId: string, star = 1, place: 'board' | 'bench' = 'bench'): RunResult {
    return this.edit(() => {
      if (!isInt(star, 1, 3)) return fail('유닛 성급은 1~3이어야 합니다');
      return this.state.forces.management.addOwnedUnit(unitId, star as 1 | 2 | 3, place);
    });
  }

  // ---- 런 중 명령: 위치·전투 ----

  /**
   * 지금 액트의 보스로 간다. viaCamp면 보스 직전 야영지에 입장(야영지 단계)하고, 아니면 바로 보스 전투 준비.
   * 중간 노드는 지나온 것으로 기록한다 (전투·정예는 승리 기록, 이벤트는 이벤트 id).
   */
  jumpToBoss(viaCamp: boolean): RunResult {
    const blocked = this.requireMovePhase('보스로 이동');
    if (blocked) return blocked;
    const a = this.availability();
    const reason = viaCamp ? a.bossCamp : a.boss;
    if (reason) return fail(reason);
    const path = this.pathTo(this.state.map.bossNode) as MapNode[];
    this.leaveCurrentNode();
    const stop = viaCamp ? path.length - 2 : path.length - 1;
    for (const node of path.slice(0, stop)) this.markPassed(node);
    this.hooks.visitNode(path[stop] as MapNode);
    return OK;
  }

  /**
   * 지금 액트의 보스를 쓰러뜨린 것으로 하고 다음 액트로 넘어간다 (마지막 액트면 거부).
   * withBossRelic이면 보스 유물 선택 화면(후보가 없으면 바로 액트 소개), 아니면 곧바로 액트 소개 — 지휘관 HP 회복도 실제와 같다.
   */
  skipToNextAct(withBossRelic: boolean): RunResult {
    const blocked = this.requireMovePhase('다음 액트로 이동');
    if (blocked) return blocked;
    const last = this.availability().nextAct;
    if (last) return fail(last);
    const atBoss = this.state.currentNodeId === this.state.map.bossNode.id;
    const path = atBoss ? [] : this.pathTo(this.state.map.bossNode);
    if (!path) return fail('현재 위치에서 보스로 이어지는 길이 없습니다');
    this.leaveCurrentNode(atBoss);
    for (const node of path) this.markPassed(node);
    this.hooks.clearActBoss(withBossRelic);
    return OK;
  }

  /**
   * 지금 전투 노드의 전투를 강제로 끝내고 일반 정산 경로(completeBattle)로 정산한다.
   * 전투 준비·전투 중 모두 가능. 화면에서 재생 중인 전투를 끝낼 때는 화면 쪽이 같은 forceCombatResult를 그 시뮬에 쓴다.
   */
  forceBattleResult(result: ForcedResult): SettleResult {
    const blocked = this.availability().battle;
    if (blocked) return fail(blocked);
    const sim = this.hooks.createSimulator();
    if (this.state.phase === 'battlePrep') {
      const begun = this.hooks.beginBattle();
      if (!begun.ok) return begun;
    }
    forceCombatResult(sim, result);
    return this.hooks.completeBattle(sim);
  }

  // ---- 내부 ----

  /**
   * 지금 노드 화면(상점·이벤트·야영지·전투 준비)을 떠나 맵 단계로 돌아간다.
   * 전투 준비 중이던 노드는 이긴 것으로 기록한다 (일반·정예는 승리 1건, 보스는 승리를 한 건 더하는 건 beatBoss일 때만).
   */
  private leaveCurrentNode(beatBoss = false): void {
    const s = this.state;
    if (s.phase === 'map') return;
    const node = s.currentNodeId === null ? undefined : s.map.node(s.currentNodeId);
    if (s.phase === 'battlePrep' && node && (node.type !== 'boss' || beatBoss)) this.recordWin(node);
    this.hooks.toMap();
  }

  private recordWin(node: MapNode): void {
    const s = this.state;
    s.history.push({
      nodeId: node.id, floor: node.floor, type: node.type, outcome: 'win', endTime: 0, cardsUsed: 0,
      hpAfter: s.health.hp, goldAfter: s.forces.economy.gold,
    });
  }

  /** 테스트 런이고 편집 가능한 단계일 때만 동작을 실행한다 */
  private edit(action: () => RunResult): RunResult {
    if (!this.state.test) return fail('테스트 런에서만 쓸 수 있습니다');
    const blocked = this.availability().edit;
    return blocked ? fail(blocked) : action();
  }

  private requireMovePhase(what: string): RunResult | null {
    const blocked = this.availability().move;
    return blocked ? fail(what === '' ? blocked : `${what}: ${blocked}`) : null;
  }

  private expect(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) throw new Error(result.reason);
  }

  private applyGold(target: number): void {
    const economy = this.state.forces.economy;
    if (target >= economy.gold) economy.gain(target - economy.gold);
    else economy.spend(economy.gold - target);
  }

  private assertCardSpec(spec: TestCardSpec, commanderId: string): void {
    const def = this.deps.cards.get(spec.cardId);
    if (!def) throw new Error(`알 수 없는 카드 "${spec.cardId}"`);
    if (def.owner !== 'neutral' && def.owner !== commanderId) throw new Error(`다른 지휘관의 고유 카드는 넣을 수 없습니다 ("${spec.cardId}")`);
    if (spec.upgraded === true && !def.upgrade) throw new Error(`카드 "${spec.cardId}"에는 강화 버전이 없습니다`);
    if (spec.count !== undefined && !isInt(spec.count, 1, TEST_LIMITS.CARD_COUNT_MAX)) throw new Error(`카드 장수는 1~${TEST_LIMITS.CARD_COUNT_MAX}의 정수여야 합니다`);
  }

  /**
   * 현재 위치(없으면 지금 맵의 시작 노드들)에서 목표 노드까지 간선을 따라가는 경로 (현재 위치 제외, 목표 포함).
   * 현재 노드가 지난 액트의 것이면 지금 맵의 1층부터 센다.
   */
  private pathTo(target: MapNode): MapNode[] | null {
    const map = this.state.map;
    const here = this.state.currentNodeId === null ? undefined : map.node(this.state.currentNodeId);
    const search = (node: MapNode): MapNode[] | null => {
      if (node.id === target.id) return [node];
      if (node.floor >= target.floor) return null;
      for (const next of map.nextNodes(node.id)) {
        const rest = search(next);
        if (rest) return [node, ...rest];
      }
      return null;
    };
    for (const first of here ? map.nextNodes(here.id) : map.startNodes()) {
      const path = search(first);
      if (path) return path;
    }
    return null;
  }

  /** 노드를 거쳐 온 것으로 기록한다 (입장 처리 없이): 전투·정예·보스는 승리 기록, 이벤트는 이벤트 id */
  private markPassed(node: MapNode): void {
    const s = this.state;
    s.visited.push(node.id);
    s.currentNodeId = node.id;
    if (node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
      this.recordWin(node);
    } else if (node.type === 'event') {
      s.seenEvents.push(this.hooks.pickEvent(node.id, s.seenEvents));
    }
  }

  /** 시작 전에 지나간 액트 하나: 보스까지 지나온 것으로 기록하고 다음 액트의 맵을 붙인다 */
  private clearActBehind(act: number): void {
    const path = this.pathTo(this.state.map.bossNode) as MapNode[];
    for (const node of path) this.markPassed(node);
    this.state.maps.push(new MapGenerator().generate(this.state.seed, act + 1));
  }
}
