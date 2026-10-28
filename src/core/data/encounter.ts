/** 적 편성 데이터 타입 (data/encounters.json). 형식은 data/README.md 기준. */

export const ENCOUNTER_KINDS = ['normal', 'elite', 'boss'] as const;
export type EncounterKind = (typeof ENCOUNTER_KINDS)[number];

/** 적 진영(열 4~7) 배치 한 칸 */
export interface EncounterUnit {
  unitId: string;
  star: 1 | 2 | 3;
  col: number;
  row: number;
}

export interface EncounterDef {
  id: string;
  name: string;
  kind: EncounterKind;
  /** 이 편성이 나올 수 있는 층 범위 (포함) */
  minFloor: number;
  maxFloor: number;
  /** 미리보기에 보여줄 한 줄 설명 */
  text: string;
  units: EncounterUnit[];
}

export interface EncounterFile {
  version: number;
  encounters: EncounterDef[];
}
