import { describe, expect, it } from 'vitest';
import { fixtureCard, fixtureCatalog } from '../cards/testSupport';
import type { PlayTarget } from './cardCommand';
import {
  cardCatalog,
  eventsOf,
  makeCardSim,
  stepTicks,
  unitOf,
} from './testSupport';

const NONE: PlayTarget = { kind: 'none' };
const unit = (uid: number): PlayTarget => ({ kind: 'unit', uid });
const units = (...uids: number[]): PlayTarget => ({ kind: 'units', uids });

// 기본 편성: 아군 uid 0 방패병(3,1) / 1 방패병(3,3) / 2 투기장 신병(2,2), 적 uid 3 방패병(4,2) / 4 석궁병(6,2)

describe('7장 카드 효과', () => {
  it('방진 유지: 전열(열 3) 아군에게 최대 HP 15% 보호막, 후열은 제외', () => {
    const sim = makeCardSim({ hand: ['shield_formation'] });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(unitOf(sim, 0).statuses.shieldTotal()).toBe(Math.round(650 * 0.15));
    expect(unitOf(sim, 1).statuses.shieldTotal()).toBe(Math.round(650 * 0.15));
    expect(unitOf(sim, 2).statuses.shieldTotal()).toBe(0);
  });

  it('방진 유지(강화): 20%, 4초', () => {
    const sim = makeCardSim({ hand: ['shield_formation'], upgraded: [1] });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(unitOf(sim, 0).statuses.shieldTotal()).toBe(130);
  });

  it('전열 사수: 대상 아군만 받는 피해 x0.5, 3초 뒤 해제', () => {
    const sim = makeCardSim({ hand: ['hold_the_line'] });
    sim.startCombat();
    expect(sim.playCard(1, unit(2)).ok).toBe(true);
    expect(unitOf(sim, 2).statuses.takenMultiplier()).toBe(0.5);
    expect(unitOf(sim, 0).statuses.takenMultiplier()).toBe(1);
    sim.runUntil(31);
    expect(unitOf(sim, 2).statuses.takenMultiplier()).toBe(1);
  });

  it('전쟁 북(작전): 준비 단계에서 사용하면 아군 전체 ATK +10%가 전투 내내 유지', () => {
    const sim = makeCardSim({ hand: ['war_drums'] });
    expect(sim.phase).toBe('prep');
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(44);
    expect(unitOf(sim, 2).stat('atk')).toBeCloseTo(52 * 1.1);
    expect(unitOf(sim, 3).stat('atk')).toBe(40); // 적에게는 적용 안 됨
    sim.runUntil(400);
    if (unitOf(sim, 0).alive) expect(unitOf(sim, 0).stat('atk')).toBeCloseTo(44);
  });

  it('집중 포화: 아군 전체가 지정한 적을 3초간 우선 공격', () => {
    const sim = makeCardSim({ hand: ['focus_fire'] });
    sim.startCombat();
    expect(sim.playCard(1, unit(4)).ok).toBe(true);
    for (const uid of [0, 1, 2]) expect(unitOf(sim, uid).statuses.forcedTargetUid()).toBe(4);
    sim.runUntil(30);
    const attacks = eventsOf(sim, 'attack').filter((e) => e.unit <= 2 && e.t <= 3);
    for (const a of attacks) expect(a.target).toBe(4);
    sim.runUntil(32);
    expect(unitOf(sim, 0).statuses.forcedTargetUid()).toBeNull();
  });

  it('집중 포화(강화): 지정한 적은 받는 피해 +15%', () => {
    const sim = makeCardSim({ hand: ['focus_fire'], upgraded: [1] });
    sim.startCombat();
    expect(sim.playCard(1, unit(4)).ok).toBe(true);
    expect(unitOf(sim, 4).statuses.takenMultiplier()).toBeCloseTo(1.15);
  });

  it('최후의 저항: 2초간 HP가 1 밑으로 내려가지 않고, 끝나면 다시 죽을 수 있다', () => {
    const sim = makeCardSim({ hand: ['last_stand'] });
    sim.startCombat();
    expect(sim.playCard(1, unit(0)).ok).toBe(true);
    const target = unitOf(sim, 0);
    sim.world.dealDamage({ source: null, target, raw: 99999, type: 'physical' });
    expect(target.alive).toBe(true);
    expect(target.hp).toBe(1);
    sim.runUntil(21);
    sim.world.dealDamage({ source: null, target, raw: 99999, type: 'physical' });
    expect(target.alive).toBe(false);
  });

  it('진형 교대: 두 아군의 위치가 바뀐다 (teleport 이벤트 2개)', () => {
    const sim = makeCardSim({ hand: ['formation_swap'] });
    sim.startCombat();
    expect(sim.playCard(1, units(0, 2)).ok).toBe(true);
    expect(unitOf(sim, 0).cell).toEqual({ col: 2, row: 2 });
    expect(unitOf(sim, 2).cell).toEqual({ col: 3, row: 1 });
    expect(eventsOf(sim, 'teleport')).toHaveLength(2);
    expect(sim.world.board.occupantAt({ col: 2, row: 2 })).toBe(0);
  });

  it('진형 교대(강화): 위치 교환 + 둘에게 최대 HP 10% 보호막', () => {
    const sim = makeCardSim({ hand: ['formation_swap'], upgraded: [1] });
    sim.startCombat();
    expect(sim.playCard(1, units(0, 1)).ok).toBe(true);
    expect(unitOf(sim, 0).statuses.shieldTotal()).toBe(65);
    expect(unitOf(sim, 1).statuses.shieldTotal()).toBe(65);
  });

  it('돌격 신호: 근접 유닛 AS +30% 4초 (사거리 4 석궁병은 제외)', () => {
    const sim = makeCardSim({
      a: [['iron_shieldbearer', 1, 3, 2], ['legion_crossbow', 1, 1, 2]],
      hand: ['charge_signal'],
    });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(0.6 * 1.3);
    expect(unitOf(sim, 1).stat('as')).toBeCloseTo(0.65);
    sim.runUntil(41);
    expect(unitOf(sim, 0).stat('as')).toBeCloseTo(0.6);
  });
});

