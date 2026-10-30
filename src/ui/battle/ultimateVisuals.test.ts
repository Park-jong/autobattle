import { describe, expect, it } from 'vitest';
import type { ReplayEffect } from '../replay/ReplayState';
import { TIMING } from '../theme';
import { activeUltimate, ultimateEnvelope, ultimateRecoil, type UltimateEffect } from './ultimateVisuals';

const used: UltimateEffect = { kind: 'ultimate', seq: 1, t: 5, commanderId: 'cmd_isera', name: '대분화', durationSeconds: 0 };
const impact: ReplayEffect = { kind: 'impact', seq: 2, t: 6, id: 1, cell: { col: 4, row: 2 }, radius: 1 };

describe('궁극기 시네마틱 재생', () => {
  it('발동 전과 종료 후에는 컷인을 남기지 않고 조회 창 안에서 끝난다', () => {
    expect(TIMING.ULTIMATE_CUTIN).toBeLessThanOrEqual(TIMING.EFFECT_WINDOW);
    expect(activeUltimate(4.99, [used])).toBeNull();
    expect(activeUltimate(5, [used])).toEqual(used);
    expect(activeUltimate(6.5, [used])).toEqual(used);
    expect(activeUltimate(5 + TIMING.ULTIMATE_CUTIN, [used])).toBeNull();
    expect(ultimateEnvelope(-0.1).alpha).toBe(0);
    expect(ultimateEnvelope(TIMING.ULTIMATE_CUTIN).alpha).toBe(0);
  });

  it('이벤트 순서와 무관하게 가장 최근 궁극기 하나만 표시한다', () => {
    const next = { ...used, t: 5.3, seq: 3, commanderId: 'cmd_harten' };
    const tied = { ...next, seq: 4 };
    expect(activeUltimate(5.4, [tied, used, next, impact])).toEqual(tied);
    expect(activeUltimate(5.2, [next, used])).toEqual(used);
  });

  it('일시정지·되감기에서 같은 프레임과 흔들림을 재현한다', () => {
    const before = ultimateEnvelope(0.3);
    const recoil = ultimateRecoil(5.3, [used, impact], false);
    expect(Math.hypot(recoil.x, recoil.y)).toBeGreaterThan(0);
    ultimateEnvelope(2.1);
    ultimateRecoil(7, [used, impact], false);
    expect(ultimateEnvelope(0.3)).toEqual(before);
    expect(ultimateRecoil(5.3, [used, impact], false)).toEqual(recoil);
    expect(ultimateRecoil(5.3, [used, impact], false)).toEqual(recoil);
  });

  it('모션 줄이기와 연출 종료·리셋에서 카메라가 원위치로 돌아온다', () => {
    const events = [used, impact];
    for (const time of [4, 5.3, 6.05, 7]) {
      expect(ultimateRecoil(time, events, true)).toEqual({ x: 0, y: 0 });
    }
    expect(ultimateRecoil(4, events, false)).toEqual({ x: 0, y: 0 });
    expect(ultimateRecoil(7, events, false)).toEqual({ x: 0, y: 0 });
    expect(ultimateRecoil(6.05, [], false)).toEqual({ x: 0, y: 0 });
  });

  it('동시에 운석이 여러 개 떨어져도 흔들림과 섬광의 강도가 제한된다', () => {
    const impacts = Array.from({ length: 30 }, (_, i) => ({ ...impact, seq: i + 10 }));
    for (let age = 0; age <= 2.5; age += 0.01) {
      const recoil = ultimateRecoil(6 + age, impacts, false);
      expect(Math.abs(recoil.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(recoil.y)).toBeLessThanOrEqual(7);
      const frame = ultimateEnvelope(age);
      expect(frame.alpha).toBeGreaterThanOrEqual(0);
      expect(frame.alpha).toBeLessThanOrEqual(1);
      expect(frame.flash).toBeLessThanOrEqual(0.16);
    }
  });
});
