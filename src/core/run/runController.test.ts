import { describe, expect, it } from 'vitest';
import { deckCards } from '../cards';
import { CombatSimulator } from '../combat';
import { handSnapshot, harten, traits, units } from '../combat/testSupport';
import { RUN } from './constants';
import { defeatDamage } from './commanderHealth';
import { floorScale } from './encounterPlanner';
import { RunController } from './runController';
import {
  damageCommander, driveTo, finishBattle, forceResult, grantGold, newRun, runDeps, spendAllGold,
} from './testSupport';

describe('런 시작', () => {
  it('지휘관 시작 상태: HP 80, 10G, 시작 유닛 2기·레벨 3, 시작 덱 10장, 맵 선택 단계', () => {
    const run = newRun(1);
    expect(run.phase).toBe('map');
    expect(run.outcome).toBeNull();
    expect([run.hp, run.maxHp]).toEqual([80, 80]);
    expect(run.gold).toBe(10);
    const roster = run.roster.snapshot();
    expect(roster.level).toBe(3);
    expect(roster.board.map((u) => u.unitId)).toEqual(['iron_shieldbearer', 'iron_shieldbearer']);
    expect(deckCards(run.deck)).toHaveLength(10);
    expect(run.currentNode).toBeNull();
    expect(run.availableNodes().map((n) => n.id)).toEqual(run.map.floor(1).map((n) => n.id));
  });

  it('같은 시드는 같은 맵·시작 상태, 모르는 지휘관은 오류', () => {
    expect(JSON.stringify(newRun(3).serialize())).toBe(JSON.stringify(newRun(3).serialize()));
    expect(JSON.stringify(newRun(3).serialize())).not.toBe(JSON.stringify(newRun(4).serialize()));
    expect(() => RunController.create(runDeps, { seed: 1, commanderId: 'cmd_nope' })).toThrow(/알 수 없는 지휘관/);
  });

  it('노드 선택: 현재 위치에서 이어진 다음 층 노드만 고를 수 있다', () => {
    const run = newRun(1);
    expect(run.chooseNode('2-0')).toMatchObject({ ok: false });
    expect(run.chooseNode('nope')).toMatchObject({ ok: false });
    const first = run.availableNodes()[0]!;
    expect(run.chooseNode(first.id)).toEqual({ ok: true });
    expect(run.currentNode?.id).toBe(first.id);
    expect(run.visited).toEqual([first.id]);
    expect(run.chooseNode(first.id)).toMatchObject({ ok: false }); // 이미 노드 안
    expect(run.availableNodes()).toEqual([]); // map 단계가 아님
  });
});

describe('전투 노드와 적 편성', () => {
  it('미리보기 = 실제 전투 편성: 유닛·성급·칸·보정 후 HP가 시뮬 spawn과 같다', () => {
    const run = newRun(2);
    const node = run.availableNodes()[0]!;
    const preview = run.previewNode(node.id)!;
    expect(preview).not.toBeNull();
    run.chooseNode(node.id);
    expect(run.battlePlan()).toEqual(preview);

    const sim = run.createSimulator();
    const spawns = sim.events.filter((e) => e.type === 'spawn' && e.side === 1) as Extract<(typeof sim.events)[number], { type: 'spawn' }>[];
    expect(spawns.map((s) => [s.unitId, s.star, s.cell, s.maxHp])).toEqual(preview.units.map((u) => [u.unitId, u.star, u.cell, u.hp]));
    for (const unit of preview.units) {
      const live = sim.world.units.find((u) => u.side === 1 && u.cell.col === unit.cell.col && u.cell.row === unit.cell.row)!;
      expect(live.stat('atk')).toBe(unit.atk);
    }
  });

  it('모든 전투 종류에서 미리보기와 실제 전투 편성이 같다 (정예 변이·보스 포함)', () => {
    for (const type of ['elite', 'boss'] as const) {
      const run = newRun(6);
      driveTo(run, type);
      const preview = run.previewNode(run.currentNode!.id)!;
      const sim = run.createSimulator();
      const spawns = sim.events.filter((e) => e.type === 'spawn' && e.side === 1) as { unitId: string; maxHp: number; cell: unknown }[];
      expect(spawns.map((s) => [s.unitId, s.maxHp, s.cell])).toEqual(preview.units.map((u) => [u.unitId, u.hp, u.cell]));
      const mutations = sim.events.filter((e) => e.type === 'mutation').map((e) => (e as { id: string }).id);
      expect(mutations).toEqual(preview.mutations);
      if (type === 'elite') expect(mutations.length).toBeGreaterThan(0);
    }
  });

  it('전투 시드는 런 시드·노드·시도 횟수로 정해지고 시뮬은 같은 상태에서 같은 로그다', () => {
    const make = () => {
      const run = newRun(5);
      run.chooseNode(run.availableNodes()[0]!.id);
      return run;
    };
    const a = make();
    const b = make();
    expect(a.battleSeed()).toBe(b.battleSeed());
    expect(JSON.stringify(a.createSimulator().run().events)).toBe(JSON.stringify(b.createSimulator().run().events));
  });

  it('층 보정이 적용된 층의 적은 같은 편성의 1층 기준보다 강하다', () => {
    const run = newRun(8);
    driveTo(run, 'combat');
    const plan = run.battlePlan();
    expect(plan.scale).toBe(floorScale(plan.floor));
  });
});

