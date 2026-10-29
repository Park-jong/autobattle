import type { ActiveTrait } from '../../../core/combat/traits';
import type { TraitDef } from '../../../core/data/trait';
import { skillTextForStar } from './unitInfoView';

/** 전투 화면 왼쪽 특성 패널의 한 줄 */
export interface TraitRowView {
  traitId: string;
  name: string;
  kind: 'origin' | 'job';
  /** 서로 다른 유닛 종류 수 */
  count: number;
  /** 0 = 미달, 1~3 = 단계 */
  tier: 0 | 1 | 2 | 3;
  thresholds: readonly [number, number, number];
  /** 다음 단계까지 필요한 종류 수 (최고 단계면 null) */
  nextAt: number | null;
  /** 지금 단계의 효과 문장 (미달이면 1단계 문장) */
  currentText: string;
  /** 단계 값이 모두 들어 있는 원문 */
  fullText: string;
}

/**
 * 진영의 특성 목록 → 패널 줄. 켜진 특성(단계 높은 순·종류 수 많은 순)을 먼저, 미달은 뒤에 둔다.
 * 특성 정의를 못 찾으면 그 줄은 뺀다.
 */
export function buildTraitRows(active: readonly ActiveTrait[], lookup: (id: string) => TraitDef | undefined): TraitRowView[] {
  const rows: TraitRowView[] = [];
  for (const t of active) {
    const def = lookup(t.traitId);
    if (!def || t.count <= 0) continue;
    const nextAt = def.thresholds.find((n) => n > t.count) ?? null;
    rows.push({
      traitId: def.id,
      name: def.name,
      kind: def.kind === 'job' ? 'job' : 'origin',
      count: t.count,
      tier: t.tier,
      thresholds: def.thresholds,
      nextAt,
      currentText: skillTextForStar(def.text, (t.tier === 0 ? 1 : t.tier) as 1 | 2 | 3),
      fullText: def.text,
    });
  }
  return rows.sort((a, b) => b.tier - a.tier || b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}
