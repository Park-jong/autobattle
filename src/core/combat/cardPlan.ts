import type { CardCatalog } from '../data/cardLoader';
import { DataValidationError } from '../data/errors';
import { FieldReader } from '../data/fieldReader';
import type { PlayTarget } from './cardCommand';
import type { CombatResult, CombatSimulator } from './sim';
import type { CombatUnit } from './unit';

/**
 * 카드 사용 계획: 사람이 직접 하지 않는 헤드리스 시뮬(tools/sim, 이후 카드 유무 비교)용 단순 규칙.
 *
 * 계획 JSON = 항목 배열.
 *   { "tick": 50, "card": "focus_fire", "target": { "rule": "lowestHpEnemy" } }
 * - tick: 이 틱부터 시도한다. 실패하면(CP 부족 등) until까지 매 틱 다시 시도한다.
 * - card: 카드 id. 손패에서 아직 계획에 쓰이지 않은 같은 카드 한 장을 고른다. 손패에 없으면 즉시 실패.
 * - target.rule: 대상 규칙 (생략하면 none). 규칙이 가리키는 진영의 유닛 중 정렬 순서대로 필요한 수만큼 고른다.
 *     none / lowestHpEnemy / highestHpEnemy / lowestHpAlly / highestHpAlly
 *     (칸을 지정하는 카드는 고른 첫 유닛의 칸을 쓴다)
 * - until: 이 틱까지만 시도 (생략하면 전투 끝까지)
 * 작전(operation) 카드는 tick과 무관하게 준비 단계에서 한 번 시도한다.
 */
export const TARGET_RULES = ['none', 'lowestHpEnemy', 'highestHpEnemy', 'lowestHpAlly', 'highestHpAlly'] as const;
export type TargetRule = (typeof TARGET_RULES)[number];

export interface PlanEntry {
  tick: number;
  card: string;
  rule: TargetRule;
  until: number;
}

/** 계획 실행 통계. failed = 끝내 사용하지 못한 항목 수 */
export interface PlanStats {
  played: number;
  failed: number;
  /** 실패 사유별 항목 수 */
  failureReasons: Record<string, number>;
}

/** 계획 JSON(배열)을 검증해 항목 목록으로 바꾼다 */
export function parseCardPlan(data: unknown, label = 'plan'): PlanEntry[] {
  if (!Array.isArray(data)) throw new DataValidationError(label, '항목 배열이어야 함');
  return data.map((raw, i) => {
    const r = FieldReader.of(raw, `${label}[${i}]`);
    r.onlyKeys(['tick', 'card', 'target', 'until']);
    let rule: TargetRule = 'none';
    if (r.has('target')) {
      const t = r.object('target');
      t.onlyKeys(['rule']);
      rule = t.enum('rule', TARGET_RULES);
    }
    return {
      tick: r.int('tick', 0),
      card: r.string('card'),
      rule,
      until: r.has('until') ? r.int('until', 0) : Infinity,
    };
  });
}

type EntryState = { phase: 'waiting' } | { phase: 'done' } | { phase: 'failed'; reason: string };

/**
 * 계획대로 시뮬을 직접 진행하며 카드를 쓴다. 시뮬의 공개 API(playCard/step)만 사용하므로
 * 결과 이벤트 로그와 commandLog는 UI에서 사람이 쓴 것과 같은 방식으로 기록된다.
 */
export class CardPlanRunner {
  private readonly states: EntryState[];
  private readonly entries: readonly PlanEntry[];
  /** 항목에 배정된 카드 인스턴스 (같은 카드를 여러 항목이 쓰면 서로 다른 장을 배정) */
  private readonly assigned = new Map<number, number>();
  private played = 0;
  private lastReason = new Map<number, string>();

