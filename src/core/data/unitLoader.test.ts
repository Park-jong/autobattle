/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import cardsJson from '../../../data/cards.json';
import traitsJson from '../../../data/traits.json';
import unitsJson from '../../../data/units.json';
import { EffectValidator } from './effectValidator';
import { FieldReader } from './fieldReader';
import { loadTraits } from './traitLoader';
import { loadUnits } from './unitLoader';

const traits = loadTraits(traitsJson);

function unitError(mutate: (d: any) => void, withTraits = true): string {
  const d: any = structuredClone(unitsJson);
  mutate(d);
  try {
    loadUnits(d, withTraits ? traits : undefined);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

function traitError(mutate: (d: any) => void): string {
  const d: any = structuredClone(traitsJson);
  mutate(d);
  try {
    loadTraits(d);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

describe('loadUnits', () => {
  it('실제 data/units.json 15기(보스 포함)가 통과하고 특성 참조도 유효', () => {
    const catalog = loadUnits(unitsJson, traits);
    expect(catalog.size).toBe(15);
    const shield = catalog.get('iron_shieldbearer');
    expect(shield?.stats).toEqual({ hp: 650, atk: 40, as: 0.6, rng: 1, arm: 40, res: 20, mana: 80 });
    expect(shield?.skill.effects).toHaveLength(2);
  });

  it('성급별 수치 배열이 보존됨', () => {
    const stun = loadUnits(unitsJson).get('iron_shieldbearer')?.skill.effects[1];
    expect(stun).toMatchObject({ kind: 'stun', duration: [1, 1.25, 1.5] });
  });

  it('알 수 없는 필드와 effect.kind', () => {
    expect(unitError((d) => (d.units[0].extra = 1))).toContain('units[0] (iron_shieldbearer).extra: 알 수 없는 필드');
    expect(unitError((d) => (d.units[0].skill.effects[0].kind = 'boom'))).toContain(
      'units[0] (iron_shieldbearer).skill.effects[0].kind: 알 수 없는 값 "boom"',
    );
    expect(unitError((d) => (d.units[0].skill.effects[0].foo = 1))).toContain('skill.effects[0].foo: 알 수 없는 필드');
  });

  it('성급 배열은 길이 3이어야 함', () => {
    expect(unitError((d) => (d.units[0].skill.effects[1].duration = [1, 2]))).toContain(
      'skill.effects[1].duration: 성급별 배열은 길이 3이어야 함',
    );
    expect(unitError((d) => (d.units[0].skill.effects[1].duration = [1, 'a', 3]))).toContain(
      'skill.effects[1].duration[1]: 숫자여야 함',
    );
  });

  it('필수 필드 누락 / 타입 오류', () => {
    expect(unitError((d) => delete d.units[1].stats.hp)).toBe('units[1] (arena_recruit).stats.hp: 필수 필드 누락');
    expect(unitError((d) => (d.units[2].stats.rng = 1.5))).toContain('units[2] (legion_crossbow).stats.rng: 정수여야 함');
    expect(unitError((d) => (d.units[0].skill.targeting = 'x'))).toContain('skill.targeting: 알 수 없는 값 "x"');
    expect(unitError((d) => (d.units[0].skill.effects = []))).toContain('skill.effects: 효과가 최소 1개 필요함');
  });

  it('중복 id', () => {
    expect(unitError((d) => (d.units[1].id = 'iron_shieldbearer'))).toContain('units[1] (iron_shieldbearer).id: 중복된 id');
  });

  it('존재하지 않는 특성 참조 / 종류 불일치', () => {
    expect(unitError((d) => (d.units[0].origin = 'nope'))).toBe(
      'units[0] (iron_shieldbearer).origin: traits.json에 없는 특성 id "nope"',
    );
    expect(unitError((d) => (d.units[0].job = 'iron_legion'))).toContain('종류가 origin라서 job 자리에');
    expect(() => unitError((d) => (d.units[0].origin = 'nope'), false)).toThrow('에러가 발생해야 함');
  });
});

describe('loadTraits', () => {
  it('9개 특성 정의 중 6개에 실제 효과가 있다', () => {
    expect(traits.size).toBe(9);
    const withEffects = traits.traits.filter((t) => t.effects && t.effects.length > 0).map((t) => t.id);
    expect(withEffects).toEqual(['iron_legion', 'ember', 'abyss', 'guardian', 'gladiator', 'marksman']);
    for (const id of ['iron_legion', 'ember', 'abyss', 'forest_pact', 'guardian', 'gladiator', 'marksman', 'mystic', 'assassin']) {
      expect(traits.get(id)).toBeDefined();
    }
  });

  it('thresholds 검증', () => {
    expect(traitError((d) => (d.traits[0].thresholds = [2, 4]))).toContain('traits[0] (iron_legion).thresholds: 길이 3');
    expect(traitError((d) => (d.traits[0].thresholds = [4, 2, 6]))).toContain('오름차순');
    expect(traitError((d) => (d.traits[0].thresholds = [2, 4, 0.5]))).toContain('thresholds[2]');
  });

  it('kind / 알 수 없는 필드 / 중복 id', () => {
    expect(traitError((d) => (d.traits[0].kind = 'x'))).toContain('traits[0] (iron_legion).kind: 알 수 없는 값 "x"');
    expect(traitError((d) => (d.traits[1].oops = 1))).toContain('traits[1] (ember).oops: 알 수 없는 필드');
    expect(traitError((d) => (d.traits[1].id = 'iron_legion'))).toContain('중복된 id');
  });
});

describe('효과 검증기와 카드 호환', () => {
  it('덱 드로우는 유닛 스킬과 특성에서 거부한다', () => {
    const effect = { kind: 'drawCards', selector: 'allAllies', count: 2 };
    expect(unitError((d) => { d.units[0].skill.effects = [effect]; })).toContain('카드 전용');
    expect(traitError((d) => { d.traits[0].effects = [effect]; })).toContain('카드 전용');
  });
  it('cards.json의 모든 카드 효과가 전투 효과 검증기를 통과 (카드가 같은 효과 모듈을 재사용 가능)', () => {
    const validator = new EffectValidator({ allowStarArrays: false, allowCardEffects: true });
    for (const card of cardsJson.cards) {
      const lists = [card.effects, ...(card.upgrade ? [card.upgrade.effects] : [])];
      for (const effects of lists) {
        const parent = FieldReader.of({ effects }, card.id);
        expect(validator.validateList(parent, 'effects')).toHaveLength(effects.length);
      }
    }
  });

  it('새 effect kind 파라미터 검증', () => {
    const validator = new EffectValidator();
    const check = (effect: unknown) => validator.validateEffect(FieldReader.of(effect, 'e'));
    expect(check({ kind: 'burn', selector: 'target', dpsPctAtk: 10, duration: 3 })).toMatchObject({ kind: 'burn' });
    expect(() => check({ kind: 'damage', selector: 'target', pctAtk: 100, dmgType: 'fire' })).toThrow('e.dmgType');
    expect(() => check({ kind: 'teleport', selector: 'self', destination: 'x' })).toThrow('e.destination');
    expect(() => check({ kind: 'extraShots', selector: 'self', count: 0 })).toThrow('e.count: 1 이상');
    expect(() => check({ kind: 'statMod', selector: 'self', stat: 'atk', pct: 1, duration: 1, refreshOnKill: 'y' })).toThrow(
      'e.refreshOnKill: 불리언',
    );
  });
});
