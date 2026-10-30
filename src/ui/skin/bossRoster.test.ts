import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import units from '../../../data/units.json';
import { BOSS_ART_CODES, bossProfile } from './bossRoster';
import { skinArtList, unitArtUrl, unitSkillName, unitSkinName, unitTextureKey } from './skins';

describe('보스 원화 UI 연결', () => {
  it('실제 보스 4종만 B01~B04에 매핑한다', () => {
    expect(Object.keys(BOSS_ART_CODES).sort()).toEqual(units.units.filter(u => 'boss' in u && u.boss).map(u => u.id).sort());
    expect(Object.values(BOSS_ART_CODES)).toEqual(['B01', 'B02', 'B03', 'B04']);
  });

  it.each(['academy', 'modern'] as const)('%s 보스 4종 × 3종 원화가 하위 경로·미리 읽기·배포 PNG에 연결된다', skin => {
    for (const kind of ['sd', 'portrait', 'illustration'] as const) {
      const list = skinArtList(skin, kind, '/autobattle/');
      for (const [id, code] of Object.entries(BOSS_ART_CODES)) {
        const url = `/autobattle/skins/${skin}/${kind}/${code}.png`;
        const key = `skin:${skin}:${kind}:${id}`;
        expect(unitArtUrl(skin, id, kind, '/autobattle/')).toBe(url);
        expect(unitTextureKey(skin, id, kind)).toBe(key);
        expect(list.filter(entry => entry.key === key)).toEqual([{ key, url }]);
        const png = readFileSync(new URL(`../../../public/skins/${skin}/${kind}/${code}.png`, import.meta.url));
        expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        expect(png[25]).toBe(6); // RGBA
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(kind === 'illustration' ? [384, 576] : [256, 256]);
        expect(bossProfile(skin, id)?.bio).toBeTruthy();
        const setting = readFileSync(new URL(`../../../characters/bosses/${skin}/${code}/README.md`, import.meta.url), 'utf8');
        expect(setting).toContain(unitSkinName(skin, id, '원본'));
      }
    }
  });

  it('촉수 군주와 여성 통수관·쌍둥이 안드로이드의 설정과 스킬 이름을 표시한다', () => {
    expect(bossProfile('academy', 'legion_lord')?.role).toBe('심연의 촉수 군주');
    expect(unitSkillName('academy', 'legion_lord', '군주의 칼날')).toBe('군주의 촉수');
    expect(unitSkinName('modern', 'legion_lord', '바르칸')).toBe('최고통수관 바르칸');
    expect(unitSkinName('modern', 'twin_ser', '세르')).toBe('소각 안드로이드 세르');
    expect(unitSkinName('modern', 'twin_mir', '미르')).toBe('장막 안드로이드 미르');
    expect(unitSkillName('modern', 'twin_ser', '불꽃 낙인')).toBe('소각 낙인');
    expect(unitTextureKey('academy', 'legion_lord', 'sd')).not.toBe(unitTextureKey('modern', 'legion_lord', 'sd'));
  });

  it('기본 도형 스킨과 알 수 없는 유닛은 기존 이름·스킬·원화 없음 처리를 유지한다', () => {
    for (const id of Object.keys(BOSS_ART_CODES)) {
      expect(unitArtUrl('default', id, 'sd')).toBeNull();
      expect(unitTextureKey('default', id, 'sd')).toBeNull();
      expect(unitSkinName('default', id, '원본 이름')).toBe('원본 이름');
      expect(unitSkillName('default', id, '원본 스킬')).toBe('원본 스킬');
      expect(bossProfile('default', id)).toBeUndefined();
    }
    expect(unitArtUrl('modern', 'missing', 'portrait')).toBeNull();
    expect(unitTextureKey('academy', 'missing', 'sd')).toBeNull();
    expect(unitSkinName('academy', 'missing', '알 수 없음')).toBe('알 수 없음');
  });
});
