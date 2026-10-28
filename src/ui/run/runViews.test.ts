import { describe, expect, it } from 'vitest';
import { grantGold, damageCommander, driveTo, finishBattle, newRun, runDeps } from '../../core/run/testSupport';
import {
  buildCampView, buildCardView, buildEncounterPreview, buildEndView, buildEventView, buildHud, buildMapView, buildRewardView,
  buildSettlementView, buildShopView,
} from './runViews';

const { cards, units } = runDeps;

describe('맵 표시 정보', () => {
  it('시작 직후에는 1층만 선택 가능하고 나머지는 잠겨 있다', () => {
    const run = newRun(1);
    const view = buildMapView(run);
    expect(view.floors).toHaveLength(13);
    expect(view.floors[0]!.every((n) => n.state === 'available')).toBe(true);
    expect(view.floors.slice(1).flat().every((n) => n.state === 'locked')).toBe(true);
    expect(view.currentId).toBeNull();
    expect(view.edges.every((e) => e.state === 'idle')).toBe(true);
    expect(view.floors.flat().filter((n) => n.previewable).every((n) => ['combat', 'elite', 'boss'].includes(n.type))).toBe(true);
    expect(view.floors[12]![0]).toMatchObject({ type: 'boss', label: '보스' });
  });

  it('방문 경로·현재 위치·선택 가능 노드·지나온 간선을 구분한다', () => {
    const run = newRun(2);
    const firstId = run.availableNodes()[0]!.id;
    run.chooseNode(firstId);
    finishBattle(run, 'win');
    run.skipReward();
    const view = buildMapView(run);
    const nodes = view.floors.flat();
    expect(nodes.find((n) => n.id === firstId)!.state).toBe('current');
    const next = run.availableNodes().map((n) => n.id);
    expect(view.availableIds).toEqual(next);
    for (const id of next) expect(nodes.find((n) => n.id === id)!.state).toBe('available');
    expect(view.edges.filter((e) => e.state === 'available').every((e) => e.from === firstId)).toBe(true);
    expect(view.edges.filter((e) => e.state === 'available').map((e) => e.to).sort()).toEqual([...next].sort());
    // 두 번째 노드로 이동하면 첫 노드는 방문함, 둘 사이 간선은 지나온 길
    const secondId = next[0]!;
    driveTo(run, run.map.node(secondId)!.type); // 이미 선택 가능한 노드로 이동 (같은 종류까지 진행)
    const after = buildMapView(run);
    expect(after.floors.flat().find((n) => n.id === firstId)!.state).toBe('visited');
    expect(after.edges.some((e) => e.state === 'walked' && e.from === firstId)).toBe(true);
  });
});

describe('적 편성 미리보기', () => {
  it('보정 후 HP/ATK·등급·성급이 core의 계획과 같다', () => {
    const run = newRun(3);
    const node = run.availableNodes()[0]!;
    const plan = run.previewNode(node.id)!;
    const view = buildEncounterPreview(plan);
    expect(view.kindLabel).toBe('일반 전투');
    expect(view.units).toHaveLength(plan.units.length);
    plan.units.forEach((u, i) => expect(view.units[i]).toMatchObject({ name: u.name, tier: u.tier, star: u.star, hp: u.hp, atk: u.atk }));
    expect(view.scaleLabel).toBe('층 보정 없음');
  });

  it('정예는 변이 이름·설명을, 높은 층은 보정 퍼센트를 보여준다', () => {
    const run = newRun(4);
    const elite = run.map.allNodes().find((n) => n.type === 'elite')!;
    const view = buildEncounterPreview(run.previewNode(elite.id)!);
    expect(view.kindLabel).toBe('정예 전투');
    expect(view.mutations.length).toBeGreaterThanOrEqual(1);
    expect(view.mutations[0]!.name.length).toBeGreaterThan(0);
    expect(view.scaleLabel).toMatch(/^HP·ATK \+\d+%$/);
  });

  it('보스 편성은 보스 유닛을 표시한다', () => {
    const run = newRun(5);
    const view = buildEncounterPreview(run.previewNode(run.map.bossNode.id)!);
    expect(view.kind).toBe('boss');
    expect(view.units.some((u) => u.boss)).toBe(true);
  });
});

