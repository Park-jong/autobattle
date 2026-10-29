import raw from '../../../data/skins/modern.json';

export const MODERN_WEAPONS = ['pistol', 'smg', 'rifle', 'shotgun', 'machinegun', 'sniper', 'grenade', 'rocket', 'drone', 'blade'] as const;
export type ModernWeapon = typeof MODERN_WEAPONS[number];

export interface ModernCharacter {
  code: string; id: string; name: string; gender: 'female'; age: number; height: number;
  measurements: string; body: string; skin: string; hair: string; eyes: string; face: string;
  role: string; faction: string; color: string; weapon: ModernWeapon; equipment: string;
  outfit: string; bio: string; skillName: string; quote: string;
}
export interface ModernRoster { version: number; id: 'modern'; name: string; characters: ModernCharacter[] }

/** 표시용 설정도 로드할 때 검증한다. 잘못된 원화 매핑이나 연령은 실행 전에 알려 준다. */
export function loadModernRoster(input: unknown): ModernRoster {
  const fail = (path: string): never => { throw new Error(`현대전 스킨 설정 오류: ${path}`); };
  if (!input || typeof input !== 'object') fail('루트');
  const data = input as Record<string, unknown>;
  if (data.id !== 'modern' || data.version !== 1 || typeof data.name !== 'string' || !Array.isArray(data.characters) || data.characters.length !== 33) fail('이름·버전·캐릭터 33명');
  const ids = new Set<string>(), codes = new Set<string>();
  const strings = ['code', 'id', 'name', 'measurements', 'body', 'skin', 'hair', 'eyes', 'face', 'role', 'faction', 'color', 'weapon', 'equipment', 'outfit', 'bio', 'skillName', 'quote'];
  for (const [index, value] of (data.characters as unknown[]).entries()) {
    if (!value || typeof value !== 'object') fail(`characters[${index}]`);
    const row = value as Record<string, unknown>;
    for (const field of strings) if (typeof row[field] !== 'string' || !(row[field] as string).trim()) fail(`characters[${index}].${field}`);
    if (row.gender !== 'female' || !Number.isInteger(row.age) || (row.age as number) < 22 || (row.age as number) > 80) fail(`characters[${index}].성인 여성 설정`);
    if (!Number.isFinite(row.height) || (row.height as number) < 140 || (row.height as number) > 210) fail(`characters[${index}].height`);
    if (!/^#[0-9a-f]{6}$/i.test(row.color as string) || !MODERN_WEAPONS.includes(row.weapon as ModernWeapon)) fail(`characters[${index}].색·무기`);
    if (ids.has(row.id as string) || codes.has(row.code as string)) fail(`characters[${index}].중복 번호·ID`);
    ids.add(row.id as string); codes.add(row.code as string);
  }
  const expected = [...Array.from({ length: 30 }, (_, i) => `U${String(i + 1).padStart(2, '0')}`), 'C01', 'C02', 'C03'];
  if (expected.some(code => !codes.has(code))) fail('U01~U30·C01~C03 번호');
  return input as ModernRoster;
}

export const MODERN_ROSTER = loadModernRoster(raw);
export const MODERN_UNITS: Readonly<Record<string, ModernCharacter>> = Object.fromEntries(MODERN_ROSTER.characters.filter(c => c.code.startsWith('U')).map(c => [c.id, c]));
export const MODERN_COMMANDERS: Readonly<Record<string, ModernCharacter>> = Object.fromEntries(MODERN_ROSTER.characters.filter(c => c.code.startsWith('C')).map(c => [c.id, c]));
