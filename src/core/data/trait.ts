import type { EffectDef } from './effect';

export const TRAIT_KINDS = ['origin', 'job'] as const;
export type TraitKind = (typeof TRAIT_KINDS)[number];

export interface TraitDef {
  id: string;
  name: string;
  kind: TraitKind;
  /** 단계 진입에 필요한 서로 다른 유닛 종류 수 (오름차순 3개) */
  thresholds: [number, number, number];
  text: string;
  /** 수치 배열은 [1단계, 2단계, 3단계]. 없으면 아직 효과가 구현되지 않은 특성 */
  effects?: EffectDef[];
}

export interface TraitFile {
  version: number;
  traits: TraitDef[];
}
