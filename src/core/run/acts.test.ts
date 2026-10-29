import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RUN } from './constants';
import { defeatDamage } from './commanderHealth';
import { EncounterPlanner, floorScale } from './encounterPlanner';
import { MapGenerator } from './mapGenerator';
import { globalFloor } from './runMap';
import { RunController } from './runController';
import { CombatSimulator } from '../combat';
import { AutoRunner } from './autoRunner';
import { basicPlan, damageCommander, driveTo, finishBattle, newRun, newRunAs, runDeps } from './testSupport';

const sha = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const roundtrip = (run: RunController): RunController => RunController.restore(runDeps, JSON.parse(JSON.stringify(run.serialize())));
const json = (run: RunController): string => JSON.stringify(run.serialize());

/** 액트 n의 맵 단계(소개 확인 후)까지 보스 승리·첫 보스 유물 선택으로 진행한다 */
function toAct(run: RunController, act: number): void {
  while (run.act < act) {
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    if (run.phase === 'bossRelic') run.claimBossRelic(0);
    run.continueAct();
  }
}

describe('액트 1은 3액트 도입 전과 비트 단위로 같다', () => {
  // HEAD(8b7529a)에서 같은 방법으로 계산한 지문: 맵 JSON, 모든 전투 노드의 편성 계획(편성·보정·변이)
  const BASELINE: Record<number, [string, string]> = {
    1: ['ee2de3ad64d09bce', 'b7a244120eba795b'],
    7: ['12f101754649ffae', '36e911e6c3e9f734'],
    42: ['43c1a6806903794b', 'edbc3611b30d2534'],
    1234: ['caf46d14cd6afb87', 'a8430cb5296fb0fa'],
  };

  it.each(Object.keys(BASELINE).map(Number))('시드 %i: 액트 1 맵과 적 편성 계획이 기존과 같다', (seed) => {
    const map = new MapGenerator().generate(seed);
    expect(map.act).toBe(1);
    const planner = new EncounterPlanner(runDeps.units, runDeps.encounters, seed);
    const plans = map.allNodes().map((n) => planner.plan(n)).filter((p) => p !== null)
      .map((p) => ({ id: p.encounterId, scale: p.scale, mut: p.mutations, f: p.formation, e: p.enemy, u: p.units }));
    expect([sha(map.toJSON()), sha(plans)]).toEqual(BASELINE[seed]);
  });

  it('3액트 런의 액트 1은 1액트 런과 같은 맵·미리보기를 갖는다', () => {
    const one = newRun(9);
    const three = newRun(9, 'starter', 3);
    expect(JSON.stringify(three.map)).toBe(JSON.stringify(one.map));
    for (const node of one.map.allNodes()) {
      expect(JSON.stringify(three.previewNode(node.id))).toBe(JSON.stringify(one.previewNode(node.id)));
    }
    expect(three.act).toBe(1);
    expect(three.totalActs).toBe(3);
    expect(one.totalActs).toBe(1);
  });
});