describe('카드·HUD·보상·상점', () => {
  it('강화 카드는 이름에 +가 붙고 강화 효과·비용을 쓴다', () => {
    const upgradable = cards.cards.find((c) => c.upgrade && c.rarity !== 'starter')!;
    const plain = buildCardView(cards, upgradable.id);
    const up = buildCardView(cards, upgradable.id, true);
    expect(up.name).toBe(`${upgradable.name}+`);
    expect(up.text).toBe(upgradable.upgrade!.text);
    expect(plain.text).toBe(upgradable.text);
    expect(plain.rarityLabel.length).toBeGreaterThan(0);
  });

  it('HUD는 층·HP·골드·덱 장수를 담는다', () => {
    const run = newRun(1);
    expect(buildHud(run)).toMatchObject({ floor: 0, hp: 80, maxHp: 80, gold: 10, deckCount: 10, location: '출발 전' });
    run.chooseNode(run.availableNodes()[0]!.id);
    expect(buildHud(run)).toMatchObject({ floor: 1, location: '1층 전투' });
  });

  it('보상은 3장을, 상점은 골드가 모자라면 구매·제거를 비활성 사유와 함께 보여준다', () => {
    const run = newRun(6);
    driveTo(run, 'combat');
    finishBattle(run, 'win');
    expect(buildRewardView(run, cards, runDeps.relics).cards).toHaveLength(3);
    run.skipReward();

    const shopRun = newRun(7);
    driveTo(shopRun, 'shop');
    const shop = buildShopView(shopRun.shopView()!, shopRun.gold, cards, runDeps.relics);
    expect(shop.cards).toHaveLength(3);
    expect(shop.removal.price).toBe(75);
    for (const entry of shop.cards) expect(entry.affordable).toBe(entry.price <= shopRun.gold);
    if (shopRun.gold < 75) {
      expect(shop.removal.affordable).toBe(false);
      expect(shop.removal.reason).toBe('골드가 부족합니다');
    }
    grantGold(shopRun, 500);
    const rich = buildShopView(shopRun.shopView()!, shopRun.gold, cards, runDeps.relics);
    expect(rich.cards.every((c) => c.affordable)).toBe(true);
    expect(rich.removal.affordable).toBe(true);
    expect(rich.removal.candidates.length).toBeGreaterThan(0);
    // 구매한 카드는 판매 완료로 바뀐다
    shopRun.buyShopCard(0);
    const after = buildShopView(shopRun.shopView()!, shopRun.gold, cards, runDeps.relics);
    expect(after.cards[0]).toMatchObject({ sold: true, affordable: false, reason: '판매 완료' });
  });
});

