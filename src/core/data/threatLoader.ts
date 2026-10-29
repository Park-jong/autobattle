import type { CardCatalog } from './cardLoader';
import { DataValidationError } from './errors';
import type { ThreatLevelDef } from './threat';
import { ThreatValidator } from './threatValidator';

/** 검증된 위협 레벨표. 레벨 1~10의 정의를 순서대로 가진다. */
export class ThreatCatalog {
  constructor(readonly levels: readonly ThreatLevelDef[]) {}

  /** 가장 높은 레벨 */
  get maxLevel(): number {
    return this.levels.length;
  }

  /** 레벨 N의 정의 (1~maxLevel, 아니면 undefined) */
  get(level: number): ThreatLevelDef | undefined {
    return this.levels[level - 1];
  }

  /** 레벨 N까지의 누적 정의 (1~N). 0이면 빈 목록 */
  upTo(level: number): ThreatLevelDef[] {
    return this.levels.slice(0, Math.max(0, level));
  }
}

/** 이미 파싱된 threat.json을 검증해 ThreatCatalog로 만든다. 저주 카드 참조(존재·저주 종류)도 확인한다 */
export function loadThreat(data: unknown, cards: CardCatalog, validator: ThreatValidator = new ThreatValidator()): ThreatCatalog {
  const file = validator.validateFile(data);
  file.levels.forEach((def, li) => {
    def.effects.forEach((effect, ei) => {
      if (effect.kind !== 'startCurse') return;
      const path = `levels[${li}].effects[${ei}].cardId`;
      const card = cards.get(effect.cardId);
      if (!card) throw new DataValidationError(path, `cards.json에 없는 카드 "${effect.cardId}"`);
      if (card.type !== 'curse') throw new DataValidationError(path, `저주 카드여야 함 ("${effect.cardId}"는 ${card.type})`);
    });
  });
  return new ThreatCatalog(file.levels);
}
