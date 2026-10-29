import type { ResolvedEffect } from '../data/effect';
import { BOARD_COLS, BOARD_ROWS, chebyshev, type Cell, type Side } from './board';
import { COMBAT } from './constants';
import type { CombatWorld } from './world';

type DamageZoneEffect = Extract<ResolvedEffect, { kind: 'damageZone' }>;

interface Zone {
  id: number;
  side: Side;
  center: Cell;
  radius: number;
  amount: number;
  dmgType: DamageZoneEffect['dmgType'];
  intervalTicks: number;
  startTick: number;
  /** 마지막 피해 틱(포함) */
  lastTick: number;
}

/**
 * 지속 범위 피해 장판(카드 화염 지대). 설치한 칸 범위에 시작 틱부터 intervalSeconds마다 고정 피해를 주고
 * duration초가 지나면 사라진다 (첫 피해는 한 간격 뒤). 장판은 칸에 묶여 그 칸 안에 있는 적이 피해를 입는다.
 * 설치는 `zoneStart`, 피해 순간은 `zonePulse`(이어서 damage 이벤트)로 남는다. 시전자가 없고 Rng를 쓰지 않는다.
 */
export class GroundZones {
  private zones: Zone[] = [];
  private nextId = 1;

  constructor(private readonly world: CombatWorld) {
    world.bus.on('onTick', ({ tick }) => this.onTick(tick));
  }

  install(side: Side, area: { cell: Cell; radius: number }, effect: DamageZoneEffect): void {
    const world = this.world;
    const intervalTicks = Math.max(1, Math.round(effect.intervalSeconds * COMBAT.TICKS_PER_SECOND));
    const durationTicks = Math.max(intervalTicks, Math.round(effect.duration * COMBAT.TICKS_PER_SECOND));
    const zone: Zone = {
      id: this.nextId++,
      side,
      center: area.cell,
      radius: area.radius,
      amount: effect.amount,
      dmgType: effect.dmgType,
      intervalTicks,
      startTick: world.tick,
      lastTick: world.tick + durationTicks,
    };
    this.zones.push(zone);
    world.emit({
      type: 'zoneStart',
      id: zone.id,
      cells: this.cellsOf(zone),
      endAt: zone.lastTick / COMBAT.TICKS_PER_SECOND,
      intervalSeconds: effect.intervalSeconds,
    });
  }

  private onTick(tick: number): void {
    if (this.zones.length === 0) return;
    for (const zone of this.zones) {
      const elapsed = tick - zone.startTick;
      if (elapsed <= 0 || elapsed % zone.intervalTicks !== 0 || tick > zone.lastTick) continue;
      this.world.emit({ type: 'zonePulse', id: zone.id });
      for (const target of this.world.enemiesOf(zone.side)) {
        if (chebyshev(target.cell, zone.center) > zone.radius) continue;
        this.world.dealDamage({ source: null, target, raw: zone.amount, type: zone.dmgType });
      }
    }
    this.zones = this.zones.filter((zone) => zone.lastTick > tick);
  }

  private cellsOf(zone: Zone): Cell[] {
    const cells: Cell[] = [];
    for (let col = zone.center.col - zone.radius; col <= zone.center.col + zone.radius; col++) {
      for (let row = zone.center.row - zone.radius; row <= zone.center.row + zone.radius; row++) {
        if (col >= 0 && col < BOARD_COLS && row >= 0 && row < BOARD_ROWS) cells.push({ col, row });
      }
    }
    return cells;
  }
}
