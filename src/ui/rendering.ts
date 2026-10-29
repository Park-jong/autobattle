import { computeHiDpi } from './hidpi';
import type { RunScreenId } from './run/contracts';

/** Touch devices avoid the large WebGL framebuffers that can terminate iOS WebContent. */
export function renderProfile(viewport: { width: number; height: number; devicePixelRatio: number; coarsePointer: boolean }) {
  const mobile = viewport.coarsePointer;
  return {
    renderer: mobile ? 'canvas' as const : 'auto' as const,
    fps: mobile ? 30 : 60,
    metrics: computeHiDpi(viewport.devicePixelRatio, {
      viewport,
      maxScale: mobile ? 1 : 3,
    }),
  };
}

/** Menus need neither a game canvas nor a running renderer. */
export function needsBattleRenderer(screen: RunScreenId): boolean {
  return screen === 'battle' || screen === 'debug';
}
