import { describe, expect, it } from 'vitest';
import { deckCards } from '../cards';
import { ULTIMATE } from '../combat';
import {
  CARD_A, commanders, cpEvents, eventsOf, fillUltimateGauge, harten, makeCardSim, relicCatalog, relicEffects, unitOf,
} from '../combat/testSupport';
import type { DeckSnapshot } from '../cards';
import { RUN } from './constants';
import { RelicInventory } from './relicInventory';
import { RelicRewardGenerator } from './relicRewards';
import { Rng } from '../rng';
import { RunController } from './runController';
import {
  damageCommander, driveTo, finishBattle, forceEvent, grantGold, grantRelic, newRun, newRunAs, runDeps, spendAllGold,
} from './testSupport';

/** 효과 테스트를 마친 유물. 마지막 테스트가 유물 20개 전부가 여기 들어 있는지 확인한다 */
const covered = new Set<string>();
const covers = (...ids: string[]): void => ids.forEach((id) => covered.add(id));

const jsonOf = (run: RunController): string => JSON.stringify(run.serialize());
const roundtrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));

describe('유물 데이터', () => {
  it('유물 20개: 일반 9 / 희귀 8 / 보스 3, id 중복 없음', () => {
    const relics = relicCatalog.relics;
    expect(relics).toHaveLength(20);
    expect(new Set(relics.map((r) => r.id)).size).toBe(20);
    expect([relicCatalog.ofRarity('common').length, relicCatalog.ofRarity('rare').length, relicCatalog.ofRarity('boss').length]).toEqual([9, 8, 3]);
  });

  it('DESIGN 8-1의 6개가 들어 있다', () => {
    const names = relicCatalog.relics.map((r) => r.name);
    for (const name of ['낡은 지휘봉', '상인의 저울', '전령의 가방', '피의 맹세', '쌍둥이 거울', '다섯 번째 깃발']) expect(names).toContain(name);
  });
});

describe('RelicInventory', () => {
  it('같은 유물을 두 번 얻을 수 없고 없는 유물은 거부한다', () => {
    const inv = new RelicInventory(relicCatalog);
    inv.add('old_baton');
    expect(() => inv.add('old_baton')).toThrow(/이미 가진 유물/);
    expect(() => inv.add('ghost')).toThrow(/알 수 없는 유물/);
    expect(inv.ids).toEqual(['old_baton']);
  });
});

