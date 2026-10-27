/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import traitsJson from '../../../data/traits.json';
import { loadCards } from './cardLoader';
import { loadTraits } from './traitLoader';

const traits = loadTraits(traitsJson);

function card(overrides: Record<string, unknown>): any {
  return {
    id: 'fx',
    name: 'fx',
    owner: 'neutral',
    rarity: 'common',
    type: 'command',
    cost: 1,
    target: { kind: 'none' },
    keywords: [],
    text: 't',
    effects: [{ kind: 'heal', selector: 'allAllies', amount: 10 }],
    ...overrides,
  };
}

function load(cards: unknown[], withTraits = true) {
  return loadCards({ version: 1, cards }, withTraits ? traits : undefined);
}
function errorOf(cards: unknown[], withTraits = true): string {
  try {
    load(cards, withTraits);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

describe('카드 검증기: 공통 효과 검증기 통합', () => {
  it('cards.json 16종은 특성 참조 검증과 함께도 통과', () => {
    expect(loadCards(cardsJson, traits).size).toBe(16);
  });

  it('전투 효과 kind 전부를 카드에서 쓸 수 있다 (시전자 불필요한 형태)', () => {
    const effects = [
      { kind: 'shield', selector: 'allAllies', pctMaxHp: 10, duration: 'combat' },
      { kind: 'damageTakenMult', selector: 'allAllies', mult: 0.9, duration: 'combat' },
      { kind: 'statMod', selector: 'allAllies', stat: 'atk', pct: 10, duration: 2 },
      { kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 5, duration: 2 },
      { kind: 'undying', selector: 'target', duration: 1 },
      { kind: 'flatDamage', selector: 'target', amount: 100, dmgType: 'magic', ignoreArmorPct: 10 },
      { kind: 'stun', selector: 'target', duration: 1 },
      { kind: 'heal', selector: 'target', amount: 50 },
      { kind: 'healAura', selector: 'target', perSecond: 10, radius: 1, duration: 3 },
      { kind: 'burn', selector: 'target', dps: 20, duration: 3 },
      { kind: 'silence', selector: 'target', duration: 2 },
      { kind: 'manaDrain', selector: 'target', amount: 20 },
      { kind: 'extraShots', selector: 'allAllies', count: 2 },
      { kind: 'forceTarget', selector: 'allAllies', duration: 3 },
      { kind: 'teleport', selector: 'allAllies', destination: 'behindTarget' },
      { kind: 'swapPositions', selector: 'target' },
    ];
    expect(() => load([card({ target: { kind: 'enemyUnit' }, effects })])).not.toThrow();
  });

  it('확장 selector: 대상+인접, 범위 안 적/아군', () => {
    expect(() =>
      load([card({ target: { kind: 'enemyUnit' }, effects: [{ kind: 'stun', selector: 'targetAndAdjacent', duration: 1 }] })]),
    ).not.toThrow();
    expect(() =>
      load([
        card({
          target: { kind: 'area3x3' },
          effects: [
            { kind: 'flatDamage', selector: 'enemiesInTargetArea', amount: 100, dmgType: 'magic' },
            { kind: 'heal', selector: 'alliesInTargetArea', amount: 10 },
          ],
        }),
      ]),
    ).not.toThrow();
  });

  it('성급 배열은 카드에서 거부', () => {
    const msg = errorOf([card({ effects: [{ kind: 'heal', selector: 'allAllies', amount: [10, 20, 30] }] })]);
    expect(msg).toContain('cards[0] (fx).effects[0].amount: 이 위치에서는 성급별 배열을 쓸 수 없음');
    expect(errorOf([card({ upgrade: { text: 'u', effects: [{ kind: 'heal', selector: 'allAllies', amount: [1, 2, 3] }] } })])).toContain(
      'upgrade.effects[0].amount',
    );
  });

  it('알 수 없는 kind·selector·stat는 공통 검증기의 오류로 거부', () => {
    expect(errorOf([card({ effects: [{ kind: 'nuke', selector: 'allAllies' }] })])).toContain('effects[0].kind: 알 수 없는 값 "nuke"');
    expect(errorOf([card({ effects: [{ kind: 'heal', selector: 'everyone', amount: 1 }] })])).toContain('effects[0].selector');
    expect(errorOf([card({ effects: [{ kind: 'statMod', selector: 'allAllies', stat: 'luck', pct: 1, duration: 1 }] })])).toContain(
      'effects[0].stat: 알 수 없는 값 "luck"',
    );
  });

  it('시전자가 필요한 효과·선택자는 카드에서 거부', () => {
    expect(errorOf([card({ effects: [{ kind: 'damage', selector: 'allAllies', pctAtk: 100, dmgType: 'physical' }] })])).toContain(
      'damage는 시전자의 ATK가 필요',
    );
    expect(errorOf([card({ effects: [{ kind: 'burn', selector: 'allAllies', dpsPctAtk: 10, duration: 3 }] })])).toContain('dps');
    expect(errorOf([card({ effects: [{ kind: 'heal', selector: 'self', amount: 1 }] })])).toContain('시전 유닛이 있는 스킬 전용');
    expect(errorOf([card({ effects: [{ kind: 'cpOnKill', selector: 'allAllies', amount: 1, maxPerCombat: 2 }] })])).toContain('특성 전용');
  });

  it('selector와 target.kind가 맞지 않으면 거부', () => {
    expect(errorOf([card({ effects: [{ kind: 'heal', selector: 'target', amount: 1 }] })])).toContain(
      '유닛을 지정하는 대상(target.kind: none)에서는 쓸 수 없음',
    );
    expect(errorOf([card({ effects: [{ kind: 'heal', selector: 'enemiesInTargetArea', amount: 1 }] })])).toContain('칸/범위를 지정하는 대상에서만');
    expect(errorOf([card({ effects: [{ kind: 'forceTarget', selector: 'allAllies', duration: 3 }] })])).toContain('지정 유닛 대상이 필요');
  });

  it('burn은 dpsPctAtk와 dps 중 정확히 하나', () => {
    expect(errorOf([card({ effects: [{ kind: 'burn', selector: 'allAllies', duration: 3 }] })])).toContain('정확히 하나');
    expect(
      errorOf([card({ effects: [{ kind: 'burn', selector: 'allAllies', dps: 5, dpsPctAtk: 10, duration: 3 }] })]),
    ).toContain('정확히 하나');
  });
});

describe('카드 검증기: 공명과 연쇄', () => {
  const chainEffects = [{ kind: 'heal', selector: 'allAllies', amount: 5 }];

  it('비용만 바꾸는 연쇄를 허용하고 잘못된 비용·빈 연쇄는 거부한다', () => {
    expect(load([card({ keywords: ['chain'], chain: { cost: 0, effects: [] } })]).get('fx')?.chain?.cost).toBe(0);
    for (const cost of [-1, 0.5, '0']) {
      expect(errorOf([card({ keywords: ['chain'], chain: { cost, effects: [] } })])).toContain('chain.cost');
    }
    expect(errorOf([card({ keywords: ['chain'], chain: { effects: [] } })])).toContain('연쇄 효과 또는 비용이 필요함');
  });

  it('드로우 수는 양의 정수, 선택자는 allAllies만 허용한다', () => {
    for (const count of [0, -1, 1.5, [1, 2, 3]]) {
      expect(errorOf([card({ effects: [{ kind: 'drawCards', selector: 'allAllies', count }] })])).toContain('.count');
    }
    expect(errorOf([card({ target: { kind: 'allyUnit' }, effects: [{ kind: 'drawCards', selector: 'target', count: 2 }] })])).toContain('.selector');
  });

  it('연쇄 키워드가 있으면 chain 효과가 필요하고, 형식은 { effects: [...] }', () => {
    const ok = load([card({ keywords: ['chain'], chain: { effects: chainEffects } })]);
    expect(ok.get('fx')?.chain?.effects).toHaveLength(1);
    expect(errorOf([card({ keywords: ['chain'] })])).toContain('cards[0] (fx).chain: 필수 필드 누락'.replace('필수 필드 누락', 'keywords에 chain이 있으면'));
  });

  it('연쇄 키워드가 없는데 chain이 있으면 거부', () => {
    expect(errorOf([card({ chain: { effects: chainEffects } })])).toContain('keywords에 chain이 없는 카드는');
  });

  it('chain 효과도 카드 문맥 규칙을 따른다 (성급 배열 불가)', () => {
    expect(
      errorOf([card({ keywords: ['chain'], chain: { effects: [{ kind: 'heal', selector: 'allAllies', amount: [1, 2, 3] }] } })]),
    ).toContain('chain.effects[0].amount');
  });

  it('upgrade는 resonance·chain을 대체할 수 있다', () => {
    const c = load([
      card({
        keywords: ['chain'],
        chain: { effects: chainEffects },
        resonance: { trait: 'ember', effects: chainEffects },
        upgrade: {
          text: 'u',
          effects: chainEffects,
          resonance: { trait: 'ember', effects: chainEffects },
          chain: { effects: chainEffects },
        },
      }),
    ]).get('fx');
    expect(c?.upgrade?.chain).toBeDefined();
    expect(c?.upgrade?.resonance).toBeDefined();
    expect(errorOf([card({ upgrade: { text: 'u', effects: chainEffects, chain: { effects: chainEffects } } })])).toContain(
      'upgrade.chain',
    );
  });

  it('공명이 가리키는 특성 id가 없으면 거부 (특성 카탈로그를 줬을 때)', () => {
    const bad = card({ resonance: { trait: 'nope', effects: chainEffects } });
    expect(errorOf([bad])).toContain('cards[0] (fx).resonance.trait: traits.json에 없는 특성 id "nope"');
    expect(() => load([bad], false)).not.toThrow();
  });
});
