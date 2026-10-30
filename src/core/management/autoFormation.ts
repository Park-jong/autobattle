import { COMBAT } from '../combat/constants';
import { BOARD_ROWS, HALF_COLS, type Cell } from '../combat/board';
import type { TraitCatalog } from '../data/traitLoader';
import type { UnitCatalog } from '../data/unitLoader';
import type { UnitDef } from '../data/unit';
import type { ManagementSnapshot, OwnedUnit, RosterPlacement } from './management';

interface Candidate {
  unit: OwnedUnit;
  def: UnitDef;
  strength: number;
  frontline: boolean;
  rear: boolean;
  traits: number[];
}

/** Deterministic recommendation from owned units only. At most C(18,9) teams are scored. */
export function buildAutoFormation(state: ManagementSnapshot, units: UnitCatalog, traits: TraitCatalog): RosterPlacement[] {
  const traitIndex = new Map(traits.traits.map((trait, index) => [trait.id, index]));
  const candidates: Candidate[] = [...state.board, ...state.bench.filter((unit): unit is OwnedUnit => unit !== null)]
    .sort((a, b) => a.id - b.id)
    .flatMap(unit => {
      const def = units.get(unit.unitId);
      if (!def || def.boss) return [];
      const stats = def.stats;
      const mult = COMBAT.STAR_MULTIPLIER[unit.star - 1] ?? 1;
      return [{
        unit, def,
        strength: (stats.hp / 30 + stats.atk * stats.as / 3 + stats.arm / 5 + stats.res / 5 + def.tier * 12) * mult + unit.equipment.length * 20,
        frontline: def.job === 'guardian' || stats.rng <= 1 && !['assassin', 'mystic'].includes(def.job),
        rear: stats.rng >= 3 || def.job === 'mystic',
        traits: [...new Set([def.origin, def.job])].flatMap(id => traitIndex.has(id) ? [traitIndex.get(id)!] : []),
      }];
    });
  const size = Math.min(state.level, candidates.length);
  if (size === 0) return [];
  const counts = traits.traits.map(() => 0);
  const types = new Map<string, number>();
  const selection: Candidate[] = [];
  let best: Candidate[] = [];
  let bestScore = -Infinity;
  let bestRetained = -1;
  const synergyValue = [0, 50, 135, 245];

  const search = (start: number, strength: number, frontline: number, rear: number, retained: number): void => {
    if (selection.length === size) {
      // Trait membership counts distinct unit types, exactly as combat does.
      let score = strength + types.size * 8;
      traits.traits.forEach((trait, index) => {
        const tier = trait.thresholds.filter(threshold => counts[index]! >= threshold).length;
        score += synergyValue[tier] ?? 0;
      });
      if (size >= 3) score += (frontline > 0 ? 25 : -30) + (rear > 0 ? 15 : 0);
      if (score > bestScore + 1e-8 || Math.abs(score - bestScore) < 1e-8 && retained > bestRetained) {
        best = [...selection]; bestScore = score; bestRetained = retained;
      }
      return;
    }
    const remaining = size - selection.length;
    for (let i = start; i <= candidates.length - remaining; i++) {
      const candidate = candidates[i]!;
      const count = types.get(candidate.unit.unitId) ?? 0;
      types.set(candidate.unit.unitId, count + 1);
      if (count === 0) candidate.traits.forEach(index => { counts[index]!++; });
      selection.push(candidate);
      search(i + 1, strength + candidate.strength, frontline + Number(candidate.frontline), rear + Number(candidate.rear), retained + Number(candidate.unit.cell !== null));
      selection.pop();
      if (count === 0) {
        types.delete(candidate.unit.unitId);
        candidate.traits.forEach(index => { counts[index]!--; });
      } else types.set(candidate.unit.unitId, count);
    }
  };
  search(0, 0, 0, 0, 0);

  const taken = new Set<string>();
  return best.sort((a, b) => Number(b.frontline) - Number(a.frontline) || b.strength - a.strength || a.unit.id - b.unit.id)
    .map(candidate => {
      const assassin = candidate.def.job === 'assassin';
      const cols = candidate.frontline ? [3, 2, 1, 0] : assassin ? [2, 3, 1, 0] : candidate.def.stats.rng >= 3 ? [1, 0, 2, 3] : [2, 1, 0, 3];
      const rows = assassin ? [0, 4, 1, 3, 2] : candidate.frontline ? [2, 1, 3, 0, 4] : [1, 3, 0, 4, 2];
      const cell = cols.flatMap(col => rows.map(row => ({ col, row })))
        .find(cell => cell.col < HALF_COLS && cell.row < BOARD_ROWS && !taken.has(`${cell.col}:${cell.row}`)) as Cell;
      taken.add(`${cell.col}:${cell.row}`);
      return { id: candidate.unit.id, cell };
    });
}
