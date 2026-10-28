import { describe, expect, it } from 'vitest';
import { CARD_A, CARD_B, cardCatalog, commanders, formation, traits, units } from '../../core/combat/testSupport';
import { BattleSession } from './BattleSession';

function newSession(commanderId: string | null): BattleSession {
  const s = new BattleSession(units, traits, [formation(CARD_A), formation(CARD_B)], { cards: cardCatalog, commanders });
  s.setCommander(commanderId);
  return s;
}

/** 게이지를 가득 채운다 (카드 사용 트리거를 흉내 낸다. 세션의 실제 사용 경로는 그대로 쓴다) */
function fillGauge(s: BattleSession): void {
  const live = (s as unknown as { live: { sim: { world: { bus: { emit(type: 'onCardPlay', p: { cardId: string; instanceId: number }): void } } } } }).live;
  for (let i = 0; i < 8; i++) live.sim.world.bus.emit('onCardPlay', { cardId: 'test', instanceId: 0 });
}

describe('BattleSession 궁극기', () => {
  it('지휘관마다 손패 패널에 궁극기 이름과 게이지 0이 표시된다 (준비 단계: 쓸 수 없음)', () => {
    for (const [id, name] of [['cmd_harten', '불굴의 방진'], ['cmd_isera', '대분화'], ['cmd_nox', '대가 지불']] as const) {
      const s = newSession(id);
      const ult = s.cardView().ultimate;
      expect(ult).toMatchObject({ name, charge: 0, max: 100, used: false, ready: false });
      expect(ult?.reason).toBeTruthy();
    }
  });

  it('지휘관이 없으면 카드 UI와 함께 궁극기도 없다', () => {
    expect(newSession(null).cardView().ultimate).toBeNull();
  });

  it('전투 시작 전 사용하면 실패 사유가 토스트로 나오고 상태는 그대로다', () => {
    const s = newSession('cmd_harten');
    const before = s.cardView().toast?.id ?? 0;
    s.useUltimate();
    const toast = s.cardView().toast;
    expect(toast?.id).toBeGreaterThan(before);
    expect(toast?.message).toContain('전투 중에만');
    expect(s.cardView().ultimate?.used).toBe(false);
  });

  it('전투 중 게이지가 차면 사용할 수 있고 사용 후에는 소진 상태가 된다', () => {
    const s = newSession('cmd_harten');
    s.start(1);
    s.advance(0.1);
    expect(s.cardView().ultimate).toMatchObject({ charge: 0, ready: false });
    fillGauge(s);
    expect(s.cardView().ultimate).toMatchObject({ charge: 100, ready: true });
    s.useUltimate();
    expect(s.cardView().ultimate).toMatchObject({ used: true, ready: false });
    // 지속 효과(받는 피해 감소)가 있어 aura가 켜진다
    s.advance(0.2);
    expect(s.ultimateAura()).toMatchObject({ commanderId: 'cmd_harten' });
    s.useUltimate();
    expect(s.cardView().toast?.message).toContain('전투당 1회');
  });

  it('5연전의 "카드 사용 금지" 옵션에서는 궁극기도 막힌다', () => {
    const s = new BattleSession(units, traits, [formation(CARD_A), formation(CARD_B)], {
      cards: cardCatalog,
      commanders,
      seriesStages: [{ name: '약한 적', enemy: formation([['arena_recruit', 1, 4, 2]]) }],
    });
    s.setCommander('cmd_nox');
    s.startSeries(false);
    s.useUltimate();
    expect(s.cardView().toast?.message).toContain('카드 사용 금지');
  });
});