describe('전투 정산', () => {
  it('승리: 골드(5G+이자) 지급, 지휘관 HP 유지, 카드 보상 단계로', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const result = finishBattle(run, 'win');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.settlement;
    expect(s).toMatchObject({ kind: 'normal', outcome: 'win', cardHpLost: 0, defeatDamage: 0, hpBefore: 80, hpAfter: 80, runEnded: null });
    expect(s.reward).toMatchObject({ base: 5, interest: 1, total: 6, goldBefore: 10, goldAfter: 16 });
    expect(run.gold).toBe(16);
    expect(run.phase).toBe('reward');
    expect(s.cardOffer).toHaveLength(3);
    expect(run.rewardOffer()).toEqual(s.cardOffer);
    expect(run.history).toHaveLength(1);
  });

  it('같은 전투를 두 번 정산하지 못한다 (골드·HP·덱이 다시 바뀌지 않는다)', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const sim = run.createSimulator();
    run.beginBattle();
    forceResult(sim, 'win');
    expect(run.completeBattle(sim).ok).toBe(true);
    const gold = run.gold;
    const again = run.completeBattle(sim);
    expect(again.ok).toBe(false);
    expect(run.gold).toBe(gold);
    expect(run.history).toHaveLength(1);
    expect(run.phase).toBe('reward');
  });

  it('끝나지 않은 전투와 다른 단계의 정산은 거부한다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const sim = run.createSimulator();
    expect(run.completeBattle(sim)).toEqual({ ok: false, reason: '전투가 아직 끝나지 않았습니다' });
    const fresh = newRun(2);
    expect(fresh.completeBattle(sim).ok).toBe(false);
  });

  it('패배: 일반 전투 피해 = 2 + 생존 적 등급 합 + floor(층/3), 골드 3G', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const plan = run.battlePlan();
    const tierSum = plan.units.reduce((sum, u) => sum + u.tier, 0);
    const result = finishBattle(run, 'loss');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = defeatDamage({ survivorTierSum: tierSum, floor: 1, kind: 'normal' });
    expect(expected).toBe(2 + tierSum + 0);
    expect(result.settlement).toMatchObject({ outcome: 'loss', defeatDamage: expected, hpAfter: 80 - expected });
    expect(run.hp).toBe(80 - expected);
    expect(result.settlement.reward.base).toBe(3);
    expect(run.phase).toBe('map'); // 일반 패배는 보상 없이 다음 선택으로
    expect(run.availableNodes().length).toBeGreaterThan(0);
  });

  it('정예 패배는 ×1.5 올림, 층 보정 반영', () => {
    const run = newRun(6);
    const node = driveTo(run, 'elite');
    const tierSum = run.battlePlan().units.reduce((sum, u) => sum + u.tier, 0);
    const result = finishBattle(run, 'loss');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.kind).toBe('elite');
    expect(result.settlement.defeatDamage).toBe(Math.ceil((2 + tierSum + Math.floor(node.floor / 3)) * 1.5));
    expect(result.settlement.reward.base).toBe(3);
  });

  it('무승부(동시 전멸)는 패배로 취급: 생존 적이 없으면 피해는 2 + floor(층/3)', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const result = finishBattle(run, 'draw');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.outcome).toBe('draw');
    expect(result.settlement.defeatDamage).toBe(2);
    expect(result.settlement.reward.base).toBe(3);
    expect(run.phase).toBe('map');
  });

  it('시간 초과 무승부도 패배 피해를 받는다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const sim = run.createSimulator();
    run.beginBattle();
    // 서로 공격하지 못하게 모든 유닛을 기절시켜 90초 시간 초과
    for (const u of sim.world.units) u.statuses.addStun(1000);
    sim.run();
    const result = run.completeBattle(sim);
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.outcome).toBe('draw');
    expect(result.settlement.defeatDamage).toBeGreaterThan(2);
  });

  it('지휘관 HP가 0이 되면 런이 종료(사망)되고 이후 행동은 거부된다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    damageCommander(run, 79);
    const result = finishBattle(run, 'loss');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.runEnded).toBe('dead');
    expect(run.hp).toBe(0);
    expect(run.phase).toBe('ended');
    expect(run.outcome).toBe('dead');
    expect(run.availableNodes()).toEqual([]);
    expect(run.chooseNode('2-0').ok).toBe(false);
    expect(run.roster.buy(0).ok).toBe(false);
    expect(run.rewardOffer()).toEqual([]);
  });

  it('보스 처치는 런 승리로 종료하며 카드 보상은 없다', () => {
    const run = newRun(6);
    driveTo(run, 'boss');
    const result = finishBattle(run, 'win');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement).toMatchObject({ kind: 'boss', outcome: 'win', runEnded: 'victory', cardOffer: null });
    expect(result.settlement.reward.base).toBe(15);
    expect(run.phase).toBe('ended');
    expect(run.outcome).toBe('victory');
    expect(run.floorReached).toBe(13);
  });

  it('보스에서 지고 살아 있으면 같은 노드에서 재도전한다 (패배 피해 ×2, 전투 시드 변경)', () => {
    const run = newRun(6);
    driveTo(run, 'boss');
    const firstSeed = run.battleSeed();
    const survivorTier = run.battlePlan().units.reduce((sum, u) => sum + u.tier, 0);
    const result = finishBattle(run, 'loss');
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement.defeatDamage).toBe((2 + survivorTier + 4) * 2);
    expect(run.phase).toBe('battlePrep');
    expect(run.currentNode?.type).toBe('boss');
    expect(run.battleSeed()).not.toBe(firstSeed);
    // 재도전 전투는 새 전투 ID로 정산된다 (골드 중복 정산 아님)
    const gold = run.gold;
    expect(finishBattle(run, 'loss').ok).toBe(true);
    expect(run.gold).toBeGreaterThan(gold);
  });

  it('전투 중에는 로스터 관리 명령을 거부하고, 취소하면 준비 단계로 돌아간다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    expect(run.roster.buy(0).ok || run.roster.snapshot().offers[0] === null).toBe(true);
    run.beginBattle();
    expect(run.phase).toBe('battle');
    const board = run.roster.snapshot().board;
    expect(run.roster.buy(0).ok).toBe(false);
    expect(run.roster.reroll().ok).toBe(false);
    expect(run.roster.sell(board[0]!.id).ok).toBe(false);
    expect(run.roster.moveToBench(board[0]!.id).ok).toBe(false);
    expect(run.beginBattle().ok).toBe(false);
    expect(run.abandonBattle().ok).toBe(true);
    expect(run.phase).toBe('battlePrep');
    expect(run.roster.reroll().ok).toBe(true);
  });

  it('맵 단계에서는 구매·리롤은 막고 배치는 허용한다', () => {
    const run = newRun(2);
    expect(run.roster.reroll().ok).toBe(false);
    expect(run.roster.buyXp().ok).toBe(false);
    const unit = run.roster.snapshot().board[0]!;
    expect(run.roster.moveToBench(unit.id).ok).toBe(true);
    expect(run.roster.moveToBoard(unit.id, { col: 2, row: 2 }).ok).toBe(true);
  });
});

