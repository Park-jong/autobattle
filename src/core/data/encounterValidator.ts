import { isInOwnHalf } from '../combat/board';
import { ENCOUNTER_KINDS, type EncounterDef, type EncounterFile, type EncounterUnit } from './encounter';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';

const ENCOUNTER_KEYS = ['id', 'name', 'kind', 'minFloor', 'maxFloor', 'text', 'units'] as const;

/** encounters.json 구조를 검증한다. 유닛 id 참조와 층 커버리지는 loadEncounters가 확인한다. 파일 I/O는 하지 않는다. */
export class EncounterValidator {
  validateFile(data: unknown): EncounterFile {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'encounters']);
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const encounters = root.array('encounters').map((raw, index) => {
      const encounter = this.validateEncounter(raw, index);
      const prev = seen.get(encounter.id);
      if (prev !== undefined) {
        throw new DataValidationError(`encounters[${index}] (${encounter.id}).id`, `중복된 id "${encounter.id}" (encounters[${prev}]와 동일)`);
      }
      seen.set(encounter.id, index);
      return encounter;
    });
    return { version, encounters };
  }

  private validateEncounter(raw: unknown, index: number): EncounterDef {
    let path = `encounters[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(ENCOUNTER_KEYS);
    const minFloor = r.int('minFloor', 1);
    const maxFloor = r.int('maxFloor', 1);
    if (maxFloor < minFloor) r.fail('maxFloor', `minFloor(${minFloor}) 이상이어야 함 (실제: ${maxFloor})`);
    const units = this.validateUnits(r);
    return { id: r.string('id'), name: r.string('name'), kind: r.enum('kind', ENCOUNTER_KINDS), minFloor, maxFloor, text: r.string('text'), units };
  }

  private validateUnits(parent: FieldReader): EncounterUnit[] {
    const list = parent.array('units');
    if (list.length === 0) parent.fail('units', '유닛이 최소 1기 필요함');
    const cells = new Set<string>();
    return list.map((raw, i) => {
      const r = FieldReader.of(raw, `${parent.path}.units[${i}]`);
      r.onlyKeys(['unitId', 'star', 'col', 'row']);
      const star = r.int('star', 1);
      if (star > 3) r.fail('star', `1~3이어야 함 (실제: ${star})`);
      const col = r.int('col', 0);
      const row = r.int('row', 0);
      if (!isInOwnHalf(1, { col, row })) r.fail('col', `칸 (${col},${row})이 적 진영(열 4~7, 행 0~4) 밖`);
      const key = `${col},${row}`;
      if (cells.has(key)) r.fail('col', `칸 (${key})이 중복됨`);
      cells.add(key);
      return { unitId: r.string('unitId'), star: star as 1 | 2 | 3, col, row };
    });
  }
}