describe('액트별 맵과 층 보정', () => {
  it('액트 2·3 맵은 (시드, 액트)에서 결정적이고 액트마다 다르며 노드 id에 액트 접두사가 붙는다', () => {
    const gen = new MapGenerator();
    const a1 = gen.generate(5, 1);
    const a2 = gen.generate(5, 2);
    const a3 = gen.generate(5, 3);
    expect(JSON.stringify(gen.generate(5, 2))).toBe(JSON.stringify(a2));
    expect(new Set([JSON.stringify(a1), JSON.stringify(a2), JSON.stringify(a3)]).size).toBe(3);
    expect(a1.node('1-0')).toBeDefined();
    expect(a2.floor(1).map((n) => n.id)).toEqual(a2.floor(1).map((_, i) => `a2-1-${i}`));
    expect(a3.bossNode.id).toBe('a3-13-0');
    for (const map of [a2, a3]) {
      expect(() => map.assertValid()).not.toThrow();
      expect(map.countCrossings()).toBe(0);
      expect(map.floorCount).toBe(13);
    }
  });

  it('층 보정은 전체 층 기준이다: 액트 1은 기존과 같고, 액트 2 1층은 14층, 액트 3 보스는 39층 보정', () => {
    expect(globalFloor(1, 7)).toBe(7);
    expect(globalFloor(2, 1)).toBe(14);
    expect(globalFloor(3, 13)).toBe(39);
    expect(floorScale(1)).toBe(1);
    expect(floorScale(13)).toBeCloseTo(1.48);
    const run = newRun(3, 'starter', 3);
    const first = run.previewAvailable()[0]!.plan!;
    expect(first.act).toBe(1);
    expect(first.scale).toBe(1);
    const bossPlan = run.previewNode(run.map.bossNode.id)!;
    expect(bossPlan.scale).toBeCloseTo(1.48);
    toAct(run, 2);
    const act2 = run.previewAvailable()[0]!.plan!;
    expect([act2.act, act2.floor, act2.globalFloor]).toEqual([2, 1, 14]);
    expect(act2.scale).toBeCloseTo(1 + 0.04 * 13);
    expect(act2.enemy).toEqual({ hpMult: act2.scale, atkMult: act2.scale, mutations: [] });
    expect(run.previewNode(run.map.bossNode.id)!.scale).toBeCloseTo(1 + 0.04 * 25);
    toAct(run, 3);
    expect(run.previewNode(run.map.bossNode.id)!.scale).toBeCloseTo(1 + 0.04 * 38);
  });

  it('액트마다 그 액트에 맞는 적 편성이 나온다 (액트 2는 잿불 고원, 액트 3은 몰락한 수도, 보스는 액트 보스)', () => {
    const run = newRun(8, 'starter', 3);
    expect(run.previewNode(run.map.bossNode.id)!.units.map((u) => u.unitId)).toContain('gate_breaker');
    toAct(run, 2);
    const twin = run.previewNode(run.map.bossNode.id)!;
    expect(twin.encounterId).toBe('boss_twin_sorcerers');
    expect(twin.units.map((u) => u.unitId)).toEqual(expect.arrayContaining(['twin_ser', 'twin_mir']));
    toAct(run, 3);
    expect(run.previewNode(run.map.bossNode.id)!.encounterId).toBe('boss_legion_lord');
    for (const act of [2, 3]) {
      const planner = new EncounterPlanner(runDeps.units, runDeps.encounters, 8);
      const map = new MapGenerator().generate(8, act);
      for (const node of map.allNodes()) {
        const plan = planner.plan(node, act);
        if (plan) expect(plan.globalFloor).toBeGreaterThanOrEqual(act === 2 ? 14 : 27);
      }
    }
  });

  it('보스 미리보기에 패턴 설명이 담긴다 (성문 파괴자·쌍둥이·군주), 일반 편성에는 없다', () => {
    const run = newRun(8, 'starter', 3);
    const gate = run.previewNode(run.map.bossNode.id)!;
    expect(gate.bossPatterns.map((p) => [p.unitId, p.title])).toEqual([['gate_breaker', '열 강타']]);
    expect(gate.bossPatterns[0]!.lines.join(' ')).toContain('420');
    expect(run.previewAvailable()[0]!.plan!.bossPatterns).toEqual([]);
    toAct(run, 2);
    const twin = run.previewNode(run.map.bossNode.id)!;
    expect(twin.bossPatterns.map((p) => p.unitId)).toEqual(['twin_ser']); // 쌍둥이는 한 쌍에 설명 하나
    expect(twin.bossPatterns[0]!.lines.join(' ')).toContain('3초');
    toAct(run, 3);
    const lord = run.previewNode(run.map.bossNode.id)!;
    expect(lord.bossPatterns).toHaveLength(1);
    expect(lord.bossPatterns[0]!.lines.join(' ')).toMatch(/2페이즈.*3페이즈/s);
  });

  it('패배 피해의 층 항도 전체 층을 쓴다 (액트 2 보스: floor(26/3) = 8)', () => {
    expect(defeatDamage({ survivorTierSum: 3, floor: 13, kind: 'boss' })).toBe(Math.ceil((2 + 3 + 4) * 2));
    const run = newRun(4, 'starter', 3);
    toAct(run, 2);
    driveTo(run, 'boss');
    const plan = run.battlePlan();
    const tiers = plan.units.reduce((sum, u) => sum + u.tier, 0);
    const result = finishBattle(run, 'loss');
    expect(result.ok && result.settlement.defeatDamage).toBe(Math.ceil((2 + tiers + Math.floor(26 / 3)) * 2));
    expect(run.phase).toBe('battlePrep'); // 보스 재도전은 액트 1과 같다
    expect(run.session).toEqual({ kind: 'battle', tries: 1 });
  });
});