/** 테스트 전용: 덱에 카드를 직접 넣는다 */
const addDeckCard = (run: RunController, cardId: string): void => {
  (run as unknown as { state: { forces: { addCard(id: string): void } } }).state.forces.addCard(cardId);
};

describe('심연의 계약 정산', () => {
  it('전투 중 카드로 잃은 지휘관 HP는 승리해도 런에서 차감된다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    // 발급된 시뮬만 정산되므로, 덱에 심연의 계약을 넉넉히 넣어 준비 손패에 들어오게 한다
    for (let i = 0; i < 6; i++) addDeckCard(run, 'abyss_pact');
    const sim = run.createSimulator();
    const pact = sim.deck!.hand.find((card) => card.cardId === 'abyss_pact');
    if (!pact) throw new Error('준비 손패에 심연의 계약이 없음');
    run.beginBattle();
    sim.startCombat();
    expect(sim.playCard(pact.instanceId, { kind: 'none' }).ok).toBe(true);
    forceResult(sim, 'win');
    const result = run.completeBattle(sim);
    if (!result.ok) throw new Error(result.reason);
    expect(result.settlement).toMatchObject({ outcome: 'win', cardHpLost: 3, defeatDamage: 0, hpBefore: 80, hpAfter: 77 });
    expect(run.hp).toBe(77);
  });

  it('전투 시뮬은 시작 HP를 넘는 지출을 허용하지 않는다 (HP 4 이하에서 사용 한도)', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    damageCommander(run, 77); // HP 3
    const plan = run.battlePlan();
    const sim = new CombatSimulator(
      { seed: 1, formations: [[{ unitId: 'iron_shieldbearer', star: 1, cell: { col: 3, row: 1 } }], plan.formation], cards: { commander: harten, deck: handSnapshot(['abyss_pact']), commanderHp: run.hp } },
      units, traits, runDeps.cards,
    );
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(false);
  });
});

