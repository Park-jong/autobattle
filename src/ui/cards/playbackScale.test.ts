import { describe, expect, it } from 'vitest';
import { CARD_UI } from '../theme';
import { playbackScale } from './playbackScale';

const base = { speed: 1, paused: false, cardHeld: false, pauseOnCardHold: false };

describe('playbackScale', () => {
  it('평소에는 배속 그대로', () => {
    expect(playbackScale(base)).toBe(1);
    expect(playbackScale({ ...base, speed: 4 })).toBe(4);
  });

  it('카드를 집으면 배속에 슬로모션 배율을 곱한다', () => {
    expect(CARD_UI.SLOWMO_FACTOR).toBe(0.25);
    expect(playbackScale({ ...base, cardHeld: true })).toBeCloseTo(0.25);
    expect(playbackScale({ ...base, speed: 2, cardHeld: true })).toBeCloseTo(0.5);
    expect(playbackScale({ ...base, speed: 4, cardHeld: true })).toBeCloseTo(1);
  });

  it('카드 선택 중 일시정지 옵션이면 정지한다', () => {
    expect(playbackScale({ ...base, cardHeld: true, pauseOnCardHold: true })).toBe(0);
    // 카드를 집지 않았으면 옵션이 켜져 있어도 영향 없음
    expect(playbackScale({ ...base, pauseOnCardHold: true })).toBe(1);
  });

  it('일시정지가 최우선이다', () => {
    expect(playbackScale({ ...base, paused: true })).toBe(0);
    expect(playbackScale({ ...base, paused: true, cardHeld: true })).toBe(0);
  });
});
