import { STAGE } from '../theme';

/** 화면(client) 좌표 위의 사각형: 캔버스의 getBoundingClientRect 결과 중 필요한 부분 */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 브라우저 화면 좌표 → 게임 좌표(1280x720). 캔버스는 CSS로 늘어나 있으므로 사각형 비율로 환산한다.
 * 캔버스 밖이거나 크기가 0이면 null.
 */
export function clientToStage(
  clientX: number,
  clientY: number,
  rect: ClientRect,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  return { x: nx * STAGE.WIDTH, y: ny * STAGE.HEIGHT };
}
