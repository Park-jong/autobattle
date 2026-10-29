import { describe, expect, it } from 'vitest';
import { RunController } from './index';
import { ContentMigrations } from './contentMigration';
import fixture from './runSaveV3M54A.fixture.json';
import { newRun, newRunAs, runDeps } from './testSupport';
import { fixtureCard, fixtureCatalog } from '../cards/testSupport';
import migrationsJson from '../../../data/migrations.json';

const refs = { cards: runDeps.cards, relics: runDeps.relics, commanders: runDeps.commanders };
const load = (migrations: unknown[]) => ContentMigrations.load({ version: 1, migrations }, refs);
const errorOf = (migrations: unknown[]): string => {
  try { load(migrations); } catch (e) { return (e as Error).message; }
  throw new Error('에러가 발생해야 함');
};

const card = (instanceId: number, cardId: string, upgraded = false) => ({ instanceId, cardId, upgraded });
const fakeSave = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  commanderId: 'cmd_harten',
  forces: {
    economy: { balance: 10 },
    carryDeck: { draw: [card(1, 'old_a'), card(2, 'hold_the_line')], hand: [card(3, 'old_a', true)], discard: [], exhaust: [] },
  },
  relics: { owned: ['field_tent'] },
  session: null,
  ...over,
});
const ids = (save: unknown, pile: string): string[] =>
  ((save as { forces: { carryDeck: Record<string, { cardId: string }[]> } }).forces.carryDeck[pile] ?? []).map((c) => c.cardId);

describe('콘텐츠 마이그레이션: 데이터 검증', () => {
  it('실제 data/migrations.json이 검증을 통과하고 현재 버전이 1이다', () => {
    const migrations = ContentMigrations.load(migrationsJson, refs);
    expect(migrations.current).toBe(1);
  });

  it('버전은 1부터 빠짐없이 이어져야 한다', () => {
    const step = { op: 'replaceCard', from: 'a', to: 'forged_blade' };
    expect(errorOf([{ to: 2, note: 'x', steps: [step] }])).toContain('migrations[0].to: 1부터 빠짐없이');
    expect(errorOf([{ to: 1, note: 'x', steps: [step] }, { to: 3, note: 'y', steps: [step] }])).toContain('migrations[1].to');
  });

  it('알 수 없는 op·필드·존재하지 않는 대상 카드는 경로가 담긴 오류', () => {
    expect(errorOf([{ to: 1, note: 'x', steps: [{ op: 'explode' }] }])).toContain('migrations[0].steps[0].op: 알 수 없는 값');
    expect(errorOf([{ to: 1, note: 'x', steps: [{ op: 'replaceCard', from: 'a', to: 'ghost' }] }])).toContain('steps[0].to: cards.json에 없는 카드 "ghost"');
    expect(errorOf([{ to: 1, note: 'x', steps: [{ op: 'replaceCard', from: 'forged_blade', to: 'forged_blade' }] }])).toContain('from과 같을 수 없음');
    expect(errorOf([{ to: 1, note: 'x', steps: [{ op: 'replaceCard', from: 'a', to: 'forged_blade', extra: 1 }] }])).toContain('알 수 없는 필드');
    expect(errorOf([{ to: 1, note: 'x', steps: [{ op: 'replaceCard', from: 'a', to: 'forged_blade', unlessCommander: 'cmd_ghost' }] }])).toContain('unlessCommander');
    expect(errorOf([{ to: 1, note: 'x', steps: [] }])).toContain('단계가 최소 1개');
  });

  it('removeCard: replaceWith·refundGold·shopFallback 조합 규칙', () => {
    const bad = (step: Record<string, unknown>) => errorOf([{ to: 1, note: 'x', steps: [{ op: 'removeCard', cardId: 'old', ...step }] }]);
    expect(bad({})).toContain('shopFallback: replaceWith가 없으면 필요함');
    expect(bad({ replaceWith: 'forged_blade', refundGold: 5 })).toContain('함께 쓸 수 없음');
    expect(bad({ replaceWith: 'forged_blade', shopFallback: 'vine_snare' })).toContain('필요 없음');
    expect(bad({ shopFallback: 'hold_the_line' })).toContain('상점에 진열할 수 있는 희귀도');
    expect(() => load([{ to: 1, note: 'x', steps: [{ op: 'removeCard', cardId: 'old', refundGold: 5, shopFallback: 'vine_snare' }] }])).not.toThrow();
  });
});