describe('카드 보상', () => {
  it('3장 중 1장을 고르면 덱에 들어가고 맵으로 돌아간다. 두 번 받을 수 없다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    const offer = run.rewardOffer();
    expect(new Set(offer).size).toBe(3);
    const before = deckCards(run.deck).length;
    expect(run.claimReward(5).ok).toBe(false);
    expect(run.claimReward(1)).toEqual({ ok: true });
    expect(deckCards(run.deck)).toHaveLength(before + 1);
    expect(deckCards(run.deck).filter((c) => c.cardId === offer[1]).length).toBeGreaterThanOrEqual(1);
    expect(run.phase).toBe('map');
    expect(run.claimReward(0).ok).toBe(false);
    expect(run.skipReward().ok).toBe(false);
    expect(deckCards(run.deck)).toHaveLength(before + 1);
  });

  it('건너뛰면 덱은 그대로다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    const before = deckCards(run.deck).length;
    expect(run.skipReward().ok).toBe(true);
    expect(deckCards(run.deck)).toHaveLength(before);
    expect(run.phase).toBe('map');
  });

  it('정예 승리 보상은 정예 가중치(희귀 이상 증가)를 쓴다', () => {
    const run = newRun(6);
    driveTo(run, 'elite');
    finishBattle(run, 'win');
    expect(run.session).toMatchObject({ kind: 'reward', source: 'elite' });
  });
});

