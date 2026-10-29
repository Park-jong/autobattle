/**
 * 화면 스킨(테마) 정의: 화면·원화를 바꾸고 게임 규칙·데이터·저장에는 영향을 주지 않는다.
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
  { id: 'academy', name: '마도아카데미', description: '성인 여성 캐릭터와 지휘관 원화, 금장과 마법진으로 꾸민 아카데미 테마입니다. 보스는 고유 문장으로 표시합니다.' },
];

export const DEFAULT_SKIN: SkinId = 'academy';

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value);
}

/** 원화 종류: 전투·맵용 SD / 초상화 / 선택·정보 화면 전신 */
export type ArtKind = 'sd' | 'portrait' | 'illustration';

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

/** 지휘관 원화도 유닛과 같은 종류·저장 구조를 쓴다. */
export const COMMANDER_ART_CODES: Readonly<Record<string, string>> = {
  cmd_harten: 'C01', cmd_isera: 'C02', cmd_nox: 'C03',
};

export const COMMANDER_PROFILES: Readonly<Record<string, { title: string; quote: string; color: string }>> = {
  cmd_harten: { title: '강철의 선도부장', quote: '내 뒤에 서. 대열은 무너지지 않아.', color: '#83bfff' },
  cmd_isera: { title: '폭발물 학부의 수석', quote: '이번 실험은 조금 뜨거울 거야.', color: '#f5a06d' },
  cmd_nox: { title: '금서 거래상', quote: '네가 감당할 가격으로 맞춰 줄게.', color: '#c6a1ef' },
};

/** 화면용 이름만 바꾸며 규칙·저장의 유닛 ID는 유지한다. */
export const ACADEMY_UNIT_NAMES: Readonly<Record<string, string>> = {
  U01: '리네', U02: '카렌', U03: '세나', U04: '모스', U05: '루카',
  U06: '피아', U07: '포포', U08: '니아', U09: '마치', U10: '키리',
  U11: '라비', U12: '모네', U13: '시온', U14: '베어트', U15: '베르나',
  U16: '네로', U17: '메리엘', U18: '테사', U19: '샤라', U20: '림',
  U21: '베가', U22: '실피', U23: '아델', U24: '노엘', U25: '레오나',
  U26: '오르카', U27: '에레브', U28: '유예', U29: '무명', U30: '에델',
};

export function unitSkinName(skin: SkinId, unitId: string, fallback: string): string {
  return skin === 'academy' ? ACADEMY_UNIT_NAMES[ACADEMY_ART_CODES[unitId] ?? ''] ?? fallback : fallback;
}

export function commanderArtUrl(skin: SkinId, commanderId: string, kind: ArtKind, base: string = BASE_URL): string | null {
  const code = skin === 'academy' ? COMMANDER_ART_CODES[commanderId] : undefined;
  return code ? `${base}skins/academy/${kind}/${code}.png` : null;
}

export function commanderTextureKey(commanderId: string): string {
  return `skin:academy:portrait:${commanderId}`;
}

export function commanderArtList(base: string = BASE_URL): { key: string; url: string }[] {
  return Object.keys(COMMANDER_ART_CODES).map((id) => ({
    key: commanderTextureKey(id), url: commanderArtUrl('academy', id, 'portrait', base)!,
  }));
}

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
