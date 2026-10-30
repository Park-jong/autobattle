import { describe, expect, it } from 'vitest';
import { handGesture } from './handGesture';

describe('hand gestures', () => {
  it('lets touch swipes scroll, including unavailable cards and vertical page scrolling', () => {
    expect(handGesture('touch', 70, 3, 8)).toBe('scroll');
    expect(handGesture('touch', -70, 3, 8)).toBe('scroll');
    expect(handGesture('touch', 1, 40, 8)).toBe('scroll');
  });
  it('tolerates a small finger movement during a tap', () => {
    expect(handGesture('touch', 3, -3, 8)).toBe('tap');
  });
  it('preserves mouse and pen drag-to-play', () => {
    expect(handGesture('mouse', 70, 3, 8)).toBe('drag');
    expect(handGesture('pen', 2, -20, 8)).toBe('drag');
  });
});