describe('사용 성공 시 상태 변화', () => {
  it('CP 차감, 카드는 버린 더미로, cp·cardPlayed 이벤트 기록', () => {
    const sim = makeCardSim({ hand: ['hold_the_line'] });
    sim.startCombat();
    const before = sim.events.length;
    const result = sim.playCard(1, unit(0));
    expect(result).toEqual({ ok: true, cp: 1, pool: 'combat' });
    expect(sim.commandPoints?.combat).toBe(1);
    expect(sim.deck?.hand).toHaveLength(0);
    expect(sim.deck?.discardPile.map((c) => c.cardId)).toEqual(['hold_the_line']);

    const added = sim.events.slice(before);
    expect(added[0]).toMatchObject({ type: 'cp', pool: 'combat', delta: -1, cp: 1, reason: 'card' });
    expect(added[1]).toMatchObject({
      type: 'cardPlayed',
      cardId: 'hold_the_line',
      instanceId: 1,
      upgraded: false,
      target: { kind: 'unit', uid: 0 },
      cp: 1,
      pool: 'combat',
    });
    expect(added[2]).toMatchObject({ type: 'statusApplied', status: 'damageTakenMult' });
  });

  it('비용 0 카드는 cp 이벤트를 남기지 않는다', () => {
    const sim = makeCardSim({ hand: ['formation_swap'] });
    sim.startCombat();
    sim.playCard(1, units(0, 1));
    expect(eventsOf(sim, 'cp').filter((e) => e.reason === 'card')).toHaveLength(0);
    expect(eventsOf(sim, 'cardPlayed')).toHaveLength(1);
  });

  it('소모 카드는 소모 더미로 간다', () => {
    const catalog = fixtureCatalog([fixtureCard('vanish', { keywords: ['exhaust'] })]);
    const sim = makeCardSim({ catalog, hand: ['vanish'] });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true);
    expect(sim.deck?.exhaustPile.map((c) => c.cardId)).toEqual(['vanish']);
    expect(sim.deck?.discardPile).toHaveLength(0);
  });

  it('전투가 끝나면 남은 손패는 버린 더미로, 보존 카드는 손패에 남는다', () => {
    const catalog = fixtureCatalog([fixtureCard('plain'), fixtureCard('keeper', { keywords: ['retain'] })]);
    const sim = makeCardSim({ catalog, hand: ['plain', 'keeper'] });
    sim.run();
    expect(sim.deck?.hand.map((c) => c.cardId)).toEqual(['keeper']);
    expect(sim.deck?.discardPile.map((c) => c.cardId)).toEqual(['plain']);
  });

  it('입력 덱 스냅샷은 시뮬이 바꾸지 않는다', () => {
    const sim = makeCardSim({ hand: ['hold_the_line'] });
    sim.startCombat();
    sim.playCard(1, unit(0));
    // 새 시뮬을 같은 방식으로 만들면 손패에 카드가 그대로 있다
    expect(makeCardSim({ hand: ['hold_the_line'] }).deck?.hand).toHaveLength(1);
  });
});

