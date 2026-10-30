/** Touch uses native scrolling and tap-to-target. Mouse/pen retain drag-to-play. */
export function handGesture(pointerType: string, dx: number, dy: number, threshold: number): 'tap' | 'scroll' | 'drag' {
  if (Math.hypot(dx, dy) < threshold) return 'tap';
  return pointerType === 'touch' ? 'scroll' : 'drag';
}