describe('전투 유물', () => {
  it('낡은 지휘봉 / 균열의 심장: 전투 시작 CP +1 / +2', () => {
    covers('old_baton', 'rift_heart');
    const cp = (...ids: string[]): number => {
      const sim = makeCardSim({ commander: harten, relics: relicEffects(...ids) });
      sim.startCombat();
      return sim.commandPoints?.combat ?? 0;
    };
    expect(cp()).toBe(2);
    expect(cp('old_baton')).toBe(3);
    expect(cp('rift_heart')).toBe(4);
    expect(cp('old_baton', 'rift_heart')).toBe(5);
  });

  it('철벽의 인장: 전열 아군에게 최대 HP 8% 보호막 / 군단장의 인장: 아군 전체 15%', () => {
    covers('bulwark_crest', 'legion_seal');
    const shields = (id: string) => {
      const sim = makeCardSim({ commander: null, relics: relicEffects(id) });
      return eventsOf(sim, 'shield').map((e) => [e.unit, e.amount, e.duration]);
    };
    const maxHp = (uid: number) => unitOf(makeCardSim({ commander: null }), uid).maxHp;
    // CARD_A: 방패병(3,1), 방패병(3,3), 투기장 신병(2,2) — 열 3이 전열
    expect(shields('bulwark_crest')).toEqual([[0, Math.round(maxHp(0) * 0.08), 'combat'], [1, Math.round(maxHp(1) * 0.08), 'combat']]);
    expect(shields('legion_seal')).toEqual(CARD_A.map((_, i) => [i, Math.round(maxHp(i) * 0.15), 'combat']));
  });

  it('잿불 부적: 주문 카드 피해 +20% (지휘관 패시브와 합산)', () => {
    covers('ember_charm');
    const burn = (commander: typeof harten | null, ...ids: string[]): number => {
      const sim = makeCardSim({ commander, hand: ['ember_arrow'], relics: relicEffects(...ids), a: [['iron_shieldbearer', 1, 3, 2]], b: [['arena_recruit', 1, 4, 2]] });
      sim.startCombat();
      sim.playCard(1, { kind: 'unit', uid: 1 });
      return eventsOf(sim, 'statusApplied').find((e) => e.status === 'burn')?.value ?? 0;
    };
    expect(burn(null)).toBe(20);
    expect(burn(null, 'ember_charm')).toBe(24);
    expect(burn(commanders.get('cmd_isera') ?? null, 'ember_charm')).toBe(29); // 20 × 1.45
  });

  it('피의 장부: 지휘관 HP를 잃는 카드의 소모량 -1', () => {
    covers('blood_ledger');
    const lost = (card: string, ...ids: string[]): number => {
      const sim = makeCardSim({ commander: commanders.get('cmd_nox') ?? null, hand: [card], commanderHp: 30, relics: relicEffects(...ids) });
      sim.startCombat();
      const result = sim.playCard(1, card === 'blood_price' ? { kind: 'unit', uid: 0 } : { kind: 'none' });
      expect(result.ok).toBe(true);
      return sim.commanderHpSpent;
    };
    expect(lost('blood_price')).toBe(2);
    expect(lost('blood_price', 'blood_ledger')).toBe(1);
    expect(lost('abyss_pact', 'blood_ledger')).toBe(2);
  });

  it('전리품 사슬: 아군이 적을 처치하면 처치한 유닛의 마나 +15', () => {
    covers('trophy_chain');
    const sim = makeCardSim({ commander: harten, relics: relicEffects('trophy_chain'), b: [['arena_recruit', 1, 4, 2], ['legion_crossbow', 1, 6, 2]] });
    sim.startCombat();
    const killer = unitOf(sim, 0);
    expect(killer.mana).toBe(0);
    sim.world.dealDamage({ source: killer, target: unitOf(sim, 3), raw: 1e9, type: 'magic' });
    expect(killer.mana).toBe(15);
  });

  it('피의 맹세: 아군 유닛이 쓰러지면 CP +1 (전투당 최대 3)', () => {
    covers('blood_oath');
    const five = Array.from({ length: 5 }, (_, i) => ['iron_shieldbearer', 1, 3, i] as const);
    const sim = makeCardSim({ commander: harten, a: five, relics: relicEffects('blood_oath') });
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(2);
    for (let uid = 0; uid < 4; uid++) sim.world.dealDamage({ source: null, target: unitOf(sim, uid), raw: 1e9, type: 'magic' });
    const gains = cpEvents(sim).filter((e) => e.reason === 'effect');
    expect(gains.map((e) => e.delta)).toEqual([1, 1, 1]);
    expect(sim.commandPoints?.combat).toBe(5);
  });

  it('다섯 번째 깃발: 같은 특성 유닛 5기 이상이면 단계 +1', () => {
    covers('fifth_banner');
    const five = Array.from({ length: 5 }, (_, i) => ['iron_shieldbearer', 1, 3, i] as const);
    const tier = (...ids: string[]): number | undefined => {
      const sim = makeCardSim({ commander: harten, a: five, relics: relicEffects(...ids) });
      return sim.activeTraits[0].find((t) => t.traitId === 'guardian')?.tier;
    };
    expect(tier()).toBe(0); // 같은 유닛 5기는 종류 1로 센다
    expect(tier('fifth_banner')).toBe(1);
    const four = five.slice(0, 4);
    const sim = makeCardSim({ commander: harten, a: four, relics: relicEffects('fifth_banner') });
    expect(sim.activeTraits[0].find((t) => t.traitId === 'guardian')?.tier).toBe(0); // 4기는 모자란다
  });

  it('전쟁의 기록부: 궁극기 게이지 충전량 +50%', () => {
    covers('war_record');
    const charge = (...ids: string[]): number => {
      const sim = makeCardSim({ commander: harten, hand: ['hold_the_line'], relics: relicEffects(...ids) });
      sim.startCombat();
      sim.playCard(1, { kind: 'unit', uid: 0 });
      return sim.ultimate?.charge ?? 0;
    };
    expect(charge()).toBe(ULTIMATE.CARD_CHARGE);
    expect(charge('war_record')).toBe(Math.round(ULTIMATE.CARD_CHARGE * 1.5));
    const sim = makeCardSim({ commander: harten, relics: relicEffects('war_record') });
    sim.startCombat();
    fillUltimateGauge(sim);
    expect(sim.ultimate?.charge).toBe(ULTIMATE.GAUGE_MAX);
  });

  it('전령의 가방: 손패 상한 +1 (전투 시뮬이 새 상한을 쓴다)', () => {
    covers('heralds_bag');
    const full = (extra: boolean): number => {
      const hand = Array.from({ length: 10 }, (_, i) => ({ instanceId: i + 1, cardId: 'war_drums', upgraded: false }));
      const deck: DeckSnapshot = { nextInstanceId: 12, draw: [{ instanceId: 11, cardId: 'war_drums', upgraded: false }], hand, discard: [], exhaust: [], rngState: 1 };
      const sim = makeCardSim({ commander: harten, deck, relics: extra ? relicEffects('heralds_bag') : [] });
      sim.deck?.draw(1);
      return sim.deck?.hand.length ?? 0;
    };
    expect(full(false)).toBe(10);
    expect(full(true)).toBe(11);
  });
});

