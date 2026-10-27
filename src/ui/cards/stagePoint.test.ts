import { describe, expect, it } from 'vitest';
import { clientToStage } from './stagePoint';

describe('clientToStage', () => {
  const rect = { left: 100, top: 50, width: 640, height: 360 };

  it('캔버스 사각형 비율로 게임 좌표(1280x720)를 계산한다', () => {
    expect(clientToStage(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToStage(420, 230, rect)).toEqual({ x: 640, y: 360 });
    expect(clientToStage(740, 410, rect)).toEqual({ x: 1280, y: 720 });
  });

  it('캔버스 밖이나 크기 0이면 null', () => {
    expect(clientToStage(99, 100, rect)).toBeNull();
    expect(clientToStage(300, 411, rect)).toBeNull();
    expect(clientToStage(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});
