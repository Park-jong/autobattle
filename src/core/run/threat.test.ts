import { describe, expect, it } from 'vitest';
import { deckCards } from '../cards';
import { scaledHpAtk } from '../combat';
import { EncounterPlanner, floorScale } from './encounterPlanner';
import { RunController, type RunOptions } from './runController';
import { RunSerializer } from './runSerializer';
import { ThreatRules } from './threatRules';
import { damageCommander, driveTo, finishBattle, newRun, runDeps } from './testSupport';

const create = (threatLevel: number | undefined, extra: Partial<RunOptions> = {}): RunController =>
  RunController.create(runDeps, { seed: 1, commanderId: 'cmd_harten', acts: 1, ...(threatLevel !== undefined ? { threatLevel } : {}), ...extra });

const dump = (run: RunController): string => JSON.stringify(run.serialize());
const rules = (level: number): ThreatRules => new ThreatRules(runDeps.threat, level);
const cardIds = (run: RunController): string[] => deckCards(run.deck).map((c) => c.cardId);

describe('ThreatRules: 레벨별 누적 규칙', () => {
  it('레벨 0은 모든 질의가 변화 없음이다', () => {
    const r = rules(0);
    expect(r.enemyMult('normal')).toEqual({ hp: 1, atk: 1 });
    expect(r.enemyMult('boss')).toEqual({ hp: 1, atk: 1 });
    expect(r.startGoldDelta).toBe(0);
    expect(r.startCurses()).toEqual([]);
    expect(r.actHealPct()).toBe(50);
    expect(r.shopPrice(15)).toBe(15);
    expect(r.eliteMutationsMin).toBe(0);
    expect(r.maxHp(80)).toBe(80);
  });

  it('적 능력치는 종류별로 누적된다', () => {
    expect(rules(1).enemyMult('normal')).toEqual({ hp: 1.1, atk: 1 });
    expect(rules(3).enemyMult('normal')).toEqual({ hp: 1.1, atk: 1.1 });
    expect(rules(8).enemyMult('elite')).toEqual({ hp: 1.1, atk: 1.1 });
    expect(rules(9).enemyMult('elite')).toEqual({ hp: 1.25, atk: 1.2 });
    expect(rules(9).enemyMult('normal')).toEqual({ hp: 1.1, atk: 1.1 });
    expect(rules(10).enemyMult('boss')).toEqual({ hp: 1.45, atk: 1.2 });
  });

  it('시작 골드·저주·가격·변이·최대 HP·액트 회복이 정해진 레벨부터 누적된다', () => {
    expect(rules(1).startGoldDelta).toBe(0);
    expect(rules(2).startGoldDelta).toBe(-5);
    expect(rules(10).startGoldDelta).toBe(-10);
    expect(rules(4).shopPrice(8)).toBe(10);
    expect(rules(4).shopPrice(15)).toBe(18);
    expect(rules(3).shopPrice(15)).toBe(15);
    expect(rules(4).startCurses()).toEqual([]);
    expect(rules(5).startCurses()).toEqual([{ cardId: 'dread', count: 1 }]);
    expect(rules(10).startCurses()).toEqual([{ cardId: 'dread', count: 1 }, { cardId: 'wound', count: 1 }]);
    expect(rules(5).eliteMutationsMin).toBe(0);
    expect(rules(6).eliteMutationsMin).toBe(2);
    expect(rules(6).maxHp(80)).toBe(80);
    expect(rules(7).maxHp(80)).toBe(72);
    expect(rules(7).maxHp(65)).toBe(58);
    expect(rules(7).actHealPct()).toBe(50);
    expect(rules(8).actHealPct()).toBe(25);
  });

  it('범위 밖 레벨을 거부한다', () => {
    for (const bad of [-1, 11, 1.5, Number.NaN]) expect(() => rules(bad)).toThrow('위협 레벨은 0~10의 정수여야 합니다');
  });
});

