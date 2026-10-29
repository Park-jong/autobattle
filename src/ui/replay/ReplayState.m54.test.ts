import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '../../core/combat/events';
import { CombatSimulator } from '../../core/combat/sim';
import { cardCatalog, eventsOf, fillMana, formation, handSnapshot, traits, units, type Placement } from '../../core/combat/testSupport';
import { Deck } from '../../core/cards';
import { newRng } from '../../core/combat/testSupport';
import { CardPanelViewBuilder } from '../cards/cardPanelView';
import { explainUnplayable } from '../cards/cardAvailability';
import { unitAbbreviation } from '../gameData';
import { ReplayState } from './ReplayState';

const spawn = (unit: number, side: 0 | 1, col: number): CombatEvent =>
  ({ t: 0, type: 'spawn', unit, unitId: 'iron_shieldbearer', side, star: 1, cell: { col, row: 2 }, hp: 650, maxHp: 650, mana: 0, maxMana: 80 });

describe('M5-4 연출 이벤트 재생 (ReplayState)', () => {
  it('치명타 피해 이벤트는 crit 표시가 있는 연출이 된다 (일반 피해에는 없다)', () => {
    const events: CombatEvent[] = [
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 0.5, type: 'damage', unit: 1, source: 0, amount: 120, absorbed: 0, dmgType: 'physical', hp: 530, crit: true },
      { t: 0.6, type: 'damage', unit: 1, source: 0, amount: 80, absorbed: 0, dmgType: 'physical', hp: 450 },
    ];
    const replay = new ReplayState(events);
    replay.advanceTo(1);
    const damages = replay.recentEffects(2).filter((e) => e.kind === 'damage');
    expect(damages[0]).toMatchObject({ amount: 120, crit: true });
    expect(damages[1]).not.toHaveProperty('crit');
  });

  it('같은 상태가 여러 겹이면 stacks로 알려 주고, 겹이 하나면 stacks가 없다 (숲의 맹약 AS 중첩)', () => {
    const stack = (t: number): CombatEvent => ({ t, type: 'statusApplied', unit: 0, status: 'statMod:as', duration: 'combat', source: null, value: 5 });
    const replay = new ReplayState([spawn(0, 0, 3), spawn(1, 1, 4), stack(3), stack(6), stack(9)]);
    replay.advanceTo(3.1);
    expect(replay.viewOf(0)?.statuses.find((s) => s.name === 'statMod:as')).not.toHaveProperty('stacks');
    replay.advanceTo(9.1);
    expect(replay.viewOf(0)?.statuses.find((s) => s.name === 'statMod:as')).toMatchObject({ value: 5, stacks: 3 });
  });

  it('시전자가 죽어 취소된 지연 타격은 예고만 사라지고 번쩍임이 없다', () => {
    const events: CombatEvent[] = [
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 0, type: 'telegraph', id: 1000, source: 0, pattern: 'skill', label: '포격', cells: [{ col: 4, row: 2 }], fireAt: 2 },
      { t: 1, type: 'strike', id: 1000, source: 0, cells: [{ col: 4, row: 2 }], cancelled: true },
    ];
    const replay = new ReplayState(events);
    replay.advanceTo(0.5);
    expect(replay.telegraphs()).toHaveLength(1);
    expect(replay.telegraphs()[0]?.label).toBe('포격'); // 스킬 예고는 스킬 이름이 라벨이 된다
    replay.advanceTo(1.1);
    expect(replay.telegraphs()).toHaveLength(0);
    expect(replay.recentEffects(5).some((e) => e.kind === 'strike')).toBe(false);
  });

  it('손패 비용이 줄면 발동한 유닛이 붙은 cardCost 연출이 생긴다 (방해 변이는 유닛 없음)', () => {
    const events: CombatEvent[] = [
      spawn(0, 0, 3), spawn(1, 1, 4),
      { t: 1, type: 'cardCost', instanceId: 2, cardId: 'focus_fire', surcharge: -1, delta: -1, source: 0 },
      { t: 2, type: 'cardCost', instanceId: 3, cardId: 'focus_fire', surcharge: 1 },
    ];
    const replay = new ReplayState(events);
    replay.advanceTo(3);
    const costs = replay.recentEffects(5).filter((e) => e.kind === 'cardCost');
    expect(costs).toMatchObject([{ unit: 0, delta: -1, cardId: 'focus_fire' }, { unit: null, delta: 0 }]);
  });

  it('실제 전투의 도약·치명·주술사 이벤트가 오류 없이 재생된다', () => {
    const a: Placement[] = [['shade_dagger', 1, 3, 1], ['legion_spy', 1, 3, 3], ['ember_kindler', 1, 2, 2], ['abyss_whisperer', 1, 2, 0]];
    const sim = new CombatSimulator(
      { seed: 4, formations: [formation(a), formation([['iron_shieldbearer', 1, 4, 2]])], cards: { commander: null, deck: handSnapshot(['focus_fire', 'mana_infusion']) } },
      units, traits, cardCatalog,
    );
    sim.world.units[0]!.critChance = 1;
    fillMana(sim, 2);
    sim.runUntil(150);
    const replay = new ReplayState(sim.events);
    replay.advanceTo(sim.world.now);
    expect(eventsOf(sim, 'teleport').length).toBeGreaterThanOrEqual(2);
    expect(replay.recentEffects(100).some((e) => e.kind === 'teleport')).toBe(true);
    expect(replay.recentEffects(100).some((e) => e.kind === 'damage' && e.crit)).toBe(true);
  });
});

