import { describe, expect, it } from 'vitest';
import { CombatSimulator } from '../../core/combat';
import {
  CARD_A,
  CARD_B,
  cardCatalog,
  commanders,
  formation,
  traits,
  units,
} from '../../core/combat/testSupport';
import { LAYOUT } from '../theme';
import type { GauntletStage } from '../live/Gauntlet';
import { BattleSession } from './BattleSession';

const A = formation(CARD_A);
const B = formation(CARD_B);
const STAGES: GauntletStage[] = [
  { name: '약한 적', enemy: formation([['arena_recruit', 1, 4, 2]]) },
  { name: '조금 강한 적', enemy: formation([['iron_shieldbearer', 1, 4, 2], ['arena_recruit', 1, 5, 1]]) },
];

/** 칸 중심의 게임 좌표 */
function at(col: number, row: number): [number, number] {
  return [LAYOUT.BOARD_X + (col + 0.5) * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + (row + 0.5) * LAYOUT.CELL_SIZE];
}

function newSession(withCommander = true): BattleSession {
  const s = new BattleSession(units, traits, [A, B], {
    cards: cardCatalog,
    commanders,
    startFormations: new Map([['cmd_harten', formation([['iron_shieldbearer', 1, 3, 2], ['legion_crossbow', 1, 1, 2]])]]),
    seriesStages: STAGES,
  });
  if (withCommander) s.setCommander('cmd_harten');
  return s;
}

/** 손패에 필요한 카드가 모두 들어오는 시드를 찾아 적용한다 */
function dealWith(s: BattleSession, ...cardIds: string[]): void {
  for (let seed = 1; seed < 400; seed++) {
    s.setSeed(seed);
    const ids = s.cardView().hand.map((c) => c.cardId);
    if (cardIds.every((id) => ids.includes(id))) return;
  }
  throw new Error(`손패에 ${cardIds.join(', ')}가 들어오는 시드가 없음`);
}

const handCard = (s: BattleSession, cardId: string) => {
  const c = s.cardView().hand.find((x) => x.cardId === cardId);
  if (!c) throw new Error(`손패에 ${cardId} 없음`);
  return c;
};

function advanceSeconds(s: BattleSession, seconds: number, dt = 0.05): void {
  for (let t = 0; t < seconds; t += dt) s.advance(dt);
}

function playToEnd(s: BattleSession): void {
  for (let i = 0; i < 20000 && s.phase !== 'finished'; i++) s.advance(0.1);
}

describe('BattleSession 지휘관 선택', () => {
  it('지휘관이 없으면 카드 UI가 숨겨지고 결과는 카드 없는 sim과 같다 (M1 동작)', () => {
    const s = newSession(false);
    expect(s.cardView().visible).toBe(false);
    expect(s.prepping).toBe(false);
    s.start(5);
    playToEnd(s);
    const expected = new CombatSimulator({ seed: 5, formations: [A, B] }, units, traits).run();
    expect(JSON.stringify(s.snapshot().result)).toBe(JSON.stringify(expected));
  });

  it('기본 지휘관을 주면 처음부터 그 지휘관의 준비 단계이고, 없는 id면 지휘관 없음이다', () => {
    const extras = { cards: cardCatalog, commanders };
    const s = new BattleSession(units, traits, [A, B], { ...extras, defaultCommanderId: 'cmd_harten' });
    expect(s.snapshot().commanderId).toBe('cmd_harten');
    expect(s.prepping).toBe(true);
    expect(s.cardView().visible).toBe(true);
    expect(s.cardView().hand).toHaveLength(5);
    expect(s.cardView().cp.prep).toBe(2);
    expect(s.snapshot().formations[0]).toEqual(A); // 시작 편성은 자동 배치하지 않는다

    for (const id of [null, 'cmd_missing']) {
      const none = new BattleSession(units, traits, [A, B], { ...extras, defaultCommanderId: id });
      expect(none.snapshot().commanderId).toBeNull();
      expect(none.cardView().visible).toBe(false);
    }
  });

  it('하르텐을 고르면 시작 덱 10장에서 5장을 뽑은 준비 단계가 된다', () => {
    const s = newSession();
    const view = s.cardView();
    expect(view.visible).toBe(true);
    expect(view.hand).toHaveLength(5);
    expect(view.draw.count).toBe(5);
    expect(view.phaseLabel).toBe('준비 단계');
    expect(view.passiveName).toBe('철의 서약');
    expect(view.cp.showPrep).toBe(true);
    expect(view.cp.prep).toBe(2);
    expect(s.prepping).toBe(true);
    // 준비 단계: 철의 서약 보호막이 이미 보인다
    expect(s.views().some((v) => v.side === 0 && v.shield > 0)).toBe(true);
    // 명령 카드는 준비 단계에서 비활성 + 이유
    const command = view.hand.find((c) => c.type === 'command');
    expect(command?.playable).toBe(false);
    expect(command?.reason).toContain('전투 중에만');

    s.setCommander(null);
    expect(s.cardView().visible).toBe(false);
  });

  it('시작 편성 불러오기는 아군 쪽만 바꾼다', () => {
    const s = newSession();
    s.loadCommanderStart();
    expect(s.snapshot().formations[0]).toHaveLength(2);
    expect(s.snapshot().formations[1]).toEqual(B);
    const none = newSession(false);
    none.loadCommanderStart();
    expect(none.snapshot().error).toContain('지휘관');
  });
});

