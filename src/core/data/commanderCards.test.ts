/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import commandersJson from '../../../data/commanders.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { effectiveCard } from '../cards/effectiveCard';
import { CardRewardGenerator } from '../run/cardRewards';
import { isRewardCardFor, type Card } from './card';
import { loadCards } from './cardLoader';
import { loadCommanders } from './commanderLoader';
import { loadTraits } from './traitLoader';
import { loadUnits } from './unitLoader';

/** M5-4 2부-B: 지휘관 전용 카드 90장 데이터 (장수·희귀도 분포·id 규칙·강화·보상 풀 격리) */

const traits = loadTraits(traitsJson);
const units = loadUnits(unitsJson, traits);
const catalog = loadCards(cardsJson, traits);

const OWNERS = [
  { owner: 'cmd_harten', prefix: 'harten_', start: 'shield_formation', rarity: { common: 16, rare: 10, epic: 4 } },
  { owner: 'cmd_isera', prefix: 'isera_', start: 'ember_arrow', rarity: { common: 14, rare: 12, epic: 4 } },
  { owner: 'cmd_nox', prefix: 'nox_', start: 'blood_price', rarity: { common: 13, rare: 12, epic: 5 } },
] as const;

const own = (owner: string): Card[] => catalog.cards.filter((c) => c.owner === owner && c.rarity !== 'starter');

describe('지휘관 전용 카드 데이터', () => {
  it('카드 풀은 기존 18종 + 전용 90종 = 108종, 지휘관마다 30장', () => {
    expect(catalog.size).toBe(108);
    for (const { owner } of OWNERS) expect(own(owner)).toHaveLength(30);
  });

  for (const { owner, prefix, start, rarity } of OWNERS) {
    describe(owner, () => {
      it(`희귀도 분포가 설계안 표 그대로다 (일반 ${rarity.common} / 희귀 ${rarity.rare} / 에픽 ${rarity.epic})`, () => {
        const tally = { common: 0, rare: 0, epic: 0 };
        for (const c of own(owner)) tally[c.rarity as keyof typeof tally] += 1;
        expect(tally).toEqual(rarity);
      });

      it(`id는 "${prefix}"로 시작하고 시작 카드(${start})는 starter로 그대로 남아 있다`, () => {
        for (const c of own(owner)) expect(c.id.startsWith(prefix)).toBe(true);
        expect(catalog.get(start)).toMatchObject({ owner, rarity: 'starter' });
      });

      it('모든 카드에 한국어 설명과 강화 버전(설명 포함)이 있고 강화는 무엇인가 달라진다', () => {
        for (const c of own(owner)) {
          expect(c.text, c.id).toMatch(/[가-힣]/);
          expect(c.name, c.id).toMatch(/[가-힣]/);
          expect(c.upgrade, c.id).toBeDefined();
          expect(c.upgrade!.text, c.id).toMatch(/[가-힣]/);
          const base = effectiveCard(c, false);
          const up = effectiveCard(c, true);
          const differs =
            up.text !== base.text || up.cost !== base.cost || JSON.stringify(up.effects) !== JSON.stringify(base.effects) ||
            JSON.stringify(up.keywords) !== JSON.stringify(base.keywords) || JSON.stringify(up.commanderHpCost) !== JSON.stringify(base.commanderHpCost);
          expect(differs, c.id).toBe(true);
        }
      });

      it('강화는 연쇄·징집 키워드 구성을 바꾸지 않는다 (소모·보존만 바뀔 수 있음)', () => {
        for (const c of own(owner)) {
          const up = effectiveCard(c, true).keywords;
          for (const keyword of ['chain', 'conscript'] as const) expect(up.includes(keyword), c.id).toBe(c.keywords.includes(keyword));
        }
      });

      it('보상·상점·이벤트 풀에 자기 카드 30장이 모두 나오고 다른 지휘관 카드와 시작 카드는 나오지 않는다', () => {
        const pooled = new Set<string>();
        const generator = new CardRewardGenerator(catalog, owner);
        for (const rarity of ['common', 'rare', 'epic'] as const) for (const c of generator.pool(rarity)) pooled.add(c.id);
        const ownIds = own(owner).map((c) => c.id);
        for (const id of ownIds) expect(pooled.has(id), id).toBe(true);
        for (const other of OWNERS.filter((o) => o.owner !== owner)) {
          for (const c of own(other.owner)) expect(pooled.has(c.id), c.id).toBe(false);
        }
        expect(pooled.has(start)).toBe(false);
        for (const id of pooled) {
          const card = catalog.get(id)!;
          expect(isRewardCardFor(card, owner)).toBe(true);
          expect(['neutral', owner]).toContain(card.owner);
        }
      });
    });
  }

  it('지휘관 패시브·시작 덱은 전용 카드를 포함하지 않는다 (시작 덱 변경 없음)', () => {
    const commanders = loadCommanders(commandersJson, catalog, units);
    const startingIds = (id: string) => commanders.get(id)!.startingDeck.map((s) => s.cardId);
    expect(startingIds('cmd_harten')).toContain('shield_formation');
    expect(startingIds('cmd_isera')).toContain('ember_arrow');
    expect(startingIds('cmd_nox')).toContain('blood_price');
    for (const { prefix } of OWNERS) {
      for (const id of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
        expect(startingIds(id).some((cardId) => cardId.startsWith(prefix))).toBe(false);
      }
    }
  });

  it('HP 비용·제한 같은 설계안 필드가 표대로 들어 있다', () => {
    const hp = (id: string) => catalog.get(id)!.commanderHpCost?.amount;
    expect(hp('nox_blood_contract')).toBe(2);
    expect(hp('nox_usury')).toBe(4);
    expect(catalog.get('nox_usury')!.upgrade!.commanderHpCost?.amount).toBe(3);
    expect(hp('nox_final_deal')).toBe(8);
    expect(catalog.get('nox_final_deal')!.upgrade!.commanderHpCost?.amount).toBe(6);
    expect(hp('nox_blood_pact')).toBe(4);
    expect(catalog.get('nox_blood_pact')!.upgrade!.commanderHpCost?.amount).toBe(3);
    expect(catalog.get('harten_front_rotation')!.limits).toEqual({ perCombat: 2 });
    expect(catalog.get('isera_small_spark')!.limits).toEqual({ perCombat: 3 });
    expect(catalog.get('harten_leave_no_one')!.upgrade!.keywords).toEqual([]);
  });
});

