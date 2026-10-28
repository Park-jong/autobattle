import { describe, expect, it } from 'vitest';
import { damageCommander, grantRelic, newRunAs, runDeps, driveTo, finishBattle, grantGold } from '../../core/run/testSupport';
import { RUN } from '../../core/run';
import { buildCommanderChoices, buildEndView, buildHud, buildRelicView, buildRewardView, buildSettlementView, buildShopView } from './runViews';

const { cards, units, relics } = runDeps;

describe('지휘관 선택 표시 정보', () => {
  const choices = buildCommanderChoices(runDeps.commanders.commanders, cards, units, RUN.START_HP);

  it('3명의 이름·HP·패시브·궁극기·시작 유닛·덱 요약을 만든다', () => {
    expect(choices.map((c) => c.id)).toEqual(['cmd_harten', 'cmd_isera', 'cmd_nox']);
    const isera = choices[1]!;
    expect(isera).toMatchObject({ maxHp: 70, passiveName: '화로의 불씨', ultimateName: '대분화', deckCount: 10 });
    expect(isera.units).toEqual(['잿불 점화사 ×1', '숲 궁수 ×1']);
    expect(isera.deck).toContain('불씨 화살 ×3');
    expect(isera.unlock).toBe('런 1회 완료 (승패 무관)');
    expect(choices[0]!.unlock).toBeNull();
    expect(choices[2]!).toMatchObject({ maxHp: 65, ultimateName: '대가 지불', units: ['그림자 단검 ×2'] });
  });
});

describe('유물 표시 정보', () => {
  it('유물 보기: 이름 첫 글자 아이콘, 희귀도 라벨, 설명', () => {
    expect(buildRelicView(relics.get('old_baton')!)).toEqual({
      id: 'old_baton', name: '낡은 지휘봉', icon: '낡', rarity: 'common', rarityLabel: '일반', text: '전투 시작 CP +1.',
    });
    expect(buildRelicView(relics.get('rift_heart')!).rarityLabel).toBe('보스');
  });

  it('HUD에 보유 유물이 획득 순서대로 나온다', () => {
    const run = newRunAs('cmd_nox', 1);
    expect(buildHud(run).relics).toEqual([]);
    grantRelic(run, 'blood_ledger');
    grantRelic(run, 'old_baton');
    expect(buildHud(run).relics.map((r) => r.name)).toEqual(['피의 장부', '낡은 지휘봉']);
  });

  it('정예 보상 화면: 유물과 획득 여부, 일반 전투 보상에는 유물 없음', () => {
    const run = newRunAs('cmd_harten', 1);
    driveTo(run, 'elite');
    finishBattle(run, 'win');
    const reward = buildRewardView(run, cards, relics);
    expect(reward.source).toBe('elite');
    expect(reward.relic).not.toBeNull();
    expect(reward.relicClaimed).toBe(false);
    run.claimRelic();
    expect(buildRewardView(run, cards, relics).relicClaimed).toBe(true);

    const normal = newRunAs('cmd_harten', 1);
    normal.chooseNode(normal.availableNodes()[0]!.id);
    finishBattle(normal, 'win');
    expect(buildRewardView(normal, cards, relics).relic).toBeNull();
  });

  it('상점 화면: 유물 진열 가격·구매 가능 여부·판매 완료', () => {
    const run = newRunAs('cmd_harten', 5);
    driveTo(run, 'shop');
    const poor = buildShopView(run.shopView()!, 0, cards, relics);
    expect(poor.relics).toHaveLength(2);
    expect(poor.relics.every((r) => !r.affordable && r.reason === '골드가 부족합니다')).toBe(true);
    grantGold(run, 100);
    run.buyShopRelic(0);
    const after = buildShopView(run.shopView()!, run.gold, cards, relics);
    expect(after.relics[0]).toMatchObject({ sold: true, affordable: false, reason: '구매 완료' });
    expect(after.relics[1]!.affordable).toBe(true);
  });

  it('전투 결과: 유물 보너스·패시브 골드·HP 회복이 줄에 나온다', () => {
    const run = newRunAs('cmd_nox', 2);
    grantRelic(run, 'loot_sack');
    grantRelic(run, 'iron_heart');
    damageCommander(run, 10);
    run.chooseNode(run.availableNodes()[0]!.id);
    const settle = finishBattle(run, 'win');
    expect(settle.ok).toBe(true);
    if (!settle.ok) return;
    const view = buildSettlementView(settle.settlement);
    expect(view.goldLine).toContain('+ 유물 2G');
    expect(view.goldLine).toContain('지휘관 패시브 +2G');
    expect(view.hpLines).toContain('유물 효과로 지휘관 HP +2');
  });

  it('종료 화면: 보유 유물, 보스 처치 시 보스 유물 후보', () => {
    const win = newRunAs('cmd_isera', 12);
    driveTo(win, 'boss');
    finishBattle(win, 'win');
    const end = buildEndView(win, cards, units, relics);
    expect(end).toMatchObject({ outcome: 'victory', commanderId: 'cmd_isera' });
    expect(end.bossRelicOffer).toHaveLength(3);
    expect(end.bossRelicOffer.every((r) => r.rarity === 'boss')).toBe(true);
  });
});
