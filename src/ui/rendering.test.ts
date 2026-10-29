import { describe, expect, it } from 'vitest';
import { computeHiDpi } from './hidpi';
import { needsBattleRenderer, renderProfile } from './rendering';
import type { RunScreenId } from './run/contracts';

describe('mobile rendering memory budget', () => {
  it.each([
    [320, 568, 2], [390, 844, 3], [430, 932, 3],
    [844, 390, 3], [1024, 1366, 2],
  ])('caps touch framebuffer at one 720p surface: %ix%i DPR %i', (width, height, devicePixelRatio) => {
    const profile = renderProfile({ width, height, devicePixelRatio, coarsePointer: true });
    expect(profile.renderer).toBe('canvas');
    expect(profile.fps).toBe(30);
    expect(profile.metrics.canvasWidth * profile.metrics.canvasHeight).toBeLessThanOrEqual(1280 * 720);
    expect(profile.metrics.canvasWidth).toBeLessThanOrEqual(width * devicePixelRatio);
  });

  it('renders a 390px iPhone at its physical width instead of 3840px', () => {
    const { metrics } = renderProfile({ width: 390, height: 844, devicePixelRatio: 3, coarsePointer: true });
    expect(metrics.canvasWidth).toBe(1170);
    expect(metrics.canvasHeight).toBe(658);
    expect(metrics.scale).toBe(1170 / 1280);
  });

  it('keeps desktop HiDPI and renderer selection', () => {
    const profile = renderProfile({ width: 1920, height: 1080, devicePixelRatio: 2, coarsePointer: false });
    expect(profile.renderer).toBe('auto');
    expect(profile.fps).toBe(60);
    expect(profile.metrics.canvasWidth).toBe(2560);
  });

  it('handles invalid dimensions and DPR without oversized or empty surfaces', () => {
    expect(computeHiDpi(Number.NaN, { viewport: { width: 0, height: 0 } })).toEqual({ scale: 1, canvasWidth: 1280, canvasHeight: 720 });
    expect(computeHiDpi(100).canvasWidth).toBe(3840);
  });
});

describe('renderer lifecycle', () => {
  it.each(['start', 'map', 'reward', 'bossRelic', 'actIntro', 'shop', 'event', 'camp', 'ended'] as RunScreenId[])('does not allocate or run a renderer on %s', screen => {
    expect(needsBattleRenderer(screen)).toBe(false);
  });
  it.each(['battle', 'debug'] as RunScreenId[])('runs the canvas on %s', screen => {
    expect(needsBattleRenderer(screen)).toBe(true);
  });
});