describe('사용 실패: 사유를 돌려주고 CP·카드·로그는 그대로', () => {
  /** 실패를 확인하고 아무 것도 변하지 않았는지 검사한다 */
  function expectRejected(
    options: Parameters<typeof makeCardSim>[0],
    act: (sim: ReturnType<typeof makeCardSim>) => ReturnType<ReturnType<typeof makeCardSim>['playCard']>,
    reasonPart: string,
    prepare: (sim: ReturnType<typeof makeCardSim>) => void = (sim) => sim.startCombat(),
  ) {
    const sim = makeCardSim(options);
    prepare(sim);
    const events = sim.events.length;
    const cp = sim.commandPoints?.combat;
    const prep = sim.commandPoints?.prep;
    const hand = sim.deck?.hand.length;
    const result = act(sim);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reasonPart);
    expect(sim.events.length).toBe(events);
    expect(sim.commandPoints?.combat).toBe(cp);
    expect(sim.commandPoints?.prep).toBe(prep);
    expect(sim.deck?.hand.length).toBe(hand);
    expect(sim.commandLog).toHaveLength(0);
  }

  it('손패에 없는 카드', () => {
    expectRejected({ hand: ['hold_the_line'] }, (s) => s.playCard(99, unit(0)), '손패에 없는');
  });

  it('작전 카드는 전투 중에 쓸 수 없다', () => {
    expectRejected({ hand: ['war_drums'] }, (s) => s.playCard(1, NONE), '준비 단계에서만');
  });

  it('명령 카드는 준비 단계에 쓸 수 없다', () => {
    expectRejected({ hand: ['charge_signal'] }, (s) => s.playCard(1, NONE), '전투 중에만', () => {});
  });

  it('전투가 끝난 뒤에는 쓸 수 없다', () => {
    const catalog = fixtureCatalog([fixtureCard('keeper', { keywords: ['retain'] })]);
    const sim = makeCardSim({ catalog, hand: ['keeper'] });
    sim.run();
    const result = sim.playCard(1, NONE);
    expect(result).toEqual({ ok: false, reason: '전투가 이미 끝났습니다' });
  });

  it('CP 부족', () => {
    const sim = makeCardSim({ hand: ['charge_signal', 'hold_the_line'] });
    sim.startCombat();
    expect(sim.playCard(1, NONE).ok).toBe(true); // CP 2 -> 0
    const events = sim.events.length;
    const r = sim.playCard(2, unit(0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('지휘력이 부족합니다 (필요 1, 보유 0)');
    expect(sim.events.length).toBe(events);
    expect(sim.deck?.hand).toHaveLength(1);
    expect(sim.commandPoints?.combat).toBe(0);
  });

  it('준비 CP 부족 (작전 카드 2장, 비용 1 + 비용 2 짜리 픽스처)', () => {
    const catalog = fixtureCatalog([
      fixtureCard('op1', { type: 'operation', cost: 1 }),
      fixtureCard('op2', { type: 'operation', cost: 2 }),
    ]);
    const sim = makeCardSim({ catalog, hand: ['op1', 'op2'] });
    expect(sim.playCard(1, NONE).ok).toBe(true);
    const r = sim.playCard(2, NONE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('준비 단계 작전 CP가 부족');
    expect(sim.commandPoints?.prep).toBe(1);
  });

  it('대상 종류 불일치 / 대상 필요', () => {
    expectRejected({ hand: ['hold_the_line'] }, (s) => s.playCard(1, NONE), '유닛 1명을 대상으로');
    expectRejected({ hand: ['hold_the_line'] }, (s) => s.playCard(1, units(0)), '유닛 1명을 대상으로');
    expectRejected({ hand: ['charge_signal'] }, (s) => s.playCard(1, unit(0)), '대상을 지정할 수 없');
    expectRejected({ hand: ['formation_swap'] }, (s) => s.playCard(1, unit(0)), '여러 명');
  });

  it('존재하지 않는 유닛 / 쓰러진 유닛', () => {
    expectRejected({ hand: ['hold_the_line'] }, (s) => s.playCard(1, unit(77)), '존재하지 않는 유닛');
    expectRejected(
      { hand: ['hold_the_line'] },
      (s) => s.playCard(1, unit(0)),
      '쓰러진',
      (s) => {
        s.startCombat();
        s.world.dealDamage({ source: null, target: unitOf(s, 0), raw: 99999, type: 'physical' });
      },
    );
  });

  it('진영 불일치: 아군 카드에 적, 적 카드에 아군', () => {
    expectRejected({ hand: ['hold_the_line'] }, (s) => s.playCard(1, unit(3)), '아군 유닛만');
    expectRejected({ hand: ['focus_fire'] }, (s) => s.playCard(1, unit(0)), '적 유닛만');
  });

  it('allyUnits: 수가 다르거나 중복', () => {
    expectRejected({ hand: ['formation_swap'] }, (s) => s.playCard(1, units(0)), '2명을 지정');
    expectRejected({ hand: ['formation_swap'] }, (s) => s.playCard(1, units(0, 0)), '중복');
    expectRejected({ hand: ['formation_swap'] }, (s) => s.playCard(1, units(0, 3)), '아군 유닛만');
  });

  it('perCombat 제한: 같은 카드 id는 전투당 1회 (두 번째 장도 불가)', () => {
    const sim = makeCardSim({ hand: ['formation_swap', 'formation_swap'] });
    sim.startCombat();
    expect(sim.playCard(1, units(0, 1)).ok).toBe(true);
    const events = sim.events.length;
    const r = sim.playCard(2, units(0, 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('전투당 1회');
    expect(sim.events.length).toBe(events);
    expect(sim.deck?.hand).toHaveLength(1);
  });

  it('진형 교대: 이동 중인 유닛이 있으면 실패', () => {
    const sim = makeCardSim({ hand: ['formation_swap'] });
    sim.startCombat();
    stepTicks(sim, 1);
    expect(unitOf(sim, 2).moving).not.toBeNull();
    const r = sim.playCard(1, units(2, 0));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('이동 중');
    expect(sim.deck?.hand).toHaveLength(1);
  });

  it('카드 시스템이 없는 전투에서 playCard는 실패', async () => {
    const { makeSim } = await import('./testSupport');
    const sim = makeSim([['iron_shieldbearer', 1, 3, 2]], [['iron_shieldbearer', 1, 4, 2]]);
    expect(sim.playCard(1, NONE)).toEqual({ ok: false, reason: '카드 시스템이 없는 전투입니다' });
  });
});

describe('칸·범위 대상', () => {
  const catalog = fixtureCatalog([
    fixtureCard('area_blast', {
      type: 'spell',
      cost: 1,
      target: { kind: 'area3x3' },
      effects: [{ kind: 'flatDamage', selector: 'enemiesInTargetArea', amount: 100, dmgType: 'magic' }],
    }),
    fixtureCard('single_cell', {
      type: 'spell',
      target: { kind: 'cell' },
      effects: [{ kind: 'flatDamage', selector: 'enemiesInTargetArea', amount: 100, dmgType: 'magic' }],
    }),
  ]);

  it('3x3 범위 안의 적에게만 피해', () => {
    const sim = makeCardSim({
      catalog,
      b: [['iron_shieldbearer', 1, 4, 2], ['iron_shieldbearer', 1, 5, 3], ['legion_crossbow', 1, 7, 2]],
      hand: ['area_blast'],
    });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'cell', cell: { col: 5, row: 2 } }).ok).toBe(true);
    expect(unitOf(sim, 3).hp).toBeLessThan(650);
    expect(unitOf(sim, 4).hp).toBeLessThan(650);
    expect(unitOf(sim, 5).hp).toBe(450);
  });

  it('cell 종류는 그 칸만', () => {
    const sim = makeCardSim({ catalog, hand: ['single_cell'] });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'cell', cell: { col: 5, row: 2 } }).ok).toBe(true);
    expect(unitOf(sim, 3).hp).toBe(650);
  });

  it('보드 밖 칸과 잘못된 지정 방식은 실패', () => {
    const sim = makeCardSim({ catalog, hand: ['area_blast'] });
    sim.startCombat();
    const out = sim.playCard(1, { kind: 'cell', cell: { col: 9, row: 0 } });
    expect(out).toEqual({ ok: false, reason: '보드 밖의 칸입니다' });
    const wrong = sim.playCard(1, unit(3));
    expect(wrong.ok).toBe(false);
    expect(sim.deck?.hand).toHaveLength(1);
  });
});

