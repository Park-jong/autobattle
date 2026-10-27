import { DataValidationError } from './errors';
import type { UnitDef } from './unit';
import { UnitValidator } from './unitValidator';
import type { TraitCatalog } from './traitLoader';

/** 검증된 유닛 모음. id로 조회한다. */
export class UnitCatalog {
  private readonly byId: Map<string, UnitDef>;

  constructor(readonly units: readonly UnitDef[]) {
    this.byId = new Map(units.map((u) => [u.id, u]));
  }

  get size(): number {
    return this.units.length;
  }

  get(id: string): UnitDef | undefined {
    return this.byId.get(id);
  }
}

/**
 * 이미 파싱된 JSON 객체를 검증해 UnitCatalog로 만든다.
 * traits를 주면 각 유닛의 origin/job이 실제 특성 id이며 종류(origin/job)가 맞는지도 확인한다.
 */
export function loadUnits(
  data: unknown,
  traits?: TraitCatalog,
  validator: UnitValidator = new UnitValidator(),
): UnitCatalog {
  const units = validator.validateFile(data).units;
  if (traits) {
    units.forEach((unit, index) => {
      for (const [field, kind] of [['origin', 'origin'], ['job', 'job']] as const) {
        const traitId = unit[field];
        const trait = traits.get(traitId);
        const path = `units[${index}] (${unit.id}).${field}`;
        if (!trait) throw new DataValidationError(path, `traits.json에 없는 특성 id "${traitId}"`);
        if (trait.kind !== kind) {
          throw new DataValidationError(path, `특성 "${traitId}"의 종류가 ${trait.kind}라서 ${kind} 자리에 쓸 수 없음`);
        }
      }
    });
  }
  return new UnitCatalog(units);
}
