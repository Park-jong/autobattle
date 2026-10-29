import { describe, expect, it } from 'vitest';
import { formation } from '../../core/combat/testSupport';
import { loadGameData } from '../gameData';
import { LAYOUT } from '../theme';
import { BattleSession } from './BattleSession';

const data = loadGameData();
const ENEMY = formation([['arena_recruit', 1, 4, 2]]);

function session(seed = 1, preset: 'starter' | 'test' = 'starter'): BattleSession {
  const s = new BattleSession(data.units, data.traits, data.defaultFormations, {
    cards: data.cards, commanders: data.commanders, defaultCommanderId: data.defaultCommanderId,
    seriesStages: [{ name: '일반', enemy: ENEMY }, { name: '정예', enemy: ENEMY }, { name: '보스', enemy: ENEMY }],
  });
  s.setSeed(seed);
  s.startManagementRun(preset);
  return s;
}

function state(s: BattleSession) {
  const view = s.snapshot().management;
  if (!view) throw new Error('경제 플레이가 필요함');
  return view.state;
}

function finish(s: BattleSession): void {
  s.start(1);
  for (let i = 0; i < 100 && s.phase !== 'finished'; i++) s.advance(1);
  expect(s.phase).toBe('finished');
}

function point(col: number, row: number): [number, number] {
  return [LAYOUT.BOARD_X + (col + 0.5) * LAYOUT.CELL_SIZE, LAYOUT.BOARD_Y + (row + 0.5) * LAYOUT.CELL_SIZE];
}

