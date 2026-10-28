import type { EncounterDef, EncounterKind } from './encounter';
import { EncounterValidator } from './encounterValidator';
import { DataValidationError } from './errors';
import type { UnitCatalog } from './unitLoader';

/** 맵의 층 구성에 대한 커버리지 요구: 이 (전체) 층들에는 해당 종류 편성이 반드시 하나 이상 있어야 한다. 3액트는 액트 단위로 층을 나열한다 */
export interface EncounterCoverage {
  normalFloors: readonly number[];
  eliteFloors: readonly number[];
  bossFloors: readonly number[];
  /** 액트당 층 수. 주면 층 번호를 전체 층(= (액트 − 1) × 층 수 + 층)으로 보고, 오류 메시지에 액트와 액트 안 층을 함께 적는다 */
  floorsPerAct?: number;
}

/** 검증된 적 편성 모음 */
export class EncounterCatalog {
  private readonly byId: Map<string, EncounterDef>;

  constructor(readonly encounters: readonly EncounterDef[]) {
    this.byId = new Map(encounters.map((e) => [e.id, e]));
  }

  get size(): number {
    return this.encounters.length;
  }

  get(id: string): EncounterDef | undefined {
    return this.byId.get(id);
  }

  /** 종류와 층에 맞는 후보 (파일 순서) */
  candidates(kind: EncounterKind, floor: number): EncounterDef[] {
    return this.encounters.filter((e) => e.kind === kind && floor >= e.minFloor && floor <= e.maxFloor);
  }
}

/**
 * 이미 파싱된 JSON 객체를 검증해 EncounterCatalog로 만든다.
 * 유닛 id가 실제로 있는지, coverage를 주면 해당 층마다 후보가 있는지도 확인한다.
 */
export function loadEncounters(
  data: unknown,
  units: UnitCatalog,
  coverage?: EncounterCoverage,
  validator: EncounterValidator = new EncounterValidator(),
): EncounterCatalog {
  const encounters = validator.validateFile(data).encounters;
  encounters.forEach((encounter, index) => {
    encounter.units.forEach((unit, i) => {
      if (!units.get(unit.unitId)) {
        throw new DataValidationError(`encounters[${index}] (${encounter.id}).units[${i}].unitId`, `units.json에 없는 유닛 id "${unit.unitId}"`);
      }
    });
  });
  const catalog = new EncounterCatalog(encounters);
  if (coverage) {
    const check = (kind: EncounterKind, floors: readonly number[]): void => {
      for (const floor of floors) {
        if (catalog.candidates(kind, floor).length === 0) {
          const per = coverage.floorsPerAct;
          const act = per ? Math.ceil(floor / per) : 1;
          const where = per && act > 1 ? `전체 ${floor}층(액트 ${act} ${floor - (act - 1) * per}층)` : `${floor}층`;
          throw new DataValidationError('encounters', `${where}에 쓸 ${kind} 편성이 없음`);
        }
      }
    };
    check('normal', coverage.normalFloors);
    check('elite', coverage.eliteFloors);
    check('boss', coverage.bossFloors);
  }
  return catalog;
}