  constructor(
    private readonly sim: CombatSimulator,
    private readonly catalog: CardCatalog,
    plan: readonly PlanEntry[],
  ) {
    for (const entry of plan) {
      if (!catalog.get(entry.card)) throw new Error(`계획에 알 수 없는 카드 "${entry.card}"`);
    }
    // 틱 순서(같은 틱은 입력 순서)로 처리해 카드 배정이 결정적이도록 정렬
    this.entries = plan.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || a.i - b.i).map((x) => x.e);
    this.states = this.entries.map(() => ({ phase: 'waiting' }));
  }

  /** 계획을 끝까지 실행하고 전투 결과와 통계를 반환 */
  run(): { result: CombatResult; stats: PlanStats } {
    this.playOperations();
    this.sim.startCombat();
    while (!this.sim.finished) {
      this.playDue();
      this.sim.step();
    }
    return { result: this.sim.result(), stats: this.stats() };
  }

  /** 준비 단계: 작전 카드 항목을 한 번씩 시도 */
  private playOperations(): void {
    this.entries.forEach((entry, i) => {
      if (this.catalog.get(entry.card)?.type !== 'operation') return;
      this.attempt(i, entry);
      if (this.states[i]?.phase === 'waiting') this.fail(i, this.lastReason.get(i) ?? '사용하지 못함');
    });
  }

  /** 현재 틱에 시도할 차례가 된 항목을 시도 */
  private playDue(): void {
    const tick = this.sim.world.tick;
    this.entries.forEach((entry, i) => {
      if (this.states[i]?.phase !== 'waiting') return;
      if (this.catalog.get(entry.card)?.type === 'operation') return;
      if (tick < entry.tick) return;
      if (tick > entry.until) return this.fail(i, this.lastReason.get(i) ?? '시도 기한이 지남');
      this.attempt(i, entry);
    });
  }

  private attempt(index: number, entry: PlanEntry): void {
    const instance = this.sim.deck?.hand.find((c) => c.cardId === entry.card && !this.isAssignedToOther(c.instanceId, index));
    if (!instance) return this.fail(index, '손패에 없는 카드');
    this.assigned.set(instance.instanceId, index);

    const target = this.buildTarget(entry);
    if (!target) {
      this.lastReason.set(index, '규칙에 맞는 대상이 없음');
      return;
    }
    const result = this.sim.playCard(instance.instanceId, target);
    if (result.ok) {
      this.states[index] = { phase: 'done' };
      this.played += 1;
    } else {
      this.lastReason.set(index, result.reason);
    }
  }

  private isAssignedToOther(instanceId: number, index: number): boolean {
    const owner = this.assigned.get(instanceId);
    return owner !== undefined && owner !== index;
  }

  private fail(index: number, reason: string): void {
    this.states[index] = { phase: 'failed', reason };
  }

  /** 카드의 target.kind와 규칙으로 대상 지정값을 만든다. 만들 수 없으면 null */
  private buildTarget(entry: PlanEntry): PlayTarget | null {
    const card = this.catalog.get(entry.card);
    if (!card) return null;
    const kind = card.target.kind;
    if (kind === 'none') return { kind: 'none' };
    if (entry.rule === 'none') return null;

    const enemy = entry.rule === 'lowestHpEnemy' || entry.rule === 'highestHpEnemy';
    const lowest = entry.rule === 'lowestHpEnemy' || entry.rule === 'lowestHpAlly';
    const world = this.sim.world;
    const pool = enemy ? world.enemiesOf(0) : world.alliesOf(0);
    const sorted = [...pool].sort((a: CombatUnit, b: CombatUnit) => (lowest ? a.hp - b.hp : b.hp - a.hp) || a.uid - b.uid);

    if (kind === 'allyUnit' || kind === 'enemyUnit') {
      const first = sorted[0];
      return first ? { kind: 'unit', uid: first.uid } : null;
    }
    if (kind === 'allyUnits') {
      const count = card.target.count ?? 1;
      if (sorted.length < count) return null;
      return { kind: 'units', uids: sorted.slice(0, count).map((u) => u.uid) };
    }
    const first = sorted[0];
    return first ? { kind: 'cell', cell: first.cell } : null;
  }

  private stats(): PlanStats {
    const failureReasons: Record<string, number> = {};
    let failed = 0;
    this.states.forEach((state, i) => {
      if (state.phase === 'done') return;
      failed += 1;
      const reason = state.phase === 'failed' ? state.reason : (this.lastReason.get(i) ?? '전투가 끝날 때까지 사용하지 못함');
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
    });
    return { played: this.played, failed, failureReasons };
  }
}
