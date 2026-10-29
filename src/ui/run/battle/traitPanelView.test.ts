import { describe, expect, it } from 'vitest';
import traitsJson from '../../../../data/traits.json';
import type { TraitDef } from '../../../core/data/trait';
import { buildTraitRows } from './traitPanelView';

const traits = (traitsJson as unknown as { traits: TraitDef[] }).traits;
const lookup = (id: string): TraitDef | undefined => traits.find((t) => t.id === id);

describe('buildTraitRows', () => {
  it('켜진 특성을 먼저, 단계별 문장과 다음 단계 기준을 준다', () => {
    const rows = buildTraitRows([
      { traitId: 'guardian', count: 1, tier: 0 },
      { traitId: 'iron_legion', count: 4, tier: 2 },
      { traitId: 'marksman', count: 2, tier: 1 },
      { traitId: 'ember', count: 0, tier: 0 },
      { traitId: 'nope', count: 3, tier: 1 },
    ], lookup);
    expect(rows.map((r) => r.traitId)).toEqual(['iron_legion', 'marksman', 'guardian']);
    expect(rows[0]).toMatchObject({ name: '강철군단', tier: 2, nextAt: 6, currentText: '아군 전체 ARM +35.' });
    expect(rows[2]).toMatchObject({ tier: 0, nextAt: 2, currentText: '전열 아군 받는 피해 -15%.' });
  });

  it('최고 단계면 다음 기준이 없다', () => {
    expect(buildTraitRows([{ traitId: 'iron_legion', count: 6, tier: 3 }], lookup)[0]?.nextAt).toBeNull();
  });
});
