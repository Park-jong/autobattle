import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import eventsJson from '../../../data/events.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { effectiveCard } from '../cards/effectiveCard';
import { CardRewardGenerator } from '../run/cardRewards';
import { isCardAllowedFor, isRewardCard, isRewardCardFor, type Card } from './card';
import { CardValidator } from './cardValidator';
import { loadCards } from './cardLoader';
import { loadEvents } from './eventLoader';
import { loadTraits } from './traitLoader';
import { loadUnits } from './unitLoader';

/** M5-4 2부-C: 공통 카드 35장 데이터 (번호↔id, 희귀도 분포, 보상 풀, 제공 카드 연결, 저주 이벤트 연결) */

const traits = loadTraits(traitsJson);
const units = loadUnits(unitsJson, traits);
const catalog = loadCards(cardsJson, traits);

/** cardidea/common.md ✔ 카드 번호 → id */
const REWARD: Record<string, string> = {
  C01: 'shield_wall', C02: 'first_aid', C03: 'regroup', C05: 'blockade_line', C08: 'mark_weakness', C09: 'armor_shatter',
  C10: 'flashbang', C11: 'silence_bell', C13: 'fireball', C15: 'chain_lightning', C16: 'earth_collapse', C18: 'battle_cry',
  C20: 'weakening_curse', C22: 'supplies', C23: 'messenger', C26: 'full_mobilization', C27: 'chain_stratagem',
  C30: 'field_prep', C31: 'morale_boost', C36: 'steel_cuirass', C39: 'vampiric_dagger', C42: 'iron_ranks',
  C44: 'ember_spread', C47: 'void_veil', C49: 'root_prison', C50: 'shield_oath', C52: 'arena_roar', C54: 'volley',
  C56: 'spell_amplify', C58: 'shadow_step',
};
const GRANTED = { U1: 'rift_opening', U2: 'prophesied_calamity' };
const CURSES = { K1: 'dread', K2: 'wound', K4: 'rotten_supplies' };
/** 특성 공명 카드 9장 → 특성 */
const RESONANCE: Record<string, string> = {
  iron_ranks: 'iron_legion', ember_spread: 'ember', void_veil: 'abyss', root_prison: 'forest_pact', shield_oath: 'guardian',
  arena_roar: 'gladiator', volley: 'marksman', spell_amplify: 'mystic', shadow_step: 'assassin',
};

const rewardCards = Object.values(REWARD).map((id) => catalog.get(id) as Card);
const poolOf = (commanderId: string | null) => {
  const generator = new CardRewardGenerator(catalog, commanderId);
  return (['common', 'rare', 'epic'] as const).flatMap((rarity) => generator.pool(rarity));
};