describe('BattleSession 준비 단계', () => {
  it('작전 카드를 준비 CP로 쓰고, 편성을 바꾸면 되돌려진다', () => {
    const s = newSession();
    dealWith(s, 'war_drums');
    const drums = handCard(s, 'war_drums');
    expect(drums.playable).toBe(true);
    s.useCardNow(drums.instanceId);
    expect(s.cardView().hand.some((c) => c.instanceId === drums.instanceId)).toBe(false);
    expect(s.cardView().cp.prep).toBe(1);
    expect(s.cardView().discard.count).toBe(1);

    s.setBrush({ kind: 'unit', unitId: 'arena_recruit', star: 1 });
    s.clickCell({ col: 0, row: 0 }, false);
    expect(s.cardView().hand.some((c) => c.instanceId === drums.instanceId)).toBe(true);
    expect(s.cardView().cp.prep).toBe(2);
    expect(s.cardView().toast?.message).toContain('되돌려졌습니다');
  });

  it('양쪽에 유닛이 없으면 손패만 보이고 모든 카드가 사유와 함께 막힌다', () => {
    const s = new BattleSession(units, traits, [[], []], { cards: cardCatalog, commanders });
    s.setCommander('cmd_harten');
    const view = s.cardView();
    expect(view.hand).toHaveLength(5);
    expect(view.hand.every((c) => !c.playable && c.reason !== null)).toBe(true);
  });

  it('전투를 시작하면 준비 CP가 사라지고 전투 CP 2가 된다', () => {
    const s = newSession();
    s.start(s.snapshot().seed);
    const cp = s.cardView().cp;
    expect(cp.combat).toBe(2);
    expect(cp.showPrep).toBe(false);
    expect(s.cardView().phaseLabel).toBe('전투 중');
  });
});