describe('상점 노드', () => {
  it('카드 3종을 희귀도별 가격으로 진열하고, 구매하면 골드가 줄고 덱에 들어간다', () => {
    const run = newRun(1);
    driveTo(run, 'shop');
    expect(run.phase).toBe('shop');
    const view = run.shopView()!;
    expect(view.cards).toHaveLength(3);
    grantGold(run, 100);
    const gold = run.gold;
    const before = deckCards(run.deck).length;
    expect(run.buyShopCard(0)).toEqual({ ok: true });
    expect(run.gold).toBe(gold - view.cards[0]!.price);
    expect(deckCards(run.deck)).toHaveLength(before + 1);
    expect(run.shopView()!.cards[0]!.sold).toBe(true);
    expect(run.buyShopCard(0).ok).toBe(false); // 이미 구매
    expect(run.buyShopCard(9).ok).toBe(false);
  });

  it('골드가 모자라면 카드를 살 수 없고 아무것도 바뀌지 않는다', () => {
    const run = newRun(1);
    driveTo(run, 'shop');
    spendAllGold(run);
    const before = JSON.stringify(run.serialize());
    expect(run.buyShopCard(0)).toEqual({ ok: false, reason: '카드를 구매할 골드가 부족합니다' });
    expect(JSON.stringify(run.serialize())).toBe(before);
  });

  it('카드 제거: 75G, 제거할 때마다 +25G 누적 (골드 부족 시 거부)', () => {
    const run = newRun(1);
    driveTo(run, 'shop');
    expect(run.shopView()!.removalPrice).toBe(75);
    const id = () => run.shopView()!.removable[0]!.instanceId;
    expect(run.removeCardForGold(id()).ok).toBe(false); // 10G로는 부족
    grantGold(run, 400);
    const start = run.gold;
    expect(run.removeCardForGold(id()).ok).toBe(true);
    expect(run.gold).toBe(start - 75);
    expect(run.shopView()!.removalPrice).toBe(100);
    expect(run.removeCardForGold(id()).ok).toBe(true);
    expect(run.gold).toBe(start - 75 - 100);
    expect(run.shopView()!.removalPrice).toBe(125);
    expect(run.removals).toBe(2);
    expect(deckCards(run.deck)).toHaveLength(8);
    expect(run.removeCardForGold(9999).ok).toBe(false);
  });

  it('제거 횟수는 다음 상점에도 이어진다 (런 내 누적)', () => {
    const run = newRun(1);
    driveTo(run, 'shop');
    grantGold(run, 300);
    run.removeCardForGold(run.shopView()!.removable[0]!.instanceId);
    run.leaveShop();
    let second = false;
    for (let guard = 0; guard < 30 && !second; guard++) {
      try {
        driveTo(run, 'shop');
        second = true;
      } catch {
        break;
      }
    }
    if (second) expect(run.shopView()!.removalPrice).toBe(100);
    else expect(run.removals).toBe(1);
  });

  it('상점 노드에서도 유닛 구매·리롤·잠금이 가능하다 (리롤 1G)', () => {
    const run = newRun(1);
    driveTo(run, 'shop');
    const gold = run.gold;
    expect(run.roster.reroll()).toEqual({ ok: true });
    expect(run.gold).toBe(gold - 1);
    const offer = run.roster.snapshot().offers.findIndex((o) => o !== null && o.cost <= run.gold);
    expect(run.roster.buy(offer).ok).toBe(true);
    expect(run.roster.toggleLock().ok).toBe(true);
    expect(run.leaveShop().ok).toBe(true);
    expect(run.phase).toBe('map');
    expect(run.shopView()).toBeNull();
  });

  it('유닛 상점은 노드에 들어갈 때 무료로 갱신된다 (잠금이면 유지)', () => {
    const run = newRun(1);
    const before = JSON.stringify(run.roster.snapshot().offers);
    driveTo(run, 'shop');
    expect(JSON.stringify(run.roster.snapshot().offers)).not.toBe(before);
  });
});

describe('이벤트 노드', () => {
  it('이벤트 화면: 선택지 가용성을 보여 주고 선택 후 끝내면 맵으로 돌아간다', () => {
    const run = newRun(1);
    driveTo(run, 'event');
    expect(run.phase).toBe('event');
    const view = run.eventView()!;
    expect(runDeps.events.get(view.eventId)).toBeDefined();
    expect(view.chosen).toBeNull();
    expect(view.finished).toBe(false);
    expect(run.finishEvent().ok).toBe(false); // 아직 선택 전
    const index = view.choices.findIndex((c) => c.enabled);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(run.chooseEventOption(index).ok).toBe(true);
    while (run.eventView()?.pending) expect(run.pickEventOption(0).ok).toBe(true);
    expect(run.eventView()!.finished).toBe(true);
    expect(run.chooseEventOption(index).ok).toBe(false);
    expect(run.finishEvent().ok).toBe(true);
    expect(run.phase).toBe('map');
    expect(run.eventView()).toBeNull();
  });

  it('선택 불가 선택지를 고르면 거부하고 상태를 바꾸지 않는다', () => {
    const run = newRun(1);
    driveTo(run, 'event');
    spendAllGold(run);
    const view = run.eventView()!;
    const blocked = view.choices.findIndex((c) => !c.enabled);
    if (blocked < 0) return; // 골드 조건 없는 이벤트면 해당 없음
    const before = JSON.stringify(run.serialize());
    expect(run.chooseEventOption(blocked).ok).toBe(false);
    expect(JSON.stringify(run.serialize())).toBe(before);
  });

  it('한 런에서 같은 이벤트가 되풀이되기 전에 다른 이벤트부터 나온다', () => {
    const run = newRun(1);
    const seen = new Set<string>();
    for (let i = 0; i < 3; i++) {
      try {
        driveTo(run, 'event');
      } catch {
        break;
      }
      const id = run.eventView()!.eventId;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      const view = run.eventView()!;
      run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
      while (run.eventView()?.pending) run.pickEventOption(0);
      run.finishEvent();
    }
    expect(seen.size).toBeGreaterThan(0);
  });
});

