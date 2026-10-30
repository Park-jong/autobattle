import { CARD_UI } from '../theme';

/** 재생 배속 선택지 */
export type PlaybackSpeed = 1 | 2 | 4;
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [1, 2, 4];

/** 시간 배율 계산에 필요한 입력 */
export interface PlaybackScaleInput {
  /** 사용자가 고른 배속 */
  speed: number;
  /** 일시정지 중인지 */
  paused: boolean;
  /** 카드를 집은(선택/드래그) 상태인지 */
  cardHeld: boolean;
  /** 접근성 옵션: 카드를 집은 동안 슬로모션 대신 정지 */
  pauseOnCardHold: boolean;
}

/**
 * 실제 경과 시간에 곱할 시간 배율.
 * 일시정지면 0, 카드를 집었으면 (옵션에 따라) 0 또는 1배속 기준 슬로모션 배율(배속과 무관), 아니면 배속 그대로.
 */
export function playbackScale(input: PlaybackScaleInput, slowFactor: number = CARD_UI.SLOWMO_FACTOR): number {
  if (input.paused) return 0;
  if (input.cardHeld) return input.pauseOnCardHold ? 0 : slowFactor;
  return input.speed;
}