describe('이벤트·야영지', () => {
  it('이벤트는 선택 불가 사유를 표시하고 추가 선택 후보를 카드 정보로 바꾼다', () => {
    const run = newRun(8);
    driveTo(run, 'event');
    const view = buildEventView(run.eventView()!, run, cards);
    expect(view.choices.length).toBeGreaterThan(0);
    for (const choice of view.choices) expect(choice.enabled || choice.reason !== null).toBe(true);
    expect(view.pending).toBeNull();
    expect(view.finished).toBe(false);
  });

  it('덱 카드를 고르는 이벤트 선택지는 후보를 DeckCardView로 낸다', () => {
    // 카드 강화/제거 "직접 선택" 선택지를 가진 이벤트가 나올 때까지 시드를 바꿔 찾는다
    for (let seed = 1; seed < 60; seed++) {
      const run = newRun(seed);
      try { driveTo(run, 'event'); } catch { continue; }
      const raw = run.eventView()!;
      const index = raw.choices.findIndex((c) => c.enabled);
      run.chooseEventOption(index);
      const view = buildEventView(run.eventView()!, run, cards);
      if (view.pending && view.pending.kind !== 'gainCard') {
        expect(view.pending.options.length).toBeGreaterThan(0);
        expect(view.pending.options[0]!.card.instanceId).toBeGreaterThan(-1);
        return;
      }
    }
    throw new Error('덱 카드 선택 이벤트를 찾지 못함');
  });

  it('야영지는 휴식량·강화 후보(강화 후 미리보기)·승급 견적을 보여준다', () => {
    const run = newRun(9);
    damageCommander(run, 40);
    driveTo(run, 'camp');
    const view = buildCampView(run.campView()!, run, cards, units);
    expect(view.canHeal).toBe(true);
    expect(view.healAmount).toBe(24);
    expect(view.upgradable.length).toBeGreaterThan(0);
    expect(view.upgradable.every((c) => c.upgradePreview !== null)).toBe(true);
    for (const p of view.promotions) expect(p.nextStar).toBe(p.star + 1);
  });
});

describe('전투 결과·종료 화면', () => {
  it('정산 요약: 골드·HP 변화와 다음 버튼 문구', () => {
    const run = newRun(10);
    run.chooseNode(run.availableNodes()[0]!.id);
    const win = finishBattle(run, 'win');
    if (!win.ok) throw new Error(win.reason);
    const view = buildSettlementView(win.settlement);
    expect(view.headline).toBe('일반 전투 승리');
    expect(view.continueLabel).toBe('카드 보상 선택');
    expect(view.hpLines).toEqual([]);
    expect(view.goldLine).toMatch(/^\+\d+G \(기본 \d+G \+ 이자 \d+G\)$/);

    run.skipReward();
    run.chooseNode(run.availableNodes()[0]!.id);
    const loss = finishBattle(run, 'loss');
    if (!loss.ok) throw new Error(loss.reason);
    const lossView = buildSettlementView(loss.settlement);
    expect(lossView.headline).toBe('일반 전투 패배');
    expect(lossView.hpLines[0]).toMatch(/^패배 피해 지휘관 HP -\d+$/);
    expect(lossView.continueLabel).toBe('맵으로');
  });

  it('보스 패배는 재도전, 보스 승리/사망은 결과 보기', () => {
    const run = newRun(11);
    driveTo(run, 'boss');
    const loss = finishBattle(run, 'loss');
    if (!loss.ok) throw new Error(loss.reason);
    expect(run.phase).toBe('battlePrep');
    expect(buildSettlementView(loss.settlement).continueLabel).toBe('보스 재도전 준비');
    const win = finishBattle(run, 'win');
    if (!win.ok) throw new Error(win.reason);
    expect(buildSettlementView(win.settlement)).toMatchObject({ continueLabel: '결과 보기', runEnded: 'victory' });
  });

  it('종료 화면 정보: 승리/사망, 도달 층, 덱·로스터 요약', () => {
    const run = newRun(12);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const win = buildEndView(run, cards, units, runDeps.relics);
    expect(win).toMatchObject({ outcome: 'victory', title: '1액트 돌파', floorReached: 13, floorCount: 13 });
    expect(win.deck.reduce((sum, c) => sum + c.count, 0)).toBe(win.deckCount);
    expect(win.battles.played).toBe(win.battles.wins + win.battles.losses + win.battles.draws);
    expect(win.roster.length).toBeGreaterThan(0);

    const dead = newRun(13);
    damageCommander(dead, 79);
    dead.chooseNode(dead.availableNodes()[0]!.id);
    finishBattle(dead, 'loss');
    expect(buildEndView(dead, cards, units, runDeps.relics)).toMatchObject({ outcome: 'dead', hp: 0, floorReached: 1 });
  });
});
