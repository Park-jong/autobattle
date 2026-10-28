import { resolveEffect, type ResolvedEffect } from '../data/effect';
import type { CommanderUltimate } from '../data/commander';
import { BOARD_COLS, BOARD_ROWS, chebyshev, type Cell } from './board';
import { ULTIMATE_COMMAND_ID } from './cardCommand';
import type { PlayResult } from './cardCommand';
import type { CombatPhase } from './cardPlayer';
import type { CombatCommandPoints } from './combatCp';
import type { CommanderHpLedger } from './commanderHp';
import { COMBAT, ULTIMATE } from './constants';
import type { EffectExecutor } from './effects';
import type { CombatWorld } from './world';

/** UI가 그리는 궁극기 상태 */
export interface UltimateView {
  commanderId: string;
  name: string;
  text: string;
  charge: number;
  max: number;
  used: boolean;
  /** 지금 쓰면 잃는 지휘관 HP (0이면 소모 없음) */
  hpCost: number;
  /** 지금 쓸 수 있는가 */
  ready: boolean;
  /** 쓸 수 없는 이유 (한국어, ready면 null) */
  reason: string | null;
}

/** 아직 떨어지지 않은 운석 */
interface PendingImpact {
  id: number;
  tick: number;
  cell: Cell;
}

/**
 * 지휘관 궁극기: 게이지(아군 사망·카드 사용으로 충전) → 가득 차면 전투당 1회 사용.
 * 사용 즉시 효과(공통 효과 실행기) + 지휘관 HP 소모(카드 HP 비용과 같은 장부) + CP 가속 + 운석 연타를 처리한다.
 * 운석 지점은 사용 시 sim Rng로 골라 예고(ultimateTelegraph)하고, 간격이 지나면 착탄(ultimateImpact)한다.
 * 게이지 변화는 이벤트로 남기지 않는다(사용하지 않으면 로그가 궁극기 도입 전과 같다). UI는 view()로 읽는다.
 */
