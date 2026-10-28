import { DataValidationError } from './errors';
import { EffectValidator } from './effectValidator';
import { FieldReader } from './fieldReader';
import { DAMAGE_TYPES } from './effect';
import { PATTERN_KINDS, SKILL_TARGETINGS, type SkillDef, type UnitDef, type UnitFile, type UnitPattern, type UnitStats } from './unit';

const UNIT_KEYS = ['id', 'name', 'tier', 'origin', 'job', 'stats', 'skill', 'grantedCard', 'boss', 'pattern'] as const;
const STAT_KEYS = ['hp', 'atk', 'as', 'rng', 'arm', 'res', 'mana'] as const;
const SKILL_KEYS = ['name', 'text', 'targeting', 'effects', 'targetCount'] as const;

/** units.json 구조를 검증해 타입 있는 UnitDef로 변환한다. 파일 I/O는 하지 않는다. */
export class UnitValidator {
  constructor(private readonly effects: EffectValidator = new EffectValidator()) {}

  validateFile(data: unknown): UnitFile {
    const root = FieldReader.of(data, '');
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const units = root.array('units').map((raw, index) => {
      const unit = this.validateUnit(raw, index);
      const prev = seen.get(unit.id);
      if (prev !== undefined) {
        throw new DataValidationError(
          `units[${index}] (${unit.id}).id`,
          `중복된 id "${unit.id}" (units[${prev}]와 동일)`,
        );
      }
      seen.set(unit.id, index);
      return unit;
    });
    return { version, units };
  }

  private validateUnit(raw: unknown, index: number): UnitDef {
    let path = `units[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(UNIT_KEYS);
    const unit: UnitDef = {
      id: r.string('id'),
      name: r.string('name'),
      tier: r.int('tier', 1),
      origin: r.string('origin'),
      job: r.string('job'),
      stats: this.validateStats(r.object('stats')),
      skill: this.validateSkill(r.object('skill')),
    };
    if (r.has('grantedCard')) unit.grantedCard = r.string('grantedCard');
    if (r.has('boss')) {
      if (!r.boolean('boss')) r.fail('boss', 'true만 허용됨 (보스가 아니면 필드를 생략)');
      unit.boss = true;
    }
    if (r.has('pattern')) unit.pattern = this.validatePattern(r.object('pattern'));
    return unit;
  }

  private validatePattern(r: FieldReader): UnitPattern {
    r.onlyKeys(['kind', 'intervalSeconds', 'telegraphSeconds', 'damage', 'dmgType']);
    const intervalSeconds = r.number('intervalSeconds', 1);
    const telegraphSeconds = r.number('telegraphSeconds', 0.1);
    if (telegraphSeconds >= intervalSeconds) r.fail('telegraphSeconds', '예고 시간은 발동 간격보다 짧아야 함');
    return { kind: r.enum('kind', PATTERN_KINDS), intervalSeconds, telegraphSeconds, damage: r.number('damage', 0), dmgType: r.enum('dmgType', DAMAGE_TYPES) };
  }

  private validateStats(r: FieldReader): UnitStats {
    r.onlyKeys(STAT_KEYS);
    return {
      hp: r.number('hp', 1),
      atk: r.number('atk', 0),
      as: r.number('as', 0.01),
      rng: r.int('rng', 1),
      arm: r.number('arm', 0),
      res: r.number('res', 0),
      mana: r.int('mana', 1),
    };
  }

  private validateSkill(r: FieldReader): SkillDef {
    r.onlyKeys(SKILL_KEYS);
    const skill: SkillDef = {
      name: r.string('name'),
      text: r.string('text'),
      targeting: r.enum('targeting', SKILL_TARGETINGS),
      effects: this.effects.validateList(r, 'effects'),
    };
    if (r.has('targetCount')) {
      const raw = r.rawValue('targetCount');
      if (Array.isArray(raw)) {
        if (raw.length !== 3 || raw.some((n) => !Number.isInteger(n) || n < 1)) r.fail('targetCount', '양의 정수 3개가 필요함');
        skill.targetCount = raw as [number, number, number];
      } else skill.targetCount = r.int('targetCount', 1);
    }
    return skill;
  }
}
