import type { CardCatalog } from './cardLoader';
import type { CommanderDef } from './commander';
import { CommanderValidator } from './commanderValidator';
import { DataValidationError } from './errors';
import type { UnitCatalog } from './unitLoader';

/** 검증된 지휘관 모음. id로 조회한다. */
export class CommanderCatalog {
  private readonly byId: Map<string, CommanderDef>;

  constructor(readonly commanders: readonly CommanderDef[]) {
    this.byId = new Map(commanders.map((c) => [c.id, c]));
  }

  get size(): number {
    return this.commanders.length;
  }

  get(id: string): CommanderDef | undefined {
    return this.byId.get(id);
  }
}

/**
 * 이미 파싱된 JSON 객체를 검증해 CommanderCatalog로 만든다.
 * 시작 덱의 카드 id와 시작 유닛 id가 실제로 있는지, 카드의 owner가 neutral 또는 해당 지휘관인지도 확인한다.
 */
export function loadCommanders(
  data: unknown,
  cards: CardCatalog,
  units: UnitCatalog,
  validator: CommanderValidator = new CommanderValidator(),
): CommanderCatalog {
  const commanders = validator.validateFile(data).commanders;
  commanders.forEach((commander, index) => {
    const base = `commanders[${index}] (${commander.id})`;
    commander.startingDeck.forEach((entry, i) => {
      const card = cards.get(entry.cardId);
      const path = `${base}.startingDeck[${i}].cardId`;
      if (!card) throw new DataValidationError(path, `cards.json에 없는 카드 id "${entry.cardId}"`);
      if (card.owner !== 'neutral' && card.owner !== commander.id) {
        throw new DataValidationError(path, `카드 "${card.id}"의 owner가 ${card.owner}라서 ${commander.id}의 덱에 넣을 수 없음`);
      }
    });
    commander.startingUnits.forEach((entry, i) => {
      if (!units.get(entry.unitId)) {
        throw new DataValidationError(`${base}.startingUnits[${i}].unitId`, `units.json에 없는 유닛 id "${entry.unitId}"`);
      }
    });
  });
  return new CommanderCatalog(commanders);
}