describe('야영지 노드 (택1)', () => {
  it('휴식: 최대 HP의 30%(24)를 회복하고 최대치를 넘지 않는다', () => {
    const run = newRun(1);
    driveTo(run, 'camp');
    damageCommander(run, 50); // HP 30
    const view = run.campView()!;
    expect(view).toMatchObject({ healAmount: 24, canHeal: true });
    expect(run.campHeal()).toEqual({ ok: true });
    expect(run.hp).toBe(54);
    expect(run.phase).toBe('map');
    expect(run.campView()).toBeNull();
  });

  it('휴식: HP가 거의 찼으면 부족한 만큼만 회복하고, 가득이면 선택할 수 없다', () => {
    const run = newRun(1);
    driveTo(run, 'camp');
    damageCommander(run, 10);
    expect(run.campView()!.healAmount).toBe(10);
    run.campHeal();
    expect(run.hp).toBe(80);
    const full = newRun(1);
    driveTo(full, 'camp');
    expect(full.campView()!.canHeal).toBe(false);
    expect(full.campHeal()).toEqual({ ok: false, reason: '이미 HP가 가득합니다' });
    expect(full.phase).toBe('camp');
    expect(full.leaveCamp().ok).toBe(true);
  });

  it('단련: 덱 카드 1장을 강화하고 이미 강화된 카드·없는 카드는 고를 수 없다', () => {
    const run = newRun(1);
    driveTo(run, 'camp');
    const target = run.campView()!.upgradable[0]!;
    expect(run.campUpgrade(9999).ok).toBe(false);
    expect(run.campUpgrade(target.instanceId)).toEqual({ ok: true });
    expect(deckCards(run.deck).find((c) => c.instanceId === target.instanceId)?.upgraded).toBe(true);
    expect(run.phase).toBe('map'); // 택1: 하나를 고르면 끝
  });

  it('승급: 골드를 내고 유닛 1기를 한 성급 올린다 (풀 재고 사용), 골드가 모자라면 불가', () => {
    const run = newRun(1);
    driveTo(run, 'camp');
    const view = run.campView()!;
    const promo = view.promotions[0]!;
    expect(promo).toMatchObject({ star: 1, quote: { extraCopies: 2, cost: 6 } });
    const poolBefore = run.roster.snapshot().pool.iron_shieldbearer as number;
    const gold = run.gold;
    expect(run.campPromote(promo.id)).toEqual({ ok: true });
    expect(run.gold).toBe(gold - 6);
    const snap = run.roster.snapshot();
    expect(snap.board.find((u) => u.id === promo.id)?.star).toBe(2);
    expect(snap.pool.iron_shieldbearer).toBe(poolBefore - 2);
    expect(run.phase).toBe('map');

    const poor = newRun(1);
    driveTo(poor, 'camp');
    spendAllGold(poor);
    const poorView = poor.campView()!;
    expect(poorView.promotions.every((p) => !p.available)).toBe(true);
    expect(poor.campPromote(poorView.promotions[0]!.id).ok).toBe(false);
    expect(poor.phase).toBe('camp');
  });

  it('야영지 외 단계에서는 야영지 행동을 거부한다', () => {
    const run = newRun(1);
    expect(run.campHeal().ok).toBe(false);
    expect(run.campUpgrade(1).ok).toBe(false);
    expect(run.campPromote(1).ok).toBe(false);
    expect(run.leaveCamp().ok).toBe(false);
    expect(RUN.CAMP.HEAL_PCT).toBe(30);
  });
});

