import type { PhaseSummonPattern } from '../data/unit';
import type { UnitCatalog } from '../data/unitLoader';
import { nearestFreeCell } from './board';
import type { StatScale, CombatUnit } from './unit';
import type { CombatWorld } from './world';

/**
 * 페이즈 소환 (군단의 군주). 보스 한 기에 하나씩 설치된다.
 *
 * - 보스 HP가 최대 HP의 phase.hpPct% 이하가 되면 다음 페이즈로 넘어간다. 피해를 받은 즉시가 아니라
 *   다음 틱 시작(onTick)에 처리하므로 한 번의 광역 피해·카드 처리 도중에 상태가 바뀌지 않는다.
 *   한 번에 여러 임계치를 넘으면 같은 틱에 순서대로 모두 처리한다. 보스가 죽었으면 전환하지 않는다.
 * - 전환 때: bossPhase 이벤트 → 증원 spawn 이벤트들(적 보정 배율 적용, temporary: 패배 피해·생존 집계에서 제외, 칸이 차 있으면 가까운 빈 칸)
 *   → 상대 진영 모든 유닛의 버프 해제(dispel 이벤트, StatusSet.dispelBuffs 규칙).
 * Rng를 쓰지 않아 결정론이다.
 */
export class PhaseSummonRunner {
  private phase = 1;

  constructor(
    private readonly world: CombatWorld,
    private readonly boss: CombatUnit,
    private readonly pattern: PhaseSummonPattern,
    private readonly units: UnitCatalog,
    private readonly scale: StatScale,
  ) {}

  install(): void {
    this.world.bus.on('onTick', () => this.onTick());
  }

  private onTick(): void {
    if (!this.boss.alive) return;
    for (;;) {
      const next = this.pattern.phases[this.phase - 1];
      if (!next || this.boss.hp > (this.boss.maxHp * next.hpPct) / 100) return;
      this.phase += 1;
      this.transition(next, this.phase);
    }
  }

  private transition(phase: PhaseSummonPattern['phases'][number], number: number): void {
    const world = this.world;
    // bossPhase 이벤트는 증원·해제 결과를 담아야 하므로 자리를 먼저 만들고 채운다
    const index = world.events.length;
    world.emit({ type: 'bossPhase', unit: this.boss.uid, phase: number, hpPct: phase.hpPct, summoned: [], dispelled: 0 });
    const summoned: number[] = [];
    for (const entry of phase.summon) {
      const def = this.units.get(entry.unitId);
      if (!def) throw new Error(`알 수 없는 유닛 "${entry.unitId}"`);
      const cell = nearestFreeCell(world.board, { col: entry.col, row: entry.row }, this.boss.side);
      if (!cell) continue;
      summoned.push(world.spawn(def, this.boss.side, cell, true, { star: entry.star, scale: this.scale }).uid);
    }
    let dispelled = 0;
    for (const unit of world.enemiesOf(this.boss.side)) {
      const statuses = unit.statuses.dispelBuffs();
      if (statuses.length === 0) continue;
      dispelled += 1;
      world.emit({ type: 'dispel', unit: unit.uid, statuses });
    }
    const event = world.events[index];
    if (event?.type === 'bossPhase') world.events[index] = { ...event, summoned, dispelled };
  }
}