describe('런 경제·덱·맵 유물', () => {
  it('전령의 가방: 전투 준비 때 카드 1장 더 뽑기', () => {
    covers('heralds_bag');
    const run = newRun(1);
    grantRelic(run, 'heralds_bag');
    run.chooseNode(run.availableNodes()[0]!.id);
    const sim = run.createSimulator();
    expect(sim.deck?.hand).toHaveLength(RUN_HAND + 1);
  });

  it('상인의 저울: 노드마다 첫 리롤이 무료', () => {
    covers('merchants_scale');
    const run = newRun(2);
    grantRelic(run, 'merchants_scale');
    run.chooseNode(run.availableNodes()[0]!.id);
    const gold = run.gold;
    expect(run.roster.reroll()).toEqual({ ok: true });
    expect(run.gold).toBe(gold); // 무료
    expect(run.roster.reroll()).toEqual({ ok: true });
    expect(run.gold).toBe(gold - 1); // 두 번째부터 1G
    // 다음 노드에서 다시 무료
    finishBattle(run, 'win');
    run.skipReward();
    run.chooseNode(run.availableNodes()[0]!.id);
    if (run.phase === 'battlePrep') {
      const before = run.gold;
      run.roster.reroll();
      expect(run.gold).toBe(before);
    }
  });

  it('상인의 저울 없이는 첫 리롤도 1G', () => {
    const run = newRun(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    const gold = run.gold;
    run.roster.reroll();
    expect(run.gold).toBe(gold - 1);
  });

  it('쌍둥이 거울: 같은 유닛 2기가 2성으로 합쳐지고 런당 1회만 쓴다 (풀은 원본 3개 몫)', () => {
    covers('twin_mirror');
    const run = newRun(1); // 하르텐: 방패병 2기
    const poolBefore = run.roster.snapshot().pool['iron_shieldbearer']!;
    grantRelic(run, 'twin_mirror');
    const after = run.roster.snapshot();
    expect(after.board.map((u) => [u.unitId, u.star])).toEqual([['iron_shieldbearer', 2]]);
    expect(after.pool['iron_shieldbearer']).toBe(poolBefore - 1);
    // 판매하면 원본 3개를 돌려준다: 풀이 처음 시작(시작 유닛 2기를 가져가기 전)보다 늘지 않는다
    expect(after.pool['iron_shieldbearer']! + 3).toBe(poolBefore + 2);
    expect(run.serialize().relics.mirrorUsed).toBe(1);
    // 한 번 쓴 뒤에는 같은 유닛 2기가 모여도 합치지 않는다
    run.roster.snapshot();
    expect(run.serialize().relics).toMatchObject({ owned: ['twin_mirror'], mirrorUsed: 1 });
  });

  it('쌍둥이 거울은 구매로 두 번째 복사본이 들어올 때 자동으로 합친다', () => {
    const run = newRunAs('cmd_nox', 1); // 그림자 단검 2기 → 얻는 즉시 합성되므로, 먼저 한 기를 팔아 1기로 만든다
    const [first, second] = run.roster.snapshot().board;
    expect(run.roster.snapshot().board).toHaveLength(2);
    run.chooseNode(run.availableNodes()[0]!.id);
    run.roster.sell(second!.id);
    grantRelic(run, 'twin_mirror');
    expect(run.roster.snapshot().board).toHaveLength(1);
    expect(run.roster.snapshot().board[0]).toMatchObject({ id: first!.id, star: 1 });
  });

  it('전리품 자루: 전투 승리 골드 +2 (영수증에 bonus로 남는다)', () => {
    covers('loot_sack');
    const run = newRun(3);
    grantRelic(run, 'loot_sack');
    run.chooseNode(run.availableNodes()[0]!.id);
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.reward).toMatchObject({ base: 5, bonus: 2 });
    if (settle.ok) expect(settle.settlement.reward.total).toBe(5 + settle.settlement.reward.interest + 2);
    // 패배에는 붙지 않는다
    const loss = newRun(3);
    grantRelic(loss, 'loot_sack');
    loss.chooseNode(loss.availableNodes()[0]!.id);
    const lost = finishBattle(loss, 'loss');
    expect(lost.ok && lost.settlement.reward.bonus).toBeUndefined();
  });

  it('두둑한 전대: 이자 상한 +2G', () => {
    covers('fat_purse');
    const interest = (relic: boolean): number => {
      const run = newRun(4);
      if (relic) grantRelic(run, 'fat_purse');
      grantGold(run, 70); // 80G → 이자 8 (상한 적용 전)
      run.chooseNode(run.availableNodes()[0]!.id);
      const settle = finishBattle(run, 'win');
      return settle.ok ? settle.settlement.reward.interest : -1;
    };
    expect(interest(false)).toBe(3);
    expect(interest(true)).toBe(5);
    const run = newRun(4);
    grantRelic(run, 'fat_purse');
    grantGold(run, 70);
    expect(run.economyView.nextInterest).toBe(5);
  });

  it('도매 증서: 상점 카드·카드 제거 가격 -25% (올림)', () => {
    covers('wholesale_voucher');
    const plain = newRun(5);
    driveTo(plain, 'shop');
    const base = plain.shopView()!;
    const run = newRun(5);
    grantRelic(run, 'wholesale_voucher');
    driveTo(run, 'shop');
    const view = run.shopView()!;
    expect(view.removalPrice).toBe(57); // ceil(75 × 0.75)
    view.cards.forEach((slot, i) => expect(slot.price).toBe(Math.ceil((base.cards[i]!.price * 75) / 100)));
    // 구매는 할인가로 차감된다
    grantGold(run, 100);
    const gold = run.gold;
    run.buyShopCard(0);
    expect(run.gold).toBe(gold - view.cards[0]!.price);
    const removeGold = run.gold;
    run.removeCardForGold(view.removable[0]!.instanceId);
    expect(run.gold).toBe(removeGold - 57);
  });

  it('야전 천막: 야영지 휴식 회복량이 최대 HP의 30% → 50%', () => {
    covers('field_tent');
    const heal = (relic: boolean): number => {
      const run = newRun(6);
      if (relic) grantRelic(run, 'field_tent');
      damageCommander(run, 60);
      driveTo(run, 'camp');
      return run.campView()!.healAmount;
    };
    expect(heal(false)).toBe(24);
    expect(heal(true)).toBe(40);
  });

  it('강철 심장: 획득 즉시 최대 HP +20 (같은 양 회복), 전투 승리 시 HP +2', () => {
    covers('iron_heart');
    const run = newRun(7);
    damageCommander(run, 30);
    expect([run.hp, run.maxHp]).toEqual([50, 80]);
    grantRelic(run, 'iron_heart');
    expect([run.hp, run.maxHp]).toEqual([70, 100]);
    run.chooseNode(run.availableNodes()[0]!.id);
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.healed).toBe(2);
    expect(run.hp).toBe(72);
    expect(roundtrip(run).maxHp).toBe(100); // 저장·복원 일관성 검사를 통과한다
  });

  it('숙련자의 교본: 획득 즉시 덱 카드 2장 강화', () => {
    covers('veteran_manual');
    const run = newRun(8);
    const upgradedBefore = deckCards(run.deck).filter((c) => c.upgraded).length;
    grantRelic(run, 'veteran_manual');
    expect(deckCards(run.deck).filter((c) => c.upgraded).length).toBe(upgradedBefore + 2);
  });

  it('전술가의 일지: 카드 보상 선택지 +1장', () => {
    covers('tacticians_journal');
    const run = newRun(9);
    grantRelic(run, 'tacticians_journal');
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    expect(run.rewardOffer()).toHaveLength(RUN.REWARD.CHOICES + 1);
  });
});

