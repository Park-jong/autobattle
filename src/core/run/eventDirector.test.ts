import { describe, expect, it } from 'vitest';
import { loadEvents } from '../data/eventLoader';
import { Rng } from '../rng';
import { CardRewardGenerator } from './cardRewards';
import { EventDirector, type EventHost } from './eventDirector';
import { runDeps } from './testSupport';

/** 검증 로더를 거친 픽스처 이벤트 */
const catalog = loadEvents(
  {
    version: 1,
    events: [
      {
        id: 'fx', title: 't', text: 'x',
        choices: [
          { text: 'gold+hp', result: 'r0', effects: [{ kind: 'gold', amount: 14 }, { kind: 'commanderHp', amount: -6 }] },
          { text: 'pay', result: 'r1', effects: [{ kind: 'gold', amount: -5 }, { kind: 'gainCard', mode: 'random', rarity: 'common' }] },
          { text: 'nothing', result: 'r2', effects: [] },
        ],
      },
      {
        id: 'fx2', title: 't2', text: 'x',
        choices: [
          { text: 'choose card', result: 'c0', effects: [{ kind: 'gainCard', mode: 'choose', rarity: 'rare', count: 3 }, { kind: 'gold', amount: 1 }] },
          { text: 'remove', result: 'c1', effects: [{ kind: 'removeCard', mode: 'choose' }] },
          { text: 'upgrade random', result: 'c2', effects: [{ kind: 'upgradeCard', mode: 'random' }, { kind: 'gainUnit', tier: 1 }] },
        ],
      },
      {
        id: 'fx3', title: 't3', text: 'x',
        choices: [
          { text: 'heal', result: 'h', effects: [{ kind: 'commanderHp', amount: 12 }] },
          { text: 'fixed', result: 'f', effects: [{ kind: 'gainCard', mode: 'fixed', cardId: 'abyss_pact' }, { kind: 'removeCard', mode: 'random' }] },
        ],
      },
    ],
  },
  runDeps.cards, runDeps.units,
);
const [fx, fx2, fx3] = catalog.events as [typeof catalog.events[number], typeof catalog.events[number], typeof catalog.events[number]];
const unitSale = loadEvents(
  {
    version: 1,
    events: [{
      id: 'fx_unit', title: 't', text: 'x',
      choices: [{ text: 'buy unit', result: 'u', effects: [{ kind: 'gold', amount: -4 }, { kind: 'gainUnit', tier: 1 }] }, { text: 'skip', result: 's', effects: [] }],
    }],
  },
  runDeps.cards, runDeps.units,
).events[0] as typeof fx;
const director = new EventDirector(catalog, new CardRewardGenerator(runDeps.cards), 1);

class FakeHost implements EventHost {
  gold = 10;
  hp = 50;
  maxHp = 80;
  cards: string[] = [];
  removable = [11, 12, 13];
  upgradable = [11, 12];
  removed: number[] = [];
  upgraded: number[] = [];
  units: number[] = [];
  benchSpace = true;
  /** 유닛 풀 재고가 바닥났는가 */
  poolEmpty = false;
  /** 앞에서부터 차례로 쓰는 가용성 검사 결과 (비면 실제 상태로 판단). 검사 뒤 상태가 바뀌는 경우를 흉내 낸다 */
  blockerScript: (string | null)[] = [];
  addGold(amount: number): void { this.gold += amount; }
  spendGold(amount: number): boolean {
    if (amount > this.gold) return false;
    this.gold -= amount;
    return true;
  }
  changeHp(delta: number): void { this.hp = Math.max(1, Math.min(this.maxHp, this.hp + delta)); }
  addCard(cardId: string): void { this.cards.push(cardId); }
  removableCards(): number[] { return this.removable; }
  upgradableCards(): number[] { return this.upgradable; }
  removeCard(id: number): void { this.removed.push(id); }
  upgradeCard(id: number): void { this.upgraded.push(id); }
  unitGrantBlocker(_tier: number): string | null {
    if (this.blockerScript.length > 0) return this.blockerScript.shift() as string | null;
    if (!this.benchSpace) return '벤치에 빈 자리가 없습니다';
    return this.poolEmpty ? '유닛 풀 재고가 없습니다' : null;
  }
  relics: string[] = [];
  relicsLeft = true;
  relicBlocker(_rarity: 'common' | 'rare'): string | null { return this.relicsLeft ? null : '더 받을 수 있는 유물이 없습니다'; }
  grantRandomRelic(rarity: 'common' | 'rare', _rng: Rng): string | null {
    if (!this.relicsLeft) return null;
    this.relics.push(rarity);
    return `${rarity} 유물`;
  }
  grantRandomUnit(tier: number, _rng: Rng): boolean {
    if (!this.benchSpace || this.poolEmpty) return false;
    this.units.push(tier);
    return true;
  }
}

