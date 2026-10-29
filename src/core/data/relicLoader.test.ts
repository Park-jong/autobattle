import { describe, expect, it } from 'vitest';
import relicsJson from '../../../data/relics.json';
import { loadRelics } from './relicLoader';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Data = { relics: Record<string, unknown>[] };

function errorOf(edit: (d: Data) => void): string {
  const data = clone(relicsJson) as unknown as Data;
  edit(data);
  try {
    loadRelics(data);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

describe('loadRelics', () => {
  it('실제 data/relics.json 28개가 검증을 통과하고 id로 조회된다', () => {
    const catalog = loadRelics(relicsJson);
    expect(catalog.size).toBe(28);
    expect(catalog.get('old_baton')).toMatchObject({ name: '낡은 지휘봉', rarity: 'common', effects: [{ kind: 'startCp', amount: 1 }] });
    expect(catalog.get('nope')).toBeUndefined();
  });

  it('효과 종류는 모두 정해진 집합이다', () => {
    const kinds = new Set(loadRelics(relicsJson).relics.flatMap((r) => r.effects.map((e) => e.kind)));
    expect([...kinds].sort()).toEqual([
      'allyDeathCp', 'campHeal', 'cardDiscount', 'combatStart', 'freeReroll', 'handLimit', 'hpCostReduction', 'interestMax', 'killMana',
      'maxHp', 'mirrorMerge', 'openingDraw', 'rewardChoices', 'spellDamage', 'startCp', 'traitTierBonus', 'ultimateCharge',
      'upgradeOnAcquire', 'winGold', 'winHeal',
    ]);
  });

  it('중복 id / 알 수 없는 희귀도 / 빈 효과를 위치와 함께 거부한다', () => {
    expect(errorOf((d) => { d.relics[1]!.id = 'old_baton'; })).toContain('relics[1] (old_baton).id: 중복된 id "old_baton" (relics[0]와 동일)');
    expect(errorOf((d) => { d.relics[0]!.rarity = 'epic'; })).toContain('relics[0] (old_baton).rarity: 알 수 없는 값 "epic"');
    expect(errorOf((d) => { d.relics[0]!.effects = []; })).toContain('relics[0] (old_baton).effects: 효과가 최소 1개 필요함');
  });

  it('알 수 없는 효과·모르는 필드·잘못된 수치를 거부한다', () => {
    expect(errorOf((d) => { (d.relics[0]!.effects as Record<string, unknown>[])[0]!.kind = 'nuke'; })).toContain('relics[0] (old_baton).effects[0].kind: 알 수 없는 값 "nuke"');
    expect(errorOf((d) => { (d.relics[0]!.effects as Record<string, unknown>[])[0]!.bonus = 3; })).toContain('effects[0].bonus: 알 수 없는 필드');
    expect(errorOf((d) => { (d.relics[0]!.effects as Record<string, unknown>[])[0]!.amount = 0; })).toContain('effects[0].amount: 1 이상이어야 함');
    expect(errorOf((d) => { (d.relics[0]!.effects as Record<string, unknown>[])[0]!.amount = 1.5; })).toContain('effects[0].amount: 정수여야 함');
    expect(errorOf((d) => { delete d.relics[0]!.name; })).toContain('relics[0] (old_baton).name: 필수 필드 누락');
    expect(errorOf((d) => { d.relics[0]!.surprise = 1; })).toContain('relics[0] (old_baton).surprise: 알 수 없는 필드');
  });

  it('할인율은 100을 넘을 수 없다', () => {
    expect(errorOf((d) => {
      const voucher = d.relics.find((r) => r.id === 'wholesale_voucher')!;
      (voucher.effects as Record<string, unknown>[])[0]!.pct = 150;
    })).toContain('pct: 100 이하여야 함');
  });

  it('combatStart 효과는 공통 효과 검증기를 쓴다 (성급 배열·시전자 전용 선택자 거부)', () => {
    const bulwark = (d: Data) => (d.relics.find((r) => r.id === 'bulwark_crest')!.effects as { effects: Record<string, unknown>[] }[])[0]!.effects[0]!;
    expect(errorOf((d) => { bulwark(d).pctMaxHp = [8, 10, 12]; })).toContain('이 위치에서는 성급별 배열을 쓸 수 없음');
    expect(errorOf((d) => { bulwark(d).selector = 'self'; })).toContain('시전 유닛이 있는 스킬 전용 선택자');
    expect(errorOf((d) => {
      const list = (d.relics.find((r) => r.id === 'bulwark_crest')!.effects as { effects: Record<string, unknown>[] }[])[0]!;
      list.effects = [{ kind: 'cpGain', selector: 'allAllies', amount: 1 }];
    })).toContain('cpGain은 카드 전용 효과임');
  });
});