describe('액트 진행', () => {
  it('액트 1 보스 처치 → 보스 유물 3개 중 선택 → 액트 소개(회복) → 액트 2 맵 → … → 액트 3 보스 처치 = 승리', () => {
    const run = newRun(11, 'starter', 3);
    driveTo(run, 'boss');
    const gold = run.gold;
    const result = finishBattle(run, 'win');
    expect(result.ok && result.settlement).toMatchObject({ kind: 'boss', outcome: 'win', runEnded: null, actCleared: 1, cardOffer: null });
    expect(run.phase).toBe('bossRelic');
    const offer = run.bossRelicChoices();
    expect(offer).toHaveLength(3); // 보스 유물 11개 중 무작위 3개 (중복 없음)
    expect(new Set(offer).size).toBe(3);
    expect(offer.every((id) => runDeps.relics.get(id)?.rarity === 'boss')).toBe(true);
    expect(run.outcome).toBeNull();
    expect(run.bossRelicOffer()).toEqual([]); // 종료 화면용 후보는 승리로 끝난 런에서만
    const goldAfterBoss = run.gold;
    expect(goldAfterBoss).toBeGreaterThan(gold); // 보스 승리 골드
    expect(run.chooseNode('a2-1-0')).toMatchObject({ ok: false });
    damageCommander(run, 30);
    const hpBefore = run.hp;
    expect(run.claimBossRelic(9)).toMatchObject({ ok: false });
    expect(run.claimBossRelic(0)).toEqual({ ok: true });
    expect(run.phase).toBe('actIntro');
    expect(run.act).toBe(2);
    expect(run.relics).toHaveLength(1);
    expect(run.session).toMatchObject({ kind: 'actIntro' });
    const intro = run.session as { hpBefore: number; healed: number };
    const heal = Math.ceil((run.maxHp * RUN.ACTS.TRANSITION_HEAL_PCT) / 100);
    expect(intro.healed).toBe(Math.min(heal, run.maxHp - intro.hpBefore));
    expect(run.hp).toBe(intro.hpBefore + intro.healed);
    expect(run.hp).toBeGreaterThanOrEqual(hpBefore);
    expect(run.gold).toBe(goldAfterBoss); // 경제는 그대로
    expect(run.availableNodes()).toEqual([]); // 소개를 확인하기 전에는 노드를 고를 수 없다
    expect(run.continueAct()).toEqual({ ok: true });
    expect(run.continueAct()).toMatchObject({ ok: false });
    expect(run.phase).toBe('map');
    expect(run.availableNodes().map((n) => n.id)).toEqual(run.map.floor(1).map((n) => n.id));
    expect(run.availableNodes()[0]!.id.startsWith('a2-')).toBe(true);
    expect(run.floorReached).toBe(0);
    expect(run.actInfo.name).toBe('잿불 고원');

    toAct(run, 3);
    expect(run.actInfo.name).toBe('몰락한 수도 아스트라');
    driveTo(run, 'boss');
    const last = finishBattle(run, 'win');
    expect(last.ok && last.settlement).toMatchObject({ runEnded: 'victory', actCleared: null });
    expect(run.phase).toBe('ended');
    expect(run.outcome).toBe('victory');
    expect(run.act).toBe(3);
    expect(run.bossRelicOffer()).toHaveLength(3); // 이미 2개를 받았어도 남은 보스 유물 중 3개 (받을 수는 없고 표시만)
  });

  it('보스 유물은 건너뛸 수 있다 (유물 없이 다음 액트로)', () => {
    const run = newRun(12, 'starter', 3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.skipBossRelic()).toEqual({ ok: true });
    expect(run.relics).toHaveLength(0);
    expect(run.phase).toBe('actIntro');
    expect(run.skipBossRelic()).toMatchObject({ ok: false });
  });

  it('보스 유물이 남지 않았으면 선택 없이 바로 다음 액트 소개로 넘어간다', () => {
    const run = newRun(13, 'starter', 3);
    for (const id of runDeps.relics.ofRarity('boss').map((r) => r.id)) {
      (run as unknown as { acquireRelic(id: string): void }).acquireRelic(id);
    }
    driveTo(run, 'boss');
    const result = finishBattle(run, 'win');
    expect(result.ok && result.settlement.actCleared).toBe(1);
    expect(run.phase).toBe('actIntro');
    expect(run.act).toBe(2);
  });

  it('경제(골드·로스터·덱·장비·유물)와 지휘관은 액트 사이에 유지된다', () => {
    const run = newRunAs('cmd_nox', 21, 3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    run.claimBossRelic(0);
    const gold = run.gold;
    const deck = JSON.stringify(run.deck);
    const roster = JSON.stringify(run.roster.snapshot().board.map((u) => [u.unitId, u.star]));
    const relics = run.relics.map((r) => r.id);
    run.continueAct();
    expect(run.gold).toBe(gold);
    expect(JSON.stringify(run.deck)).toBe(deck);
    expect(JSON.stringify(run.roster.snapshot().board.map((u) => [u.unitId, u.star]))).toBe(roster);
    expect(run.relics.map((r) => r.id)).toEqual(relics);
    expect(run.commander.id).toBe('cmd_nox');
    expect(run.visited.length).toBe(13); // 입장 기록은 액트를 이어서 쌓는다
  });

  it('1액트 런(acts: 1)은 액트 1 보스 처치가 바로 승리다 (기존 동작)', () => {
    const run = newRun(14);
    driveTo(run, 'boss');
    const result = finishBattle(run, 'win');
    expect(result.ok && result.settlement).toMatchObject({ runEnded: 'victory', actCleared: null });
    expect(run.phase).toBe('ended');
    expect(run.bossRelicOffer()).toHaveLength(3);
    expect(run.totalActs).toBe(1);
  });

  it('액트 수는 1~3의 정수여야 한다', () => {
    for (const acts of [0, 4, 1.5, Number.NaN]) {
      expect(() => RunController.create(runDeps, { seed: 1, acts })).toThrow(/액트 수는 1~3/);
    }
    expect(RunController.create(runDeps, { seed: 1 }).totalActs).toBe(3);
  });

  it('단계가 맞지 않으면 보스 유물·액트 명령은 거부된다', () => {
    const run = newRun(15, 'starter', 3);
    expect(run.claimBossRelic(0)).toMatchObject({ ok: false });
    expect(run.skipBossRelic()).toMatchObject({ ok: false });
    expect(run.continueAct()).toMatchObject({ ok: false });
    expect(run.bossRelicChoices()).toEqual([]);
    driveTo(run, 'boss');
    expect(run.claimBossRelic(0)).toMatchObject({ ok: false });
  });

  it('보스 재도전 후 승리해도 같은 흐름이다 (액트 2 보스 패배 → 재도전 → 승리 → 액트 3)', () => {
    const run = newRun(16, 'starter', 3);
    toAct(run, 2);
    driveTo(run, 'boss');
    finishBattle(run, 'loss');
    expect(run.phase).toBe('battlePrep');
    const result = finishBattle(run, 'win');
    expect(result.ok && result.settlement.actCleared).toBe(2);
    expect(run.bossRelicChoices()).toHaveLength(3); // 하나를 가졌어도 남은 보스 유물이 충분하다
    run.claimBossRelic(1);
    run.continueAct();
    expect(run.act).toBe(3);
  });
});

describe('보스 유물을 실제로 받으면 효과가 나온다', () => {
  const pick = (relicId: string): RunController => {
    const run = newRun(17, 'starter', 3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    // 후보 3개는 무작위라 원하는 유물이 없을 수 있다: 후보에 있으면 고르고, 없으면 건너뛴 뒤 같은 획득 경로로 받는다
    const index = run.bossRelicChoices().indexOf(relicId);
    if (index >= 0) run.claimBossRelic(index);
    else {
      run.skipBossRelic();
      (run as unknown as { acquireRelic(id: string): void }).acquireRelic(relicId);
    }
    run.continueAct();
    return run;
  };
  const startSim = (run: RunController) => {
    driveTo(run, 'combat');
    const sim = run.createSimulator();
    sim.startCombat();
    return sim;
  };

  it('균열의 심장: 전투 시작 CP +2', () => {
    const base = startSim(newRun(17, 'starter', 3));
    const withRelic = startSim(pick('rift_heart'));
    expect(withRelic.commandPoints!.combat).toBe(base.commandPoints!.combat + 2);
  });

  it('군단장의 인장: 전투 시작 시 아군 전체 최대 HP 15% 보호막', () => {
    const base = startSim(newRun(17, 'starter', 3)); // 지휘관 패시브의 보호막은 유물 없이도 있다
    const sim = startSim(pick('legion_seal'));
    const allies = sim.world.alliesOf(0);
    expect(allies.length).toBeGreaterThan(0);
    allies.forEach((unit, i) => {
      expect(unit.statuses.shieldTotal() - base.world.alliesOf(0)[i]!.statuses.shieldTotal()).toBe(Math.round(unit.maxHp * 0.15));
    });
  });

  it('강철 심장: 지휘관 최대 HP +20(같은 양 회복), 전투 승리 시 HP +2', () => {
    const control = newRun(17, 'starter', 3);
    const maxBefore = control.maxHp;
    const run = pick('iron_heart');
    expect(run.maxHp).toBe(maxBefore + 20);
    damageCommander(run, 10);
    driveTo(run, 'combat');
    const hp = run.hp;
    const result = finishBattle(run, 'win');
    expect(result.ok && result.settlement.healed).toBe(2);
    expect(run.hp).toBe(hp + 2);
  });
});

describe('저장 v3: 액트별 맵', () => {
  it('액트 전환의 모든 지점(보스 유물 선택·액트 소개·새 액트 시작·액트 3)에서 저장·복원이 왕복한다', () => {
    const run = newRun(18, 'starter', 3);
    expect(run.serialize().version).toBe(3);
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    const points: string[] = [];
    const check = (): void => {
      const restored = roundtrip(run);
      expect(json(restored)).toBe(json(run));
      points.push(run.phase);
    };
    check(); // bossRelic
    run.claimBossRelic(0);
    check(); // actIntro
    const save = run.serialize();
    expect(save.maps).toHaveLength(2);
    expect(save.totalActs).toBe(3);
    run.continueAct();
    check(); // 새 액트 시작(map)
    run.chooseNode(run.availableNodes()[0]!.id);
    check();
    toAct(run, 3);
    check();
    driveTo(run, 'boss');
    check();
    finishBattle(run, 'win');
    check(); // ended
    expect(points).toEqual(['bossRelic', 'actIntro', 'map', 'battlePrep', 'map', 'battlePrep', 'ended']);
    expect(roundtrip(run).outcome).toBe('victory');
    expect(roundtrip(run).act).toBe(3);
  });

  it('복원한 런은 같은 선택에서 같은 결과를 낸다 (액트 2 진행 중)', () => {
    const a = newRun(19, 'starter', 3);
    toAct(a, 2);
    driveTo(a, 'combat');
    const b = roundtrip(a);
    expect(JSON.stringify(a.previewNode(a.currentNode!.id))).toBe(JSON.stringify(b.previewNode(b.currentNode!.id)));
    finishBattle(a, 'win');
    finishBattle(b, 'win');
    expect(json(b)).toBe(json(a));
  });

  it('정상 진행(전투 승패·재도전·사망 포함)의 모든 비전투 시점 저장본이 3액트에 걸쳐 복원된다', () => {
    let checkpoints = 0;
    let victories = 0;
    let reachedAct3 = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const run = newRunAs(['cmd_harten', 'cmd_isera', 'cmd_nox'][seed % 3]!, seed, 3);
      for (let guard = 0; guard < 700 && run.phase !== 'ended'; guard++) {
        expect(json(roundtrip(run))).toBe(json(run));
        checkpoints++;
        switch (run.phase) {
          case 'map': {
            const options = run.availableNodes();
            run.chooseNode(options[(seed + guard) % options.length]!.id);
            break;
          }
          case 'battlePrep': {
            const isBoss = run.currentNode?.type === 'boss';
            if (isBoss && run.session?.kind === 'battle' && run.session.tries === 0 && seed % 2 === 0) finishBattle(run, 'loss');
            else finishBattle(run, !isBoss && (seed + guard) % 7 === 0 ? 'loss' : 'win');
            break;
          }
          case 'reward': guard % 2 === 0 ? run.claimReward(0) : run.skipReward(); break;
          case 'bossRelic': guard % 3 === 0 ? run.skipBossRelic() : run.claimBossRelic(0); break;
          case 'actIntro': run.continueAct(); break;
          case 'shop': run.leaveShop(); break;
          case 'camp': run.leaveCamp(); break;
          case 'event': {
            const view = run.eventView()!;
            run.chooseEventOption(Math.max(0, view.choices.findIndex((c) => c.enabled)));
            while (run.eventView()?.pending) run.pickEventOption(0);
            run.finishEvent();
            break;
          }
          default: throw new Error(`예상 밖 단계 ${run.phase}`);
        }
      }
      expect(run.phase).toBe('ended');
      expect(json(roundtrip(run))).toBe(json(run));
      if (run.outcome === 'victory') victories++;
      if (run.act === 3) reachedAct3++;
    }
    expect(victories).toBeGreaterThan(0); // 패배 피해로 사망하는 런도 있지만 3액트를 끝까지 간 런도 있다
    expect(reachedAct3).toBeGreaterThan(0);
    expect(checkpoints).toBeGreaterThan(400);
  });
});

describe('AutoRunner 3액트', () => {
  it('지휘관 3명 x 여러 시드: 3액트 런이 승리 또는 사망으로 끝나고 요약에 도달 액트가 담긴다', () => {
    let reachedAct2 = 0;
    for (const commander of ['cmd_harten', 'cmd_isera', 'cmd_nox']) {
      for (let seed = 1; seed <= 4; seed++) {
        const run = newRunAs(commander, seed, 3);
        const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'random', policySeed: seed, plan: basicPlan, relics: true, ultimate: true }).run();
        expect(['victory', 'dead']).toContain(summary.outcome);
        expect(summary.totalActs).toBe(3);
        expect(summary.act).toBe(run.act);
        expect(summary.totalFloorReached).toBe(globalFloor(summary.act, summary.floorReached));
        if (summary.outcome === 'victory') expect(summary.act).toBe(3);
        if (summary.act >= 2) reachedAct2++;
        expect(json(roundtrip(run))).toBe(json(run));
      }
    }
    expect(reachedAct2).toBeGreaterThan(0);
  });

  it('유물 정책이 켜져 있으면 보스 유물을 받고, 꺼져 있으면 건너뛴다', () => {
    const levelled = (relics: boolean): number => {
      let best = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const run = newRun(seed, 'starter', 3);
        const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: seed, plan: basicPlan, relics }).run();
        if (summary.act >= 2) {
          const boss = run.relics.filter((r) => r.rarity === 'boss').length;
          best = Math.max(best, boss);
        }
      }
      return best;
    };
    expect(levelled(true)).toBeGreaterThanOrEqual(1);
    expect(levelled(false)).toBe(0);
  });

  it('액트 1 런(acts: 1)의 자동 진행은 액트 1에서 끝난다', () => {
    const run = newRun(2);
    const summary = new AutoRunner(run, runDeps.cards, runDeps.units, { pathMode: 'first', policySeed: 2, plan: basicPlan }).run();
    expect([summary.act, summary.totalActs]).toEqual([1, 1]);
  });
});