describe('이벤트 선택지 효과', () => {
  it('골드 +14와 지휘관 HP -6을 적용한다', () => {
    const host = new FakeHost();
    const state = director.start(fx);
    expect(director.choose(state, fx, 0, host, 'n').ok).toBe(true);
    expect(host.gold).toBe(24);
    expect(host.hp).toBe(44);
    expect(state.messages).toEqual(['r0']);
    expect(director.isFinished(state, fx)).toBe(true);
  });

  it('골드를 내고 희귀도별 무작위 카드를 받는다 (같은 시드·노드면 같은 카드)', () => {
    const run = () => {
      const host = new FakeHost();
      director.choose(director.start(fx), fx, 1, host, 'n1');
      return host;
    };
    const host = run();
    expect(host.gold).toBe(5);
    expect(host.cards).toHaveLength(1);
    expect(runDeps.cards.get(host.cards[0] as string)?.rarity).toBe('common');
    expect(run().cards).toEqual(host.cards);
  });

  it('효과 없는 선택지는 바로 끝난다', () => {
    const host = new FakeHost();
    const state = director.start(fx);
    expect(director.choose(state, fx, 2, host, 'n').ok).toBe(true);
    expect(host.gold).toBe(10);
    expect(director.isFinished(state, fx)).toBe(true);
  });

  it('카드 선택(획득): 후보 3장을 보여 주고 고른 카드를 받은 뒤 남은 효과를 이어서 실행한다', () => {
    const host = new FakeHost();
    const state = director.start(fx2);
    director.choose(state, fx2, 0, host, 'n');
    expect(state.pending?.kind).toBe('gainCard');
    expect(state.pending?.options).toHaveLength(3);
    expect(new Set(state.pending?.options as string[]).size).toBe(3);
    expect(host.gold).toBe(10); // 아직 뒤 효과 전
    expect(director.isFinished(state, fx2)).toBe(false);
    const picked = state.pending?.options[1] as string;
    expect(director.pick(state, fx2, 1, host, 'n').ok).toBe(true);
    expect(host.cards).toEqual([picked]);
    expect(host.gold).toBe(11);
    expect(state.pending).toBeNull();
    expect(director.isFinished(state, fx2)).toBe(true);
    expect(director.pick(state, fx2, 0, host, 'n').ok).toBe(false);
  });

  it('카드 제거(선택): 후보에서 고른 인스턴스를 제거한다. 범위 밖 선택은 거부한다', () => {
    const host = new FakeHost();
    const state = director.start(fx2);
    director.choose(state, fx2, 1, host, 'n');
    expect(state.pending).toEqual({ kind: 'removeCard', options: [11, 12, 13] });
    expect(director.pick(state, fx2, 7, host, 'n').ok).toBe(false);
    expect(director.pick(state, fx2, 2, host, 'n').ok).toBe(true);
    expect(host.removed).toEqual([13]);
  });

  it('카드 강화(무작위)와 무작위 1등급 유닛 획득', () => {
    const host = new FakeHost();
    const state = director.start(fx2);
    director.choose(state, fx2, 2, host, 'n');
    expect(host.upgraded).toHaveLength(1);
    expect([11, 12]).toContain(host.upgraded[0]);
    expect(host.units).toEqual([1]);
    expect(director.isFinished(state, fx2)).toBe(true);
  });

  it('지휘관 HP 회복은 최대치를 넘지 않고, 고정 카드 획득과 무작위 제거가 함께 된다', () => {
    const host = new FakeHost();
    host.hp = 75;
    director.choose(director.start(fx3), fx3, 0, host, 'n');
    expect(host.hp).toBe(80);
    const second = new FakeHost();
    director.choose(director.start(fx3), fx3, 1, second, 'n');
    expect(second.cards).toEqual(['abyss_pact']);
    expect(second.removed).toHaveLength(1);
  });

  it('이미 고른 이벤트는 다시 고를 수 없고, 범위 밖 선택지는 거부한다', () => {
    const host = new FakeHost();
    const state = director.start(fx);
    expect(director.choose(state, fx, 5, host, 'n').ok).toBe(false);
    director.choose(state, fx, 0, host, 'n');
    expect(director.choose(state, fx, 0, host, 'n')).toEqual({ ok: false, reason: '이미 선택지를 골랐습니다' });
    expect(host.gold).toBe(24);
  });
});