const RUN_HAND = 5;

describe('유물 획득 경로', () => {
  it('정예 승리: 유물 1개가 카드 보상과 함께 제시되고 claimRelic으로 받는다 (두 번 받아도 한 개)', () => {
    const run = newRun(1);
    driveTo(run, 'elite');
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.relicOffer).not.toBeNull();
    const session = run.session;
    expect(session?.kind === 'reward' && session.relic).toBeTruthy();
    const relicId = (session as { relic: string }).relic;
    expect(run.relics).toHaveLength(0);
    expect(run.claimRelic()).toEqual({ ok: true });
    expect(run.claimRelic()).toEqual({ ok: true });
    expect(run.relics.map((r) => r.id)).toEqual([relicId]);
    expect(run.relics[0]!.rarity).not.toBe('boss');
    expect(run.claimReward(0)).toEqual({ ok: true });
  });

  it('일반 전투 승리에는 유물이 없고 claimRelic은 거부된다', () => {
    const run = newRun(1);
    run.chooseNode(run.availableNodes()[0]!.id);
    const settle = finishBattle(run, 'win');
    expect(settle.ok && settle.settlement.relicOffer).toBeNull();
    expect(run.claimRelic()).toMatchObject({ ok: false });
    expect(run.relics).toHaveLength(0);
  });

  it('정예에서 지면 유물이 없다', () => {
    const run = newRun(1);
    driveTo(run, 'elite');
    const settle = finishBattle(run, 'loss');
    expect(settle.ok && settle.settlement.relicOffer).toBeNull();
  });

  it('같은 시드는 같은 유물 보상·상점 진열을 만든다', () => {
    const offer = (): string => {
      const run = newRun(11);
      driveTo(run, 'elite');
      finishBattle(run, 'win');
      return JSON.stringify(run.session);
    };
    expect(offer()).toBe(offer());
    const shop = (): string => {
      const run = newRun(11);
      driveTo(run, 'shop');
      return JSON.stringify(run.shopView()!.relics);
    };
    expect(shop()).toBe(shop());
    expect(JSON.parse(shop())).toHaveLength(RUN.RELIC.SHOP_SLOTS);
  });

  it('상점: 유물 2개가 가격과 함께 진열되고 구매하면 골드가 빠지며 이미 산 유물은 다시 못 산다', () => {
    const run = newRun(5);
    driveTo(run, 'shop');
    const view = run.shopView()!;
    expect(view.relics).toHaveLength(2);
    for (const slot of view.relics) {
      const rarity = relicCatalog.get(slot.relicId)!.rarity;
      expect(['common', 'rare']).toContain(rarity);
      expect(slot.price).toBe(RUN.RELIC.PRICES[rarity as 'common' | 'rare']);
    }
    spendAllGold(run);
    expect(run.buyShopRelic(0)).toMatchObject({ ok: false, reason: expect.stringContaining('골드가 부족') });
    grantGold(run, 100);
    const gold = run.gold;
    const first = view.relics[0]!;
    expect(run.buyShopRelic(0)).toEqual({ ok: true });
    expect(run.gold).toBe(gold - first.price);
    expect(run.relics.map((r) => r.id)).toEqual([first.relicId]);
    expect(run.shopView()!.relics[0]!.sold).toBe(true);
    expect(run.buyShopRelic(0)).toMatchObject({ ok: false, reason: '이미 구매한 유물입니다' });
    expect(run.buyShopRelic(9)).toMatchObject({ ok: false });
    expect(run.relics).toHaveLength(1);
  });

  it('이벤트: 대장간·균열 제단의 유물 선택지가 HP를 대가로 유물을 준다', () => {
    const fresh = newRun(1);
    driveTo(fresh, 'event');
    forceEvent(fresh, 'gate_smith');
    const view = fresh.eventView()!;
    const index = view.choices.findIndex((c) => c.grantsRelic);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(view.choices[index]!.enabled).toBe(true);
    const hp = fresh.hp;
    expect(fresh.chooseEventOption(index)).toEqual({ ok: true });
    expect(fresh.hp).toBe(hp - 6);
    expect(fresh.relics).toHaveLength(1);
    expect(fresh.relics[0]!.rarity).toBe('common');
    expect(fresh.eventView()!.messages.at(-1)).toBe(`유물 획득: ${fresh.relics[0]!.name}`);
    expect(fresh.finishEvent()).toEqual({ ok: true });

    const altar = newRun(2);
    driveTo(altar, 'event');
    forceEvent(altar, 'rift_altar');
    const choice = altar.eventView()!.choices.findIndex((c) => c.grantsRelic);
    expect(altar.chooseEventOption(choice)).toEqual({ ok: true });
    expect(altar.relics[0]!.rarity).toBe('rare');
  });

  it('유물 보상이 바닥나면 이벤트 선택지는 선택 불가, 정예·상점은 줄 유물이 없다', () => {
    const run = newRun(1);
    for (const relic of relicCatalog.relics.filter((r) => r.rarity === 'common')) grantRelic(run, relic.id);
    driveTo(run, 'event');
    forceEvent(run, 'gate_smith');
    const choice = run.eventView()!.choices.find((c) => c.grantsRelic)!;
    expect(choice.enabled).toBe(false);
    expect(choice.reason).toBe('더 받을 수 있는 유물이 없습니다');

    const generator = new RelicRewardGenerator(relicCatalog);
    const all = relicCatalog.relics.filter((r) => r.rarity !== 'boss').map((r) => r.id);
    expect(generator.offerElite(all, new Rng(1))).toBeNull();
    expect(generator.stock(all, new Rng(1))).toEqual([]);
    expect(generator.stock(all.slice(1), new Rng(1)).map((s) => s.relicId)).toEqual([all[0]]);
  });

  it('상점·정예 후보는 이미 가진 유물을 제외한다 (중복 획득 금지)', () => {
    const generator = new RelicRewardGenerator(relicCatalog);
    const nonBoss = relicCatalog.relics.filter((r) => r.rarity !== 'boss').map((r) => r.id);
    for (let seed = 1; seed <= 30; seed++) {
      const owned = nonBoss.slice(0, seed % nonBoss.length);
      const elite = generator.offerElite(owned, new Rng(seed));
      expect(elite === null || !owned.includes(elite)).toBe(true);
      for (const slot of generator.stock(owned, new Rng(seed))) expect(owned).not.toContain(slot.relicId);
    }
  });

  it('보스 처치: 보스 유물 후보 3개를 결정적으로 제시한다 (준비만 해 둠, 사망이면 없음)', () => {
    const run = newRun(12);
    expect(run.bossRelicOffer()).toEqual([]); // 진행 중
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.outcome).toBe('victory');
    const offer = run.bossRelicOffer();
    expect(offer).toHaveLength(3);
    expect(offer.every((id) => relicCatalog.get(id)?.rarity === 'boss')).toBe(true);
    expect(new Set(offer).size).toBe(3);
    const again = newRun(12);
    driveTo(again, 'boss');
    finishBattle(again, 'win');
    expect(again.bossRelicOffer()).toEqual(offer);
  });
});