describe('RunController: 위협 레벨 적용', () => {
  it('레벨 0은 옵션을 생략한 런과 저장 결과가 비트 단위로 같고 threatLevel 필드가 없다', () => {
    expect(dump(create(0))).toBe(dump(create(undefined)));
    expect(dump(create(undefined))).not.toContain('threatLevel');
    const run = create(0);
    expect(run.threatLevel).toBe(0);
    expect(run.threatName).toBeNull();
    expect(run.runSummary().threatLevel).toBe(0);
  });

  it('레벨 0 진행(맵 이동·전투 로그)이 옵션 생략과 같다', () => {
    const a = create(0);
    const b = create(undefined);
    const nodeA = a.availableNodes()[0]!;
    a.chooseNode(nodeA.id);
    b.chooseNode(nodeA.id);
    const simA = a.createSimulator();
    const simB = b.createSimulator();
    expect(JSON.stringify(a.previewNode(nodeA.id))).toBe(JSON.stringify(b.previewNode(nodeA.id)));
    simA.runUntil(30);
    simB.runUntil(30);
    expect(JSON.stringify(simA.events)).toBe(JSON.stringify(simB.events));
  });

  it('시작 골드, 시작 덱 저주, 최대 HP가 누적 적용된다', () => {
    const base = create(0);
    expect(base.gold).toBe(10);
    const l2 = create(2);
    expect(l2.gold).toBe(5);
    expect(l2.maxHp).toBe(80);
    const l5 = create(5);
    expect(cardIds(l5).filter((id) => id === 'dread')).toHaveLength(1);
    expect(deckCards(l5.deck)).toHaveLength(deckCards(base.deck).length + 1);
    expect(cardIds(l5)).not.toContain('wound');
    const l7 = create(7);
    expect(l7.maxHp).toBe(72);
    expect(l7.hp).toBe(72);
    const l10 = create(10);
    expect(l10.gold).toBe(0);
    expect(cardIds(l10)).toEqual(expect.arrayContaining(['dread', 'wound']));
    expect(l10.runSummary().threatLevel).toBe(10);
    expect(l10.threatName).toBe('최후의 시험');
  });

  it('최대 HP는 지휘관 기본값에 퍼센트를 적용한다 (녹스 65 → 58)', () => {
    expect(create(7, { commanderId: 'cmd_nox' }).maxHp).toBe(58);
  });

  it('범위 밖 레벨은 거부하고, unlocks.maxThreat보다 높은 레벨도 거부한다', () => {
    for (const bad of [-1, 11, 2.5]) expect(() => create(bad)).toThrow('위협 레벨은 0~10');
    const all = { commanders: ['cmd_harten'], relics: runDeps.relics.relics.map((r) => r.id) };
    expect(() => create(3, { unlocks: { ...all, maxThreat: 2 } })).toThrow('아직 해금하지 않은 위협 레벨입니다: 3');
    expect(create(2, { unlocks: { ...all, maxThreat: 2 } }).threatLevel).toBe(2);
    expect(create(0, { unlocks: all }).threatLevel).toBe(0);
    // maxThreat를 안 주면 core는 범위만 본다
    expect(create(10, { unlocks: all }).threatLevel).toBe(10);
  });

  it('상점 가격(카드·유물·제거)이 레벨 4부터 20% 오르고 구매에도 같은 값이 든다', () => {
    const base = newRun(3);
    const marked = create(4, { seed: 3 });
    driveTo(base, 'shop');
    driveTo(marked, 'shop');
    const plain = base.shopView()!;
    const view = marked.shopView()!;
    expect(view.cards.map((c) => c.cardId)).toEqual(plain.cards.map((c) => c.cardId));
    view.cards.forEach((slot, i) => expect(slot.price).toBe(Math.ceil(plain.cards[i]!.price * 1.2)));
    view.relics.forEach((slot, i) => expect(slot.price).toBe(Math.ceil(plain.relics[i]!.price * 1.2)));
    expect(view.removalPrice).toBe(Math.ceil(plain.removalPrice * 1.2));
    // 구매 성공 여부와 차감액이 화면의 가격과 같다
    const price = view.cards[0]!.price;
    const gold = marked.gold;
    const result = marked.buyShopCard(0);
    expect(result.ok).toBe(gold >= price);
    if (result.ok) expect(marked.gold).toBe(gold - price);
  });

  it('액트 전환 회복이 레벨 8부터 25%p 줄어든다', () => {
    const healed = (level: number): number => {
      const run = RunController.create(runDeps, { seed: 8, commanderId: 'cmd_harten', acts: 2, threatLevel: level });
      driveTo(run, 'boss');
      damageCommander(run, run.hp - 1);
      expect(finishBattle(run, 'win').ok).toBe(true);
      if (run.phase === 'bossRelic') run.skipBossRelic();
      expect(run.phase).toBe('actIntro');
      const session = run.session;
      return session?.kind === 'actIntro' ? session.healed : -1;
    };
    expect(healed(0)).toBe(40);
    expect(healed(7)).toBe(Math.ceil((72 * 50) / 100));
    expect(healed(8)).toBe(Math.ceil((72 * 25) / 100));
  });

  it('테스트 런도 레벨을 받는다 (메타 해금과 무관). 골드 지정은 레벨의 시작 골드를 덮어쓴다', () => {
    const run = RunController.createTest(runDeps, { seed: 1, threatLevel: 10 });
    expect(run.threatLevel).toBe(10);
    expect(run.testInfo).not.toBeNull();
    expect(run.gold).toBe(0);
    expect(RunController.createTest(runDeps, { seed: 1, threatLevel: 10, gold: 7 }).gold).toBe(7);
    expect(() => RunController.createTest(runDeps, { seed: 1, threatLevel: 11 })).toThrow('위협 레벨은 0~10');
    expect(dump(RunController.createTest(runDeps, { seed: 1 }))).not.toContain('"threatLevel"');
  });
});

