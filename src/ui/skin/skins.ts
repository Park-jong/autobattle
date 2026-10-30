/**
 * 화면 스킨(테마) 정의: 화면·원화를 바꾸고 게임 규칙·데이터·저장에는 영향을 주지 않는다.
 * - default: 진영색 도형 + 이름 약자 (기존 표시)
 * - academy: 마도아카데미 캐릭터 원화 (characters/Uxx → public/skins/academy, tools/skin-assets.ps1로 축소)
 * - modern: 성인 여성 도시 작전요원 (characters/modern/Uxx → public/skins/modern)
 */
import { MODERN_COMMANDERS, MODERN_UNITS } from './modernRoster';
import { BOSS_ART_CODES, bossProfile } from './bossRoster';

export type SkinId = 'default' | 'academy' | 'modern';

export interface SkinDef {
  readonly id: SkinId;
  readonly name: string;
  readonly description: string;
}

export const SKINS: readonly SkinDef[] = [
  { id: 'default', name: '기본', description: '진영색 도형과 이름 약자로 유닛을 표시합니다.' },
  { id: 'academy', name: '마도아카데미', description: '캐릭터·지휘관 원화와 골렘·화로령·촉수 군주 보스를 갖춘 아카데미 테마입니다.' },
  { id: 'modern', name: '시티 오퍼레이션', description: '성인 여성 작전요원과 지휘관, 공성 병기·쌍둥이 안드로이드·최고통수관 보스의 현대 도시전 테마입니다.' },
];

export const DEFAULT_SKIN: SkinId = 'academy';

export function isSkinId(value: unknown): value is SkinId {
  return SKINS.some((s) => s.id === value);
}

export function isIllustratedSkin(skin: SkinId): boolean { return skin === 'academy' || skin === 'modern'; }

export function skinPresentation(skin: SkinId): { title: string; eyebrow: string; subtitle: string } {
  if (skin === 'modern') return { title: '시티 오퍼레이션', eyebrow: 'URBAN TASK FORCE · OPERATIONS', subtitle: '도시의 평화를 되찾을 30명의 대원, 당신의 작전이 시작된다.' };
  if (skin === 'academy') return { title: '마도아카데미', eyebrow: 'ARCANA ACADEMY · TACTICS', subtitle: '금서가 깨어난 밤, 당신의 전술이 그녀들의 운명을 바꾼다.' };
  return { title: '전술 지휘관', eyebrow: 'TACTICAL COMMANDER', subtitle: '오토체스 + 덱빌딩 로그라이크' };
}

export function commanderProfile(skin: SkinId, id: string): { title: string; quote: string; color: string } | undefined {
  const modern = skin === 'modern' ? MODERN_COMMANDERS[id] : undefined;
  return modern ? { title: modern.role, quote: modern.quote, color: modern.color } : skin === 'academy' ? COMMANDER_PROFILES[id] : undefined;
}

export function commanderSkinName(skin: SkinId, id: string | undefined, fallback: string): string {
  return skin === 'modern' && id ? MODERN_COMMANDERS[id]?.name ?? fallback : fallback;
}

export function commanderSkillName(skin: SkinId, id: string | undefined, kind: 'passive' | 'ultimate', fallback: string): string {
  if (skin !== 'modern' || !id || !MODERN_COMMANDERS[id]) return fallback;
  const passives: Readonly<Record<string, string>> = { cmd_harten: '전열 방호 프로토콜', cmd_isera: '탄약 과충전', cmd_nox: '비인가 지원선' };
  return kind === 'ultimate' ? MODERN_COMMANDERS[id]!.skillName : passives[id] ?? fallback;
}

const MODERN_ACTS: Readonly<Record<number, { name: string; region: string; text: string }>> = {
  1: { name: '봉쇄 시가지', region: '시티 외곽 · 거주 구역', text: '시민 대피로를 확보하고 통신 중계소를 되찾으세요.' },
  2: { name: '해안 공업지구', region: '화물 부두 · 자동화 공장', text: '보급로를 돌파하고 적의 중장비 생산선을 차단하세요.' },
  3: { name: '중앙 관제도시', region: '데이터 센터 · 중앙 지휘부', text: '전자전 방어선을 넘어 도시 관제망을 복구하세요.' },
};
export function actPresentation(skin: SkinId, act: number): { name: string; region: string; text: string } | undefined {
  return skin === 'modern' ? MODERN_ACTS[act] : undefined;
}
export function encounterSkinName(skin: SkinId, kind: string, fallback: string): string {
  return skin === 'modern' ? ({ normal: '적 기동대 대치전', elite: '특수부대 제압 작전', boss: '지휘부 돌파 작전' } as Record<string, string>)[kind] ?? fallback : fallback;
}

