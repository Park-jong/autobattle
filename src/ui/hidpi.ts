import Phaser from 'phaser';
import { FONT_FAMILY, STAGE } from './theme';

/**
 * HiDPI 선명도 처리 (DESIGN 10장): 캔버스 실제 크기 = 기준 해상도 × DPR, 카메라 줌 = DPR,
 * 게임 좌표는 1280x720 그대로. 관련 계산을 이 파일에 모은다.
 */
export interface HiDpiMetrics {
  /** 적용된 배율 (상한 적용 후) */
  readonly scale: number;
  /** 캔버스 실제 픽셀 크기 */
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export function computeHiDpi(devicePixelRatio: number = window.devicePixelRatio): HiDpiMetrics {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scale = Math.min(Math.max(dpr, 1), STAGE.MAX_DPR);
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
