import { describe, expect, it } from 'vitest';
import { textSize } from './cardFace';

describe('textSize (카드 설명 길이 단계)', () => {
  it('글자 수(한글 한 자 = 1)에 따라 s → m → l → xl', () => {
    expect(textSize('가'.repeat(33))).toBe('s');
    expect(textSize('가'.repeat(34))).toBe('m');
    expect(textSize('가'.repeat(48))).toBe('m');
    expect(textSize('가'.repeat(49))).toBe('l');
    expect(textSize('가'.repeat(70))).toBe('l');
    expect(textSize('가'.repeat(71))).toBe('xl');
  });
});
