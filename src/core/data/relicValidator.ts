import type { EffectDef } from './effect';
import { assertEffectsUsable } from './effectUsage';
import { EffectValidator } from './effectValidator';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';
import { RELIC_RARITIES, type RelicDef, type RelicEffect, type RelicEffectKind, type RelicFile } from './relic';

/** 효과 종류별 허용 파라미터 (kind 제외). 값은 모두 1 이상의 정수 */
const INT_PARAMS: Readonly<Record<Exclude<RelicEffectKind, 'combatStart'>, readonly string[]>> = {
  startCp: ['amount'],
  allyDeathCp: ['amount', 'maxPerCombat'],
  killMana: ['amount'],
  traitTierBonus: ['minUnits'],
  ultimateCharge: ['pct'],
  hpCostReduction: ['amount'],
  spellDamage: ['pct'],
  handLimit: ['amount'],
  openingDraw: ['amount'],
  upgradeOnAcquire: ['count'],
  rewardChoices: ['amount'],
  freeReroll: ['count'],
  mirrorMerge: ['count'],
  interestMax: ['amount'],
  winGold: ['amount'],
  cardDiscount: ['pct'],
  campHeal: ['pct'],
  winHeal: ['amount'],
  maxHp: ['amount'],
};

const RELIC_KEYS = ['id', 'name', 'rarity', 'text', 'unlock', 'effects'] as const;
const PERCENT_KINDS: readonly string[] = ['cardDiscount'];

/** relics.json 구조를 검증한다. 파일 I/O는 하지 않는다. */
export class RelicValidator {
  /** combatStart 효과는 지휘관 패시브처럼 성급이 없다 */
  constructor(private readonly effects: EffectValidator = new EffectValidator({ allowStarArrays: false })) {}

  validateFile(data: unknown): RelicFile {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'relics']);
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const relics = root.array('relics').map((raw, index) => {
      const relic = this.validateRelic(raw, index);
      const prev = seen.get(relic.id);
      if (prev !== undefined) {
        throw new DataValidationError(`relics[${index}] (${relic.id}).id`, `중복된 id "${relic.id}" (relics[${prev}]와 동일)`);
      }
      seen.set(relic.id, index);
      return relic;
    });
    return { version, relics };
  }

  private validateRelic(raw: unknown, index: number): RelicDef {
    let path = `relics[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(RELIC_KEYS);
    const effectsRaw = r.array('effects');
    if (effectsRaw.length === 0) r.fail('effects', '효과가 최소 1개 필요함');
    const relic: RelicDef = {
      id: r.string('id'),
      name: r.string('name'),
      rarity: r.enum('rarity', RELIC_RARITIES),
      text: r.string('text'),
      effects: effectsRaw.map((e, i) => this.validateEffect(FieldReader.of(e, `${path}.effects[${i}]`))),
    };
    if (r.has('unlock')) relic.unlock = r.string('unlock');
    return relic;
  }

  private validateEffect(r: FieldReader): RelicEffect {
    const kinds = ['combatStart', ...Object.keys(INT_PARAMS)] as RelicEffectKind[];
    const kind = r.enum('kind', kinds);
    if (kind === 'combatStart') {
      r.onlyKeys(['kind', 'effects']);
      const effects: EffectDef[] = this.effects.validateList(r, 'effects');
      assertEffectsUsable(r, 'effects', effects, { targetKind: 'none' });
      return { kind, effects };
    }
    const params = INT_PARAMS[kind];
    r.onlyKeys(['kind', ...params]);
    const out: Record<string, unknown> = { kind };
    for (const key of params) {
      out[key] = r.int(key, 1);
      if (PERCENT_KINDS.includes(kind) && (out[key] as number) > 100) r.fail(key, '100 이하여야 함');
    }
    return out as unknown as RelicEffect;
  }
}
