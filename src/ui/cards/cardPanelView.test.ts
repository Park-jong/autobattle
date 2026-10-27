import { describe, expect, it } from 'vitest';
import { Deck } from '../../core/cards';
import { cardCatalog, handSnapshot, harten, newRng } from '../../core/combat/testSupport';
import { CardPanelViewBuilder, type PanelInput } from './cardPanelView';

const builder = new CardPanelViewBuilder(cardCatalog);

function input(over: Partial<PanelInput> = {}): PanelInput {
  const snapshot = handSnapshot(['war_drums', 'hold_the_line', 'last_stand'], [3]);
  snapshot.draw = [{ instanceId: 4, cardId: 'hold_the_line', upgraded: false }];
  const deck = Deck.restore(snapshot, cardCatalog, newRng(1));
  return {
    commander: harten,
    piles: deck,
    phase: 'combat',
    prepCp: 0,
    combatCp: 2,
    time: 0,
    usesOf: () => 0,
    selectedInstanceId: null,
    holding: false,
    hint: '',
    blockedReason: null,
    toast: null,
    ...over,
  };
}

describe('CardPanelViewBuilder', () => {
  it('손패 카드에 이름·비용·타입·설명·강화 표시를 담는다', () => {
    const view = builder.build(input());
    expect(view.visible).toBe(true);
    expect(view.hand).toHaveLength(3);
    const upgraded = view.hand.find((c) => c.cardId === 'last_stand');
    expect(upgraded).toMatchObject({ name: '최후의 저항+', cost: 1, typeLabel: '명령', upgraded: true, targetLabel: '아군 1명 지정' });
    expect(upgraded?.text).toContain('HP가 1 밑으로');
    expect(view.commanderName).toContain('하르텐');
    expect(view.passiveName).toBe('철의 서약');
  });

  it('단계·CP가 맞지 않는 카드는 이유와 함께 사용 불가로 표시한다', () => {
    const view = builder.build(input({ combatCp: 0 }));
    for (const c of view.hand) {
      expect(c.playable).toBe(false);
      expect(c.reason).not.toBeNull();
    }
    const prep = builder.build(input({ phase: 'prep', prepCp: 2 }));
    const drums = prep.hand.find((c) => c.cardId === 'war_drums');
    const line = prep.hand.find((c) => c.cardId === 'hold_the_line');
    expect(drums?.playable).toBe(true);
    expect(line?.reason).toContain('전투 중에만');
  });

  it('외부 차단 사유(카드 사용 금지 등)가 모든 카드에 우선한다', () => {
    const view = builder.build(input({ blockedReason: '카드 사용 금지 옵션' }));
    expect(view.hand.every((c) => c.reason === '카드 사용 금지 옵션' && !c.playable)).toBe(true);
    expect(view.notice).toBe('카드 사용 금지 옵션');
  });

  it('더미는 같은 카드끼리 묶어 장수를 세고 선택 표시를 따른다', () => {
    const base = input();
    const view = builder.build({ ...base, selectedInstanceId: base.piles.hand[0]?.instanceId ?? null });
    expect(view.hand.filter((c) => c.selected)).toHaveLength(1);
    expect(view.draw.count + view.hand.length + view.discard.count + view.exhaust.count).toBe(4);
    const all = [...view.draw.entries, ...view.discard.entries];
    expect(all.reduce((s, e) => s + e.count, 0)).toBe(view.draw.count + view.discard.count);
  });

  it('CP 진행률: 전투 중에는 4초 주기, 상한이면 가득', () => {
    expect(builder.build(input({ time: 0 })).cp.regenProgress).toBe(0);
    expect(builder.build(input({ time: 1 })).cp.regenProgress).toBeCloseTo(0.25);
    expect(builder.build(input({ time: 5 })).cp.regenProgress).toBeCloseTo(0.25);
    expect(builder.build(input({ time: 1, combatCp: 6 })).cp.regenProgress).toBe(1);
    const prep = builder.build(input({ phase: 'prep', prepCp: 2 })).cp;
    expect(prep.showPrep).toBe(true);
    expect(prep.prep).toBe(2);
    expect(builder.build(input()).cp.showPrep).toBe(false);
  });

  it('숨김 뷰는 visible=false', () => {
    expect(builder.hidden().visible).toBe(false);
  });
});