describe('BattleSession 카드 사용 (대상 지정)', () => {
  it('아군 대상 카드: 선택 후 아군 유닛을 클릭하면 사용되고, 잘못된 곳은 선택이 유지된다', () => {
    const s = newSession();
    dealWith(s, 'hold_the_line');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'hold_the_line');
    expect(card.playable).toBe(true);

    s.beginCard(card.instanceId, 'click');
    expect(s.targeting().active).toBe(true);
    expect(s.targeting().validUnits).toEqual([0, 1, 2]);
    s.pointerMoved(...at(3, 1));
    expect(s.targeting().hoverUnit).toBe(0);

    // 적 유닛 클릭: 사용되지 않고 사유 토스트, 선택 유지
    s.pointerDown(...at(4, 2), false);
    expect(s.targeting().active).toBe(true);
    expect(s.cardView().toast?.message).toContain('아군');
    expect(s.cardView().hand.some((c) => c.instanceId === card.instanceId)).toBe(true);

    s.pointerDown(...at(3, 1), false);
    expect(s.targeting().active).toBe(false);
    expect(s.cardView().hand.some((c) => c.instanceId === card.instanceId)).toBe(false);
    expect(s.cardView().cp.combat).toBe(1);
  });

  it('우클릭과 cancelCard는 선택을 취소한다', () => {
    const s = newSession();
    dealWith(s, 'hold_the_line');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'hold_the_line');
    s.beginCard(card.instanceId, 'click');
    s.pointerDown(...at(3, 1), true);
    expect(s.targeting().active).toBe(false);
    s.beginCard(card.instanceId, 'click');
    s.cancelCard();
    expect(s.targeting().active).toBe(false);
    // 같은 카드를 다시 누르면 선택 해제(토글)
    s.beginCard(card.instanceId, 'click');
    s.beginCard(card.instanceId, 'click');
    expect(s.targeting().active).toBe(false);
  });

  it('드래그로 놓기: 캔버스 밖에 놓으면 취소, 유효한 유닛 위에 놓으면 사용', () => {
    const s = newSession();
    dealWith(s, 'hold_the_line');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'hold_the_line');
    s.beginCard(card.instanceId, 'drag');
    s.dropCard(null);
    expect(s.targeting().active).toBe(false);
    expect(s.cardView().hand).toHaveLength(5);

    s.beginCard(card.instanceId, 'drag');
    const [x, y] = at(2, 2);
    s.dropCard({ x, y });
    expect(s.cardView().hand).toHaveLength(4);
  });

  it('진형 교대: 아군 2명을 차례로 골라 위치를 바꾼다', () => {
    const s = newSession();
    dealWith(s, 'formation_swap');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'formation_swap');
    s.beginCard(card.instanceId, 'click');
    s.pointerDown(...at(3, 1), false);
    expect(s.targeting().selectedUnits).toEqual([0]);
    s.pointerDown(...at(2, 2), false);
    expect(s.targeting().active).toBe(false);
    s.advance(0.1);
    // 교대 연출(teleport)이 재생 로그에 나타나고, 두 유닛이 서로의 칸으로 이동한다
    const teleports = s.recentEffects(2).filter((e) => e.kind === 'teleport');
    expect(teleports).toHaveLength(2);
    const swapped = s.views().filter((v) => v.uid === 0 || v.uid === 2).map((v) => v.pos);
    expect(swapped).toHaveLength(2);
  });

  it('CP가 부족한 카드는 집을 수 없고 이유를 토스트로 알린다', () => {
    const s = newSession();
    dealWith(s, 'last_stand');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'last_stand'); // 비용 2: 시작 CP 2로 가능
    s.beginCard(card.instanceId, 'click');
    s.pointerDown(...at(3, 1), false);
    expect(s.cardView().cp.combat).toBe(0);
    // 이제 CP 0: 다른 카드는 부족
    const other = s.cardView().hand.find((c) => c.cost > 0);
    if (!other) throw new Error('비용 있는 카드 없음');
    expect(other.playable).toBe(false);
    expect(other.reason).toContain('CP 부족');
    s.beginCard(other.instanceId, 'click');
    expect(s.targeting().active).toBe(false);
    expect(s.cardView().toast?.message).toContain('CP 부족');
  });

  it('대상이 필요 없는 카드는 바로 사용하거나 보드 위에 놓아 사용한다', () => {
    const s = newSession();
    dealWith(s, 'shield_formation');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'shield_formation');
    s.beginCard(card.instanceId, 'click');
    expect(s.targeting().dropZone).toBe(true);
    s.pointerDown(...at(6, 4), false);
    expect(s.cardView().hand.some((c) => c.instanceId === card.instanceId)).toBe(false);
  });
});

describe('BattleSession 슬로모션', () => {
  it('카드를 집는 동안 배속의 25%로 진행하고 취소하면 복귀한다', () => {
    const s = newSession();
    dealWith(s, 'hold_the_line');
    s.start(s.snapshot().seed);
    const card = handCard(s, 'hold_the_line');
    expect(s.timeScale).toBe(1);
    s.beginCard(card.instanceId, 'click');
    expect(s.timeScale).toBeCloseTo(0.25);
    const t0 = s.time;
    s.advance(1);
    expect(s.time - t0).toBeCloseTo(0.25);
    s.setSpeed(4);
    expect(s.timeScale).toBeCloseTo(1);
    s.cancelCard();
    expect(s.timeScale).toBe(4);
  });

  it('"카드 선택 중 일시정지" 옵션이면 멈춘다', () => {
    const s = newSession();
    dealWith(s, 'hold_the_line');
    s.start(s.snapshot().seed);
    s.setPauseOnCardHold(true);
    s.beginCard(handCard(s, 'hold_the_line').instanceId, 'drag');
    expect(s.timeScale).toBe(0);
    const t0 = s.time;
    s.advance(1);
    expect(s.time).toBe(t0);
    s.dropCard(null);
    expect(s.timeScale).toBe(1);
  });
});

