import { describe, expect, it } from 'vitest';
import { CombatSimulator, type CardCommand, type CombatSetup } from '../../core/combat';
import {
  CARD_A,
  CARD_B,
  cardCatalog,
  formation,
  handSnapshot,
  harten,
  traits,
  units,
} from '../../core/combat/testSupport';
import { LiveBattle } from './LiveBattle';

const HAND = ['war_drums', 'hold_the_line', 'focus_fire', 'shield_formation', 'formation_swap'];

function cardSetup(commands?: readonly CardCommand[], seed = 3): CombatSetup {
  return {
    seed,
    formations: [formation(CARD_A), formation(CARD_B)],
    cards: {
      commander: harten,
      deck: handSnapshot(HAND),
      ...(commands ? { commands } : {}),
    },
  };
}

/** 고정된 프레임 간격으로 끝까지 진행 */
function playOut(live: LiveBattle, dt: number): void {
  for (let i = 0; i < 100000 && !live.finished; i++) live.advance(dt);
}

describe('LiveBattle (카드 없음)', () => {
  it('프레임 간격과 상관없이 한 번에 돌린 결과와 이벤트 로그가 같다', () => {
    const setup: CombatSetup = { seed: 5, formations: [formation(CARD_A), formation(CARD_B)] };
    const expected = new CombatSimulator(setup, units, traits).run();
    for (const dt of [1 / 60, 0.05, 0.1, 0.37, 1]) {
      const live = new LiveBattle(setup, units, traits);
      playOut(live, dt);
      expect(live.finished).toBe(true);
      expect(JSON.stringify(live.result().events)).toBe(JSON.stringify(expected.events));
      expect(live.time).toBeCloseTo(expected.endTime);
      expect(live.replay.result?.winner).toBe(expected.winner);
    }
  });

  it('재생 시각까지만 sim을 진행한다 (미리 끝까지 계산하지 않음)', () => {
    const live = new LiveBattle({ seed: 5, formations: [formation(CARD_A), formation(CARD_B)] }, units, traits);
    live.advance(1.05);
    expect(live.sim.finished).toBe(false);
    expect(live.sim.world.tick).toBe(11); // 틱 0..10 처리
    expect(live.time).toBeCloseTo(1.05);
    live.advance(0);
    expect(live.sim.world.tick).toBe(11);
  });
});

describe('LiveBattle (카드)', () => {
  it('준비 단계 작전 카드는 틱 0에 적용되고 전투 시작 후 명령 카드를 쓸 수 있다', () => {
    const live = new LiveBattle(cardSetup(), units, traits, cardCatalog);
    expect(live.combatStarted).toBe(false);
    expect(live.playCard(1, { kind: 'none' }).ok).toBe(true); // 전쟁 북 (작전)
    expect(live.playCard(2, { kind: 'unit', uid: 0 })).toMatchObject({ ok: false }); // 명령은 준비 단계에서 불가
    live.startCombat();
    expect(live.playCard(2, { kind: 'unit', uid: 0 }).ok).toBe(true);
    expect(live.cardsPlayed).toBe(2);
    expect(live.usesOf('war_drums')).toBe(1);
    expect(live.replay.recentEffects(1).filter((e) => e.kind === 'card')).toHaveLength(2);
  });

  it('실패한 카드는 상태를 바꾸지 않고 한국어 사유를 돌려준다', () => {
    const live = new LiveBattle(cardSetup(), units, traits, cardCatalog);
    live.startCombat();
    const before = live.sim.events.length;
    const result = live.playCard(3, { kind: 'unit', uid: 0 }); // 집중 포화는 적 대상
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('적');
    expect(live.sim.events.length).toBe(before);
    expect(live.sim.deck?.hand).toHaveLength(HAND.length);
  });

  it('실시간으로 쓴 카드는 commandLog를 미리 예약해 한 번에 돌린 결과와 같다 (결정론)', () => {
    const live = new LiveBattle(cardSetup(), units, traits, cardCatalog);
    live.playCard(1, { kind: 'none' }); // 전쟁 북
    live.startCombat();
    const plays: { at: number; id: number; target: CardCommand['target'] }[] = [
      { at: 1.5, id: 4, target: { kind: 'none' } },
      { at: 3.2, id: 3, target: { kind: 'unit', uid: 3 } },
      { at: 5.0, id: 2, target: { kind: 'unit', uid: 0 } },
      { at: 5.0, id: 5, target: { kind: 'units', uids: [0, 2] } },
    ];
    const dt = 0.033;
    let next = 0;
    for (let i = 0; i < 100000 && !live.finished; i++) {
      live.advance(dt);
      while (next < plays.length && live.time >= (plays[next]?.at ?? Infinity)) {
        const p = plays[next++];
        if (p) live.playCard(p.id, p.target);
      }
    }
    expect(live.finished).toBe(true);
    expect(live.cardsPlayed).toBeGreaterThanOrEqual(3);

    const log = live.sim.commandLog;
    const replayed = new CombatSimulator(cardSetup(log), units, traits, cardCatalog).run();
    expect(JSON.stringify(replayed.events)).toBe(JSON.stringify(live.result().events));
    expect(replayed.winner).toBe(live.result().winner);
    expect(replayed.endTime).toBe(live.result().endTime);
  });

  it('프레임 간격이 달라도 같은 틱에서 쓴 카드는 같은 로그를 만든다', () => {
    const run = (dt: number) => {
      const live = new LiveBattle(cardSetup(), units, traits, cardCatalog);
      live.startCombat();
      let used = false;
      for (let i = 0; i < 100000 && !live.finished; i++) {
        live.advance(dt);
        if (!used && live.sim.world.tick >= 20) {
          used = live.playCard(4, { kind: 'none' }).ok;
        }
      }
      return JSON.stringify(live.result().events);
    };
    expect(run(0.1)).toBe(run(0.1));
    // 사용 틱(world.tick)이 같으면 로그가 같다: dt 0.1과 0.05는 모두 틱 20 직전에서 멈춘다
    expect(run(0.05)).toBe(run(0.1));
  });
});
