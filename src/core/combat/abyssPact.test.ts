import { describe, expect, it } from 'vitest';
import { CombatSimulator } from './sim';
import { cardCatalog, cpEvents, eventsOf, formation, handSnapshot, traits, units, type Placement } from './testSupport';

const ABYSS_ALLY: readonly Placement[] = [['shade_dagger', 1, 3, 1], ['abyss_whisperer', 1, 3, 3]]; // 심연 2종 → 공명 활성
const PLAIN_ALLY: readonly Placement[] = [['iron_shieldbearer', 1, 3, 1], ['arena_recruit', 1, 3, 3]];
const ENEMY: readonly Placement[] = [['iron_shieldbearer', 3, 4, 2]];

function make(ally: readonly Placement[], opts: { hand?: readonly string[]; upgraded?: readonly number[]; commanderHp?: number } = {}): CombatSimulator {
  return new CombatSimulator(
    {
      seed: 1,
      formations: [formation(ally), formation(ENEMY)],
      cards: {
        commander: null,
        deck: handSnapshot(opts.hand ?? ['abyss_pact'], opts.upgraded),
        ...(opts.commanderHp === undefined ? {} : { commanderHp: opts.commanderHp }),
      },
    },
    units, traits, cardCatalog,
  );
}

describe('심연의 계약 (0CP 명령, 지휘관 HP 3 → CP +2)', () => {
  it('카드 데이터: 0CP 명령, HP 비용 3, 심연 공명이면 면제, 전투당 2회', () => {
    const card = cardCatalog.get('abyss_pact')!;
    expect(card).toMatchObject({ type: 'command', cost: 0, commanderHpCost: { amount: 3, waivedByTrait: 'abyss' }, limits: { perCombat: 2 } });
    expect(card.effects).toEqual([{ kind: 'cpGain', selector: 'allAllies', amount: 2 }]);
  });

  it('지휘관 HP를 3 잃는다는 사실을 commanderHp 이벤트로 남기고 CP를 2 얻는다', () => {
    const sim = make(PLAIN_ALLY, { commanderHp: 20 });
    sim.startCombat();
    expect(sim.commandPoints?.combat).toBe(2);
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
    expect(eventsOf(sim, 'commanderHp')).toEqual([{ type: 'commanderHp', t: 0, delta: -3, remaining: 17, cardId: 'abyss_pact', instanceId: 1 }]);
    expect(sim.commanderHpSpent).toBe(3);
    expect(sim.commandPoints?.combat).toBe(4);
    expect(cpEvents(sim).at(-1)).toMatchObject({ pool: 'combat', delta: 2, cp: 4, reason: 'effect' });
  });

  it('CP 상한(6)을 넘는 만큼은 얻지 못한다', () => {
    const sim = make(PLAIN_ALLY, { hand: ['abyss_pact', 'abyss_pact', 'abyss_pact'], commanderHp: 50 });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
    expect(sim.playCard(2, { kind: 'none' }).ok).toBe(true);
    expect(sim.commandPoints?.combat).toBe(6);
    const last = cpEvents(sim).at(-1);
    expect(last).toMatchObject({ delta: 2, cp: 6 });
    // 전투당 2회 제한
    const third = sim.playCard(3, { kind: 'none' });
    expect(third.ok).toBe(false);
  });

  it('사용 후 지휘관 HP가 1 이상 남아야 한다 (HP 3이면 불가, 4면 가능)', () => {
    const low = make(PLAIN_ALLY, { commanderHp: 3 });
    low.startCombat();
    const result = low.playCard(1, { kind: 'none' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('지휘관 HP가 부족합니다');
    expect(eventsOf(low, 'commanderHp')).toHaveLength(0);
    expect(low.deck?.hand).toHaveLength(1); // 실패하면 카드·CP·로그 그대로
    expect(low.commandPoints?.combat).toBe(2);

    const ok = make(PLAIN_ALLY, { commanderHp: 4 });
    ok.startCombat();
    expect(ok.playCard(1, { kind: 'none' }).ok).toBe(true);
    expect(eventsOf(ok, 'commanderHp')[0]?.remaining).toBe(1);
  });

  it('여러 번 쓰면 남은 HP를 누적해서 따진다', () => {
    const sim = make(PLAIN_ALLY, { hand: ['abyss_pact', 'abyss_pact'], commanderHp: 6 });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true); // 6 → 3
    expect(sim.playCard(2, { kind: 'none' }).ok).toBe(false); // 3 → 0 불가
    expect(sim.commanderHpSpent).toBe(3);
  });

  it('공명 [심연]이 활성이면 HP 손실 없이 CP를 얻는다', () => {
    const sim = make(ABYSS_ALLY, { commanderHp: 2 });
    sim.startCombat();
    expect(sim.activeTraits[0].some((t) => t.traitId === 'abyss' && t.tier >= 1)).toBe(true);
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true); // HP 2여도 면제라 사용 가능
    expect(eventsOf(sim, 'commanderHp')).toHaveLength(0);
    expect(sim.commanderHpSpent).toBe(0);
    expect(sim.commandPoints?.combat).toBe(4);
  });

  it('강화 버전은 CP +3이다', () => {
    const sim = make(PLAIN_ALLY, { upgraded: [1], commanderHp: 20 });
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
    expect(sim.commandPoints?.combat).toBe(5);
  });

  it('commanderHp를 주지 않는 전투(디버그)에서는 HP 제한 없이 쓸 수 있다', () => {
    const sim = make(PLAIN_ALLY);
    sim.startCombat();
    expect(sim.playCard(1, { kind: 'none' }).ok).toBe(true);
    expect(eventsOf(sim, 'commanderHp')).toHaveLength(1);
  });

  it('같은 입력이면 같은 로그가 나온다 (명령 기록으로 재현)', () => {
    const first = make(PLAIN_ALLY, { commanderHp: 20 });
    first.startCombat();
    first.playCard(1, { kind: 'none' });
    first.runUntil(200);
    const replay = new CombatSimulator(
      { seed: 1, formations: [formation(PLAIN_ALLY), formation(ENEMY)], cards: { commander: null, deck: handSnapshot(['abyss_pact']), commanderHp: 20, commands: first.commandLog } },
      units, traits, cardCatalog,
    );
    replay.runUntil(200);
    expect(JSON.stringify(replay.events)).toBe(JSON.stringify(first.events));
  });
});
