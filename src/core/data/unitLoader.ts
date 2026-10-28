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
  checkPatternReferences(units);
  return new UnitCatalog(units);
}

/** 보스 패턴이 참조하는 유닛(쌍둥이 짝, 증원 유닛)이 실제로 있고 서로 맞는지 확인한다 */
function checkPatternReferences(units: readonly UnitDef[]): void {
  const byId = new Map(units.map((u) => [u.id, u]));
  units.forEach((unit, index) => {
    const pattern = unit.pattern;
    const path = `units[${index}] (${unit.id}).pattern`;
    if (pattern?.kind === 'twinRevive') {
      const partner = byId.get(pattern.partner);
      if (!partner) throw new DataValidationError(`${path}.partner`, `units.json에 없는 유닛 id "${pattern.partner}"`);
      if (partner.id === unit.id) throw new DataValidationError(`${path}.partner`, '자기 자신을 짝으로 쓸 수 없음');
      if (partner.pattern?.kind !== 'twinRevive' || partner.pattern.partner !== unit.id) {
        throw new DataValidationError(`${path}.partner`, `"${partner.id}"의 twinRevive 짝이 이 유닛("${unit.id}")이어야 함`);
      }
    }
    if (pattern?.kind === 'phaseSummon') {
      pattern.phases.forEach((phase, p) => phase.summon.forEach((entry, i) => {
        const target = byId.get(entry.unitId);
        const where = `${path}.phases[${p}].summon[${i}].unitId`;
        if (!target) throw new DataValidationError(where, `units.json에 없는 유닛 id "${entry.unitId}"`);
        if (target.boss) throw new DataValidationError(where, `보스 유닛 "${entry.unitId}"는 증원으로 쓸 수 없음`);
      }));
    }
  });
}
