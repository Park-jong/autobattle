import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import units from '../../../data/units.json';
import commanders from '../../../data/commanders.json';
import raw from '../../../data/skins/three_kingdoms.json';
import { loadThreeKingdomsRoster, THREE_KINGDOMS_CHARACTERS, THREE_KINGDOMS_ROSTER } from './threeKingdomsRoster';
import { ACADEMY_ART_CODES, COMMANDER_ART_CODES, actPresentation, cardArtUrl, commanderArtList, commanderArtUrl, commanderProfile, commanderSkinName, isSkinId, skinArtList, skinPresentation, traitSkinName, unitArtUrl, unitSkinName, unitSkillName } from './skins';
import { BOSS_ART_CODES, bossProfile } from './bossRoster';
import { SkinStore, SKIN_PREF_KEY } from './SkinStore';
import { attackProfile } from '../battle/combatVisuals';
import type { UnitDef } from '../../core/data/unit';

describe('삼국지 스킨 선택과 표시', () => {
  it('기존 유닛·보스·지휘관 37개 ID를 빠짐없이 같은 원화 번호로 연결한다', () => {
    const expected = { ...ACADEMY_ART_CODES, ...BOSS_ART_CODES, ...COMMANDER_ART_CODES };
    expect(Object.keys(THREE_KINGDOMS_CHARACTERS).sort()).toEqual([...units.units, ...commanders.commanders].map(c => c.id).sort());
    for (const row of THREE_KINGDOMS_ROSTER.characters) {
      expect(row.code).toBe(expected[row.id]);
      const folder = row.code.startsWith('B') ? `characters/bosses/three_kingdoms/${row.code}` : `characters/three_kingdoms/${row.code}`;
      const doc = readFileSync(new URL(`../../../${folder}/README.md`, import.meta.url), 'utf8');
      expect(doc).toContain(row.name);
      expect(doc).toContain(`${row.height} cm`);
      expect(doc).toContain(`**${row.cupSize}컵**`);
    }
  });

  it.each(['age', 'height', 'bustType', 'cupSize', 'faction', 'code', 'id', 'bio'] as const)('잘못된 %s 설정을 거부한다', field => {
    const copy = structuredClone(raw);
    const row = copy.characters[0]! as Record<string, unknown>;
    row[field] = ({ age: 17, height: 0, bustType: 'unknown', cupSize: 'M', faction: '군웅', code: copy.characters[1]!.code, id: copy.characters[1]!.id, bio: '' })[field];
    expect(() => loadThreeKingdomsRoster(copy)).toThrow();
  });

  it('선택값을 저장·복원하고 기존 academy 기본값을 유지한다', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
    const store = new SkinStore(() => storage);
    expect(store.current).toBe('academy');
    expect(isSkinId('three_kingdoms')).toBe(true);
    store.set('three_kingdoms');
    expect(values.get(SKIN_PREF_KEY)).toBe('three_kingdoms');
    expect(new SkinStore(() => storage).current).toBe('three_kingdoms');
  });

  it('세 군주·네 세력·네 적 보스·액트 표시를 적용한다', () => {
    expect(commanderSkinName('three_kingdoms', 'cmd_harten', '')).toBe('유비');
    expect(commanderSkinName('three_kingdoms', 'cmd_isera', '')).toBe('손권');
    expect(commanderSkinName('three_kingdoms', 'cmd_nox', '')).toBe('조조');
    expect(commanderProfile('three_kingdoms', 'cmd_harten')?.title).toContain('도원');
    expect(['iron_legion', 'ember', 'abyss', 'forest_pact'].map(id => traitSkinName('three_kingdoms', id, ''))).toEqual(['촉', '오', '위', '동탁']);
    expect(unitSkinName('three_kingdoms', 'legion_lord', '')).toBe('동탁');
    expect(bossProfile('three_kingdoms', 'gate_breaker')?.name).toBe('화웅');
    expect(bossProfile('three_kingdoms', 'iron_shieldbearer')).toBeUndefined();
    expect(actPresentation('three_kingdoms', 1)?.name).toContain('사수관');
    expect(actPresentation('three_kingdoms', 3)?.name).toContain('낙양');
    expect(skinPresentation('three_kingdoms').title).toBe('연화삼국');
    expect(unitSkillName('three_kingdoms', 'missing', '원본')).toBe('원본');
  });

  it('하위 경로 배포·카드·궁극기용 원화와 미리 읽기 목록을 연결한다', () => {
    expect(unitArtUrl('three_kingdoms', 'legion_lord', 'sd', '/autobattle/')).toBe('/autobattle/skins/three_kingdoms/sd/B04.png');
    expect(commanderArtUrl('three_kingdoms', 'cmd_harten', 'illustration', './')).toBe('./skins/three_kingdoms/illustration/C01.png');
    expect(skinArtList('three_kingdoms', 'sd')).toHaveLength(34);
    expect(commanderArtList('three_kingdoms')).toHaveLength(3);
    expect(cardArtUrl('three_kingdoms', { owner: 'cmd_nox', name: '명령', type: 'command', text: '' })).toContain('/three_kingdoms/portrait/C03.png');
  });

  it('궁수·화약 항아리·근접 무기의 연출을 구분하고 총격 연출을 사용하지 않는다', () => {
    for (const id of ['legion_crossbow', 'siege_bombardier', 'void_sniper']) {
      expect(attackProfile(units.units.find(u => u.id === id) as UnitDef, 'three_kingdoms').style).toBe('arrow');
    }
    expect(attackProfile(units.units.find(u => u.id === 'ember_slinger') as UnitDef, 'three_kingdoms').style).toBe('shell');
    expect(attackProfile(units.units.find(u => u.id === 'muhon') as UnitDef, 'three_kingdoms')).toMatchObject({ style: 'slash', ranged: false });
    for (const unit of units.units) expect(attackProfile(unit as UnitDef, 'three_kingdoms').modern).toBeUndefined();
  });
});
