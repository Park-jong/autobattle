/** 시드 기반 결정론적 난수 생성기 (mulberry32). Math.random은 사용하지 않는다. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) 범위의 실수 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하(포함)의 정수 */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`잘못된 정수 범위: [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 배열에서 무작위 원소 하나 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('빈 배열에서 고를 수 없음');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Fisher-Yates 셔플. 원본은 바꾸지 않고 새 배열을 반환 */
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j] as T, result[i] as T];
    }
    return result;
  }

  /** 내부 상태 직렬화 (런 저장용) */
  getState(): number {
    return this.state;
  }

  /** 저장된 상태 복원 */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}
