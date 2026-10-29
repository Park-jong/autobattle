import type { CommanderCatalog } from './commanderLoader';
import { DataValidationError } from './errors';
import type { PointsRule, UnlockEntry, UnlockTarget } from './meta';
import { MetaValidator } from './metaValidator';
import type { RelicCatalog } from './relicLoader';

/** 검증된 메타 진행 데이터: 전공 포인트 공식과 해금 항목. id로 조회한다. */
export class MetaCatalog {
  private readonly byId: Map<string, UnlockEntry>;

  constructor(
    readonly points: PointsRule,
    readonly unlocks: readonly UnlockEntry[],
  ) {
    this.byId = new Map(unlocks.map((entry) => [entry.id, entry]));
  }

  get(id: string): UnlockEntry | undefined {
    return this.byId.get(id);
  }

  /** 대상 종류의 해금 항목 (파일 순서) */
  ofTarget(target: UnlockTarget): UnlockEntry[] {
    return this.unlocks.filter((entry) => entry.target === target);
  }
}

/**
 * 이미 파싱된 meta.json을 검증해 MetaCatalog로 만든다. 파일 읽기는 호출하는 쪽 책임.
 * 항목의 id가 지휘관·유물에 실제로 있는지, 그리고 잠그는 대상의 집합이
 * commanders.json·relics.json에서 `unlock` 문구가 있는 항목의 집합과 정확히 같은지 확인한다.
 */
export function loadMeta(
  data: unknown,
  commanders: CommanderCatalog,
  relics: RelicCatalog,
  validator: MetaValidator = new MetaValidator(),
): MetaCatalog {
  const file = validator.validateFile(data);
  const lockedByEntry: Record<UnlockTarget, Set<string>> = { commander: new Set(), relic: new Set() };
  file.unlocks.forEach((entry, index) => {
    const catalogHas = entry.target === 'commander' ? commanders.get(entry.id) : relics.get(entry.id);
    if (!catalogHas) {
      const file = entry.target === 'commander' ? 'commanders.json' : 'relics.json';
      throw new DataValidationError(`unlocks[${index}].id`, `${file}에 없는 ${entry.target === 'commander' ? '지휘관' : '유물'} id "${entry.id}"`);
    }
    lockedByEntry[entry.target].add(entry.id);
  });
  const withText = {
    commander: commanders.commanders.filter((c) => c.unlock !== undefined).map((c) => c.id),
    relic: relics.relics.filter((r) => r.unlock !== undefined).map((r) => r.id),
  };
  for (const target of ['commander', 'relic'] as const) {
    const label = target === 'commander' ? '지휘관' : '유물';
    const source = target === 'commander' ? 'commanders.json' : 'relics.json';
    for (const id of withText[target]) {
      if (!lockedByEntry[target].has(id)) {
        throw new DataValidationError('unlocks', `${source}의 ${label} "${id}"에 unlock 문구가 있는데 meta.json에 해금 항목이 없음`);
      }
    }
    const textual = new Set(withText[target]);
    file.unlocks.forEach((entry, index) => {
      if (entry.target === target && !textual.has(entry.id)) {
        throw new DataValidationError(`unlocks[${index}].id`, `${label} "${entry.id}"는 ${source}에 unlock 문구가 없음 (잠그는 대상 집합이 달라짐)`);
      }
    });
  }
  return new MetaCatalog(file.points, file.unlocks);
}
