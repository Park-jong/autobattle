import cardsJson from '../../data/cards.json';
import commandersJson from '../../data/commanders.json';
import encountersJson from '../../data/encounters.json';
import eventsJson from '../../data/events.json';
import migrationsJson from '../../data/migrations.json';
import relicsJson from '../../data/relics.json';
import traitsJson from '../../data/traits.json';
import unitsJson from '../../data/units.json';
import { parseFormation, type FormationEntry } from '../core/combat';
import { loadRunDeps, type RunDeps } from '../core/run';
import type { CardCatalog, CommanderCatalog, TraitCatalog, UnitCatalog } from '../core/data';
import formationA from '../../tools/formations/a.json';
import formationB from '../../tools/formations/b.json';
import hartenStart from '../../tools/formations/harten-start.json';
import iseraStart from '../../tools/formations/isera-start.json';
import noxStart from '../../tools/formations/nox-start.json';
import series1 from '../../tools/formations/series-1.json';
import series2 from '../../tools/formations/series-2.json';
import series3 from '../../tools/formations/series-3.json';
import series4 from '../../tools/formations/series-4.json';
import series5 from '../../tools/formations/series-5.json';
import type { GauntletStage } from './live/Gauntlet';

/** 검증이 끝난 게임 데이터 */
export interface GameData {
  cards: CardCatalog;
  traits: TraitCatalog;
  units: UnitCatalog;
  commanders: CommanderCatalog;
  /** 디버그 화면 시작 시 불러둘 기본 편성 [아군, 적] */
  defaultFormations: readonly [FormationEntry[], FormationEntry[]];
  /** 처음 선택할 지휘관 id. DEFAULT_COMMANDER_ID가 지휘관·카드 데이터에 없으면 null */
  defaultCommanderId: string | null;
  /** 지휘관 id → 시작 유닛 편성 ("시작 편성 불러오기") */
  startFormations: ReadonlyMap<string, readonly FormationEntry[]>;
  /** 5연전의 고정 적 편성 (점점 강해지는 순서) */
  seriesStages: readonly GauntletStage[];
  /** 런 코어가 쓰는 검증된 데이터 (적 편성·이벤트 포함). 위 카탈로그와 같은 인스턴스를 공유한다 */
  run: RunDeps;
}

/** 디버그 화면을 처음 열 때 선택되어 있는 지휘관 (데이터에 없으면 지휘관 없음으로 떨어진다) */
export const DEFAULT_COMMANDER_ID = 'cmd_harten';

/**
 * 보드의 유닛 약자(2글자). 띄어쓰기가 있는 이름은 앞 두 단어의 첫 글자("잿불 점화사" → "잿점"),
 * 한 단어면 앞 두 글자("방패병" → "방패"). 30종 중 "잿불"·"심연"·"군단"으로 시작하는 이름이 많아 구분하려는 규칙이다.
 */
export function unitAbbreviation(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return words.slice(0, 2).map((w) => [...w][0] ?? '').join('');
  return [...name.replace(/\s+/g, '')].slice(0, 2).join('');
}

const SERIES_FILES: readonly unknown[] = [series1, series2, series3, series4, series5];

/** data/*.json을 검증해 읽는다. 검증 실패 시 DataValidationError 등 한국어 메시지 Error를 던진다. */
export function loadGameData(): GameData {
  // 런 코어와 같은 검증을 한 번만 거쳐 카탈로그를 공유한다 (유닛·카드 참조, 적 편성 층 커버리지 포함)
  const run = loadRunDeps({
    traits: traitsJson, units: unitsJson, cards: cardsJson, commanders: commandersJson, encounters: encountersJson, events: eventsJson, relics: relicsJson, migrations: migrationsJson,
  });
  const { traits, units, cards, commanders } = run;
  const seriesStages = SERIES_FILES.map((raw, i) => {
    const label = `5연전 ${i + 1}전 편성`;
    const enemy = parseFormation(raw, label);
    return { name: ((raw as { name?: string }).name ?? label).replace(/^5연전 \d전: /, ''), enemy };
  });
  return {
    cards,
    traits,
    units,
    commanders,
    defaultFormations: [parseFormation(formationA, '기본 아군 편성'), parseFormation(formationB, '기본 적 편성')],
    defaultCommanderId: commanders.get(DEFAULT_COMMANDER_ID) ? DEFAULT_COMMANDER_ID : null,
    startFormations: new Map([
      ['cmd_harten', parseFormation(hartenStart, '하르텐 시작 편성')],
      ['cmd_isera', parseFormation(iseraStart, '이세라 시작 편성')],
      ['cmd_nox', parseFormation(noxStart, '녹스 시작 편성')],
    ]),
    seriesStages,
    run,
  };
}