describe('이벤트 선택 조건', () => {
  it('골드가 부족한 선택지는 선택 불가이며 상태를 바꾸지 않는다', () => {
    const host = new FakeHost();
    host.gold = 4;
    const views = director.choiceViews(fx, host);
    expect(views.map((v) => v.enabled)).toEqual([true, false, true]);
    expect(views[1]?.reason).toContain('골드가 부족');
    const state = director.start(fx);
    const result = director.choose(state, fx, 1, host, 'n');
    expect(result.ok).toBe(false);
    expect(host.gold).toBe(4);
    expect(host.cards).toEqual([]);
    expect(state.chosen).toBeNull();
  });

  it('지휘관 HP가 모자라 쓰러지게 되는 선택지는 선택 불가다 (HP 6이면 -6 불가, 7이면 가능)', () => {
    const host = new FakeHost();
    host.hp = 6;
    expect(director.choiceViews(fx, host)[0]).toMatchObject({ enabled: false });
    expect(director.choiceViews(fx, host)[0]?.reason).toContain('HP가 부족');
    host.hp = 7;
    expect(director.choiceViews(fx, host)[0]?.enabled).toBe(true);
  });

  it('벤치가 가득하면 유닛 획득 선택지가, 제거/강화 가능한 카드가 없으면 해당 선택지가 불가다', () => {
    const host = new FakeHost();
    host.benchSpace = false;
    expect(director.choiceViews(fx2, host)[2]?.enabled).toBe(false);
    host.benchSpace = true;
    host.removable = [];
    expect(director.choiceViews(fx2, host)[1]?.enabled).toBe(false);
    host.upgradable = [];
    expect(director.choiceViews(fx2, host)[2]?.enabled).toBe(false);
  });
});

describe('유닛 획득 이벤트: 재고 없음', () => {
  it('유닛 풀 재고가 없으면 선택지가 불가 사유와 함께 막히고 골드도 빠지지 않는다', () => {
    const host = new FakeHost();
    host.poolEmpty = true;
    const view = director.choiceViews(unitSale, host)[0];
    expect(view).toMatchObject({ enabled: false });
    expect(view?.reason).toContain('재고');
    const state = director.start(unitSale);
    const result = director.choose(state, unitSale, 0, host, 'n');
    expect(result.ok).toBe(false);
    expect(host.gold).toBe(10);
    expect(host.units).toEqual([]);
    expect(state.chosen).toBeNull();
    expect(state.messages).toEqual([]);
  });

  it('검사 뒤 실행 단계에서 받지 못해도 실패로 알리고 선택 상태를 되돌린다 (효과가 하나도 적용되지 않은 경우)', () => {
    const host = new FakeHost();
    const unitFirst = loadEvents(
      { version: 1, events: [{ id: 'fx_unit2', title: 't', text: 'x', choices: [{ text: 'u', result: 'u', effects: [{ kind: 'gainUnit', tier: 1 }, { kind: 'gold', amount: 3 }] }, { text: 's', result: 's', effects: [] }] }] },
      runDeps.cards, runDeps.units,
    ).events[0] as typeof fx;
    host.blockerScript = [null, '유닛 풀 재고가 없습니다'];
    const state = director.start(unitFirst);
    const result = director.choose(state, unitFirst, 0, host, 'n');
    expect(result).toEqual({ ok: false, reason: '유닛 풀 재고가 없습니다' });
    expect(host.gold).toBe(10);
    expect(host.units).toEqual([]);
    expect(state.chosen).toBeNull();
    expect(state.nextEffect).toBe(0);
    expect(state.messages).toEqual([]);
  });
});

describe('이벤트 선택(노드별 결정)', () => {
  it('노드마다 결정적으로 이벤트를 고르고 본 이벤트를 우선 피한다', () => {
    const real = new EventDirector(runDeps.events, new CardRewardGenerator(runDeps.cards), 9);
    expect(real.pickEvent('3-1', []).id).toBe(real.pickEvent('3-1', []).id);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const event = real.pickEvent(`node-${i}`, seen);
      expect(seen).not.toContain(event.id);
      seen.push(event.id);
    }
    expect(new Set(seen).size).toBe(5);
    expect(runDeps.events.get(real.pickEvent('x', seen).id)).toBeDefined(); // 모두 봤으면 전체에서 다시
  });
});
