import { describe, expect, it } from 'vitest';
import { Economy, goldInterest, type BattleKind } from './economy';

describe('골드와 전투 보상', () => {
  it.each([[0, 0], [9, 0], [10, 1], [19, 1], [20, 2], [29, 2], [30, 3], [49, 4], [50, 5], [99, 5]])('잔고 %sG의 이자는 %sG', (gold, interest) => {
    expect(goldInterest(gold)).toBe(interest);
  });

  it.each([['normal', 5], ['elite', 8], ['boss', 15]] as const)('%s 승리 기본 보상 %sG와 이자를 합산한다', (kind, base) => {
    const economy = new Economy();
    expect(economy.settleBattle('first', kind, 'win')).toMatchObject({ goldBefore: 10, base, interest: 1, total: base + 1, goldAfter: 10 + base + 1 });
    expect(economy.gold).toBe(10 + base + 1);
  });

  it.each(['normal', 'elite', 'boss'] as const)('%s 패배·무승부에도 기본 3G를 지급한다', (kind) => {
    for (const outcome of ['loss', 'draw'] as const) {
      const economy = new Economy(29);
      expect(economy.settleBattle('first', kind, outcome)).toMatchObject({ base: 3, interest: 2, total: 5, goldAfter: 34 });
    }
  });

  it('이자는 보상 전 잔고를 기준으로 계산하고 다음 전투에만 새 구간을 적용한다', () => {
    const economy = new Economy(9);
    expect(economy.settleBattle('a', 'normal', 'win')).toMatchObject({ base: 5, interest: 0, goldAfter: 14 });
    expect(economy.settleBattle('b', 'normal', 'win')).toMatchObject({ base: 5, interest: 1, goldAfter: 20 });
    expect(economy.snapshot().nextInterest).toBe(2);
  });

  it('같은 전투를 재정산해도 최초 내역을 반환하고 골드를 다시 주지 않는다', () => {
    const economy = new Economy();
    const first = economy.settleBattle('same', 'normal', 'win');
    expect(economy.settleBattle('same', 'boss', 'loss')).toBe(first);
    expect(economy.gold).toBe(16);
    const second = economy.settleBattle('next', 'normal', 'win');
    expect(economy.settleBattle('same', 'normal', 'win')).toBe(first);
    expect(economy.gold).toBe(22);
    expect(economy.snapshot().lastReward).toBe(second);
  });

  it('안전한 차감은 잔고 부족 시 아무것도 바꾸지 않는다', () => {
    const economy = new Economy(10);
    expect(economy.spend(11)).toBe(false);
    expect(economy.gold).toBe(10);
    expect(economy.spend(0)).toBe(true);
    expect(economy.spend(10)).toBe(true);
    expect(economy.gold).toBe(0);
  });

  it('판매 수입은 양의 정수만 더하고 오버플로 시 상태를 유지한다', () => {
    const economy = new Economy();
    economy.gain(3);
    expect(economy.gold).toBe(13);
    expect(() => economy.gain(-1)).toThrow('골드');
    expect(() => economy.gain(Number.MAX_SAFE_INTEGER)).toThrow('골드');
    expect(economy.gold).toBe(13);
  });

  it.each([-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('잘못된 금액 %s를 거부한다', (amount) => {
    expect(() => new Economy(amount)).toThrow('골드');
    expect(() => goldInterest(amount)).toThrow('골드');
    const economy = new Economy();
    expect(() => economy.spend(amount)).toThrow('골드');
    expect(economy.gold).toBe(10);
  });

  it('알 수 없는 전투 종류·빈 ID와 정수 범위를 넘는 지급은 상태 변경 전에 거부한다', () => {
    const economy = new Economy(Number.MAX_SAFE_INTEGER);
    expect(() => economy.settleBattle(' ', 'normal', 'win')).toThrow('ID');
    expect(() => economy.settleBattle('bad', 'wrong' as BattleKind, 'win')).toThrow('종류');
    expect(() => economy.settleBattle('huge', 'normal', 'win')).toThrow('골드');
    expect(economy.gold).toBe(Number.MAX_SAFE_INTEGER);
    expect(economy.snapshot().lastReward).toBeNull();
  });
});