describe('경제 플레이 통합', () => {
  it.each([false, true])('준비 편성 변경 시 실제 작전 카드 사용=%s에 맞춰 복구 알림을 표시한다', (operationUsed) => {
    const s = session(3, 'test');
    const equipment = s.cardView().hand.find((card) => card.cardId === 'forged_blade');
    const operation = s.cardView().hand.find((card) => card.cardId === 'war_drums');
    if (!equipment || !operation) throw new Error('준비 카드 없음');
    s.beginCard(equipment.instanceId, 'click');
    s.pointerDown(...point(3, 1), false);
    if (operationUsed) s.useCardNow(operation.instanceId);
    s.moveManagedToBench(state(s).board[0]!.id);
    expect(state(s).bench.some((unit) => unit?.equipment.includes('forged_blade'))).toBe(true);
    const message = s.cardView().toast?.message ?? '';
    if (operationUsed) expect(message).toContain('작전 카드가 되돌려졌습니다');
    else expect(message).not.toContain('작전 카드');
  });
  it('상점 잠금·리롤·경험치 구매만으로 준비 단계 작전 카드가 되돌아오지 않는다', () => {
    const s = session(3, 'test');
    const operation = s.cardView().hand.find((card) => card.cardId === 'war_drums');
    if (!operation) throw new Error('작전 카드 없음');
    s.useCardNow(operation.instanceId);
    expect(s.cardView().cp.prep).toBe(1);
    s.toggleShopLock();
    s.rerollShop();
    s.buyExperience();
    expect(s.cardView().cp.prep).toBe(1);
    expect(s.cardView().hand.some((card) => card.instanceId === operation.instanceId)).toBe(false);
  });
  it('2기·10G·레벨3으로 시작해 구매·배치·인구 제한·레벨업·판매를 연결한다', () => {
    const s = session();
    expect(state(s)).toMatchObject({ gold: 10, level: 3, population: 2 });
    expect(state(s).offers).toHaveLength(5);
    expect(state(s).bench).toHaveLength(9);
    s.buyUnit(1); // 시드1: 잿불 투석병
    const recruit = state(s).bench.find((unit) => unit !== null);
    if (!recruit) throw new Error('구매 유닛 없음');
    s.selectManagedUnit(recruit.id);
    s.pointerDown(...point(2, 2), false);
    expect(state(s).population).toBe(3);
    s.buyUnit(3); // 심연 단검병
    const extra = state(s).bench.find((unit) => unit !== null);
    if (!extra) throw new Error('추가 유닛 없음');
    s.moveManagedToBoard(extra.id, { col: 1, row: 2 });
    expect(state(s).population).toBe(3);
    s.buyExperience();
    expect(state(s).level).toBe(4);
    s.dropManagedToBoard(extra.id, ...point(1, 2));
    expect(state(s).population).toBe(4);
    const gold = state(s).gold;
    s.sellManagedUnit(extra.id);
    expect(state(s).population).toBe(3);
    expect(state(s).gold).toBe(gold + 1);
  });

  it('유닛 카드 공급은 보드에만 연결되고 벤치 이동·판매 시 제거된다', () => {
    // 진열은 시드와 유닛 풀 구성에 따라 달라지므로 전쟁 군악대가 진열된 시드를 찾아서 쓴다
    let s = session();
    let slot = -1;
    for (let seed = 1; seed <= 200 && slot < 0; seed++) {
      s = session(seed);
      slot = state(s).offers.findIndex((offer) => offer?.unitId === 'war_drummer');
    }
    expect(slot).toBeGreaterThanOrEqual(0);
    s.buyUnit(slot);
    const provider = state(s).bench.find((unit) => unit?.unitId === 'war_drummer');
    if (!provider) throw new Error('군악대 없음');
    const ids = () => [...s.cardView().hand, ...s.cardView().draw.entries, ...s.cardView().discard.entries, ...s.cardView().exhaust.entries].map((card) => card.cardId);
    expect(ids()).not.toContain('marching_song');
    s.moveManagedToBoard(provider.id, { col: 2, row: 2 });
    expect(ids()).toContain('marching_song');
    s.moveManagedToBench(provider.id);
    expect(ids()).not.toContain('marching_song');
    s.moveManagedToBoard(provider.id, { col: 2, row: 2 });
    expect(ids().filter((id) => id === 'marching_song')).toHaveLength(1);
    s.sellManagedUnit(provider.id);
    expect(ids()).not.toContain('marching_song');
  });

  it('장비 카드는 로스터에 저장되고 준비 화면 재생성·다음 판에도 복제 없이 유지된다', () => {
    const s = session(2, 'test');
    const item = s.cardView().hand.find((card) => card.cardId === 'forged_blade');
    if (!item) throw new Error('장비 카드 없음');
    expect(item.playable).toBe(true);
    s.beginCard(item.instanceId, 'click');
    s.pointerDown(...point(3, 1), false);
    expect(state(s).board[0]?.equipment).toEqual(['forged_blade']);
    expect(s.cardView().hand.some((card) => card.instanceId === item.instanceId)).toBe(false);
    expect(s.cardView().exhaust.entries.some((card) => card.cardId === 'forged_blade')).toBe(true);
    s.moveManagedToBench(state(s).board[0]!.id);
    const equipped = state(s).bench.find((unit) => unit?.equipment.length);
    if (!equipped) throw new Error('장비 유닛 없음');
    s.moveManagedToBoard(equipped.id, { col: 3, row: 1 });
    expect(state(s).board.find((unit) => unit.id === equipped.id)?.equipment).toEqual(['forged_blade']);
    expect(s.cardView().hand.some((card) => card.cardId === 'forged_blade')).toBe(false);
    finish(s);
    s.nextSeriesBattle();
    expect(state(s).board.find((unit) => unit.id === equipped.id)?.equipment).toEqual(['forged_blade']);
    expect(s.snapshot().formations[0].find((entry) => entry.cell.row === 1)?.equipment).toEqual(['forged_blade']);
  });

  it('징집 임시 유닛은 소유 로스터·장비 UID 매핑과 다음 전투에 섞이지 않는다', () => {
    const s = session(2, 'test');
    const original = state(s).board.map((unit) => unit.id);
    const card = s.cardView().hand.find((entry) => entry.cardId === 'call_reserves');
    if (!card) throw new Error('징집 카드 없음');
    s.start(1);
    s.advance(4); // CP 3 확보
    s.useCardNow(card.instanceId);
    s.advance(0.2);
    expect(s.views().filter((unit) => unit.side === 0)).toHaveLength(4);
    expect(state(s).board.map((unit) => unit.id)).toEqual(original);
    for (let i = 0; i < 100 && s.phase !== 'finished'; i++) s.advance(1);
    s.nextSeriesBattle();
    expect(s.views().filter((unit) => unit.side === 0)).toHaveLength(2);
    expect(state(s).board.map((unit) => unit.id)).toEqual(original);
    expect(state(s).board.every((unit) => unit.equipment.length === 0)).toBe(true);
  });

  it('잠금은 다음 상점 1회를 유지하고 마지막 보상까지 골드가 누적된다', () => {
    const s = session();
    const offers = state(s).offers;
    s.toggleShopLock();
    finish(s);
    const gold = state(s).gold;
    s.nextSeriesBattle();
    expect(state(s).offers).toEqual(offers);
    expect(state(s).locked).toBe(false);
    expect(state(s).gold).toBe(gold);
    finish(s);
    s.nextSeriesBattle();
    expect(state(s).offers).not.toEqual(offers);
    finish(s);
    expect(s.snapshot().series?.done).toBe(true);
    expect(s.snapshot().economy.lastReward?.kind).toBe('boss');
    expect(s.snapshot().economy.lastReward?.base).toBe(15);
    expect(s.snapshot().management?.canManage).toBe(false);
    const finalGold = state(s).gold;
    s.buyUnit(0);
    s.rerollShop();
    s.reset();
    expect(state(s).gold).toBe(finalGold);
    s.endManagementRun();
    expect(s.snapshot().management).toBeNull();
    expect(s.snapshot().economy.gold).toBe(10);
  });
});
