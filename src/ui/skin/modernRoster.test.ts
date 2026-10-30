import { describe, expect, it } from 'vitest';
import raw from '../../../data/skins/modern.json';
import units from '../../../data/units.json';
import commanders from '../../../data/commanders.json';
import { loadModernRoster, MODERN_COMMANDERS, MODERN_ROSTER, MODERN_UNITS, MODERN_WEAPONS } from './modernRoster';
import { ACADEMY_ART_CODES, COMMANDER_ART_CODES, commanderArtList, commanderArtUrl, commanderTextureKey, isIllustratedSkin, isSkinId, skinArtList, traitSkinName, unitArtUrl, unitSkillName, unitSkinName, unitTextureKey } from './skins';
import { SkinStore, SKIN_PREF_KEY } from './SkinStore';

describe('현대전 대원 설정과 표시 매핑', () => {
  it('기존 상점 유닛 30종과 지휘관 3명을 빠짐없이 같은 ID에 연결한다', () => {
    const shop = (units.units as { id: string; boss?: unknown }[]).filter(u => !u.boss).map(u => u.id).sort();
    expect(Object.keys(MODERN_UNITS).sort()).toEqual(shop);
    expect(Object.keys(MODERN_COMMANDERS).sort()).toEqual(commanders.commanders.map(c => c.id).sort());
    expect(MODERN_ROSTER.characters).toHaveLength(33);
    for (const c of MODERN_ROSTER.characters) {
      expect(c.code).toBe(c.code.startsWith('U') ? ACADEMY_ART_CODES[c.id] : COMMANDER_ART_CODES[c.id]);
      expect(c.gender).toBe('female'); expect(c.age).toBeGreaterThanOrEqual(22);
      expect(MODERN_WEAPONS).toContain(c.weapon);
    }
  });

  it.each(['code', 'id', 'gender', 'age', 'height', 'bustType', 'weapon', 'color', 'bio'] as const)('잘못된 %s 설정은 로드 단계에서 찾는다', field => {
    const copy = structuredClone(raw);
    const row = copy.characters[1]! as unknown as Record<string, unknown>;
    row[field] = ({ code: copy.characters[0]!.code, id: copy.characters[0]!.id, gender: 'male', age: 17, height: 0, bustType: 'unknown', weapon: 'unknown', color: 'blue', bio: '' } as Record<string, unknown>)[field];
    expect(() => loadModernRoster(copy)).toThrow();
  });

  it.each(['small', 'medium', 'large'] as const)('%s 체형 구분을 지원한다', bustType => {
    const copy = structuredClone(raw);
    copy.characters[0]!.bustType = bustType;
    expect(loadModernRoster(copy).characters[0]!.bustType).toBe(bustType);
  });

  it('빠진 대원과 U/C 번호 오기는 허용하지 않는다', () => {
    const missing = structuredClone(raw); missing.characters.pop();
    expect(() => loadModernRoster(missing)).toThrow();
    const mistyped = structuredClone(raw); mistyped.characters[0]!.code = 'U99';
    expect(() => loadModernRoster(mistyped)).toThrow();
  });

  it('기존 스킨과 텍스처를 공유하지 않고 하위 경로에도 배포한다', () => {
    expect(isSkinId('modern')).toBe(true); expect(isIllustratedSkin('modern')).toBe(true);
    expect(unitArtUrl('modern', 'iron_shieldbearer', 'sd', './')).toBe('./skins/modern/sd/U01.png');
    expect(unitArtUrl('modern', 'elder_treeking', 'portrait', '/autobattle/')).toBe('/autobattle/skins/modern/portrait/U30.png');
    expect(commanderArtUrl('modern', 'cmd_nox', 'illustration', './')).toBe('./skins/modern/illustration/C03.png');
    expect(unitTextureKey('modern', 'grove_archer', 'sd')).not.toBe(unitTextureKey('academy', 'grove_archer', 'sd'));
    expect(commanderTextureKey('cmd_harten', 'modern')).not.toBe(commanderTextureKey('cmd_harten', 'academy'));
    expect(skinArtList('modern', 'sd')).toHaveLength(34); expect(commanderArtList('modern')).toHaveLength(3);
    for (const skin of ['academy', 'modern'] as const) {
      const cutins = commanderArtList(skin, '/autobattle/', 'illustration');
      expect(cutins).toHaveLength(3);
      expect(cutins[0]).toEqual({ key: commanderTextureKey('cmd_harten', skin, 'illustration'), url: `/autobattle/skins/${skin}/illustration/C01.png` });
      expect(cutins[0]!.key).not.toBe(commanderTextureKey('cmd_harten', skin));
    }
    expect(commanderArtList('default', '/', 'illustration')).toEqual([]);
    expect(unitArtUrl('modern', 'gate_breaker', 'sd', './')).toBe('./skins/modern/sd/B01.png');
  });

  it('현대전 선택을 저장하고 이름·특성·기술만 바꾼다', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const store = new SkinStore(() => storage); store.set('modern');
    expect(values.get(SKIN_PREF_KEY)).toBe('modern'); expect(new SkinStore(() => storage).current).toBe('modern');
    expect(unitSkinName('modern', 'iron_shieldbearer', '방패병')).toBe('리네');
    expect(unitSkinName('default', 'iron_shieldbearer', '방패병')).toBe('방패병');
    expect(traitSkinName('modern', 'iron_legion', '철군단')).toBe('도시방위대');
    expect(unitSkillName('modern', 'iron_shieldbearer', '원본')).toBe(MODERN_UNITS.iron_shieldbearer!.skillName);
  });
});
