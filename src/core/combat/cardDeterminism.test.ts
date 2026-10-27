import { describe, expect, it } from 'vitest';
import type { CardCommand } from './cardCommand';
import { CARD_A, CARD_B, harten, makeCardSim, makeSim } from './testSupport';

const HAND = ['war_drums', 'focus_fire', 'hold_the_line', 'shield_formation', 'formation_swap'];
const json = (v: unknown) => JSON.stringify(v);

/** 사람이 UI에서 하듯 틱 사이에 직접 카드를 쓰며 진행한 전투 */
function playLive(seed: number) {
  const sim = makeCardSim({ seed, hand: HAND, commander: harten });
  sim.playCard(1, { kind: 'none' }); // 전쟁 북 (준비 단계)
  sim.startCombat();
  sim.runUntil(10);
  sim.playCard(2, { kind: 'unit', uid: 4 }); // 집중 포화
  sim.runUntil(35);
  sim.playCard(99, { kind: 'none' }); // 실패: 기록되면 안 됨
  sim.playCard(3, { kind: 'unit', uid: 2 }); // 전열 사수
  sim.runUntil(60);
  sim.playCard(4, { kind: 'none' }); // 방진 유지
  sim.run();
  return sim;
}

describe('결정론: 같은 입력 -> 같은 로그', () => {
  it('같은 시드·편성·지휘관·덱·명령이면 이벤트 로그가 JSON까지 일치', () => {
    const commands: CardCommand[] = [
      { tick: 0, cardInstanceId: 1, target: { kind: 'none' } },
      { tick: 10, cardInstanceId: 2, target: { kind: 'unit', uid: 4 } },
      { tick: 35, cardInstanceId: 3, target: { kind: 'unit', uid: 2 } },
    ];
    const a = makeCardSim({ hand: HAND, commander: harten, commands }).run();
    const b = makeCardSim({ hand: HAND, commander: harten, commands }).run();
    expect(json(a.events)).toBe(json(b.events));
    expect(a.endTime).toBe(b.endTime);
  });

  it('직접 진행하며 쓴 카드를 기록해 다시 넣으면 같은 로그 (예약 명령 재생)', () => {
    const live = playLive(7);
    expect(live.commandLog.map((c) => [c.tick, c.cardInstanceId])).toEqual([
      [0, 1],
      [10, 2],
      [35, 3],
      [60, 4],
    ]);
    const replay = makeCardSim({ seed: 7, hand: HAND, commander: harten, commands: live.commandLog });
    replay.run();
    expect(json(replay.events)).toBe(json(live.events));
    expect(json(replay.commandLog)).toBe(json(live.commandLog));
  });

  it('기록은 JSON 왕복 후에도 재현된다', () => {
    const live = playLive(3);
    const restored = JSON.parse(JSON.stringify(live.commandLog)) as CardCommand[];
    const replay = makeCardSim({ seed: 3, hand: HAND, commander: harten, commands: restored });
    replay.run();
    expect(json(replay.events)).toBe(json(live.events));
  });

  it('카드를 쓰면 결과 로그가 달라진다', () => {
    const noCards = makeCardSim({ hand: HAND, commander: harten }).run();
    const withCards = playLive(1);
    expect(json(withCards.events)).not.toBe(json(noCards.events));
  });

  it('예약 명령이 실패하면 rejectedCommands에만 남고 로그에는 없다', () => {
    const sim = makeCardSim({
      hand: HAND,
      commands: [
        { tick: 5, cardInstanceId: 3, target: { kind: 'unit', uid: 3 } }, // 적을 아군 카드의 대상으로
        { tick: 6, cardInstanceId: 3, target: { kind: 'unit', uid: 0 } },
      ],
    });
    sim.runUntil(10);
    expect(sim.rejectedCommands).toHaveLength(1);
    expect(sim.rejectedCommands[0]?.reason).toContain('아군 유닛만');
    expect(sim.commandLog).toHaveLength(1);
    expect(sim.events.filter((e) => e.type === 'cardPlayed')).toHaveLength(1);
  });

  it('틱 0의 작전 카드가 아닌 명령은 tick 0 첫 step에서 실행된다', () => {
    const sim = makeCardSim({
      hand: HAND,
      commands: [{ tick: 0, cardInstanceId: 3, target: { kind: 'unit', uid: 0 } }],
    });
    expect(sim.events.filter((e) => e.type === 'cardPlayed')).toHaveLength(0);
    sim.step();
    expect(sim.events.filter((e) => e.type === 'cardPlayed')).toHaveLength(1);
  });

  it('작전 카드를 tick 0이 아닌 명령으로 주면 거부된다', () => {
    const sim = makeCardSim({ hand: HAND, commands: [{ tick: 3, cardInstanceId: 1, target: { kind: 'none' } }] });
    sim.runUntil(5);
    expect(sim.rejectedCommands[0]?.reason).toContain('준비 단계에서만');
  });

  it('음수 틱 같은 잘못된 명령은 생성 시 Error', () => {
    expect(() => makeCardSim({ hand: HAND, commands: [{ tick: -1, cardInstanceId: 1, target: { kind: 'none' } }] })).toThrow(
      '틱은 0 이상',
    );
  });
});

describe('카드 없는 전투는 M1과 동일', () => {
  it('cards 옵션이 없으면 cp·cardPlayed 이벤트가 전혀 없다', () => {
    const result = makeSim(CARD_A, CARD_B, 5).run();
    expect(result.events.some((e) => e.type === 'cp' || e.type === 'cardPlayed')).toBe(false);
  });

  it('지휘관 없음 + 명령 없음이면 cp 이벤트를 빼고 M1 로그와 같다', () => {
    const legacy = makeSim(CARD_A, CARD_B, 5).run();
    const withCards = makeCardSim({ seed: 5, commander: null, hand: HAND }).run();
    const stripped = withCards.events.filter((e) => e.type !== 'cp');
    expect(json(stripped)).toBe(json(legacy.events));
    expect(withCards.endTime).toBe(legacy.endTime);
  });

  it('지휘관(하르텐)을 넣으면 달라진다', () => {
    const base = makeCardSim({ seed: 5, commander: null }).run();
    const withHarten = makeCardSim({ seed: 5, commander: harten }).run();
    expect(json(withHarten.events)).not.toBe(json(base.events));
  });
});

describe('틱 단위 진행 API', () => {
  it('step을 반복한 결과와 run이 같다', () => {
    const stepped = makeCardSim({ seed: 9, hand: HAND, commander: harten });
    while (!stepped.finished) stepped.step();
    const ran = makeCardSim({ seed: 9, hand: HAND, commander: harten });
    ran.run();
    expect(json(stepped.events)).toBe(json(ran.events));
  });

  it('runUntil은 해당 틱 직전까지 진행하고 로그를 조회할 수 있다', () => {
    const sim = makeCardSim();
    const before = sim.events.length;
    sim.runUntil(20);
    expect(sim.world.tick).toBe(20);
    expect(sim.events.length).toBeGreaterThan(before);
    expect(sim.phase).toBe('combat');
    sim.runUntil(10); // 이미 지난 틱이면 아무 일도 하지 않는다
    expect(sim.world.tick).toBe(20);
  });

  it('전투 종료 후 phase는 ended, 이후 step은 아무 일도 하지 않는다', () => {
    const sim = makeCardSim();
    sim.run();
    const count = sim.events.length;
    sim.step();
    expect(sim.phase).toBe('ended');
    expect(sim.events.length).toBe(count);
  });
});