describe('손패 비용 표시', () => {
  const builder = new CardPanelViewBuilder(cardCatalog);
  const piles = () => Deck.restore(handSnapshot(['focus_fire', 'mana_infusion']), cardCatalog, newRng(1));
  const base = {
    commander: { id: 'cmd_x', name: 'x', passive: { name: 'p', text: 't' } } as never,
    phase: 'combat' as const, prepCp: 0, combatCp: 1, time: 0, usesOf: () => 0, selectedInstanceId: null, holding: false, hint: '', blockedReason: null, toast: null,
  };

  it('비용 조정(주술사 −1, 방해 +1)이 표시 비용과 사용 가능 여부에 반영된다', () => {
    const view = builder.build({ ...base, piles: piles(), costAdjustOf: (id) => (id === 2 ? -1 : id === 1 ? 1 : 0) });
    const [focus, infusion] = view.hand;
    expect(focus).toMatchObject({ cost: 2, baseCost: 1, playable: false }); // 1 + 1 > CP 1
    expect(infusion).toMatchObject({ cost: 1, baseCost: 2, playable: true }); // 2 − 1 = 1 ≤ CP 1
  });

  it('조정 후 비용은 0 밑으로 내려가지 않는다', () => {
    const view = builder.build({ ...base, piles: piles(), combatCp: 0, costAdjustOf: () => -5 });
    expect(view.hand.map((c) => [c.cost, c.playable])).toEqual([[0, true], [0, true]]);
    const card = cardCatalog.get('focus_fire')!;
    expect(explainUnplayable(card, false, { phase: 'combat', prepCp: 0, combatCp: 0, usesOf: () => 0, costAdjust: -1 })).toBeNull();
    expect(explainUnplayable(card, false, { phase: 'combat', prepCp: 0, combatCp: 0, usesOf: () => 0 })).toContain('CP 부족');
  });
});

describe('유닛 약자', () => {
  it('띄어쓰기가 있는 이름은 앞 두 단어의 첫 글자, 한 단어면 앞 두 글자', () => {
    expect(unitAbbreviation('잿불 점화사')).toBe('잿점');
    expect(unitAbbreviation('방패병')).toBe('방패');
    expect(unitAbbreviation('태고의 수목왕')).toBe('태수');
  });

  it('상점 유닛 30종의 약자가 모두 다르다', () => {
    const names = units.units.filter((u) => !u.boss).map((u) => unitAbbreviation(u.name));
    expect(new Set(names).size).toBe(30);
  });
});