describe('콘텐츠 마이그레이션: 적용', () => {
  const m1 = { to: 1, note: '1차', steps: [{ op: 'replaceCard', from: 'old_a', to: 'forged_blade' }] };
  const m2 = { to: 2, note: '2차', steps: [{ op: 'replaceCard', from: 'forged_blade', to: 'vine_snare' }, { op: 'removeRelic', relicId: 'field_tent', refundGold: 7 }] };

  it('버전이 낮은 저장본에 순서대로 적용되고 contentVersion이 올라간다 (체인: old_a → forged_blade → vine_snare)', () => {
    const migrations = load([m1, m2]);
    const { data, notices } = migrations.migrate(fakeSave());
    expect(ids(data, 'draw')).toEqual(['vine_snare', 'hold_the_line']);
    expect(ids(data, 'hand')).toEqual(['vine_snare']);
    expect((data as { contentVersion: number }).contentVersion).toBe(2);
    expect((data as { relics: { owned: string[] } }).relics.owned).toEqual([]);
    expect((data as { forces: { economy: { balance: number } } }).forces.economy.balance).toBe(17);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain('1차');
    expect(notices[1]).toContain('7G 환불');
  });

  it('이미 일부 적용된 저장본은 그 뒤 것만 적용한다', () => {
    const migrations = load([m1, m2]);
    const { data } = migrations.migrate(fakeSave({ contentVersion: 1 }));
    expect(ids(data, 'draw')).toEqual(['old_a', 'hold_the_line']); // 1차는 건너뜀
  });

  it('원본을 바꾸지 않고, 현재 버전이면 그대로 돌려주며 알림이 없다', () => {
    const migrations = load([m1]);
    const save = fakeSave();
    const before = JSON.stringify(save);
    migrations.migrate(save);
    expect(JSON.stringify(save)).toBe(before);
    const current = fakeSave({ contentVersion: 1 });
    expect(migrations.migrate(current)).toEqual({ data: current, notices: [] });
  });

  it('더 새로운 콘텐츠 버전의 저장본은 한국어 오류로 거부한다', () => {
    expect(() => load([m1]).migrate(fakeSave({ contentVersion: 2 }))).toThrow('run.contentVersion: 이 저장본은 더 새로운 콘텐츠 버전(2)');
    expect(() => load([m1]).migrate(fakeSave({ contentVersion: -1 }))).toThrow('contentVersion');
  });

  it('강화 카드가 강화 버전 없는 카드로 바뀌면 강화 표시를 뗀다, unlessCommander는 건너뛴다', () => {
    // 강화 버전이 없는 카드('plain')가 있는 임시 카탈로그
    const cards = fixtureCatalog([fixtureCard('plain')]);
    const migrations = ContentMigrations.load(
      { version: 1, migrations: [{ to: 1, note: 'n', steps: [{ op: 'replaceCard', from: 'old_a', to: 'plain', unlessCommander: 'cmd_isera' }] }] },
      { ...refs, cards },
    );
    const { data } = migrations.migrate(fakeSave());
    expect((data as { forces: { carryDeck: { hand: { upgraded: boolean }[] } } }).forces.carryDeck.hand[0]?.upgraded).toBe(false);
    expect(ids(migrations.migrate(fakeSave({ commanderId: 'cmd_isera' })).data, 'draw')).toEqual(['old_a', 'hold_the_line']);
  });

  it('카드 제거: 진열은 shopFallback으로, 보상 목록에서는 빠지고, 골드는 장수만큼 환불', () => {
    const migrations = load([{ to: 1, note: '삭제', steps: [{ op: 'removeCard', cardId: 'old_a', refundGold: 4, shopFallback: 'forged_blade' }] }]);
    const shop = migrations.migrate(fakeSave({ session: { kind: 'shop', cards: [{ cardId: 'old_a', price: 8, sold: false }], relics: [] } }));
    const slot = (shop.data as { session: { cards: { cardId: string; price: number }[] } }).session.cards[0]!;
    expect(slot).toMatchObject({ cardId: 'forged_blade', price: 8 });
    expect((shop.data as { forces: { economy: { balance: number } } }).forces.economy.balance).toBe(18); // 2장 × 4G
    const reward = migrations.migrate(fakeSave({ session: { kind: 'reward', offer: ['old_a', 'firestorm'], relic: null } }));
    expect((reward.data as { session: { offer: string[] } }).session.offer).toEqual(['firestorm']);
  });

  it('유물 교체: 보유·상점·보상', () => {
    const migrations = load([{ to: 1, note: '유물', steps: [{ op: 'replaceRelic', from: 'field_tent', to: 'merchants_scale' }] }]);
    const { data } = migrations.migrate(fakeSave({ session: { kind: 'shop', cards: [], relics: [{ relicId: 'field_tent', price: 18, sold: false }] } }));
    expect((data as { relics: { owned: string[] } }).relics.owned).toEqual(['merchants_scale']);
    expect((data as { session: { relics: { relicId: string }[] } }).session.relics[0]?.relicId).toBe('merchants_scale');
  });
});

