/** Keep the board (x=224..1056, y=120..640) and its labels; crop unused stage gutters. */
export function boardViewportLayout(width: number, height: number, zoom = 1) {
  const scale = Math.min(Math.max(1, width) / 864, Math.max(1, height) / 640) * zoom;
  const surfaceWidth = Math.max(width, 864 * scale);
  const surfaceHeight = Math.max(height, 640 * scale);
  return {
    surfaceWidth, surfaceHeight,
    width: 1280 * scale, height: 720 * scale,
    left: surfaceWidth / 2 - 640 * scale,
    top: surfaceHeight / 2 - 360 * scale,
  };
}
