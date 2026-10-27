/** 전투 테스트 공용 도우미 (실제 data/*.json 사용). 프로덕션 코드에서는 쓰지 않는다. */
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { loadTraits, loadUnits, type UnitCatalog } from '../data';
import type { CombatEvent } from './events';
import type { FormationEntry, StarLevel } from './formation';
import { CombatSimulator } from './sim';
import type { CombatUnit } from './unit';
import cardsJson from '../../../data/cards.json';
import commandersJson from '../../../data/commanders.json';
import { Rng } from '../rng';
import type { CardInstance } from '../cards/cardInstance';
import type { DeckSnapshot } from '../cards/deck';
import { loadCards, loadCommanders, type CardCatalog, type CommanderDef } from '../data';
import type { CardCommand } from './cardCommand';

export const traits = loadTraits(traitsJson);
export const units: UnitCatalog = loadUnits(unitsJson, traits);

/** [유닛 id, 성급, 열, 행] */
export type Placement = readonly [string, StarLevel, number, number];

export function formation(placements: readonly Placement[]): FormationEntry[] {
  return placements.map(([unitId, star, col, row]) => ({ unitId, star, cell: { col, row } }));
}

export function makeSim(
  a: readonly Placement[],
  b: readonly Placement[],
  seed = 1,
  catalog: UnitCatalog = units,
): CombatSimulator {
  return new CombatSimulator({ seed, formations: [formation(a), formation(b)] }, catalog, traits);
}

/** 조건이 참이 되거나 maxTicks가 지날 때까지 진행. 참이 되었는지 반환 */
export function stepUntil(sim: CombatSimulator, done: () => boolean, maxTicks = 1000): boolean {
  for (let i = 0; i < maxTicks && !sim.finished; i++) {
    if (done()) return true;
    sim.step();
  }
  return done();
}

export function stepTicks(sim: CombatSimulator, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.step();
}

export function eventsOf<T extends CombatEvent['type']>(
  sim: CombatSimulator,
  type: T,
): Extract<CombatEvent, { type: T }>[] {
  return sim.world.events.filter((e): e is Extract<CombatEvent, { type: T }> => e.type === type);
}

export function unitOf(sim: CombatSimulator, uid: number): CombatUnit {
  const unit = sim.world.unitByUid(uid);
  if (!unit) throw new Error(`유닛 ${uid} 없음`);
  return unit;
}

/** 마나를 가득 채워 다음 행동에서 스킬이 나가게 한다 */
export function fillMana(sim: CombatSimulator, uid: number): void {
  const unit = unitOf(sim, uid);
  sim.world.setMana(unit, unit.maxMana);
}

// ---- 카드 시스템 테스트 도우미 ----

export const cardCatalog: CardCatalog = loadCards(cardsJson, traits);
export const commanders = loadCommanders(commandersJson, cardCatalog, units);
export const harten: CommanderDef = (() => {
  const found = commanders.get('cmd_harten');
  if (!found) throw new Error('cmd_harten 없음');
  return found;
})();

/** 지정한 카드들이 손패에 (인스턴스 id 1, 2, 3 … 순서로) 들어 있는 덱 상태. draw 등 나머지는 비어 있음 */
export function handSnapshot(cardIds: readonly string[], upgraded: readonly number[] = []): DeckSnapshot {
  const hand: CardInstance[] = cardIds.map((cardId, i) => ({ instanceId: i + 1, cardId, upgraded: upgraded.includes(i + 1) }));
  return { nextInstanceId: hand.length + 1, draw: [], hand, discard: [], exhaust: [], rngState: 1 };
}

export interface CardSimOptions {
  a?: readonly Placement[];
  b?: readonly Placement[];
  seed?: number;
  hand?: readonly string[];
  upgraded?: readonly number[];
  commander?: CommanderDef | null;
  commands?: readonly CardCommand[];
  catalog?: CardCatalog;
  unitCatalog?: UnitCatalog;
  deck?: DeckSnapshot;
}

/** 기본 편성: 아군 방패병(3,1) 방패병(3,3) 투기장 신병(2,2) vs 적 방패병(4,2) 석궁병(6,2) */
export const CARD_A: readonly Placement[] = [
  ['iron_shieldbearer', 1, 3, 1],
  ['iron_shieldbearer', 1, 3, 3],
  ['arena_recruit', 1, 2, 2],
];
export const CARD_B: readonly Placement[] = [
  ['iron_shieldbearer', 1, 4, 2],
  ['legion_crossbow', 1, 6, 2],
];

export function makeCardSim(options: CardSimOptions = {}): CombatSimulator {
  const catalog = options.catalog ?? cardCatalog;
  return new CombatSimulator(
    {
      seed: options.seed ?? 1,
      formations: [formation(options.a ?? CARD_A), formation(options.b ?? CARD_B)],
      cards: {
        commander: options.commander === undefined ? null : options.commander,
        deck: options.deck ?? handSnapshot(options.hand ?? [], options.upgraded),
        ...(options.commands ? { commands: options.commands } : {}),
      },
    },
    options.unitCatalog ?? units,
    traits,
    catalog,
  );
}

export const newRng = (seed = 1): Rng => new Rng(seed);

export function cpEvents(sim: CombatSimulator) {
  return eventsOf(sim, 'cp');
}
