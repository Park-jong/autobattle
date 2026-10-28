/**
 * 플레이 테스트 도구의 표시 정보를 만드는 순수 함수 모음 (Phaser·DOM 비의존).
 * 시작 화면의 "테스트 시작" 패널이 쓰는 선택지 목록(TestCatalogView)과, 런 중 "테스트 도구" 패널이 쓰는 현재 상태(TestToolsView).
 */
import { removableCards } from '../../core/cards';
import type { RunDeps, RunController, TestAvailability } from '../../core/run';
import { RARITY_LABELS, buildDeckCardView, buildRelicView, PHASE_LABELS, testBadgeText, type DeckCardView, type RelicView } from './runViews';
import { CARD_TYPE_LABELS } from '../cards/cardLabels';

/** 시작 화면 카드 선택지 한 장 */
export interface TestCardOption {
  id: string;
  name: string;
  cost: number;
  rarityLabel: string;
  typeLabel: string;
  text: string;
  /** 'neutral'이면 모든 지휘관 공용, 아니면 그 지휘관 고유 카드 */
  owner: string;
  hasUpgrade: boolean;
}

/** 시작 화면 유닛 선택지 한 기 (보스 전용 유닛은 제외) */
export interface TestUnitOption {
  id: string;
  name: string;
  tier: number;
  /** 기원 · 직업 특성 이름 */
  traits: string;
  skillText: string;
}

/** 테스트 도구가 고를 수 있는 것들 (데이터에서 한 번 만든다) */
export interface TestCatalogView {
  relics: RelicView[];
  cards: TestCardOption[];
  units: TestUnitOption[];
}

export function buildTestCatalog(deps: RunDeps): TestCatalogView {
  return {
    relics: deps.relics.relics.map(buildRelicView),
    cards: deps.cards.cards.map((card) => ({
      id: card.id,
      name: card.name,
      cost: card.cost,
      rarityLabel: RARITY_LABELS[card.rarity],
      typeLabel: CARD_TYPE_LABELS[card.type],
      text: card.text,
      owner: card.owner,
      hasUpgrade: card.upgrade !== undefined,
    })),
    units: deps.units.units.filter((unit) => !unit.boss).map((unit) => ({
      id: unit.id,
      name: unit.name,
      tier: unit.tier,
      traits: [deps.traits.get(unit.origin)?.name ?? unit.origin, deps.traits.get(unit.job)?.name ?? unit.job].join(' · '),
      skillText: `${unit.skill.name}: ${unit.skill.text}`,
    })),
  };
}

/** 런 중 테스트 도구 패널이 그리는 현재 상태 */
export interface TestToolsView {
  badge: string;
  phaseLabel: string;
  /** 명령 묶음별로 지금 쓸 수 없는 사유 (쓸 수 있으면 null) */
  availability: TestAvailability;
  gold: number;
  hp: number;
  maxHp: number;
  level: number;
  /** 보드에 올린 유닛 수 / 인구 한도 (= 레벨) */
  boardCount: number;
  ownedRelics: RelicView[];
  /** 제거할 수 있는 덱 카드 (유닛 제공 카드 제외) */
  deck: DeckCardView[];
  commanderId: string;
  catalog: TestCatalogView;
}

/**
 * 테스트 런이 아니면 null. resultPending(전투 결과 확인 중)이면 정산은 이미 끝나 있으나 화면은 아직 전투 결과이므로
 * 위치·편집 명령을 막는다 (계속을 눌러 다음 화면으로 넘어간 뒤에 쓰게 한다).
 */
export function buildTestToolsView(run: RunController, deps: RunDeps, catalog: TestCatalogView, resultPending: boolean): TestToolsView | null {
  const info = run.testInfo;
  if (!info) return null;
  const wait = '전투 결과를 확인한 뒤("계속") 쓸 수 있습니다';
  const base = run.test.availability();
  const availability: TestAvailability = resultPending ? { ...base, edit: wait, move: wait, battle: wait } : base;
  const roster = run.roster.snapshot();
  return {
    badge: testBadgeText(info),
    phaseLabel: PHASE_LABELS[run.phase],
    availability,
    gold: run.gold,
    hp: run.hp,
    maxHp: run.maxHp,
    level: roster.level,
    boardCount: roster.board.length,
    ownedRelics: run.relics.map(buildRelicView),
    deck: removableCards(run.deck).map((card) => buildDeckCardView(deps.cards, card)),
    commanderId: run.commander.id,
    catalog,
  };
}
