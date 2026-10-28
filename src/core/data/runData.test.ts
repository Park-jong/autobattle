import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import commandersJson from '../../../data/commanders.json';
import encountersJson from '../../../data/encounters.json';
import eventsJson from '../../../data/events.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { DataValidationError } from './errors';
import { loadCards } from './cardLoader';
import { loadCommanders } from './commanderLoader';
import { loadEncounters } from './encounterLoader';
import { loadEvents } from './eventLoader';
import { loadTraits } from './traitLoader';
import { loadUnits } from './unitLoader';

const traits = loadTraits(traitsJson);
const units = loadUnits(unitsJson, traits);
const cards = loadCards(cardsJson, traits);
const clone = <T>(value: T): T => structuredClone(value);

describe('보스 유닛 데이터', () => {
  it('성문 파괴자는 boss 플래그와 열 강타 패턴을 가진다', () => {
    const boss = units.get('gate_breaker');
    expect(boss?.boss).toBe(true);
    expect(boss?.tier).toBe(5);
    expect(boss?.pattern).toEqual({ kind: 'columnStrike', intervalSeconds: 10, telegraphSeconds: 2, damage: 420, dmgType: 'physical' });
  });

  it('패턴 검증: 예고 시간이 간격 이상이면 거부하고 boss:false·모르는 종류도 거부한다', () => {
    const data = clone(unitsJson) as { units: { id: string; pattern?: Record<string, unknown>; boss?: unknown }[] };
    const boss = data.units.find((u) => u.id === 'gate_breaker')!;
    boss.pattern!.telegraphSeconds = 10;
    expect(() => loadUnits(data, traits)).toThrow(/telegraphSeconds.*예고 시간은 발동 간격보다 짧아야 함/);
    boss.pattern!.telegraphSeconds = 2;
    boss.pattern!.kind = 'laser';
    expect(() => loadUnits(data, traits)).toThrow(/pattern\.kind/);
    boss.pattern!.kind = 'columnStrike';
    boss.boss = false;
    expect(() => loadUnits(data, traits)).toThrow(/boss.*true만 허용/);
  });
});

describe('카드 데이터: 지휘관 HP 비용·CP 획득', () => {
  it('심연의 계약은 commanderHpCost와 cpGain 효과를 가진다', () => {
    expect(cards.get('abyss_pact')?.commanderHpCost).toEqual({ amount: 3, waivedByTrait: 'abyss' });
  });

  it('commanderHpCost는 1 이상 정수여야 하고 면제 특성 id가 실제로 있어야 한다', () => {
    const data = clone(cardsJson) as { cards: { id: string; commanderHpCost?: Record<string, unknown> }[] };
    const pact = data.cards.find((c) => c.id === 'abyss_pact')!;
    pact.commanderHpCost!.amount = 0;
    expect(() => loadCards(data, traits)).toThrow(/commanderHpCost\.amount/);
    pact.commanderHpCost!.amount = 3;
    pact.commanderHpCost!.waivedByTrait = 'nope';
    expect(() => loadCards(data, traits)).toThrow(/waivedByTrait.*traits\.json에 없는 특성 id "nope"/);
  });

  it('cpGain은 카드 전용이고 selector가 allAllies여야 한다', () => {
    const skill = clone(unitsJson) as { units: { skill: { effects: unknown[] } }[] };
    skill.units[0]!.skill.effects.push({ kind: 'cpGain', selector: 'allAllies', amount: 1 });
    expect(() => loadUnits(skill, traits)).toThrow(/cpGain은 카드 전용 효과/);
    const bad = clone(cardsJson) as { cards: { id: string; effects: Record<string, unknown>[] }[] };
    bad.cards.find((c) => c.id === 'abyss_pact')!.effects[0]!.selector = 'self';
    expect(() => loadCards(bad, traits)).toThrow(/cpGain은 selector가 allAllies여야 함|시전 유닛/);
  });
});

describe('지휘관 데이터: maxHp', () => {
  it('maxHp는 선택 필드이며 1 이상 정수여야 한다', () => {
    const catalog = loadCommanders(commandersJson, cards, units);
    expect(catalog.get('cmd_harten')?.maxHp).toBe(80);
    const bad = clone(commandersJson) as { commanders: { maxHp?: number }[] };
    bad.commanders[0]!.maxHp = 0;
    expect(() => loadCommanders(bad, cards, units)).toThrow(/maxHp/);
  });
});

