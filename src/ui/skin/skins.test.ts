import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import unitsJson from '../../../data/units.json';
import { ACADEMY_ART_CODES, DEFAULT_SKIN, SKINS, isSkinId, skinArtList, unitArtUrl, unitTextureKey } from './skins';
import { SKIN_PREF_KEY, SkinStore } from './SkinStore';
import type { StorageLike } from '../run/RunStorage';

class MapStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
}

describe('스킨 정의', () => {
  it('기본·아카데미 두 스킨이 있고 기본값은 default', () => {
    expect(SKINS.map((s) => s.id)).toEqual(['default', 'academy']);
    expect(DEFAULT_SKIN).toBe('default');
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

  it('상점 유닛 30종 모두 원화가 있고 보스 전용 유닛은 없다', () => {
    const units = (unitsJson as { units: { id: string; boss?: unknown }[] }).units;
    for (const unit of units) {
      if (unit.boss) expect(ACADEMY_ART_CODES[unit.id], unit.id).toBeUndefined();
      else expect(ACADEMY_ART_CODES[unit.id], unit.id).toBeDefined();
    }
  });

  it('축소 원화 파일(public/skins/academy)이 30종 × 2종류 모두 있다', () => {
    for (const code of Object.values(ACADEMY_ART_CODES)) {
      for (const kind of ['sd', 'portrait']) {
        expect(existsSync(new URL(`../../../public/skins/academy/${kind}/${code}.png`, import.meta.url)), `${kind}/${code}`).toBe(true);
      }
    }
  });

  it('기본 스킨·원화 없는 유닛은 URL·텍스처 키가 없다', () => {
    expect(unitArtUrl('default', 'iron_shieldbearer', 'sd')).toBeNull();
    expect(unitArtUrl('academy', 'gate_breaker', 'sd')).toBeNull();
    expect(unitTextureKey('default', 'iron_shieldbearer', 'sd')).toBeNull();
    expect(skinArtList('default', 'sd')).toEqual([]);
  });

  it('아카데미 스킨 URL은 base 기준 상대 경로', () => {
    expect(unitArtUrl('academy', 'iron_shieldbearer', 'sd', './')).toBe('./skins/academy/sd/U01.png');
    expect(unitArtUrl('academy', 'elder_treeking', 'portrait', '/')).toBe('/skins/academy/portrait/U30.png');
    const list = skinArtList('academy', 'sd', './');
    expect(list).toHaveLength(30);
    expect(new Set(list.map((a) => a.key)).size).toBe(30);
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
    expect(new SkinStore(() => storage).current).toBe('default');
    const broken: StorageLike = {
      getItem: () => { throw new Error('막힘'); },
      setItem: () => { throw new Error('막힘'); },
      removeItem: () => undefined,
    };
    const store = new SkinStore(() => broken);
    expect(store.current).toBe('default');
    store.set('academy');
    expect(store.current).toBe('academy');
    expect(new SkinStore(() => undefined).current).toBe('default');
  });
});
