import { DataValidationError } from './errors';

export type JsonObject = Record<string, unknown>;

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '배열';
  switch (typeof value) {
    case 'string': return `문자열 ${JSON.stringify(value)}`;
    case 'number': return `숫자 ${value}`;
    case 'boolean': return `불리언 ${value}`;
    default: return typeof value;
  }
}

/** JSON 객체 하나를 경로 정보와 함께 읽는 도우미. 실패 시 위치가 담긴 에러를 던진다. */
export class FieldReader {
  private constructor(
    private readonly obj: JsonObject,
    readonly path: string,
  ) {}

  static of(value: unknown, path: string): FieldReader {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new DataValidationError(path, `객체여야 함 (실제: ${describe(value)})`);
    }
    return new FieldReader(value as JsonObject, path);
  }

  private fieldPath(key: string): string {
    return this.path === '' ? key : `${this.path}.${key}`;
  }

  fail(key: string, reason: string): never {
    throw new DataValidationError(this.fieldPath(key), reason);
  }

  has(key: string): boolean {
    return this.obj[key] !== undefined;
  }

  /** 허용된 키 외의 필드가 있으면 에러 */
  onlyKeys(allowed: readonly string[]): void {
    for (const key of Object.keys(this.obj)) {
      if (!allowed.includes(key)) this.fail(key, `알 수 없는 필드 (허용: ${allowed.join(', ')})`);
    }
  }

  private raw(key: string): unknown {
    const value = this.obj[key];
    if (value === undefined) this.fail(key, '필수 필드 누락');
    return value;
  }

  /** 빈 문자열은 허용하지 않음 */
  string(key: string): string {
    const value = this.raw(key);
    if (typeof value !== 'string') this.fail(key, `문자열이어야 함 (실제: ${describe(value)})`);
    if (value === '') this.fail(key, '빈 문자열은 허용되지 않음');
    return value;
  }

  /** 유한한 숫자. min이 있으면 그 값 이상 */
  number(key: string, min?: number): number {
    const value = this.raw(key);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(key, `숫자여야 함 (실제: ${describe(value)})`);
    }
    if (min !== undefined && value < min) this.fail(key, `${min} 이상이어야 함 (실제: ${value})`);
    return value;
  }

  /** min 이상의 정수 */
  int(key: string, min: number): number {
    const value = this.number(key, min);
    if (!Number.isInteger(value)) this.fail(key, `정수여야 함 (실제: ${value})`);
    return value;
  }

  boolean(key: string): boolean {
    const value = this.raw(key);
    if (typeof value !== 'boolean') this.fail(key, `불리언이어야 함 (실제: ${describe(value)})`);
    return value;
  }

  enum<T extends string>(key: string, allowed: readonly T[]): T {
    const value = this.raw(key);
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
      this.fail(key, `알 수 없는 값 ${JSON.stringify(value)} (허용: ${allowed.join(', ')})`);
    }
    return value as T;
  }

  array(key: string): unknown[] {
    const value = this.raw(key);
    if (!Array.isArray(value)) this.fail(key, `배열이어야 함 (실제: ${describe(value)})`);
    return value;
  }

  object(key: string): FieldReader {
    return FieldReader.of(this.raw(key), this.fieldPath(key));
  }

  /** 타입 검사 없이 원시 값을 읽음 (누락이면 에러) */
  rawValue(key: string): unknown {
    return this.raw(key);
  }
}