describe('콘텐츠 마이그레이션: 저장본 복원 (불씨 화살 전환, HEAD a9cdf4f에서 만든 저장본)', () => {
  const saves = fixture as unknown as Record<'reward' | 'deck' | 'shop', Record<string, unknown>>;
  const deckIds = (run: RunController): string[] => {
    const d = (run.serialize() as unknown as { forces: { carryDeck: Record<string, { cardId: string }[]> } }).forces.carryDeck;
    return ['draw', 'hand', 'discard', 'exhaust'].flatMap((p) => (d[p] ?? []).map((c) => c.cardId));
  };

  it('픽스처: contentVersion이 없고 하르텐/녹스 저장본에 불씨 화살이 들어 있다', () => {
    for (const save of Object.values(saves)) expect(save).not.toHaveProperty('contentVersion');
    expect(JSON.stringify(saves.deck)).toContain('ember_arrow');
  });

  it('하르텐 덱의 불씨 화살은 덩굴 속박으로 바뀌고 알림이 생긴다', () => {
    const run = RunController.restore(runDeps, saves.deck);
    expect(deckIds(run)).not.toContain('ember_arrow');
    expect(deckIds(run)).toContain('vine_snare');
    expect(run.contentNotices).toHaveLength(1);
    expect(run.contentNotices[0]).toContain("'불씨 화살' 1장을 '덩굴 속박'(으)로 교체");
  });

  it('보상 제시 목록(하르텐)과 상점 진열(녹스)도 고쳐져 복원된다 (진열 가격은 새 카드 기준)', () => {
    const reward = RunController.restore(runDeps, saves.reward);
    expect(reward.rewardOffer()).not.toContain('ember_arrow');
    expect(reward.rewardOffer()).toContain('vine_snare');
    const shop = RunController.restore(runDeps, saves.shop);
    expect(shop.shopView()?.cards.map((c) => c.cardId)).not.toContain('ember_arrow');
    expect(shop.contentNotices.length).toBeGreaterThan(0);
  });

  it('고친 저장본을 다시 저장하면 contentVersion이 기록되고 알림 없이 그대로 복원된다', () => {
    const saved = JSON.parse(JSON.stringify(RunController.restore(runDeps, saves.deck).serialize()));
    expect(saved.contentVersion).toBe(runDeps.migrations.current);
    const again = RunController.restore(runDeps, saved);
    expect(again.contentNotices).toEqual([]);
    expect(JSON.parse(JSON.stringify(again.serialize()))).toEqual(saved);
  });

  it('이세라의 불씨 화살은 그대로 둔다 (진열 칸의 불씨 화살만 제외)', () => {
    const isera = newRunAs('cmd_isera', 3);
    const save = JSON.parse(JSON.stringify(isera.serialize()));
    delete save.contentVersion;
    const restored = RunController.restore(runDeps, save);
    expect(deckIds(restored).filter((id) => id === 'ember_arrow')).toHaveLength(3);
    expect(restored.contentNotices).toEqual([]);
  });

  it('새 런의 저장본에는 contentVersion이 있고, 미래 버전은 거부한다', () => {
    const save = JSON.parse(JSON.stringify(newRun(2).serialize()));
    expect(save.contentVersion).toBe(1);
    save.contentVersion = 2;
    expect(() => RunController.restore(runDeps, save)).toThrow(/contentVersion/);
  });

  it('마이그레이션이 없던 때의 불일치(다른 지휘관 고유 카드)는 여전히 경로가 담긴 오류로 거부한다', () => {
    const save = JSON.parse(JSON.stringify(newRun(2).serialize()));
    save.forces.carryDeck.draw[0].cardId = 'blood_price';
    expect(() => RunController.restore(runDeps, save)).toThrow(/forces\.carryDeck\.draw\[0\]\.cardId.*다른 지휘관의 고유 카드/);
  });
});
