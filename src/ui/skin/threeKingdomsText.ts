import unitData from '../../../data/units.json';
import type { SkinId } from './skins';
import { THREE_KINGDOMS_CHARACTERS } from './threeKingdomsRoster';

const names: readonly [string, string][] = [
  ...unitData.units.map<[string, string]>(unit => [unit.name, THREE_KINGDOMS_CHARACTERS[unit.id]?.name ?? unit.name]),
  ['세르', '이각'], ['미르', '곽사'], ['쌍둥이 부활', '서량 결의'], ['군단 소집', '옥새의 군령'],
].sort((a, b) => b[0]!.length - a[0]!.length) as [string, string][];

/** 규칙 설명의 수치는 보존하고 삼국지 표시명만 입힌다. */
export function skinNarrative(skin: SkinId, text: string): string {
  if (skin !== 'three_kingdoms') return text;
  return names.reduce((value, [original, replacement]) => value.split(original).join(replacement), text);
}
