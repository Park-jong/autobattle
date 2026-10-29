/**
 * 화면 스킨(테마) 정의: 유닛을 어떻게 그릴지만 바꾸고 게임 규칙·데이터·저장에는 영향이 없다.
 * - default: 진영색 도형 + 이름 약자 (기존 표시)
 * - academy: 마도아카데미 캐릭터 원화 (characters/Uxx → public/skins/academy, tools/skin-assets.ps1로 축소)
 */
export type SkinId = 'default' | 'academy';

export interface SkinDef {
  readonly id: SkinId;
  readonly name: string;
  readonly description: string;
}

export const SKINS: readonly SkinDef[] = [
  { id: 'default', name: '기본', description: '진영색 도형과 이름 약자로 유닛을 표시합니다.' },
  { id: 'academy', name: '아카데미 원화', description: '유닛을 마도아카데미 캐릭터 원화로 표시합니다. 원화가 없는 유닛(보스 등)은 기본 표시를 씁니다.' },
];

export const DEFAULT_SKIN: SkinId = 'default';

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value);
}

/** 원화 종류: 전투 보드용 SD / 상점·벤치용 초상화 */
export type ArtKind = 'sd' | 'portrait';

/** 유닛 id → 원화 번호 (CHARACTERS.md 4장 표의 U01~U30). 보스 전용 유닛은 원화가 없다 */
export const ACADEMY_ART_CODES: Readonly<Record<string, string>> = {
  iron_shieldbearer: 'U01',
  arena_recruit: 'U02',
  legion_crossbow: 'U03',
  moss_warden: 'U04',
  grove_archer: 'U05',
  ember_kindler: 'U06',
  ember_slinger: 'U07',
  shade_dagger: 'U08',
  war_drummer: 'U09',
  legion_spy: 'U10',
  ember_berserker: 'U11',
  abyss_devourer: 'U12',
  abyss_whisperer: 'U13',
  bear_warrior: 'U14',
  grove_druid: 'U15',
  shadow_panther: 'U16',
  battle_chaplain: 'U17',
  ember_smith: 'U18',
  ember_bladedancer: 'U19',
  rift_stalker: 'U20',
  void_sniper: 'U21',
  wind_hunter: 'U22',
  legion_centurion: 'U23',
  siege_bombardier: 'U24',
  magma_champion: 'U25',
  abyss_sentinel: 'U26',
  void_hierophant: 'U27',
  volcano_oracle: 'U28',
  muhon: 'U29',
  elder_treeking: 'U30',
};

/** 정적 파일 기준 경로 (Vite base). 빌드는 './', 개발 서버는 '/' */
const BASE_URL: string = import.meta.env?.BASE_URL ?? './';

/** 이 스킨에서 유닛 원화 URL. 기본 스킨이거나 원화가 없는 유닛이면 null */
export function unitArtUrl(skin: SkinId, unitId: string, kind: ArtKind, base: string = BASE_URL): string | null {
  if (skin !== 'academy') return null;
  const code = ACADEMY_ART_CODES[unitId];
  return code ? `${base}skins/academy/${kind}/${code}.png` : null;
}

/** Phaser 텍스처 키 (스킨·종류·유닛별로 하나) */
export function unitTextureKey(skin: SkinId, unitId: string, kind: ArtKind): string | null {
  if (skin !== 'academy' || !ACADEMY_ART_CODES[unitId]) return null;
  return `skin:${skin}:${kind}:${unitId}`;
}

/** 스킨이 쓰는 모든 원화 (Phaser 미리 읽기용) */
export function skinArtList(skin: SkinId, kind: ArtKind, base: string = BASE_URL): { key: string; url: string }[] {
  if (skin !== 'academy') return [];
  return Object.keys(ACADEMY_ART_CODES).map((unitId) => ({
    key: unitTextureKey(skin, unitId, kind)!,
    url: unitArtUrl(skin, unitId, kind, base)!,
  }));
}
