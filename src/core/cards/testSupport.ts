/** 카드 테스트 공용 픽스처. 프로덕션 코드에서는 쓰지 않는다. */
import traitsJson from '../../../data/traits.json';
import { loadCards, loadTraits, type CardCatalog } from '../data';

const traits = loadTraits(traitsJson);

/** 최소 카드 정의 (명령, 대상 없음, 비용 1, 전체 아군 ATK +10% 전투 내내). overrides로 덮어쓴다 */
export function fixtureCard(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id,
    owner: 'neutral',
    rarity: 'common',
    type: 'command',
    cost: 1,
    target: { kind: 'none' },
    keywords: [],
    text: id,
    effects: [{ kind: 'statMod', selector: 'allAllies', stat: 'atk', pct: 10, duration: 'combat' }],
    ...overrides,
  };
}

/** 픽스처 카드들로 카탈로그를 만든다 (특성 참조 검증 포함) */
export function fixtureCatalog(cards: Record<string, unknown>[]): CardCatalog {
  return loadCards({ version: 1, cards }, traits);
}
