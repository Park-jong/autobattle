import type Phaser from 'phaser';
import { FONT_FAMILY, STAGE } from './theme';

/**
 * HiDPI 선명도 처리: 화면에 맞춘 실제 픽셀 크기와 렌더링 예산으로 배율을 정한다.
 * 카메라 줌을 같은 배율로 맞추므로 게임 좌표는 1280x720 그대로 유지한다.
 */
export interface HiDpiMetrics {
  /** 적용된 배율 (상한 적용 후) */
  readonly scale: number;
  /** 캔버스 실제 픽셀 크기 */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface HiDpiOptions {
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly maxScale?: number;
}

export function computeHiDpi(devicePixelRatio: number = window.devicePixelRatio, options: HiDpiOptions = {}): HiDpiMetrics {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const viewport = options.viewport;
  const fit = viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) && viewport.width > 0 && viewport.height > 0
    ? Math.min(1, viewport.width / STAGE.WIDTH, viewport.height / STAGE.HEIGHT) : 1;
  const limit = options.maxScale !== undefined && Number.isFinite(options.maxScale) && options.maxScale > 0
    ? Math.min(options.maxScale, STAGE.MAX_DPR) : STAGE.MAX_DPR;
  const scale = Math.max(0.25, Math.min(Math.max(dpr, 1) * fit, limit));
  return {
    scale,
    canvasWidth: Math.round(STAGE.WIDTH * scale),
    canvasHeight: Math.round(STAGE.HEIGHT * scale),
  };
}

/** 씬 카메라를 게임 좌표 1280x720이 캔버스 전체에 보이도록 맞춘다 (줌 = 배율, 좌상단 기준). */
export function applyHiDpiCamera(scene: Phaser.Scene, metrics: HiDpiMetrics): void {
  const camera = scene.cameras.main;
  camera.setOrigin(0, 0);
  camera.setZoom(metrics.canvasWidth / STAGE.WIDTH);
  camera.setScroll(0, 0);
}

/** HiDPI 해상도가 적용된 텍스트를 만든다. */
export function createText(
  scene: Phaser.Scene,
  metrics: HiDpiMetrics,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  const obj = scene.add.text(x, y, text, { fontFamily: FONT_FAMILY, ...style });
  obj.setResolution(metrics.scale);
  return obj;
}
