import type { RelicDef, RelicRarity } from './relic';
import { RelicValidator } from './relicValidator';

/** 검증된 유물 모음. id로 조회한다. */
export class RelicCatalog {
  private readonly byId: Map<string, RelicDef>;

  constructor(readonly relics: readonly RelicDef[]) {
    this.byId = new Map(relics.map((r) => [r.id, r]));
  }

  get size(): number {
    return this.relics.length;
  }

  get(id: string): RelicDef | undefined {
    return this.byId.get(id);
  }

  /** 해당 희귀도의 유물 (파일 순서) */
  ofRarity(rarity: RelicRarity): RelicDef[] {
    return this.relics.filter((r) => r.rarity === rarity);
  }
}

/** 이미 파싱된 JSON 객체를 검증해 RelicCatalog로 만든다. 파일 읽기는 호출하는 쪽 책임. */
export function loadRelics(data: unknown, validator: RelicValidator = new RelicValidator()): RelicCatalog {
  return new RelicCatalog(validator.validateFile(data).relics);
}
