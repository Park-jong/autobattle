import { isRewardCard } from './card';
import type { CardCatalog } from './cardLoader';
import { DataValidationError } from './errors';
import type { EventDef } from './event';
import { EventValidator } from './eventValidator';
import type { UnitCatalog } from './unitLoader';

/** 검증된 이벤트 모음 */
export class EventCatalog {
  private readonly byId: Map<string, EventDef>;

  constructor(readonly events: readonly EventDef[]) {
    this.byId = new Map(events.map((e) => [e.id, e]));
  }

  get size(): number {
    return this.events.length;
  }

  get(id: string): EventDef | undefined {
    return this.byId.get(id);
  }
}

/**
 * 이미 파싱된 JSON 객체를 검증해 EventCatalog로 만든다.
 * 고정 카드 id, 무작위/선택 카드의 희귀도 후보(보상 풀), 유닛 등급 후보가 실제로 있는지도 확인한다.
 */
export function loadEvents(
  data: unknown,
  cards: CardCatalog,
  units: UnitCatalog,
  validator: EventValidator = new EventValidator(),
): EventCatalog {
  const events = validator.validateFile(data).events;
  events.forEach((event, index) => {
    event.choices.forEach((choice, c) => {
      choice.effects.forEach((effect, e) => {
        const path = `events[${index}] (${event.id}).choices[${c}].effects[${e}]`;
        if (effect.kind === 'gainCard') {
          if (effect.mode === 'fixed') {
            if (!cards.get(effect.cardId)) throw new DataValidationError(`${path}.cardId`, `cards.json에 없는 카드 id "${effect.cardId}"`);
          } else {
            const pool = cards.cards.filter((card) => isRewardCard(card) && card.rarity === effect.rarity);
            const need = effect.mode === 'choose' ? effect.count : 1;
            if (pool.length < need) throw new DataValidationError(`${path}.rarity`, `${effect.rarity} 보상 카드가 ${need}장 이상 필요함 (실제: ${pool.length}장)`);
          }
        }
        if (effect.kind === 'gainUnit' && !units.units.some((u) => !u.boss && u.tier === effect.tier)) {
          throw new DataValidationError(`${path}.tier`, `${effect.tier}등급 유닛이 없음`);
        }
      });
    });
  });
  return new EventCatalog(events);
}