export class UltimateSystem {
  private chargeValue = 0;
  private usedValue = false;
  private nextImpactId = 1;
  private pending: PendingImpact[] = [];

  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
    private readonly def: CommanderUltimate,
    private readonly commanderId: string,
    private readonly ledger: CommanderHpLedger,
    private readonly cp: CombatCommandPoints,
    /** 충전 배율 (유물). 1 = 보정 없음 */
    private readonly chargeMult: number,
  ) {}

  /** 충전 트리거를 설치한다 (카드 사용, 아군 사망) */
  install(): void {
    this.world.bus.on('onCardPlay', () => this.charge(ULTIMATE.CARD_CHARGE));
    this.world.bus.on('onDeath', ({ unit }) => {
      if (unit.side === 0 && !unit.temporary) this.charge(ULTIMATE.ALLY_DEATH_CHARGE);
    });
  }

  private charge(base: number): void {
    if (this.usedValue) return;
    this.chargeValue = Math.min(ULTIMATE.GAUGE_MAX, this.chargeValue + Math.round(base * this.chargeMult));
  }

  /** 지금 쓰면 잃는 지휘관 HP: 장부의 남은 HP(런 현재 HP)의 hpCostPct%를 올림. HP를 추적하지 않는 전투는 0 */
  hpCost(): number {
    if (!this.def.hpCostPct || !this.ledger.tracked) return 0;
    return Math.ceil((this.ledger.remaining * this.def.hpCostPct) / 100);
  }

  view(phase: CombatPhase): UltimateView {
    const reason = this.blocker(phase);
    return {
      commanderId: this.commanderId,
      name: this.def.name,
      text: this.def.text,
      charge: this.chargeValue,
      max: ULTIMATE.GAUGE_MAX,
      used: this.usedValue,
      hpCost: this.hpCost(),
      ready: reason === null,
      reason,
    };
  }

  private blocker(phase: CombatPhase): string | null {
    if (phase === 'ended') return '전투가 이미 끝났습니다';
    if (this.usedValue) return '궁극기는 전투당 1회만 사용할 수 있습니다';
    if (phase !== 'combat') return '궁극기는 전투 중에만 사용할 수 있습니다';
    if (this.chargeValue < ULTIMATE.GAUGE_MAX) return `궁극기 게이지가 부족합니다 (${this.chargeValue}/${ULTIMATE.GAUGE_MAX})`;
    const cost = this.hpCost();
    if (cost > 0 && !this.ledger.canSpend(cost)) {
      return `지휘관 HP가 부족합니다 (필요 ${cost}, 사용 후 1 이상 남아야 함, 사용 가능 ${this.ledger.remaining})`;
    }
    return null;
  }

  /** 궁극기를 쓴다. 실패하면 상태·로그가 전혀 바뀌지 않는다 */
  use(phase: CombatPhase): PlayResult {
    const reason = this.blocker(phase);
    if (reason) return { ok: false, reason };
    const world = this.world;
    const cost = this.hpCost();
    const effects: ResolvedEffect[] = (this.def.effects ?? []).map((e) => resolveEffect(e, 0));

    this.usedValue = true;
    if (cost > 0) {
      this.ledger.spend(cost);
      world.emit({ type: 'commanderHp', delta: -cost, remaining: this.ledger.remaining, cardId: `ultimate:${this.commanderId}`, instanceId: ULTIMATE_COMMAND_ID });
    }
    const durations = effects.flatMap((e) => ('duration' in e && typeof e.duration === 'number' ? [e.duration] : []));
    const boost = this.def.cpRegenBoostSeconds ?? 0;
    world.emit({
      type: 'ultimateUsed',
      commanderId: this.commanderId,
      name: this.def.name,
      durationSeconds: Math.max(0, boost, ...durations),
    });
    this.executor.execute(effects, { side: 0, caster: null, targets: [] });
    if (boost > 0) this.cp.boostUntil(world.tick + boost * COMBAT.TICKS_PER_SECOND);
    this.scheduleBarrage();
    return { ok: true, cp: this.cp.amount('combat'), pool: 'combat' };
  }

  /** 이번 틱에 착탄할 운석을 처리한다. 하나라도 떨어졌으면 true (피해로 전투가 끝났는지 확인하라는 뜻) */
  advance(): boolean {
    const barrage = this.def.barrage;
    if (!barrage || this.pending.length === 0) return false;
    const due = this.pending.filter((p) => p.tick <= this.world.tick);
    if (due.length === 0) return false;
    this.pending = this.pending.filter((p) => p.tick > this.world.tick);
    const effects = barrage.effects.map((e) => resolveEffect(e, 0));
    for (const impact of due) {
      this.world.emit({ type: 'ultimateImpact', id: impact.id, cell: impact.cell, radius: barrage.radius });
      this.executor.execute(effects, { side: 0, caster: null, targets: [], area: { cell: impact.cell, radius: barrage.radius } });
    }
    return true;
  }

  // ---- 운석 ----

  private scheduleBarrage(): void {
    const barrage = this.def.barrage;
    if (!barrage) return;
    const world = this.world;
    const cells = this.pickBarrageCells(barrage.count, barrage.radius);
    cells.forEach((cell, i) => {
      const delayTicks = Math.round((i + 1) * barrage.intervalSeconds * COMBAT.TICKS_PER_SECOND);
      const id = this.nextImpactId++;
      this.pending.push({ id, tick: world.tick + delayTicks, cell });
      world.emit({ type: 'ultimateTelegraph', id, cell, radius: barrage.radius, fireAt: (world.tick + delayTicks) / COMBAT.TICKS_PER_SECOND });
    });
  }

  /**
   * 적이 가장 많이 겹치는 칸(반경 radius 안의 적 수) 순으로 후보를 만들고, 앞에서 BARRAGE_POOL개 중 Rng로 하나씩 고른다.
   * 이미 고른 지점과 BARRAGE_MIN_SPACING칸 이상 떨어진 후보를 우선하고, 없으면 간격 제한 없이 고른다.
   * 적이 없으면(전투 종료 직전) 빈 목록.
   */
  private pickBarrageCells(count: number, radius: number): Cell[] {
    const enemies = this.world.enemiesOf(0);
    const scored: { cell: Cell; hits: number }[] = [];
    for (let col = 0; col < BOARD_COLS; col++) {
      for (let row = 0; row < BOARD_ROWS; row++) {
        const cell = { col, row };
        const hits = enemies.filter((e) => chebyshev(e.cell, cell) <= radius).length;
        if (hits > 0) scored.push({ cell, hits });
      }
    }
    // 같은 밀집도는 적진 깊은 쪽(열 큰 쪽), 위쪽 행 먼저로 고정해 Rng 입력이 항상 같게 한다
    scored.sort((a, b) => b.hits - a.hits || b.cell.col - a.cell.col || a.cell.row - b.cell.row);
    if (scored.length === 0) return [];
    const chosen: Cell[] = [];
    for (let i = 0; i < count; i++) {
      const spaced = scored.filter((s) => chosen.every((c) => chebyshev(c, s.cell) >= ULTIMATE.BARRAGE_MIN_SPACING));
      const pool = (spaced.length > 0 ? spaced : scored).slice(0, ULTIMATE.BARRAGE_POOL);
      chosen.push(this.world.rng.pick(pool).cell);
    }
    return chosen;
  }
}
