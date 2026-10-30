import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import unitsJson from '../../../data/units.json';
import cardsJson from '../../../data/cards.json';
import { ACADEMY_ART_CODES, ACADEMY_UNIT_NAMES, COMMANDER_ART_CODES, DEFAULT_SKIN, SKINS, cardArtUrl, commanderArtUrl, isSkinId, neutralCardArtUnit, skinArtList, unitArtUrl, unitTextureKey, unitSkinName } from './skins';
import { SKIN_PREF_KEY, SkinStore } from './SkinStore';
import type { StorageLike } from '../run/RunStorage';

class MapStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

describe('스킨 정의', () => {
  it('기본·아카데미·현대전 스킨이 있고 기본값은 academy', () => {
    expect(SKINS.map((s) => s.id)).toEqual(['default', 'academy', 'modern']);
    expect(DEFAULT_SKIN).toBe('academy');
    expect(isSkinId('academy')).toBe(true);
    expect(isSkinId('neon')).toBe(false);
  });

  it('원화 번호 대응이 CHARACTERS.md 4장 표(U01~U30)와 같다', () => {
    const markdown = readFileSync(new URL('../../../CHARACTERS.md', import.meta.url), 'utf8');
    const rows = markdown.split(/\r?\n/)
      .map((line) => line.match(/^\| (U\d\d) \| .+? \| (\w+) \| \d \|/))
      .filter((m): m is RegExpMatchArray => m !== null);
    expect(rows).toHaveLength(30);
    expect(Object.fromEntries(rows.map((m) => [m[2], m[1]]))).toEqual(ACADEMY_ART_CODES);
  });

  it('상점 원화 매핑에는 일반 유닛 30종만 포함하고 보스는 별도로 관리한다', () => {
    const units = (unitsJson as { units: { id: string; boss?: unknown }[] }).units;
    for (const unit of units) {
      if (unit.boss) expect(ACADEMY_ART_CODES[unit.id], unit.id).toBeUndefined();
      else expect(ACADEMY_ART_CODES[unit.id], unit.id).toBeDefined();
    }
  });

  it('유닛 30명·지휘관 3명의 전신·초상화·SD 배포 파일이 모두 있다', () => {
    for (const code of [...Object.values(ACADEMY_ART_CODES), ...Object.values(COMMANDER_ART_CODES)]) {
      for (const kind of ['sd', 'portrait', 'illustration']) {
        expect(existsSync(new URL(`../../../public/skins/academy/${kind}/${code}.png`, import.meta.url)), `${kind}/${code}`).toBe(true);
      }
    }
  });

  it('지휘관 원화는 하위 경로 배포와 기본 스킨을 처리한다', () => {
    expect(commanderArtUrl('academy', 'cmd_harten', 'illustration', './')).toBe('./skins/academy/illustration/C01.png');
    expect(commanderArtUrl('academy', 'cmd_nox', 'portrait', '/autobattle/')).toBe('/autobattle/skins/academy/portrait/C03.png');
    expect(commanderArtUrl('default', 'cmd_nox', 'portrait')).toBeNull();
    expect(commanderArtUrl('academy', 'missing', 'portrait')).toBeNull();
  });

  it('화면 이름이 원화 설정 문서와 일치하며 기본 스킨 이름은 유지된다', () => {
    const markdown = readFileSync(new URL('../../../characters/README.md', import.meta.url), 'utf8');
    const rows = [...markdown.matchAll(/\| \[(U\d\d)\]\([^\n]+?\) \| ([^|]+) \|/g)];
    expect(Object.fromEntries(rows.map(m => [m[1], m[2]!.trim()]))).toEqual(ACADEMY_UNIT_NAMES);
    expect(unitSkinName('academy', 'iron_shieldbearer', '방패병')).toBe('리네');
    expect(unitSkinName('default', 'iron_shieldbearer', '방패병')).toBe('방패병');
    expect(unitSkinName('academy', 'gate_breaker', '성문 파괴자')).toBe('봉인문 파괴 골렘');
  });

  it('기본 스킨·원화 없는 유닛은 URL·텍스처 키가 없다', () => {
    expect(unitArtUrl('default', 'iron_shieldbearer', 'sd')).toBeNull();
    expect(unitArtUrl('academy', 'missing', 'sd')).toBeNull();
    expect(unitTextureKey('default', 'iron_shieldbearer', 'sd')).toBeNull();
    expect(skinArtList('default', 'sd')).toEqual([]);
  });

  it('아카데미 스킨 URL은 base 기준 상대 경로', () => {
    expect(unitArtUrl('academy', 'iron_shieldbearer', 'sd', './')).toBe('./skins/academy/sd/U01.png');
    expect(unitArtUrl('academy', 'elder_treeking', 'portrait', '/')).toBe('/skins/academy/portrait/U30.png');
    const list = skinArtList('academy', 'sd', './');
    expect(list).toHaveLength(34);
    expect(new Set(list.map((a) => a.key)).size).toBe(34);
  });
});