describe('정산 바인딩', () => {
  /** 현재 전투를 끝낸 시뮬을 돌려준다 (정산 전) */
  const finished = (run: RunController, result: 'win' | 'loss' | 'draw'): CombatSimulator => {
    const sim = run.createSimulator();
    run.beginBattle();
    forceResult(sim, result);
    return sim;
  };
  const snapshot = (run: RunController) => ({ hp: run.hp, gold: run.gold, history: run.history.length, phase: run.phase, tries: run.session });

  it('보스 패배 sim을 재도전 준비 단계에서 다시 내도 HP·골드·기록이 바뀌지 않는다', () => {
    const run = newRun(6);
    driveTo(run, 'boss');
    const sim = finished(run, 'loss');
    expect(run.completeBattle(sim).ok).toBe(true);
    expect(run.phase).toBe('battlePrep');
    const before = snapshot(run);
    const again = run.completeBattle(sim);
    expect(again).toEqual({ ok: false, reason: '이미 정산한 전투입니다' });
    expect(snapshot(run)).toEqual(before);
  });

  it('같은 sim을 3번 내도 HP는 한 번만 줄어든다', () => {
    const run = newRun(6);
    driveTo(run, 'boss');
    const sim = finished(run, 'loss');
    const hp = run.hp;
    const records = run.history.length;
    expect(run.completeBattle(sim).ok).toBe(true);
    const afterFirst = run.hp;
    expect(afterFirst).toBeLessThan(hp);
    expect(run.completeBattle(sim).ok).toBe(false);
    expect(run.completeBattle(sim).ok).toBe(false);
    expect(run.hp).toBe(afterFirst);
    expect(run.history).toHaveLength(records + 1);
  });

  it('다른 노드·이전 시도·다른 컨트롤러·복원 이전에 만든 sim은 거부한다', () => {
    // 이전 노드(1층)에서 끝난 sim을 다른 전투 노드에서 제출
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const firstNodeSim = finished(run, 'win');
    const early = newRun(2);
    early.chooseNode(early.availableNodes()[0]!.id);
    const early1 = finished(early, 'win');
    expect(early.completeBattle(early1).ok).toBe(true);
    driveTo(early, 'boss');
    const beforeBoss = snapshot(early);
    expect(early.completeBattle(early1).ok).toBe(false);
    expect(snapshot(early)).toEqual(beforeBoss);

    // 같은 노드의 이전 시도 sim
    const boss = newRun(6);
    driveTo(boss, 'boss');
    const firstTry = boss.createSimulator();
    boss.beginBattle();
    forceResult(firstTry, 'loss');
    expect(boss.completeBattle(firstTry).ok).toBe(true);
    const secondTry = boss.createSimulator();
    boss.beginBattle();
    forceResult(secondTry, 'loss');
    const bossBefore = snapshot(boss);
    const staleResult = boss.completeBattle(firstTry);
    expect(staleResult.ok).toBe(false);
    expect(snapshot(boss)).toEqual(bossBefore);
    expect(boss.completeBattle(secondTry).ok).toBe(true);

    // 다른 컨트롤러가 만든 sim
    const other = newRun(2);
    other.chooseNode(other.availableNodes()[0]!.id);
    const foreign = finished(other, 'win');
    const mine = newRun(2);
    mine.chooseNode(mine.availableNodes()[0]!.id);
    mine.beginBattle();
    const mineBefore = snapshot(mine);
    const foreignResult = mine.completeBattle(foreign);
    expect(foreignResult.ok).toBe(false);
    if (!foreignResult.ok) expect(foreignResult.reason).toContain('발급한 전투가 아닙니다');
    expect(snapshot(mine)).toEqual(mineBefore);

    // 복원 이전에 만든 sim
    const restored = RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
    restored.beginBattle();
    const restoredBefore = snapshot(restored);
    expect(restored.completeBattle(firstNodeSim).ok).toBe(false);
    expect(snapshot(restored)).toEqual(restoredBefore);
  });

  it('같은 노드·시도에서 만든 sim이 여럿이어도 하나로 정산하면 나머지는 거부된다', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const a = run.createSimulator();
    const b = run.createSimulator();
    run.beginBattle();
    forceResult(a, 'win');
    forceResult(b, 'win');
    expect(run.completeBattle(a).ok).toBe(true);
    const before = snapshot(run);
    expect(run.completeBattle(b).ok).toBe(false);
    expect(snapshot(run)).toEqual(before);

    // 보스 재도전: 같은 시도의 형제 sim은 시도 횟수가 달라져 거부된다
    const boss = newRun(6);
    driveTo(boss, 'boss');
    const c = boss.createSimulator();
    const d = boss.createSimulator();
    boss.beginBattle();
    forceResult(c, 'loss');
    forceResult(d, 'loss');
    expect(boss.completeBattle(c).ok).toBe(true);
    const bossBefore = snapshot(boss);
    expect(boss.completeBattle(d).ok).toBe(false);
    expect(snapshot(boss)).toEqual(bossBefore);
  });
});