const CARD_ART_UNITS: Readonly<Record<string, string>> = { operation: 'iron_shieldbearer', command: 'legion_centurion', spell: 'ember_kindler', equipment: 'ember_smith', curse: 'void_hierophant' };
export function cardArtUnit(type: string): string { return CARD_ART_UNITS[type] ?? 'iron_shieldbearer'; }
export function cardTypeSkinName(skin: SkinId, type: string, fallback: string): string {
  return skin === 'modern' ? ({ operation: '작전', command: '지휘', spell: '지원', equipment: '장비', curse: '교란' } as Record<string, string>)[type] ?? fallback : fallback;
}

export function unitSkinRole(skin: SkinId, id: string, fallback: string): string {
  return bossProfile(skin, id)?.role ?? (skin === 'modern' ? MODERN_UNITS[id]?.role ?? fallback : fallback);
}

export function unitSkillName(skin: SkinId, id: string, fallback: string): string {
  return bossProfile(skin, id)?.skillName ?? (skin === 'modern' ? MODERN_UNITS[id]?.skillName ?? fallback : fallback);
}

const MODERN_TRAITS: Readonly<Record<string, string>> = { iron_legion: '도시방위대', forest_pact: '구조정찰대', ember: '화력공병대', abyss: '특수작전국', guardian: '방호', gladiator: '돌격', marksman: '사수', mystic: '지원', assassin: '침투' };
export function traitSkinName(skin: SkinId, id: string, fallback: string): string {
  return skin === 'modern' ? MODERN_TRAITS[id] ?? fallback : fallback;
}

/** 원화 종류: 전투·맵용 SD / 초상화 / 선택·정보 화면 전신 */
export type ArtKind = 'sd' | 'portrait' | 'illustration';

/** 상점 유닛 id → 원화 번호 (CHARACTERS.md 4장 표의 U01~U30). 보스는 BOSS_ART_CODES에서 관리한다. */
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

/** 원화 URL·미리 읽기 목록은 상점 유닛과 보스를 함께 포함한다. */
const UNIT_ART_CODES: Readonly<Record<string, string>> = { ...ACADEMY_ART_CODES, ...BOSS_ART_CODES };

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
  return bossProfile(skin, unitId)?.name ?? (skin === 'modern' ? MODERN_UNITS[unitId]?.name ?? fallback : skin === 'academy' ? ACADEMY_UNIT_NAMES[ACADEMY_ART_CODES[unitId] ?? ''] ?? fallback : fallback);
}

export function commanderArtUrl(skin: SkinId, commanderId: string, kind: ArtKind, base: string = BASE_URL): string | null {
  const code = isIllustratedSkin(skin) ? COMMANDER_ART_CODES[commanderId] : undefined;
  return code ? `${base}skins/${skin}/${kind}/${code}.png` : null;
}

export function commanderTextureKey(commanderId: string, skin: SkinId = 'academy'): string {
  return `skin:${skin}:portrait:${commanderId}`;
}

export function commanderArtList(skin: SkinId = 'academy', base: string = BASE_URL): { key: string; url: string }[] {
  if (!isIllustratedSkin(skin)) return [];
  return Object.keys(COMMANDER_ART_CODES).map((id) => ({
    key: commanderTextureKey(id, skin), url: commanderArtUrl(skin, id, 'portrait', base)!,
  }));
}

/** 이 스킨에서 유닛 원화 URL. 기본 스킨이거나 원화가 없는 유닛이면 null */
export function unitArtUrl(skin: SkinId, unitId: string, kind: ArtKind, base: string = BASE_URL): string | null {
  if (!isIllustratedSkin(skin)) return null;
  const code = UNIT_ART_CODES[unitId];
  return code ? `${base}skins/${skin}/${kind}/${code}.png` : null;
}

/** Phaser 텍스처 키 (스킨·종류·유닛별로 하나) */
export function unitTextureKey(skin: SkinId, unitId: string, kind: ArtKind): string | null {
  if (!isIllustratedSkin(skin) || !UNIT_ART_CODES[unitId]) return null;
  return `skin:${skin}:${kind}:${unitId}`;
}

/** 스킨이 쓰는 모든 원화 (Phaser 미리 읽기용) */
export function skinArtList(skin: SkinId, kind: ArtKind, base: string = BASE_URL): { key: string; url: string }[] {
  if (!isIllustratedSkin(skin)) return [];
  return Object.keys(UNIT_ART_CODES).map((unitId) => ({
    key: unitTextureKey(skin, unitId, kind)!,
    url: unitArtUrl(skin, unitId, kind, base)!,
  }));
}