describe('encounters.json', () => {
  const coverage = {
    normalFloors: Array.from({ length: 11 }, (_, i) => i + 1),
    eliteFloors: [4, 5, 6, 7, 8, 9, 10, 11],
    bossFloors: [13],
  };

  it('실제 데이터: 일반 8개 이상, 정예 3개 이상, 보스 1개이며 모든 층을 덮는다', () => {
    const catalog = loadEncounters(encountersJson, units, coverage);
    const count = (kind: string) => catalog.encounters.filter((e) => e.kind === kind).length;
    expect(count('normal')).toBeGreaterThanOrEqual(8);
    expect(count('elite')).toBeGreaterThanOrEqual(3);
    expect(count('boss')).toBe(1);
    expect(catalog.candidates('boss', 13)[0]?.units.some((u) => u.unitId === 'gate_breaker')).toBe(true);
  });

  it('적 진영 밖 칸·중복 칸·모르는 필드·모르는 유닛은 위치가 담긴 오류로 거부한다', () => {
    const data = clone(encountersJson) as { encounters: { units: Record<string, unknown>[]; minFloor: number; maxFloor: number }[] };
    data.encounters[0]!.units[0]!.col = 2;
    expect(() => loadEncounters(data, units)).toThrow(/encounters\[0\] \(patrol_scouts\)\.units\[0\].*적 진영.*밖/);
    data.encounters[0]!.units[0]!.col = 4;
    data.encounters[0]!.units[1]!.col = 4;
    data.encounters[0]!.units[1]!.row = 2;
    expect(() => loadEncounters(data, units)).toThrow(/중복/);
    data.encounters[0]!.units[1]!.col = 6;
    data.encounters[0]!.units[1]!.extra = 1;
    expect(() => loadEncounters(data, units)).toThrow(/알 수 없는 필드/);
    delete data.encounters[0]!.units[1]!.extra;
    data.encounters[0]!.units[1]!.unitId = 'ghost';
    expect(() => loadEncounters(data, units)).toThrow(/units\.json에 없는 유닛 id "ghost"/);
    data.encounters[0]!.units[1]!.unitId = 'grove_archer';
    data.encounters[0]!.maxFloor = 0;
    expect(() => loadEncounters(data, units)).toThrow(DataValidationError);
  });

  it('층 커버리지가 부족하면 어느 층인지 알려 준다', () => {
    const data = clone(encountersJson) as { encounters: { kind: string }[] };
    data.encounters = data.encounters.filter((e) => e.kind !== 'boss');
    expect(() => loadEncounters(data, units, coverage)).toThrow(/13층에 쓸 boss 편성이 없음/);
  });
});

describe('events.json', () => {
  it('실제 데이터: 이벤트 5개, 각 선택지 2~3개, 효과는 정해진 집합만 쓴다', () => {
    const catalog = loadEvents(eventsJson, cards, units);
    expect(catalog.size).toBe(5);
    const kinds = new Set<string>();
    for (const event of catalog.events) {
      expect(event.choices.length).toBeGreaterThanOrEqual(2);
      expect(event.choices.length).toBeLessThanOrEqual(3);
      for (const choice of event.choices) for (const effect of choice.effects) kinds.add(effect.kind);
    }
    expect([...kinds].sort()).toEqual(['commanderHp', 'gainCard', 'gainUnit', 'gold', 'removeCard', 'upgradeCard']);
  });

  it('선택지 개수·효과 형식 오류를 위치와 함께 거부한다', () => {
    const data = clone(eventsJson) as { events: { choices: { effects: Record<string, unknown>[] }[] }[] };
    data.events[0]!.choices.pop();
    data.events[0]!.choices.pop();
    expect(() => loadEvents(data, cards, units)).toThrow(/events\[0\] \(abandoned_depot\)\.choices.*2~3개/);

    const zero = clone(eventsJson) as typeof data;
    zero.events[0]!.choices[0]!.effects[0]!.amount = 0;
    expect(() => loadEvents(zero, cards, units)).toThrow(/choices\[0\]\.effects\[0\]\.amount.*0이 아닌 정수/);

    const unknown = clone(eventsJson) as typeof data;
    unknown.events[0]!.choices[0]!.effects[0] = { kind: 'teleport' };
    expect(() => loadEvents(unknown, cards, units)).toThrow(/effects\[0\]\.kind/);

    const extra = clone(eventsJson) as typeof data;
    extra.events[0]!.choices[0]!.effects[0]!.bonus = 1;
    expect(() => loadEvents(extra, cards, units)).toThrow(/알 수 없는 필드/);
  });

  it('참조 검증: 고정 카드 id, 희귀도 후보 수, 유닛 등급', () => {
    const data = clone(eventsJson) as { events: { choices: { effects: Record<string, unknown>[] }[] }[] };
    data.events[0]!.choices[0]!.effects = [{ kind: 'gainCard', mode: 'fixed', cardId: 'ghost_card' }];
    expect(() => loadEvents(data, cards, units)).toThrow(/cards\.json에 없는 카드 id "ghost_card"/);
    data.events[0]!.choices[0]!.effects = [{ kind: 'gainCard', mode: 'choose', rarity: 'epic', count: 3 }];
    expect(() => loadEvents(data, cards, units)).toThrow(/epic 보상 카드가 3장 이상 필요함/);
    data.events[0]!.choices[0]!.effects = [{ kind: 'gainUnit', tier: 5 }];
    expect(() => loadEvents(data, cards, units)).toThrow(/5등급 유닛이 없음/); // 보스는 제외
  });
});
