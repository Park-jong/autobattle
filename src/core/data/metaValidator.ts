import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';
import { UNLOCK_CONDITION_TYPES, UNLOCK_TARGETS, type MetaFile, type PointsRule, type UnlockCondition, type UnlockEntry } from './meta';

/** 조건 종류별 추가 필드 (type 제외). 모두 1 이상의 정수 */
const CONDITION_PARAMS: Readonly<Record<UnlockCondition['type'], readonly string[]>> = {
  runsCompleted: ['count'],
  bossKilled: ['act'],
  eliteKills: ['count'],
  unitStar3: [],
  runCompletedWithDeckSize: ['minSize'],
  ultimateUses: ['count'],
  reachBossWithGold: ['gold'],
  shopVisits: ['count'],
};

/** meta.json 구조를 검증한다. 지휘관·유물 id 참조와 잠금 집합 일치는 loadMeta가 확인한다. 파일 I/O는 하지 않는다. */
export class MetaValidator {
  validateFile(data: unknown): MetaFile {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'points', 'unlocks']);
    const version = root.int('version', 1);
    const points = this.validatePoints(root.object('points'));
    const seen = new Map<string, number>();
    const unlocks = root.array('unlocks').map((raw, index) => {
      const entry = this.validateEntry(raw, index);
      const first = seen.get(entry.id);
      if (first !== undefined) {
        throw new DataValidationError(`unlocks[${index}].id`, `중복된 id "${entry.id}" (unlocks[${first}]와 동일)`);
      }
      seen.set(entry.id, index);
      return entry;
    });
    return { version, points, unlocks };
  }

  private validatePoints(r: FieldReader): PointsRule {
    r.onlyKeys(['perFloor', 'perBoss', 'perElite', 'victoryBonus']);
    return {
      perFloor: r.int('perFloor', 0),
      perBoss: r.int('perBoss', 0),
      perElite: r.int('perElite', 0),
      victoryBonus: r.int('victoryBonus', 0),
    };
  }

  private validateEntry(raw: unknown, index: number): UnlockEntry {
    const r = FieldReader.of(raw, `unlocks[${index}]`);
    r.onlyKeys(['target', 'id', 'price', 'condition']);
    return {
      target: r.enum('target', UNLOCK_TARGETS),
      id: r.string('id'),
      price: r.int('price', 1),
      condition: this.validateCondition(r.object('condition')),
    };
  }

  private validateCondition(r: FieldReader): UnlockCondition {
    const type = r.enum('type', UNLOCK_CONDITION_TYPES);
    const params = CONDITION_PARAMS[type];
    r.onlyKeys(['type', ...params]);
    const condition: Record<string, unknown> = { type };
    for (const key of params) condition[key] = r.int(key, 1);
    return condition as unknown as UnlockCondition;
  }
}
