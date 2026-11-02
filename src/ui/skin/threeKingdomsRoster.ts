import raw from '../../../data/skins/three_kingdoms.json';

export interface ThreeKingdomsCharacter {
  code: string; id: string; name: string; gender: 'female'; age: number; height: number;
  measurements: string; bustType: 'small' | 'medium' | 'large'; cupSize: string;
  body: string; skin: string; hair: string; eyes: string; face: string;
  role: string; faction: '위' | '촉' | '오' | '동탁'; color: string;
  equipment: string; outfit: string; bio: string; skillName: string; quote: string;
}
export interface ThreeKingdomsRoster {
  version: 1; id: 'three_kingdoms'; name: string; characters: ThreeKingdomsCharacter[];
}

/** 표시 전용 로스터. 능력·편성·해금·저장의 원본 ID를 변경하지 않는다. */
export function loadThreeKingdomsRoster(input: unknown): ThreeKingdomsRoster {
  const fail = (field: string): never => { throw new Error(`삼국지 스킨 설정 오류: ${field}`); };
  if (!input || typeof input !== 'object') fail('루트');
  const data = input as Record<string, unknown>;
  if (data.version !== 1 || data.id !== 'three_kingdoms' || typeof data.name !== 'string' || !data.name.trim()
    || !Array.isArray(data.characters) || data.characters.length !== 37) fail('버전·이름·37명');
  const codes = new Set<string>(), ids = new Set<string>();
  const strings = ['code', 'id', 'name', 'measurements', 'body', 'skin', 'hair', 'eyes', 'face', 'role', 'faction', 'color', 'equipment', 'outfit', 'bio', 'skillName', 'quote'];
  const cups: Readonly<Record<string, readonly string[]>> = { small: ['A'], medium: ['C', 'D'], large: ['H', 'I', 'J', 'K'] };
  for (const [index, item] of (data.characters as unknown[]).entries()) {
    if (!item || typeof item !== 'object') fail(`characters[${index}]`);
    const row = item as Record<string, unknown>;
    for (const key of strings) if (typeof row[key] !== 'string' || !(row[key] as string).trim()) fail(`${index}.${key}`);
    if (row.gender !== 'female' || !Number.isInteger(row.age) || (row.age as number) < 22 || (row.age as number) > 80) fail(`${index}.성인 여성`);
    if (!Number.isFinite(row.height) || (row.height as number) < 140 || (row.height as number) > 210) fail(`${index}.키`);
    if (!cups[String(row.bustType)]?.includes(row.cupSize as string)) fail(`${index}.체형·컵`);
    if (!/^\d{2,3}\/\d{2,3}\/\d{2,3} cm$/.test(row.measurements as string)) fail(`${index}.쓰리사이즈`);
    if (!['위', '촉', '오', '동탁'].includes(row.faction as string) || !/^#[0-9a-f]{6}$/i.test(row.color as string)) fail(`${index}.세력·색`);
    if (codes.has(row.code as string) || ids.has(row.id as string)) fail(`${index}.중복 번호·ID`);
    codes.add(row.code as string); ids.add(row.id as string);
  }
  const expected = [...Array.from({ length: 30 }, (_, i) => `U${String(i + 1).padStart(2, '0')}`), 'C01', 'C02', 'C03', 'B01', 'B02', 'B03', 'B04'];
  if (expected.some(code => !codes.has(code))) fail('U01~U30·C01~C03·B01~B04');
  return input as ThreeKingdomsRoster;
}

export const THREE_KINGDOMS_ROSTER = loadThreeKingdomsRoster(raw);
export const THREE_KINGDOMS_CHARACTERS: Readonly<Record<string, ThreeKingdomsCharacter>> = Object.fromEntries(THREE_KINGDOMS_ROSTER.characters.map(c => [c.id, c]));
export const THREE_KINGDOMS_COMMANDERS: Readonly<Record<string, ThreeKingdomsCharacter>> = Object.fromEntries(THREE_KINGDOMS_ROSTER.characters.filter(c => c.code.startsWith('C')).map(c => [c.id, c]));
