import type { CommanderDef, CommanderFile, CommanderPassive, CommanderUltimate, StartingCard, StartingUnit, UltimateBarrage } from './commander';
import { assertEffectsUsable } from './effectUsage';
import { EffectValidator } from './effectValidator';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';

const COMMANDER_KEYS = ['id', 'name', 'passive', 'startingDeck', 'startingUnits', 'startCpBonus', 'maxHp', 'ultimate', 'unlock'] as const;

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
    const passiveReader = r.object('passive');
    const commander: CommanderDef = {
      id: r.string('id'),
      name: r.string('name'),
      passive: this.validatePassive(passiveReader),
      startingDeck: this.validateDeck(r),
      startingUnits: this.validateUnits(r),
      startCpBonus: r.int('startCpBonus', 0),
    };
    // 패시브가 실제로 하는 일: 전투 시작 효과, 주문 피해·골드 보정, 시작 CP 보정 중 하나는 있어야 한다
    const p = commander.passive;
    if (p.effects.length === 0 && p.spellDamagePct === undefined && p.goldPerLeftoverCp === undefined && commander.startCpBonus === 0) {
      passiveReader.fail('effects', '효과가 비어 있으면 spellDamagePct·goldPerLeftoverCp 또는 지휘관 startCpBonus 보정이 있어야 함 (아무 효과 없는 패시브)');
    }
    if (r.has('maxHp')) commander.maxHp = r.int('maxHp', 1);
    if (r.has('unlock')) commander.unlock = r.string('unlock');
    if (r.has('ultimate')) commander.ultimate = this.validateUltimate(r.object('ultimate'));
    return commander;
  }

  private validatePassive(r: FieldReader): CommanderPassive {
    r.onlyKeys(['name', 'text', 'effects', 'spellDamagePct', 'goldPerLeftoverCp']);
    const effects = this.effects.validateList(r, 'effects', true);
    // 패시브는 시전자도 지정 대상도 없는 문맥에서 실행된다
    assertEffectsUsable(r, 'effects', effects, { targetKind: 'none' });
    const passive: CommanderPassive = { name: r.string('name'), text: r.string('text'), effects };
    if (r.has('spellDamagePct')) passive.spellDamagePct = r.int('spellDamagePct', 1);
    if (r.has('goldPerLeftoverCp')) passive.goldPerLeftoverCp = r.int('goldPerLeftoverCp', 1);
    return passive;
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
    r.onlyKeys(['name', 'text', 'hpCostPct', 'effects', 'cpRegenBoostSeconds', 'barrage']);
    const ultimate: CommanderUltimate = { name: r.string('name'), text: r.string('text') };
    if (r.has('hpCostPct')) {
      ultimate.hpCostPct = r.int('hpCostPct', 1);
      if (ultimate.hpCostPct > 100) r.fail('hpCostPct', '100 이하여야 함');
    }
    if (r.has('effects')) {
      ultimate.effects = this.effects.validateList(r, 'effects', true);
      assertEffectsUsable(r, 'effects', ultimate.effects, { targetKind: 'none' });
    }
    if (r.has('cpRegenBoostSeconds')) ultimate.cpRegenBoostSeconds = r.int('cpRegenBoostSeconds', 1);
    if (r.has('barrage')) ultimate.barrage = this.validateBarrage(r.object('barrage'));
    // 궁극기는 id가 아니라 데이터로 정의된다: 실제로 하는 일(효과·운석·CP 가속)이 하나는 있어야 한다
    if (!ultimate.effects?.length && !ultimate.barrage && ultimate.cpRegenBoostSeconds === undefined) {
      r.fail('effects', '효과(effects)·운석(barrage)·CP 가속(cpRegenBoostSeconds) 중 하나는 정의해야 함 (효과 없는 궁극기)');
    }
    return ultimate;
  }

  private validateBarrage(r: FieldReader): UltimateBarrage {
    r.onlyKeys(['count', 'intervalSeconds', 'radius', 'effects']);
    const effects = this.effects.validateList(r, 'effects');
    // 착탄 효과는 3×3 같은 범위를 지정한 문맥에서 실행된다
    assertEffectsUsable(r, 'effects', effects, { targetKind: 'area3x3' });
    return { count: r.int('count', 1), intervalSeconds: r.number('intervalSeconds', 0.1), radius: r.int('radius', 0), effects };
  }
}
