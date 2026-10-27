import { FieldReader } from '../data/fieldReader';
import type { UnitCatalog } from '../data/unitLoader';
import { isInOwnHalf, type Cell, type Side } from './board';

export type StarLevel = 1 | 2 | 3;

/** 편성 한 칸: 유닛 종류, 성급, 보드 절대 좌표(열 0~7, 행 0~4) */
export interface FormationEntry {
  unitId: string;
  star: StarLevel;
  cell: Cell;
}

export type Formation = readonly FormationEntry[];

/** JSON({ name?, units: [{ unitId, star, col, row }] })을 편성으로 변환한다. */
export function parseFormation(data: unknown, label = 'formation'): FormationEntry[] {
  const root = FieldReader.of(data, label);
  root.onlyKeys(['name', 'units']);
  return root.array('units').map((raw, i) => {
    const r = FieldReader.of(raw, `${label}.units[${i}]`);
    r.onlyKeys(['unitId', 'star', 'col', 'row']);
    const star = r.int('star', 1);
    if (star > 3) r.fail('star', `1~3이어야 함 (실제: ${star})`);
    return { unitId: r.string('unitId'), star: star as StarLevel, cell: { col: r.int('col', 0), row: r.int('row', 0) } };
  });
}

/** 편성 검증: 존재하는 유닛, 성급 1~3, 자기 진영 영역 안, 칸 중복 없음. 위반 시 한국어 Error */
export function assertFormationValid(side: Side, formation: Formation, units: UnitCatalog): void {
  const seen = new Set<string>();
  formation.forEach((entry, i) => {
    const where = `진영 ${side} 편성[${i}]`;
    if (!units.get(entry.unitId)) throw new Error(`${where}: 알 수 없는 유닛 "${entry.unitId}"`);
    if (![1, 2, 3].includes(entry.star)) throw new Error(`${where}: 성급은 1~3이어야 함 (실제: ${entry.star})`);
    if (!isInOwnHalf(side, entry.cell)) {
      throw new Error(`${where}: 칸 (${entry.cell.col},${entry.cell.row})이 진영 ${side} 영역 밖`);
    }
    const key = `${entry.cell.col},${entry.cell.row}`;
    if (seen.has(key)) throw new Error(`${where}: 칸 (${key})이 중복됨`);
    seen.add(key);
  });
}
