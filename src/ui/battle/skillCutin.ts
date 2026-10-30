import type { ReplayEffect, UnitView } from '../replay/ReplayState';
import { TIMING } from '../theme';

type SkillEffect = Extract<ReplayEffect, { kind: 'skill' }>;

/** 한 진영당 한 컷인. 먼저 시작한 연출을 끝까지 보여 주고, 지난 이벤트는 대기열에 쌓지 않는다. */
export function activeSkillCutins(
  time: number, effects: readonly ReplayEffect[], views: ReadonlyMap<number, UnitView>,
): SkillEffect[] {
  const sides = new Map<number, SkillEffect>();
  for (const effect of effects) {
    if (effect.kind !== 'skill' || time < effect.t || time - effect.t >= TIMING.SKILL_CUTIN) continue;
    const unit = views.get(effect.unit);
    if (!unit) continue;
    const current = sides.get(unit.side);
    if (!current || effect.t < current.t || (effect.t === current.t && effect.seq < current.seq)) sides.set(unit.side, effect);
  }
  return [...sides.values()];
}
