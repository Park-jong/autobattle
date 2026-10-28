import type { CommanderDef, CommanderFile, CommanderPassive, CommanderUltimate, StartingCard, StartingUnit } from './commander';
import { assertEffectsUsable } from './effectUsage';
import { EffectValidator } from './effectValidator';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';

const COMMANDER_KEYS = ['id', 'name', 'passive', 'startingDeck', 'startingUnits', 'startCpBonus', 'maxHp', 'ultimate'] as const;

/** commanders.json 구조를 검증한다. 카드·유닛 id 참조는 loadCommanders가 확인한다. 파일 I/O는 하지 않는다. */
export class CommanderValidator {
  /** 패시브는 성급이 없으므로 성급 배열을 거부한다 */
  constructor(private readonly effects: EffectValidator = new EffectValidator({ allowStarArrays: false })) {}

  validateFile(data: unknown): CommanderFile {
    const root = FieldReader.of(data, '');
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const commanders = root.array('commanders').map((raw, index) => {
      const commander = this.validateCommander(raw, index);
      const prev = seen.get(commander.id);
      if (prev !== undefined) {
        throw new DataValidationError(
          `commanders[${index}] (${commander.id}).id`,
          `중복된 id "${commander.id}" (commanders[${prev}]와 동일)`,
        );
      }
      seen.set(commander.id, index);
      return commander;
    });
    return { version, commanders };
  }

  private validateCommander(raw: unknown, index: number): CommanderDef {
    let path = `commanders[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(COMMANDER_KEYS);
    const commander: CommanderDef = {
      id: r.string('id'),
      name: r.string('name'),
      passive: this.validatePassive(r.object('passive')),
      startingDeck: this.validateDeck(r),
      startingUnits: this.validateUnits(r),
      startCpBonus: r.int('startCpBonus', 0),
    };
    if (r.has('maxHp')) commander.maxHp = r.int('maxHp', 1);
    if (r.has('ultimate')) commander.ultimate = this.validateUltimate(r.object('ultimate'));
    return commander;
  }

  private validatePassive(r: FieldReader): CommanderPassive {
    r.onlyKeys(['name', 'text', 'effects']);
    const effects = this.effects.validateList(r, 'effects');
    // 패시브는 시전자도 지정 대상도 없는 문맥에서 실행된다
    assertEffectsUsable(r, 'effects', effects, { targetKind: 'none' });
    return { name: r.string('name'), text: r.string('text'), effects };
  }

  private validateDeck(r: FieldReader): StartingCard[] {
    return this.validateCounted(r, 'startingDeck', 'cardId');
  }

  private validateUnits(r: FieldReader): StartingUnit[] {
    return this.validateCounted(r, 'startingUnits', 'unitId');
  }

  /** [{ <idKey>, count }] 목록. 비어 있으면 안 되고 같은 id가 두 번 나오면 안 됨 */
  private validateCounted<K extends 'cardId' | 'unitId'>(
    parent: FieldReader,
    key: string,
    idKey: K,
  ): ({ [P in K]: string } & { count: number })[] {
    const list = parent.array(key);
    if (list.length === 0) parent.fail(key, '최소 1개 필요함');
    const seen = new Set<string>();
    return list.map((raw, i) => {
      const item = FieldReader.of(raw, `${parent.path}.${key}[${i}]`);
      item.onlyKeys([idKey, 'count']);
      const id = item.string(idKey);
      if (seen.has(id)) item.fail(idKey, `중복된 id "${id}" (count로 합쳐야 함)`);
      seen.add(id);
      return { [idKey]: id, count: item.int('count', 1) } as { [P in K]: string } & { count: number };
    });
  }

  private validateUltimate(r: FieldReader): CommanderUltimate {
    r.onlyKeys(['name', 'text']);
    return { name: r.string('name'), text: r.string('text') };
  }
}