describe('강화 필드: keywords · commanderHpCost', () => {
  const base = {
    id: 'fx', name: 'fx', owner: 'neutral', rarity: 'common', type: 'command', cost: 1, target: { kind: 'none' }, keywords: ['exhaust'], text: 't',
    effects: [{ kind: 'heal', selector: 'allAllies', amount: 10 }],
  };
  const upgrade = (extra: Record<string, unknown>) => ({
    text: 'u', effects: [{ kind: 'heal', selector: 'allAllies', amount: 20 }], ...extra,
  });
  const errorOf = (card: unknown): string => {
    try {
      loadCards({ version: 1, cards: [card] }, traits);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('에러가 발생해야 함');
  };

  it('강화가 키워드 목록과 지휘관 HP 비용을 대체한다 (effectiveCard에 반영)', () => {
    const cards = loadCards({
      version: 1,
      cards: [{ ...base, commanderHpCost: { amount: 5 }, upgrade: upgrade({ keywords: [], commanderHpCost: { amount: 2 } }) }],
    }, traits);
    const card = cards.get('fx')!;
    expect(effectiveCard(card, false)).toMatchObject({ keywords: ['exhaust'], commanderHpCost: { amount: 5 } });
    expect(effectiveCard(card, true)).toMatchObject({ keywords: [], commanderHpCost: { amount: 2 } });
  });

  it('upgrade에 없으면 기본 카드의 키워드·HP 비용을 그대로 쓴다', () => {
    const card = loadCards({ version: 1, cards: [{ ...base, commanderHpCost: { amount: 5 }, upgrade: upgrade({}) }] }, traits).get('fx')!;
    expect(effectiveCard(card, true)).toMatchObject({ keywords: ['exhaust'], commanderHpCost: { amount: 5 } });
  });

  it('강화로 chain 키워드를 더하거나 빼면 거부한다', () => {
    const error = errorOf({ ...base, upgrade: upgrade({ keywords: ['exhaust', 'chain'] }) });
    expect(error).toContain('upgrade.keywords');
    expect(error).toContain('chain');
  });

  it('HP 비용이 없는 카드를 강화로 HP 비용 카드로 만들 수 없고, 알 수 없는 키워드는 거부한다', () => {
    expect(errorOf({ ...base, upgrade: upgrade({ commanderHpCost: { amount: 2 } }) })).toContain('upgrade.commanderHpCost');
    expect(errorOf({ ...base, upgrade: upgrade({ keywords: ['nope'] }) })).toContain('upgrade.keywords[0]');
  });

  it('강화의 HP 비용 면제 특성이 없는 특성이면 로더가 거부한다', () => {
    const card = { ...base, commanderHpCost: { amount: 3 }, upgrade: upgrade({ commanderHpCost: { amount: 3, waivedByTrait: 'nope' } }) };
    expect(errorOf(card)).toContain('upgrade.commanderHpCost.waivedByTrait');
  });
});