describe('저장 v2와 v1 마이그레이션', () => {
  it('유물·무료 리롤·거울 사용량이 저장·복원 왕복 후 완전히 같다', () => {
    const run = newRun(3);
    grantRelic(run, 'twin_mirror');
    grantRelic(run, 'merchants_scale');
    grantRelic(run, 'iron_heart');
    run.chooseNode(run.availableNodes()[0]!.id);
    run.roster.reroll(); // 무료 리롤 사용량 1
    const save = run.serialize();
    expect(save.version).toBe(2);
    expect(save.relics).toEqual({ owned: ['twin_mirror', 'merchants_scale', 'iron_heart'], mirrorUsed: 1, freeRerollsUsed: 1 });
    const restored = roundtrip(run);
    expect(jsonOf(restored)).toBe(jsonOf(run));
    expect(restored.relics.map((r) => r.id)).toEqual(['twin_mirror', 'merchants_scale', 'iron_heart']);
    // 복원 후에도 효과가 유지된다: 무료 리롤은 이미 썼으므로 1G
    const gold = restored.gold;
    restored.roster.reroll();
    expect(restored.gold).toBe(gold - 1);
  });

  it('정예 보상·상점 세션(유물 포함)도 왕복한다', () => {
    const elite = newRun(1);
    driveTo(elite, 'elite');
    finishBattle(elite, 'win');
    expect(jsonOf(roundtrip(elite))).toBe(jsonOf(elite));
    elite.claimRelic();
    expect(jsonOf(roundtrip(elite))).toBe(jsonOf(elite));
    const shop = newRun(5);
    driveTo(shop, 'shop');
    grantGold(shop, 100);
    shop.buyShopRelic(0);
    expect(jsonOf(roundtrip(shop))).toBe(jsonOf(shop));
  });

  it('v1 저장본(M4 시절 실제 저장 파일)은 하르텐·유물 없음으로 읽히고 v2로 다시 저장된다', async () => {
    const fixture = (await import('./runSaveV1.fixture.json')).default as unknown as { shop: Record<string, unknown>; reward: Record<string, unknown> };
    for (const v1 of [fixture.shop, fixture.reward]) {
      expect(v1.version).toBe(1);
      expect(v1).not.toHaveProperty('relics');
      const run = RunController.restore(runDeps, v1);
      expect(run.commander.id).toBe('cmd_harten');
      expect(run.relics).toEqual([]);
      const save = run.serialize();
      expect(save.version).toBe(2);
      expect(save.relics).toEqual({ owned: [], mirrorUsed: 0, freeRerollsUsed: 0 });
      expect(jsonOf(roundtrip(run))).toBe(jsonOf(run));
    }
    const shopRun = RunController.restore(runDeps, fixture.shop);
    expect(shopRun.phase).toBe('shop');
    expect(shopRun.shopView()!.relics).toEqual([]); // v1 상점에는 유물 진열이 없다
    const rewardRun = RunController.restore(runDeps, fixture.reward);
    expect(rewardRun.phase).toBe('reward');
    expect(rewardRun.claimRelic()).toMatchObject({ ok: false }); // v1 보상에는 유물이 없다
    expect(rewardRun.claimReward(0)).toEqual({ ok: true });
  });

  it('v1 저장본에 v2 필드(relics)가 섞여 있으면 거부한다', () => {
    const save = JSON.parse(jsonOf(newRun(1)));
    save.version = 1;
    expect(() => RunController.restore(runDeps, save)).toThrow(/run\.relics: 알 수 없는 필드/);
  });

  it('잘못된 유물 저장 데이터는 경로가 담긴 한국어 오류로 거부한다', () => {
    const base = () => JSON.parse(jsonOf(newRun(1)));
    const bad = (edit: (s: ReturnType<typeof base>) => void) => () => {
      const s = base();
      edit(s);
      RunController.restore(runDeps, s);
    };
    expect(bad((s) => { s.relics.owned = ['ghost']; })).toThrow(/run\.relics\.owned\[0\]: relics\.json에 없는 유물/);
    expect(bad((s) => { s.relics.owned = ['old_baton', 'old_baton']; })).toThrow(/run\.relics\.owned\[1\]: 중복된 유물/);
    expect(bad((s) => { s.relics.mirrorUsed = 1; })).toThrow(/run\.relics\.mirrorUsed/);
    expect(bad((s) => { s.relics.owned = ['iron_heart']; })).toThrow(/run\.health\.maxHp: 지휘관 기본 최대 HP와 보유 유물에서 계산한 100여야 함/);
    expect(bad((s) => { delete s.relics; })).toThrow(/run\.relics: 필수 필드 누락/);
  });
});

describe('유물 20개 전부 효과 테스트가 있다', () => {
  it('relics.json의 모든 유물 id가 위 테스트에서 다뤄졌다', () => {
    expect([...covered].sort()).toEqual(relicCatalog.relics.map((r) => r.id).sort());
  });
});