describe('적 편성: 위협 레벨 반영과 미리보기 일치', () => {
  const run = newRun(5, 'starter', 3);
  const nodesOf = (type: 'combat' | 'elite' | 'boss') => run.map.allNodes().filter((n) => n.type === type);
  const planner = (level: number): EncounterPlanner => new EncounterPlanner(runDeps.units, runDeps.encounters, run.seed, rules(level));

  it('일반·정예·보스별로 HP·ATK 배율이 층 보정에 곱해진다', () => {
    const cases: { type: 'combat' | 'elite' | 'boss'; level: number; hp: number; atk: number }[] = [
      { type: 'combat', level: 1, hp: 1.1, atk: 1 },
      { type: 'combat', level: 3, hp: 1.1, atk: 1.1 },
      { type: 'elite', level: 9, hp: 1.25, atk: 1.2 },
      { type: 'boss', level: 10, hp: 1.45, atk: 1.2 },
    ];
    for (const c of cases) {
      const node = nodesOf(c.type)[0]!;
      const plain = planner(0).plan(node)!;
      const plan = planner(c.level).plan(node)!;
      const scale = floorScale(plan.globalFloor);
      expect(plan.enemy.hpMult).toBe(scale * c.hp);
      expect(plan.enemy.atkMult).toBe(scale * c.atk);
      expect(plan.encounterId).toBe(plain.encounterId);
      plan.units.forEach((u, i) => {
        const def = runDeps.units.get(u.unitId)!;
        const expected = scaledHpAtk(def, u.star, { hp: scale * c.hp, atk: scale * c.atk });
        expect(u.hp).toBe(expected.hp);
        expect(u.atk).toBe(expected.atk);
        expect(u.hp).toBeGreaterThanOrEqual(plain.units[i]!.hp);
      });
    }
  });

  it('레벨 0 계획은 위협 규칙이 없는 계획과 같다', () => {
    for (const node of run.map.allNodes()) {
      expect(JSON.stringify(planner(0).plan(node))).toBe(JSON.stringify(new EncounterPlanner(runDeps.units, runDeps.encounters, run.seed).plan(node)));
    }
  });

  it('레벨 6부터 정예는 변이가 항상 2개이고 기존 변이를 앞에 그대로 둔다', () => {
    const elites = run.map.allNodes().filter((n) => n.type === 'elite');
    expect(elites.length).toBeGreaterThan(0);
    for (const node of elites) {
      const plain = planner(0).plan(node)!.mutations;
      const high = planner(6).plan(node)!.mutations;
      expect(high).toHaveLength(2);
      expect(high.slice(0, plain.length)).toEqual(plain);
      expect(planner(5).plan(node)!.mutations).toEqual(plain);
    }
  });

  it('미리보기와 실제 전투가 같은 값을 쓴다 (레벨 10)', () => {
    const marked = create(10, { seed: 5 });
    const node = marked.availableNodes().find((n) => n.type === 'combat')!;
    const preview = marked.previewNode(node.id)!;
    marked.chooseNode(node.id);
    expect(JSON.stringify(marked.battlePlan())).toBe(JSON.stringify(preview));
    const sim = marked.createSimulator();
    sim.startCombat();
    const enemyHp = sim.world.units.filter((u) => u.side === 1).map((u) => u.maxHp).sort((a, b) => a - b);
    expect(enemyHp).toEqual(preview.units.map((u) => u.hp).sort((a, b) => a - b));
    const plain = create(0, { seed: 5 });
    plain.chooseNode(node.id);
    expect(preview.units[0]!.hp).toBeGreaterThan(plain.previewNode(node.id)!.units[0]!.hp);
  });
});

