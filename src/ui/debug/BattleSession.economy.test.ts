import { describe, expect, it } from 'vitest';
import { cardCatalog, formation, traits, units } from '../../core/combat/testSupport';
import { BattleSession } from './BattleSession';

const ALLY = formation([['iron_shieldbearer', 3, 3, 2]]);
const ENEMY = formation([['arena_recruit', 1, 4, 2]]);

function session(): BattleSession {
  return new BattleSession(units, traits, [ALLY, ENEMY], {
    cards: cardCatalog,
    seriesStages: [{ name: '일반', enemy: ENEMY }, { name: '보스', enemy: ENEMY, kind: 'boss' }],
  });
}

function finish(s: BattleSession): void {
  s.start(1);
  for (let i = 0; i < 100 && s.phase !== 'finished'; i++) s.advance(1);
  expect(s.phase).toBe('finished');
  expect(s.snapshot().result?.winner).toBe(0);
}

describe('BattleSession 경제 흐름', () => {
  it('단일 전투가 끝날 때 한 번 지급하고 다음 전투에서 골드와 이자를 이어간다', () => {
    const s = session();
    expect(s.snapshot().economy).toMatchObject({ gold: 10, nextInterest: 1, lastReward: null });
    finish(s);
    expect(s.snapshot().economy).toMatchObject({ gold: 16, lastReward: { base: 5, interest: 1 } });
    for (let i = 0; i < 5; i++) s.advance(100);
    expect(s.snapshot().economy.gold).toBe(16);
    s.nextBattle();
    expect(s.phase).toBe('edit');
    finish(s);
    expect(s.snapshot().economy).toMatchObject({ gold: 22, lastReward: { goldBefore: 16, interest: 1 } });
  });

  it('결과 후 리셋·재시도는 보상을 다시 지급하지 않는다', () => {
    const s = session();
    finish(s);
    const reward = s.snapshot().economy.lastReward;
    s.reset();
    s.setBattleKind('boss');
    finish(s);
    expect(s.snapshot().economy).toMatchObject({ gold: 16, lastReward: reward });
    s.nextBattle();
    finish(s);
    expect(s.snapshot().economy.gold).toBe(32); // 새 보스 전투: 16 + 15 + 1
  });

  it('취소·일시정지·실패한 전투 시작에는 골드를 지급하지 않는다', () => {
    const s = session();
    s.start(1);
    s.togglePause();
    s.advance(100);
    expect(s.snapshot().economy.gold).toBe(10);
    s.reset();
    expect(s.snapshot().economy.lastReward).toBeNull();
    s.clearSide(1);
    s.start(1);
    expect(s.phase).toBe('edit');
    expect(s.snapshot().economy.gold).toBe(10);
  });

  it('정예 보상 선택은 준비 단계만 적용하고 골드 초기화도 준비 단계만 허용한다', () => {
    const s = session();
    s.setBattleKind('elite');
    s.start(1);
    s.setBattleKind('boss');
    s.resetEconomy();
    expect(s.snapshot().battleKind).toBe('elite');
    for (let i = 0; i < 100 && s.phase !== 'finished'; i++) s.advance(1);
    expect(s.snapshot().economy.gold).toBe(19);
    s.resetEconomy();
    expect(s.snapshot().economy.gold).toBe(19);
    s.reset();
    s.resetEconomy();
    expect(s.snapshot().economy).toMatchObject({ gold: 10, nextInterest: 1, lastReward: null });
    finish(s);
    expect(s.snapshot().economy.gold).toBe(19);
  });

  it('연전은 별도 10G로 시작하며 마지막 판까지 정산하고 종료 시 단일 경제를 복원한다', () => {
    const s = session();
    finish(s);
    s.reset();
    s.startSeries(false);
    expect(s.snapshot().economy.gold).toBe(10);
    finish(s);
    expect(s.snapshot().economy.gold).toBe(16);
    s.reset(); // 정산한 연전은 리셋 불가
    expect(s.phase).toBe('finished');
    expect(s.snapshot().economy.gold).toBe(16);
    s.nextSeriesBattle();
    finish(s);
    expect(s.snapshot().series?.done).toBe(true);
    expect(s.snapshot().economy).toMatchObject({ gold: 32, lastReward: { kind: 'boss', base: 15, interest: 1 } });
    expect(s.snapshot().series?.summary.totalGold).toBe(22);
    s.advance(100);
    expect(s.snapshot().economy.gold).toBe(32);
    s.endSeries();
    expect(s.snapshot().economy.gold).toBe(16);
  });

  it('연전 중도 취소는 미완료 판에 지급하지 않고 기존 단일 경제를 유지한다', () => {
    const s = session();
    s.startSeries(false);
    finish(s);
    s.nextSeriesBattle();
    s.start(1);
    s.resetEconomy();
    expect(s.snapshot().economy.gold).toBe(16);
    s.reset();
    expect(s.snapshot().economy.gold).toBe(16);
    s.endSeries();
    expect(s.snapshot().economy).toMatchObject({ gold: 10, lastReward: null });
  });
});
