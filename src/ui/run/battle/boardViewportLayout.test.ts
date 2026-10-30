import { describe, expect, it } from 'vitest';
import { boardViewportLayout } from './boardViewportLayout';

describe('mobile board viewport', () => {
  for (const [width, height] of [[390, 325], [844, 210], [768, 640]]) {
    it(`keeps all eight columns and five rows inside ${width}×${height}`, () => {
      const layout = boardViewportLayout(width!, height!);
      const scale = layout.width / 1280;
      expect(layout.left + 224 * scale).toBeGreaterThanOrEqual(0);
      expect(layout.left + 1056 * scale).toBeLessThanOrEqual(width! + 0.01);
      expect(layout.top + 120 * scale).toBeGreaterThanOrEqual(0);
      expect(layout.top + 640 * scale).toBeLessThanOrEqual(height! + 0.01);
      expect(layout.width / layout.height).toBeCloseTo(1280 / 720);
    });
  }
  it('enlarges the actual canvas 40% and gives the board a scrollable surface', () => {
    const normal = boardViewportLayout(390, 325);
    const zoom = boardViewportLayout(390, 325, 1.4);
    expect(zoom.width / normal.width).toBeCloseTo(1.4);
    expect(zoom.surfaceWidth).toBeGreaterThan(390);
    expect(zoom.surfaceHeight).toBeGreaterThanOrEqual(325);
    // DOM-to-stage mapping remains reversible with the enlarged canvas.
    const x = zoom.left + 300 * zoom.width / 1280;
    expect((x - zoom.left) / zoom.width * 1280).toBeCloseTo(300);
  });
});
