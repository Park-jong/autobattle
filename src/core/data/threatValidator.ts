import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';
import {
  MAX_THREAT_LEVEL, THREAT_EFFECT_KINDS, THREAT_ENEMY_KINDS, type ThreatEffect, type ThreatEnemyKind, type ThreatFile, type ThreatLevelDef,
} from './threat';

/** threat.json 구조를 검증한다. 카드 id 참조는 loadThreat가 확인한다. 파일 I/O는 하지 않는다. */
export class ThreatValidator {
  validateFile(data: unknown): ThreatFile {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'levels']);
    const version = root.int('version', 1);
    const levels = root.array('levels').map((raw, index) => this.validateLevel(raw, index));
    if (levels.length !== MAX_THREAT_LEVEL) {
      throw new DataValidationError('levels', `레벨 1~${MAX_THREAT_LEVEL}을 하나씩 정확히 ${MAX_THREAT_LEVEL}개 가져야 함 (실제: ${levels.length}개)`);
    }
    levels.forEach((def, index) => {
      if (def.level !== index + 1) throw new DataValidationError(`levels[${index}].level`, `${index + 1}이어야 함 (레벨은 1부터 순서대로, 실제: ${def.level})`);
    });
    return { version, levels };
  }

  private validateLevel(raw: unknown, index: number): ThreatLevelDef {
    const r = FieldReader.of(raw, `levels[${index}]`);
    r.onlyKeys(['level', 'name', 'text', 'effects']);
    const level = r.int('level', 1);
    const name = r.string('name');
    const text = r.string('text');
    const effects = r.array('effects').map((effect, i) => this.validateEffect(effect, `levels[${index}].effects[${i}]`));
    if (effects.length === 0) throw new DataValidationError(`levels[${index}].effects`, '효과가 하나 이상 있어야 함');
    return { level, name, text, effects };
  }

  private validateEffect(raw: unknown, path: string): ThreatEffect {
    const r = FieldReader.of(raw, path);
    const kind = r.enum('kind', THREAT_EFFECT_KINDS);
    switch (kind) {
      case 'enemyStatPct': {
        r.onlyKeys(['kind', 'kinds', 'hp', 'atk']);
        const kinds = r.array('kinds').map((value, i): ThreatEnemyKind => {
          if (typeof value !== 'string' || !(THREAT_ENEMY_KINDS as readonly string[]).includes(value)) {
            r.fail(`kinds[${i}]`, `알 수 없는 값 ${JSON.stringify(value)} (허용: ${THREAT_ENEMY_KINDS.join(', ')})`);
          }
          return value as ThreatEnemyKind;
        });
        if (kinds.length === 0) r.fail('kinds', '적 종류가 하나 이상 있어야 함');
        if (new Set(kinds).size !== kinds.length) r.fail('kinds', '중복된 적 종류');
        if (!r.has('hp') && !r.has('atk')) r.fail('hp', 'hp 또는 atk 중 하나 이상 필요');
        return { kind, kinds, ...(r.has('hp') ? { hp: r.int('hp', 1) } : {}), ...(r.has('atk') ? { atk: r.int('atk', 1) } : {}) };
      }
      case 'startGoldDelta': {
        r.onlyKeys(['kind', 'amount']);
        const amount = r.int('amount', -1000);
        if (amount === 0) r.fail('amount', '0이 아니어야 함');
        return { kind, amount };
      }
      case 'startCurse':
        r.onlyKeys(['kind', 'cardId', 'count']);
        return { kind, cardId: r.string('cardId'), count: r.int('count', 1) };
      case 'actHealPct': {
        r.onlyKeys(['kind', 'delta']);
        const delta = r.int('delta', -100);
        if (delta === 0 || delta > 100) r.fail('delta', `-100~100의 0이 아닌 정수여야 함 (실제: ${delta})`);
        return { kind, delta };
      }
      case 'shopPricePct':
        r.onlyKeys(['kind', 'pct']);
        return { kind, pct: r.int('pct', 1) };
      case 'eliteMutationsMin': {
        r.onlyKeys(['kind', 'count']);
        const count = r.int('count', 2);
        if (count > 2) r.fail('count', `2 이하여야 함 (정예 변이는 최대 2개, 실제: ${count})`);
        return { kind, count };
      }
      case 'commanderMaxHpPct': {
        r.onlyKeys(['kind', 'pct']);
        const pct = r.int('pct', -90);
        if (pct === 0) r.fail('pct', '0이 아니어야 함');
        return { kind, pct };
      }
    }
  }
}