describe('공통 카드 35장 데이터', () => {
  it('보상 30 + 제공 2 + 저주 3 = 35장이 모두 있고 전부 공용(neutral)이다', () => {
    const ids = [...Object.values(REWARD), ...Object.values(GRANTED), ...Object.values(CURSES)];
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
    for (const id of ids) expect(catalog.get(id)?.owner, id).toBe('neutral');
  });

  it('보상 카드 30장의 희귀도는 일반 19 / 희귀 8 / 에픽 3 (설계안 표 그대로)', () => {
    const tally = { common: 0, rare: 0, epic: 0 };
    for (const card of rewardCards) tally[card.rarity as keyof typeof tally] += 1;
    expect(tally).toEqual({ common: 19, rare: 8, epic: 3 });
    // 설계안 표의 개별 희귀도
    const rare = ['C03', 'C10', 'C15', 'C27', 'C31', 'C39', 'C47', 'C49'];
    const epic = ['C16', 'C18', 'C26'];
    for (const [no, id] of Object.entries(REWARD)) {
      expect(catalog.get(id)!.rarity, `${no} ${id}`).toBe(epic.includes(no) ? 'epic' : rare.includes(no) ? 'rare' : 'common');
    }
  });

  it('타입 분포: 명령 17 · 주문 9 · 작전 2 · 장비 2', () => {
    const tally: Record<string, number> = {};
    for (const card of rewardCards) tally[card.type] = (tally[card.type] ?? 0) + 1;
    expect(tally).toEqual({ command: 17, spell: 9, operation: 2, equipment: 2 });
  });

  it('보상 카드 30장은 한국어 설명과 강화 버전(설명 포함)이 있고 강화는 무엇인가 달라진다', () => {
    for (const card of [...rewardCards, ...Object.values(GRANTED).map((id) => catalog.get(id) as Card)]) {
      expect(card.name, card.id).toMatch(/[가-힣]/);
      expect(card.text, card.id).toMatch(/[가-힣]/);
      expect(card.upgrade, card.id).toBeDefined();
      expect(card.upgrade!.text, card.id).toMatch(/[가-힣]/);
      const base = effectiveCard(card, false);
      const up = effectiveCard(card, true);
      expect(up.text !== base.text && (JSON.stringify(up.effects) !== JSON.stringify(base.effects) || up.cost !== base.cost || JSON.stringify(up.resonance) !== JSON.stringify(base.resonance)), card.id).toBe(true);
    }
  });

  it('공명 카드 9장은 특성 9개에 한 장씩이다', () => {
    const withResonance = rewardCards.filter((c) => c.resonance && c.id in RESONANCE);
    expect(withResonance).toHaveLength(9);
    expect(new Set(withResonance.map((c) => c.resonance!.trait)).size).toBe(9);
    for (const [id, trait] of Object.entries(RESONANCE)) expect(catalog.get(id)!.resonance?.trait, id).toBe(trait);
    expect(withResonance.map((c) => c.resonance!.trait).sort()).toEqual(traits.traits.map((t) => t.id).sort());
  });

  it('장비 카드는 아군 1명을 지정하고, 작전 카드는 대상이 없다', () => {
    for (const card of rewardCards.filter((c) => c.type === 'equipment')) expect(card.target.kind).toBe('allyUnit');
    for (const card of rewardCards.filter((c) => c.type === 'operation')) expect(card.target.kind).toBe('none');
  });

  it('저주 3장은 type curse이고 강화·공명이 없다', () => {
    for (const id of Object.values(CURSES)) {
      const card = catalog.get(id)!;
      expect(card.type).toBe('curse');
      expect(card.upgrade).toBeUndefined();
      expect(card.resonance).toBeUndefined();
    }
  });
});

describe('보상·상점·이벤트 풀', () => {
  it('공통 보상 카드 30장이 세 지휘관 풀에 모두 나온다', () => {
    for (const commander of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
      const ids = new Set(poolOf(commander).map((c) => c.id));
      for (const id of Object.values(REWARD)) expect(ids.has(id), `${commander} ${id}`).toBe(true);
    }
    const neutralIds = new Set(poolOf(null).map((c) => c.id));
    for (const id of Object.values(REWARD)) expect(neutralIds.has(id), id).toBe(true);
  });

  it('유닛 제공 카드와 저주는 어느 풀에도 나오지 않는다', () => {
    for (const commander of [null, 'cmd_harten', 'cmd_isera', 'cmd_nox']) {
      const ids = new Set(poolOf(commander).map((c) => c.id));
      for (const id of [...Object.values(GRANTED), ...Object.values(CURSES)]) expect(ids.has(id), `${commander} ${id}`).toBe(false);
    }
    for (const id of Object.values(GRANTED)) {
      const card = catalog.get(id)!;
      expect(card.grantOnly).toBe(true);
      expect(isRewardCard(card)).toBe(false);
      expect(isRewardCardFor(card, 'cmd_nox')).toBe(false);
    }
  });

  it('공용 풀의 희귀도 분포: 새 30장 + 기존 공용 보상 카드', () => {
    const neutral = poolOf(null);
    const tally = { common: 0, rare: 0, epic: 0 };
    const newIds = new Set(Object.values(REWARD));
    for (const card of neutral.filter((c) => newIds.has(c.id))) tally[card.rarity as keyof typeof tally] += 1;
    expect(tally).toEqual({ common: 19, rare: 8, epic: 3 });
    // 기존 공용 보상 카드(2부-B까지): 에픽은 없다. 유닛 제공 3종(행군가·적진 정찰·덩굴 속박)은 grantOnly로 풀에서 빠졌다
    const old = neutral.filter((c) => !newIds.has(c.id));
    expect(old.map((c) => c.id).sort()).toEqual(['abyss_pact', 'call_reserves', 'firestorm', 'forged_blade', 'mana_infusion', 'tactical_reorganization']);
    expect(neutral).toHaveLength(36);
  });

  it('지휘관 풀 크기 = 공용 36 + 전용 30', () => {
    for (const commander of ['cmd_harten', 'cmd_isera', 'cmd_nox']) expect(poolOf(commander)).toHaveLength(36 + 30);
  });

  it('기존 유닛 제공 카드 3종은 보상 풀에 없지만 덱·저장에는 그대로 쓸 수 있다', () => {
    for (const id of ['marching_song', 'enemy_scout', 'vine_snare']) {
      const card = catalog.get(id)!;
      expect(card.grantOnly).toBe(true);
      expect(isRewardCard(card)).toBe(false);
      for (const commander of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
        expect(isRewardCardFor(card, commander)).toBe(false);
        expect(isCardAllowedFor(card, commander)).toBe(true);
      }
    }
  });
});

