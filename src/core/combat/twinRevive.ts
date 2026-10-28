import type { TwinRevivePattern } from '../data/unit';
import { nearestFreeCell } from './board';
import { COMBAT } from './constants';
import type { CombatUnit } from './unit';
import type { CombatWorld } from './world';

/**
 * 쌍둥이 부활 (쌍둥이 주술사 세르·미르). 한 쌍에 하나씩 설치된다.
 *
 * - 한쪽이 죽으면 reviveTelegraph 이벤트로 남은 시간을 알리고, 죽은 틱부터 windowSeconds 뒤(틱 번호 기준)에 짝이 아직 살아 있으면
 *   죽은 쪽이 최대 HP의 reviveHpPct%로 되살아난다 (revive 이벤트: 상태 초기화, 원래 칸 또는 가까운 빈 칸).
 *   부활 틱의 시작(onTick)에 판정하므로 그 틱에 쓰는 카드는 부활보다 먼저 처리된다 — 둘 다 3초 안에 처치해야 한다.
 * - 짝도 제한 시간 안에 죽으면 예약된 부활이 취소되고(reviveCancel) 둘 다 영구히 처치된다. 같은 틱에 둘이 죽어도 같다.
 * - 부활 시점에 진영에 빈 칸이 없으면 부활하지 못하고 reviveCancel(reason: 'noCell')을 내며 영구히 처치된 것으로 남는다.
 * - 부활한 쌍둥이가 다시 죽으면 같은 규칙이 되풀이된다. 전멸 판정은 시뮬의 기본 규칙(살아 있는 유닛 수)을 따른다.
 * Rng를 쓰지 않아 결정론이다.
 */
export class TwinReviveRunner {
  /** 부활 대기 중인 쌍둥이 uid → 부활 틱 */
  private readonly pending = new Map<number, number>();

  constructor(
    private readonly world: CombatWorld,
    private readonly a: CombatUnit,
    private readonly b: CombatUnit,
    private readonly pattern: TwinRevivePattern,
  ) {}

  install(): void {
    this.world.bus.on('onDeath', ({ unit }) => this.onDeath(unit));
    this.world.bus.on('onTick', ({ tick }) => this.onTick(tick));
  }

  private get windowTicks(): number {
    return Math.round(this.pattern.windowSeconds * COMBAT.TICKS_PER_SECOND);
  }

  private partnerOf(unit: CombatUnit): CombatUnit {
    return unit === this.a ? this.b : this.a;
  }

  private onDeath(unit: CombatUnit): void {
    if (unit !== this.a && unit !== this.b) return;
    const partner = this.partnerOf(unit);
    if (partner.alive) {
      const reviveTick = this.world.tick + this.windowTicks;
      this.pending.set(unit.uid, reviveTick);
      this.world.emit({ type: 'reviveTelegraph', unit: unit.uid, partner: partner.uid, fireAt: reviveTick / COMBAT.TICKS_PER_SECOND });
    } else if (this.pending.delete(partner.uid)) {
      this.world.emit({ type: 'reviveCancel', unit: partner.uid });
    }
  }

  private onTick(tick: number): void {
    for (const [uid, reviveTick] of [...this.pending]) {
      if (tick < reviveTick) continue;
      this.pending.delete(uid);
      const unit = uid === this.a.uid ? this.a : this.b;
      if (unit.alive || !this.partnerOf(unit).alive) continue;
      const cell = nearestFreeCell(this.world.board, unit.cell, unit.side);
      if (!cell) {
        // 진영에 빈 칸이 없으면 부활하지 못한다: 대기 표시를 UI가 정리하도록 취소 이벤트(사유 포함)를 낸다
        this.world.emit({ type: 'reviveCancel', unit: uid, reason: 'noCell' });
        continue;
      }
      this.world.revive(unit, (unit.maxHp * this.pattern.reviveHpPct) / 100, cell);
    }
  }
}