describe('저장: threatLevel 선택 필드', () => {
  const roundTrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));

  it('레벨이 있으면 저장하고 복원 뒤 같은 저장 결과를 낸다', () => {
    const run = create(7, { seed: 9 });
    const save = run.serialize() as unknown as Record<string, unknown>;
    expect(save.threatLevel).toBe(7);
    const back = roundTrip(run);
    expect(back.threatLevel).toBe(7);
    expect(dump(back)).toBe(dump(run));
    // 복원한 런도 같은 규칙(상점 가격·적 편성)을 쓴다
    const node = run.availableNodes()[0]!;
    expect(JSON.stringify(back.previewNode(node.id))).toBe(JSON.stringify(run.previewNode(node.id)));
  });

  it('필드가 없는 저장본은 레벨 0이고 0은 저장하지 않는다', () => {
    const save = JSON.parse(dump(newRun(2))) as Record<string, unknown>;
    expect('threatLevel' in save).toBe(false);
    expect(RunController.restore(runDeps, save).threatLevel).toBe(0);
    save.threatLevel = 0;
    const zero = RunController.restore(runDeps, save);
    expect(zero.threatLevel).toBe(0);
    expect(dump(zero)).not.toContain('threatLevel');
  });

  it('범위 밖·정수가 아닌 레벨을 거부한다', () => {
    const base = (): Record<string, unknown> => JSON.parse(dump(create(3)));
    for (const bad of [11, -1, 2.5, '3']) {
      const save = base();
      save.threatLevel = bad;
      expect(() => RunController.restore(runDeps, save)).toThrow(/threatLevel/);
    }
  });

  it('최대 HP는 레벨의 감소가 반영된 값이어야 한다 (레벨을 바꿔 끼운 저장본은 거부)', () => {
    const save = JSON.parse(dump(create(7))) as { threatLevel?: number };
    delete save.threatLevel; // 레벨 7의 최대 HP 72를 레벨 0으로 읽으면 기본값 80과 맞지 않는다
    expect(() => RunController.restore(runDeps, save)).toThrow('지휘관 기본 최대 HP');
    const tampered = JSON.parse(dump(create(0))) as { threatLevel?: number };
    tampered.threatLevel = 7;
    expect(() => new RunSerializer(runDeps).parse(tampered)).toThrow('지휘관 기본 최대 HP');
  });
});
