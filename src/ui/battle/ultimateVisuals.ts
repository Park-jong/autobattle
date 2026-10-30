import type { ReplayEffect } from '../replay/ReplayState';
import { TIMING } from '../theme';

export type UltimateEffect = Extract<ReplayEffect, { kind: 'ultimate' }>;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** 전투 시각으로만 계산한다. 정지·되감기·배속에도 별도 타이머가 남지 않는다. */
export function ultimateEnvelope(age: number) {
  const active = age >= 0 && age < TIMING.ULTIMATE_CUTIN;
  const enter = clamp(age / 0.24);
  const exit = clamp((age - 1.55) / (TIMING.ULTIMATE_CUTIN - 1.55));
  return {
    active,
    alpha: active ? Math.min(clamp(age / 0.08), 1 - exit) : 0,
    entrance: 1 - Math.pow(1 - enter, 4),
    exit,
    burst: active ? clamp((age - 0.22) / 0.72) : 0,
    flash: active ? Math.max(0, 1 - Math.abs(age - 0.22) / 0.11) * 0.16 : 0,
  };
}

export function activeUltimate(time: number, effects: readonly ReplayEffect[]): UltimateEffect | null {
  let active: UltimateEffect | null = null;
  for (const event of effects) {
    if (event.kind !== 'ultimate' || !ultimateEnvelope(time - event.t).active) continue;
    if (!active || event.t > active.t || (event.t === active.t && event.seq > active.seq)) active = event;
  }
  return active;
}

/** 겹치는 운석도 흔들림 상한을 넘지 않는다. 카메라 줌과 HiDPI 배율은 건드리지 않는다. */
export function ultimateRecoil(time: number, effects: readonly ReplayEffect[], reduced: boolean): { x: number; y: number } {
  if (reduced) return { x: 0, y: 0 };
  let x = 0, y = 0;
  for (const event of effects) {
    if (event.kind !== 'ultimate' && event.kind !== 'impact') continue;
    const age = time - event.t - (event.kind === 'ultimate' ? 0.22 : 0);
    const duration = event.kind === 'ultimate' ? 0.46 : 0.32;
    if (age < 0 || age >= duration) continue;
    const strength = (event.kind === 'ultimate' ? 7 : 10) * Math.pow(1 - age / duration, 2);
    x += Math.sin(age * 89 + event.seq * 2.1) * strength;
    y += Math.cos(age * 107 + event.seq * 1.7) * strength * 0.7;
  }
  return { x: Math.max(-10, Math.min(10, x)), y: Math.max(-7, Math.min(7, y)) };
}
