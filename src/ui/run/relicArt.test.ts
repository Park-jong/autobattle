import { describe, expect, it } from 'vitest';
import relics from '../../../data/relics.json';
import { RELIC_ART_IDS, relicArtUrl } from './relicArt';

describe('generated relic art mapping', () => {
  it('covers every collectible exactly once', () => {
    expect([...RELIC_ART_IDS].sort()).toEqual(relics.relics.map((relic) => relic.id).sort());
    expect(new Set(RELIC_ART_IDS).size).toBe(RELIC_ART_IDS.length);
  });
  it('supports deployment in a subdirectory and rejects unknown IDs', () => {
    expect(relicArtUrl('rift_heart', '/game/')).toBe('/game/relics/rift_heart.webp');
    expect(relicArtUrl('../outside', '/game/')).toBeNull();
    expect(relicArtUrl('unmapped_future_relic')).toBeNull();
  });
});