describe('BattleSession 실시간 진행', () => {
  it('지휘관이 있어도 카드를 쓰지 않으면 같은 시드의 sim.run과 이벤트 로그가 같다', () => {
    const s = newSession();
    s.start(9);
    playToEnd(s);
    expect(s.phase).toBe('finished');
    expect(s.cardView().phaseLabel).toBe('전투 종료');
    expect(s.cardView().hand.every((c) => !c.playable)).toBe(true);
    const result = s.snapshot().result;
    expect(result).not.toBeNull();
    expect(result?.events.some((e) => e.type === 'cp')).toBe(true);
  });

  it('리셋하면 같은 손패의 준비 단계로 돌아간다', () => {
    const s = newSession();
    const hand = s.cardView().hand.map((c) => c.instanceId);
    s.start(s.snapshot().seed);
    advanceSeconds(s, 2);
    s.reset();
    expect(s.phase).toBe('edit');
    expect(s.cardView().hand.map((c) => c.instanceId)).toEqual(hand);
    expect(s.time).toBe(0);
  });
});

describe('BattleSession 5연전', () => {
  function startSeries(cardsEnabled = true): BattleSession {
    const s = newSession();
    s.startSeries(cardsEnabled);
    return s;
  }

  it('적 편성이 고정 단계로 바뀌고 편성 편집은 잠긴다', () => {
    const s = startSeries();
    const series = s.snapshot().series;
    expect(series).toMatchObject({ total: 2, index: 0, stageName: '약한 적', cardsEnabled: true });
    expect(s.snapshot().formations[1]).toEqual(STAGES[0]?.enemy);
    expect(s.snapshot().editable).toBe(false);
    s.setBrush({ kind: 'erase' });
    s.clickCell({ col: 3, row: 1 }, false);
    expect(s.snapshot().formations[0]).toHaveLength(3);
  });

  it('전투를 마치면 기록되고 다음 전투로 넘어가며 덱이 이어진다', () => {
    const s = startSeries();
    const firstHand = s.cardView().hand.map((c) => c.instanceId);
    s.start(s.snapshot().seed);
    playToEnd(s);
    expect(s.phase).toBe('finished');
    let series = s.snapshot().series;
    expect(series?.records).toHaveLength(1);
    expect(series?.index).toBe(1);
    expect(s.snapshot().result).not.toBeNull();
    s.reset(); // 기록된 판에서는 리셋 무시
    expect(s.phase).toBe('finished');

    s.nextSeriesBattle();
    expect(s.phase).toBe('edit');
    expect(s.snapshot().formations[1]).toEqual(STAGES[1]?.enemy);
    const secondHand = s.cardView().hand.map((c) => c.instanceId);
    expect(secondHand).toHaveLength(5);
    expect(secondHand.some((id) => firstHand.includes(id))).toBe(false); // 이전 손패는 버린 더미로, 남은 뽑을 더미에서 새로 뽑음

    s.start(s.snapshot().seed);
    playToEnd(s);
    series = s.snapshot().series;
    expect(series?.done).toBe(true);
    expect(series?.summary.played).toBe(2);
    s.nextSeriesBattle(); // 끝난 뒤에는 아무 일도 없다
    expect(s.phase).toBe('finished');
  });

  it('카드 사용 금지: 손패가 비고 카드를 쓸 수 없지만 지휘관 패시브(보호막)는 적용된다', () => {
    const s = startSeries(false);
    const view = s.cardView();
    expect(view.hand).toHaveLength(0);
    expect(view.notice).toContain('카드 사용 금지');
    expect(s.views().some((v) => v.side === 0 && v.shield > 0)).toBe(true);
    s.start(s.snapshot().seed);
    playToEnd(s);
    expect(s.snapshot().series?.records[0]?.cardsUsed).toBe(0);
  });

  it('같은 설정이면 시드가 판마다 결정적으로 파생되어 같은 기록이 나온다', () => {
    const run = () => {
      const s = startSeries();
      for (let i = 0; i < 2; i++) {
        s.start(s.snapshot().seed);
        playToEnd(s);
        s.nextSeriesBattle();
      }
      return JSON.stringify(s.snapshot().series?.records);
    };
    expect(run()).toBe(run());
  });

  it('중단하면 시작 전 적 편성으로 돌아가 다시 편집할 수 있다', () => {
    const s = startSeries();
    s.endSeries();
    expect(s.snapshot().series).toBeNull();
    expect(s.snapshot().formations[1]).toEqual(B);
    expect(s.snapshot().editable).toBe(true);
    expect(s.phase).toBe('edit');
  });
});