describe('SkinStore', () => {
  it('저장된 값을 읽고, 바꾸면 저장·알림한다', () => {
    const storage = new MapStorage();
    storage.setItem(SKIN_PREF_KEY, 'academy');
    const store = new SkinStore(() => storage);
    expect(store.current).toBe('academy');
    const seen: string[] = [];
    const off = store.subscribe((s) => seen.push(s));
    store.set('default');
    store.set('default');
    expect(seen).toEqual(['default']);
    expect(storage.getItem(SKIN_PREF_KEY)).toBe('default');
    off();
    store.set('academy');
    expect(seen).toEqual(['default']);
  });

  it('잘못된 값·저장소 오류는 기본 스킨으로 계속 동작한다', () => {
    const storage = new MapStorage();
    storage.setItem(SKIN_PREF_KEY, 'neon');
    expect(new SkinStore(() => storage).current).toBe('academy');
    const broken: StorageLike = {
      getItem: () => { throw new Error('막힘'); },
      setItem: () => { throw new Error('막힘'); },
      removeItem: () => undefined,
    };
    const store = new SkinStore(() => broken);
    expect(store.current).toBe('academy');
    store.set('academy');
    expect(store.current).toBe('academy');
    expect(new SkinStore(() => undefined).current).toBe('academy');
  });
});

describe('카드 그림 (cardArtUrl)', () => {
  const base = '/b/';
  const card = (over: Partial<{ type: string; text: string; cardId: string; name: string; owner: string }>) => ({ type: 'command', text: '', cardId: 'x', name: 'x', owner: 'neutral', ...over });

  it('지휘관 전용 카드는 그 지휘관 초상화, 스킨마다 다른 폴더', () => {
    expect(cardArtUrlAt('academy', card({ owner: 'cmd_harten' }))).toBe('/b/skins/academy/portrait/C01.png');
    expect(cardArtUrlAt('modern', card({ owner: 'cmd_isera' }))).toBe('/b/skins/modern/portrait/C02.png');
    expect(cardArtUrlAt('academy', card({ owner: 'cmd_nox', type: 'spell', text: '화상 3초' }))).toBe('/b/skins/academy/portrait/C03.png');
    expect(cardArtUrlAt('default', card({ owner: 'cmd_harten' }))).toBeNull();
  });

  it('공용 카드는 설명 테마에 맞는 유닛 묶음에서, 카드 id로 고정해 고른다 (스킨이 바뀌면 같은 코드의 그 스킨 원화)', () => {
    const fire = neutralCardArtUnit(card({ type: 'spell', text: '적 1명에게 화상 4초', cardId: 'n_fire' }));
    expect(['ember_kindler', 'ember_slinger', 'volcano_oracle', 'magma_champion', 'ember_bladedancer']).toContain(fire);
    expect(neutralCardArtUnit(card({ type: 'spell', text: '적 1명에게 화상 4초', cardId: 'n_fire' }))).toBe(fire); // 결정적
    expect(['iron_shieldbearer', 'moss_warden', 'bear_warrior', 'legion_centurion']).toContain(neutralCardArtUnit(card({ text: '아군 전체 보호막' })));
    expect(['void_hierophant', 'abyss_devourer', 'abyss_sentinel']).toContain(neutralCardArtUnit(card({ type: 'curse', text: '보호막' })));
    expect(['ember_smith', 'legion_crossbow', 'iron_shieldbearer']).toContain(neutralCardArtUnit(card({ type: 'equipment', text: '장착한 유닛' })));
    const unit = neutralCardArtUnit(card({ text: '보호막' }));
    expect(cardArtUrlAt('academy', card({ text: '보호막' }))).toBe(`/b/skins/academy/portrait/${ACADEMY_ART_CODES[unit]}.png`);
    expect(cardArtUrlAt('modern', card({ text: '보호막' }))).toBe(`/b/skins/modern/portrait/${ACADEMY_ART_CODES[unit]}.png`);
  });

  it('실제 카드 143종 모두 원화가 있는 초상화를 고른다 (두 스킨)', () => {
    const cards = (cardsJson as unknown as { cards: { id: string; name: string; type: string; text: string; owner: string }[] }).cards;
    for (const skin of ['academy', 'modern'] as const) {
      for (const c of cards) {
        const url = cardArtUrlAt(skin, { ...c, cardId: c.id });
        expect(url, c.id).not.toBeNull();
        expect(existsSync(`public${url!.slice(base.length - 1)}`), `${skin} ${c.id} ${url}`).toBe(true);
      }
    }
  });

  function cardArtUrlAt(skin: 'academy' | 'modern' | 'default', c: Parameters<typeof cardArtUrl>[1]): string | null {
    // 테스트에서는 BASE_URL 대신 고정 접두사로 비교한다
    const url = cardArtUrl(skin, c);
    return url === null ? null : url.replace(/^.*?skins\//, `${base}skins/`);
  }
});