describe('유닛 제공 카드 연결 (데이터)', () => {
  it('공허 대사제 → 균열 개방, 화산 예언자 → 예언된 재앙', () => {
    expect(units.get('void_hierophant')!.grantedCard).toBe('rift_opening');
    expect(units.get('volcano_oracle')!.grantedCard).toBe('prophesied_calamity');
  });

  it('균열 개방: 2CP 주문, 3×3, RES -30(강화 -45) 4초, 심연 공명 CP +1', () => {
    const card = catalog.get('rift_opening')!;
    expect(card).toMatchObject({ type: 'spell', cost: 2, target: { kind: 'area3x3' } });
    expect(card.effects).toEqual([{ kind: 'statAdd', selector: 'enemiesInTargetArea', stat: 'res', amount: -30, duration: 4 }]);
    expect(card.upgrade!.effects).toEqual([{ kind: 'statAdd', selector: 'enemiesInTargetArea', stat: 'res', amount: -45, duration: 4 }]);
    expect(card.resonance).toEqual({ trait: 'abyss', effects: [{ kind: 'cpGain', selector: 'allAllies', amount: 1 }] });
  });

  it('예언된 재앙: 3CP 주문, 보존, 3초 뒤 마법 피해 400(강화 550)', () => {
    const card = catalog.get('prophesied_calamity')!;
    expect(card).toMatchObject({ type: 'spell', cost: 3, keywords: ['retain'] });
    const strike = (c: { effects: Card['effects'] }) => c.effects[0] as { delay: number; effects: { amount: number }[] };
    expect(strike(card).delay).toBe(3);
    expect(strike(card).effects[0]!.amount).toBe(400);
    expect(strike(card.upgrade!).effects[0]!.amount).toBe(550);
  });
});

describe('grantOnly 검증', () => {
  const clone = () => JSON.parse(JSON.stringify(cardsJson)) as { cards: Record<string, unknown>[] };
  it('불리언이어야 하고 저주 카드에는 쓸 수 없다', () => {
    const data = clone();
    data.cards.find((c) => c.id === 'rift_opening')!.grantOnly = 'yes';
    expect(() => new CardValidator().validateFile(data)).toThrow(/grantOnly/);
    const curse = clone();
    curse.cards.find((c) => c.id === 'dread')!.grantOnly = true;
    expect(() => new CardValidator().validateFile(curse)).toThrow(/grantOnly/);
  });
});

describe('저주 이벤트 데이터', () => {
  const events = loadEvents(eventsJson, catalog, units);
  const curseChoices = events.events.flatMap((event) =>
    event.choices.flatMap((choice, index) => {
      const gains = choice.effects.filter((e) => e.kind === 'gainCard' && e.mode === 'fixed' && catalog.get(e.cardId)?.type === 'curse');
      return gains.length > 0 ? [{ event: event.id, index, choice }] : [];
    }),
  );

  it('이벤트 3곳에 저주 선택지가 있고 선택지는 4개를 넘지 않는다', () => {
    expect(curseChoices.map((c) => `${c.event}#${c.index}`).sort()).toEqual(['abandoned_depot#3', 'deserter_camp#3', 'wounded_scout#3']);
    for (const event of events.events) expect(event.choices.length).toBeLessThanOrEqual(4);
  });

  it('저주 선택지는 더 좋은 보상을 같이 주며 서로 다른 저주 3장을 쓴다', () => {
    const used = curseChoices.map((c) => (c.choice.effects.find((e) => e.kind === 'gainCard' && e.mode === 'fixed') as { cardId: string }).cardId);
    expect(used.sort()).toEqual(['dread', 'rotten_supplies', 'wound']);
    for (const { choice } of curseChoices) expect(choice.effects.length).toBeGreaterThanOrEqual(2);
  });
});