describe('키워드: 공명과 연쇄 (픽스처 카드)', () => {
  const catalog = fixtureCatalog([
    fixtureCard('res_iron', {
      effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'res', amount: 1, duration: 'combat' }],
      resonance: {
        trait: 'iron_legion',
        effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 100, duration: 'combat' }],
      },
      upgrade: {
        text: '강화',
        effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'res', amount: 1, duration: 'combat' }],
        resonance: {
          trait: 'iron_legion',
          effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 200, duration: 'combat' }],
        },
      },
    }),
    fixtureCard('res_ember', {
      effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'res', amount: 1, duration: 'combat' }],
      resonance: {
        trait: 'ember',
        effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 100, duration: 'combat' }],
      },
    }),
    fixtureCard('free', { cost: 0 }),
    fixtureCard('chainer', {
      cost: 0,
      keywords: ['chain'],
      chain: { effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 50, duration: 'combat' }] },
    }),
  ]);

  it('공명: 해당 특성이 활성(단계 1 이상)이면 추가 효과 실행', () => {
    // 기본 편성 아군: 방패병 + 투기장 신병 = 강철군단 2종 (활성)
    const sim = makeCardSim({ catalog, hand: ['res_iron'] });
    sim.startCombat();
    const arm = unitOf(sim, 2).stat('arm');
    sim.playCard(1, NONE);
    expect(unitOf(sim, 2).stat('arm')).toBe(arm + 100);
    expect(unitOf(sim, 2).stat('res')).toBe(15 + 1);
  });

  it('공명: 활성이 아니면 기본 효과만', () => {
    const sim = makeCardSim({ catalog, hand: ['res_ember'] });
    sim.startCombat();
    const arm = unitOf(sim, 2).stat('arm');
    sim.playCard(1, NONE);
    expect(unitOf(sim, 2).stat('arm')).toBe(arm);
    expect(unitOf(sim, 2).stat('res')).toBe(15 + 1);
  });

  it('공명: 단계 1 미만(종류 1개뿐)이면 비활성, 강화 공명은 강화 값 사용', () => {
    const one = makeCardSim({ catalog, a: [['iron_shieldbearer', 1, 3, 1], ['iron_shieldbearer', 1, 3, 3]], hand: ['res_iron'] });
    one.startCombat();
    const arm = unitOf(one, 0).stat('arm');
    one.playCard(1, NONE);
    expect(unitOf(one, 0).stat('arm')).toBe(arm);

    const up = makeCardSim({ catalog, hand: ['res_iron'], upgraded: [1] });
    up.startCombat();
    const base = unitOf(up, 2).stat('arm');
    up.playCard(1, NONE);
    expect(unitOf(up, 2).stat('arm')).toBe(base + 200);
  });

  it('연쇄: 첫 카드로 쓰면 추가 효과 없음', () => {
    const first = makeCardSim({ catalog, hand: ['chainer'] });
    first.startCombat();
    const arm = unitOf(first, 2).stat('arm');
    first.playCard(1, NONE);
    expect(unitOf(first, 2).stat('arm')).toBe(arm);

  });

  it('연쇄: 앞선 카드 뒤에 쓰면 추가 효과', () => {
    const sim = makeCardSim({ catalog, hand: ['free', 'chainer'] });
    sim.startCombat();
    const base = unitOf(sim, 2).stat('arm');
    sim.playCard(1, NONE); // free
    sim.playCard(2, NONE); // chainer
    expect(unitOf(sim, 2).stat('arm')).toBe(base + 50);
  });

  it('준비 단계에 쓴 작전 카드도 "앞서 쓴 카드"로 친다', () => {
    const cat = fixtureCatalog([
      fixtureCard('opener', { type: 'operation', cost: 0 }),
      fixtureCard('chainer', {
        cost: 0,
        keywords: ['chain'],
        chain: { effects: [{ kind: 'statAdd', selector: 'allAllies', stat: 'arm', amount: 50, duration: 'combat' }] },
      }),
    ]);
    const sim = makeCardSim({ catalog: cat, hand: ['opener', 'chainer'] });
    expect(sim.playCard(1, NONE).ok).toBe(true);
    sim.startCombat();
    const base = unitOf(sim, 2).stat('arm');
    sim.playCard(2, NONE);
    expect(unitOf(sim, 2).stat('arm')).toBe(base + 50);
  });
});

describe('실제 카드 데이터', () => {
  it('cards.json 108종이 모두 로드된다', () => {
    expect(cardCatalog.size).toBe(108);
  });
});
