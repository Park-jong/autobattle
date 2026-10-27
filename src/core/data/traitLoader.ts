import type { TraitDef } from './trait';
import { TraitValidator } from './traitValidator';

/** 검증된 특성 모음. id로 조회한다. */
export class TraitCatalog {
  private readonly byId: Map<string, TraitDef>;

  constructor(readonly traits: readonly TraitDef[]) {
    this.byId = new Map(traits.map((t) => [t.id, t]));
  }

  get size(): number {
    return this.traits.length;
  }

  get(id: string): TraitDef | undefined {
    return this.byId.get(id);
  }
}

/** 이미 파싱된 JSON 객체를 검증해 TraitCatalog로 만든다. */
export function loadTraits(data: unknown, validator: TraitValidator = new TraitValidator()): TraitCatalog {
  return new TraitCatalog(validator.validateFile(data).traits);
}
