import { DataValidationError } from './errors';
import { EffectValidator } from './effectValidator';
import { FieldReader } from './fieldReader';
import { TRAIT_KINDS, type TraitDef, type TraitFile } from './trait';

const TRAIT_KEYS = ['id', 'name', 'kind', 'thresholds', 'text', 'effects'] as const;

/** traits.json 구조를 검증한다. 파일 I/O는 하지 않는다. */
export class TraitValidator {
  constructor(private readonly effects: EffectValidator = new EffectValidator()) {}

  validateFile(data: unknown): TraitFile {
    const root = FieldReader.of(data, '');
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const traits = root.array('traits').map((raw, index) => {
      const trait = this.validateTrait(raw, index);
      const prev = seen.get(trait.id);
      if (prev !== undefined) {
        throw new DataValidationError(
          `traits[${index}] (${trait.id}).id`,
          `중복된 id "${trait.id}" (traits[${prev}]와 동일)`,
        );
      }
      seen.set(trait.id, index);
      return trait;
    });
    return { version, traits };
  }

  private validateTrait(raw: unknown, index: number): TraitDef {
    let path = `traits[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(TRAIT_KEYS);
    const trait: TraitDef = {
      id: r.string('id'),
      name: r.string('name'),
      kind: r.enum('kind', TRAIT_KINDS),
      thresholds: this.validateThresholds(r),
      text: r.string('text'),
    };
    if (r.has('effects')) trait.effects = this.effects.validateList(r, 'effects', true);
    return trait;
  }

  /** 정수 3개, 1 이상, 엄격한 오름차순 */
  private validateThresholds(r: FieldReader): [number, number, number] {
    const list = r.array('thresholds');
    if (list.length !== 3) r.fail('thresholds', `길이 3이어야 함 (실제: ${list.length})`);
    const values = list.map((v, i) => {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        r.fail(`thresholds[${i}]`, '1 이상의 정수여야 함');
      }
      return v;
    });
    const [a, b, c] = values as [number, number, number];
    if (!(a < b && b < c)) r.fail('thresholds', `오름차순이어야 함 (실제: ${values.join(', ')})`);
    return [a, b, c];
  }
}
