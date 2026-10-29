import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODERN_ROSTER } from './modernRoster';

interface AssetRecord {
  path: string; prompt: string; sha256: string; width: number; height: number;
  mode: string; alpha_range: number[]; transparent_fraction: number; bytes: number;
}
const root = (path: string): URL => new URL(`../../../${path}`, import.meta.url);
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
function pngSize(bytes: Buffer): number[] {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(bytes[25]).toBe(6); // RGBA: 투명 배경을 보존한다
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe('현대전 원화 배포 완전성', () => {
  it('33명 × 3종의 실제 PNG·프롬프트·선택본 해시와 게임용 축소본이 모두 있다', () => {
    const manifest = JSON.parse(readFileSync(root('characters/modern/asset-manifest.json'), 'utf8')) as { assets: Record<string, AssetRecord> };
    expect(Object.keys(manifest.assets)).toHaveLength(99);
    const originals = new Set<string>(), exported = new Set<string>();
    for (const c of MODERN_ROSTER.characters) {
      const setting = readFileSync(root(`characters/modern/${c.code}/README.md`), 'utf8');
      expect(setting).toContain(c.name); expect(setting).toContain(`${c.age}세`);
      for (const kind of ['illustration', 'portrait', 'sd']) {
        const record = manifest.assets[`${c.code}/${kind}`]; expect(record).toBeDefined();
        expect(record!.path).toBe(`characters/modern/${c.code}/${kind}.png`);
        const source = readFileSync(root(record!.path));
        expect(pngSize(source)).toEqual([record!.width, record!.height]);
        expect(source.length).toBe(record!.bytes); expect(hash(source)).toBe(record!.sha256);
        expect(record!.mode).toBe('RGBA'); expect(record!.alpha_range[0]).toBe(0);
        expect(record!.alpha_range[1]).toBeGreaterThanOrEqual(250);
        expect(record!.transparent_fraction).toBeGreaterThanOrEqual(0.15);
        expect(readFileSync(root(record!.prompt), 'utf8').length).toBeGreaterThan(200);
        originals.add(record!.sha256);
        const runtime = readFileSync(root(`public/skins/modern/${kind}/${c.code}.png`));
        const commander = c.code.startsWith('C');
        expect(pngSize(runtime)).toEqual(kind === 'illustration' ? commander ? [640, 960] : [384, 576] : kind === 'portrait' && commander ? [512, 512] : [256, 256]);
        exported.add(hash(runtime));
      }
    }
    expect(originals.size).toBe(99); expect(exported.size).toBe(99);
  });
});
