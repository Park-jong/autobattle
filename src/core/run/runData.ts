import { assertUnitCardReferences } from '../cards';
import {
  loadCards, loadCommanders, loadEncounters, loadEvents, loadRelics, loadTraits, loadUnits,
} from '../data';
import { RUN } from './constants';
import { globalFloor } from './runMap';
import type { RunDeps } from './runController';

/** 파싱만 된 data/*.json (파일 읽기는 호출하는 쪽 책임) */
export interface RawRunData {
  traits: unknown;
  units: unknown;
  cards: unknown;
  commanders: unknown;
  encounters: unknown;
  events: unknown;
  relics: unknown;
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * 런 코어가 쓰는 데이터를 한꺼번에 검증해 읽는다. 적 편성은 모든 액트의 모든 층(액트마다 전투 1~11층, 정예 4~11층, 보스 13층)에
 * 쓸 후보가 있는지도 확인한다. 편성의 층 범위는 전체 층(= (액트 − 1) × 13 + 층)이다. 검증 실패는 위치가 담긴 한국어 DataValidationError.
 */
export function loadRunDeps(raw: RawRunData): RunDeps {
  const traits = loadTraits(raw.traits);
  const units = loadUnits(raw.units, traits);
  const cards = loadCards(raw.cards, traits);
  assertUnitCardReferences(units, cards);
  const commanders = loadCommanders(raw.commanders, cards, units);
  const { ELITE_MIN_FLOOR, CAMP_FLOOR, BOSS_FLOOR } = RUN.MAP;
  const acts = range(1, RUN.ACTS.COUNT);
  const encounters = loadEncounters(raw.encounters, units, {
    normalFloors: acts.flatMap((act) => range(1, CAMP_FLOOR - 1).map((floor) => globalFloor(act, floor))),
    eliteFloors: acts.flatMap((act) => range(ELITE_MIN_FLOOR, CAMP_FLOOR - 1).map((floor) => globalFloor(act, floor))),
    bossFloors: acts.map((act) => globalFloor(act, BOSS_FLOOR)),
    floorsPerAct: RUN.MAP.FLOORS,
  });
  const events = loadEvents(raw.events, cards, units);
  const relics = loadRelics(raw.relics);
  return { units, traits, cards, commanders, encounters, events, relics };
}
