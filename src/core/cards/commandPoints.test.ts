import { describe, expect, it } from 'vitest';
import { CommandPoints, CP_REGEN_TICKS } from './commandPoints';
import { CARDS } from './constants';

describe('CommandPoints', () => {
  it('전투 시작 CP는 2 + 지휘관 보정', () => {
    expect(new CommandPoints().startCombat()).toBe(2);
    expect(new CommandPoints(1).startCombat()).toBe(3);
  });

  it('보정이 커도 상한(6)을 넘지 않는다', () => {
    expect(new CommandPoints(10).startCombat()).toBe(CARDS.CP_MAX);
  });

  it('4초(40틱)마다 +1', () => {
    expect(CP_REGEN_TICKS).toBe(40);
    const cp = new CommandPoints();
    cp.startCombat();
    let gained = 0;
    for (let tick = 1; tick <= 120; tick++) gained += cp.regen(tick);
    expect(gained).toBe(3);
    expect(cp.combat).toBe(5);
    expect(cp.regen(0)).toBe(0);
  });

  it('상한 6에서 멈춘다', () => {
    const cp = new CommandPoints();
    cp.startCombat();
    for (let tick = 1; tick <= 1000; tick++) cp.regen(tick);
    expect(cp.combat).toBe(6);
  });

  it('gain은 상한까지만 실제로 늘리고 늘어난 양을 돌려준다', () => {
    const cp = new CommandPoints();
    cp.startCombat();
    expect(cp.gain(3)).toBe(3);
    expect(cp.gain(3)).toBe(1);
    expect(cp.gain(1)).toBe(0);
    expect(cp.combat).toBe(6);
  });

  it('준비 CP는 따로 있고 전투로 이월되지 않는다', () => {
    const cp = new CommandPoints();
    expect(cp.startPrep()).toBe(2);
    cp.spend('prep', 1);
    expect(cp.prep).toBe(1);
    expect(cp.combat).toBe(0);
    cp.startCombat();
    expect(cp.prep).toBe(0);
    expect(cp.combat).toBe(2);
  });

  it('모자란 CP를 쓰면 Error', () => {
    const cp = new CommandPoints();
    cp.startCombat();
    expect(cp.canSpend('combat', 3)).toBe(false);
    expect(() => cp.spend('combat', 3)).toThrow('CP 부족');
  });

  it('전투마다 초기화', () => {
    const cp = new CommandPoints();
    cp.startCombat();
    cp.gain(4);
    cp.startCombat();
    expect(cp.combat).toBe(2);
  });
});
