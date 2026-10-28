import type { UnitPattern } from '../data/unit';
import { BOARD_ROWS, type Cell, type Side } from './board';
import { COMBAT } from './constants';
import type { EffectExecutor } from './effects';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

interface PendingStrike {
  id: number;
  fireTick: number;
  cells: Cell[];
}

/**
 * 보스 열 강타 패턴 (성문 파괴자). 한 보스 유닛에 하나씩 설치된다.
 *
 * - 발동 시각(초) = 간격 × k (k = 1, 2, …). 발동 telegraphSeconds 전에 대상 열을 예고한다 (telegraph 이벤트).
 * - 대상 열 = 상대 진영 살아 있는 유닛이 가장 많은 열. 동수면 보스에 더 가까운 열.
 *   예고 시점에 열이 정해지고, 발동 시 그 열의 칸에 서 있는 유닛만 맞는다 — 예고 중에 진형 교대 등으로
 *   빠져나가거나 피해 감소 카드를 쓰면 대응할 수 있다.
 * - 피해는 공통 효과 flatDamage(시전자 = 보스)로 적용하므로 받는 피해 배율·보호막·ARM/RES가 그대로 반영된다.
 * - 보스가 죽으면 예약된 발동은 취소된다. 기절해도 패턴은 계속된다.
 * 모든 판정은 틱 번호 기준이라 결정론이다 (Rng 미사용).
 */
export class ColumnStrikeRunner {
  private pending: PendingStrike | null = null;
  private nextStrikeId = 1;

  constructor(
    private readonly world: CombatWorld,
    private readonly executor: EffectExecutor,
    private readonly boss: CombatUnit,
    private readonly pattern: UnitPattern,
  ) {}

  install(): void {
    this.world.bus.on('onTick', ({ tick }) => this.onTick(tick));
  }

  private get intervalTicks(): number {
    return Math.round(this.pattern.intervalSeconds * COMBAT.TICKS_PER_SECOND);
  }

  private get telegraphTicks(): number {
    return Math.round(this.pattern.telegraphSeconds * COMBAT.TICKS_PER_SECOND);
  }

  private onTick(tick: number): void {
    if (!this.boss.alive) {
      this.pending = null;
      return;
    }
    if (this.pending && tick === this.pending.fireTick) {
      this.fire(this.pending);
      this.pending = null;
      return;
    }
    // 다음 발동(간격의 배수)의 예고 시점인지
    const untilFire = this.intervalTicks - (tick % this.intervalTicks);
    if (!this.pending && untilFire === this.telegraphTicks) this.telegraph(tick + untilFire);
  }

  private telegraph(fireTick: number): void {
    const opponent: Side = this.boss.side === 0 ? 1 : 0;
    const counts = new Map<number, number>();
    for (const unit of this.world.alliesOf(opponent)) counts.set(unit.cell.col, (counts.get(unit.cell.col) ?? 0) + 1);
    let column: number | null = null;
    for (const [col, count] of counts) {
      const best = column === null ? 0 : (counts.get(column) ?? 0);
      const closer = column !== null && count === best && (opponent === 0 ? col > column : col < column);
      if (column === null || count > best || closer) column = col;
    }
    if (column === null) return;
    const col = column;
    const cells: Cell[] = Array.from({ length: BOARD_ROWS }, (_, row) => ({ col, row }));
    const strike: PendingStrike = { id: this.nextStrikeId++, fireTick, cells };
    this.pending = strike;
    this.world.emit({ type: 'telegraph', id: strike.id, source: this.boss.uid, pattern: this.pattern.kind, cells, fireAt: fireTick / COMBAT.TICKS_PER_SECOND });
  }

  private fire(strike: PendingStrike): void {
    this.world.emit({ type: 'strike', id: strike.id, source: this.boss.uid, cells: strike.cells });
    const col = strike.cells[0]?.col;
    const targets = this.world.enemiesOf(this.boss.side).filter((u) => u.cell.col === col);
    this.executor.execute(
      [{ kind: 'flatDamage', selector: 'target', amount: this.pattern.damage, dmgType: this.pattern.dmgType }],
      { side: this.boss.side, caster: this.boss, targets },
    );
  }
}