describe('액트 2·3 적 편성 전수 시뮬', () => {
  it('모든 적 편성(층 보정·정예 변이 포함)이 오류 없이 끝까지 돌고 결정적이다, 보스 편성은 보스 패턴 이벤트를 낸다', () => {
    const allies = [
      { unitId: 'iron_shieldbearer', star: 2 as const, cell: { col: 3, row: 1 } },
      { unitId: 'moss_warden', star: 2 as const, cell: { col: 3, row: 3 } },
      { unitId: 'grove_archer', star: 2 as const, cell: { col: 1, row: 2 } },
      { unitId: 'ember_kindler', star: 2 as const, cell: { col: 0, row: 1 } },
    ];
    const planner = new EncounterPlanner(runDeps.units, runDeps.encounters, 3);
    const bossEvents = new Map<string, Set<string>>();
    for (const act of [1, 2, 3]) {
      const map = new MapGenerator().generate(3, act);
      for (const node of map.allNodes()) {
        const plan = planner.plan(node, act);
        if (!plan) continue;
        const make = () => new CombatSimulator(
          { seed: 9, formations: [allies, plan.formation], enemy: plan.enemy },
          runDeps.units, runDeps.traits,
        );
        const first = make().run();
        expect(JSON.stringify(make().run().events)).toBe(JSON.stringify(first.events));
        expect(first.endTime).toBeGreaterThan(0);
        if (node.type === 'boss') bossEvents.set(plan.encounterId, new Set(first.events.map((e) => e.type)));
      }
    }
    expect([...bossEvents.keys()].sort()).toEqual(['boss_gate_breaker', 'boss_legion_lord', 'boss_twin_sorcerers']);
    expect(bossEvents.get('boss_gate_breaker')).toContain('telegraph');
  });

  it('보스 전투에서 실제로 쌍둥이 부활·군주 페이즈가 일어난다 (강한 아군 vs 보스)', () => {
    const strong = [
      { unitId: 'iron_shieldbearer', star: 3 as const, cell: { col: 3, row: 1 } },
      { unitId: 'iron_shieldbearer', star: 3 as const, cell: { col: 3, row: 3 } },
      { unitId: 'legion_crossbow', star: 3 as const, cell: { col: 2, row: 0 } },
      { unitId: 'legion_crossbow', star: 3 as const, cell: { col: 2, row: 2 } },
      { unitId: 'legion_crossbow', star: 3 as const, cell: { col: 2, row: 4 } },
      { unitId: 'ember_slinger', star: 3 as const, cell: { col: 1, row: 1 } },
      { unitId: 'ember_slinger', star: 3 as const, cell: { col: 1, row: 3 } },
    ];
    const planner = new EncounterPlanner(runDeps.units, runDeps.encounters, 4);
    const kinds = (act: number): string[] => {
      const plan = planner.plan(new MapGenerator().generate(4, act).bossNode, act)!;
      const result = new CombatSimulator({ seed: 2, formations: [strong, plan.formation], enemy: plan.enemy }, runDeps.units, runDeps.traits).run();
      return result.events.map((e) => e.type);
    };
    expect(kinds(2)).toEqual(expect.arrayContaining(['reviveTelegraph']));
    expect(kinds(3)).toContain('bossPhase'); // 아군에 해제할 버프가 없으면 dispel 이벤트는 없다
  });
});
