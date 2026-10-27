import type { Card } from './card';
import { CardValidator } from './cardValidator';
import { DataValidationError } from './errors';
import type { TraitCatalog } from './traitLoader';

/** 검증된 카드 모음. id로 조회한다. */
export class CardCatalog {
  private readonly byId: Map<string, Card>;

  constructor(readonly cards: readonly Card[]) {
    this.byId = new Map(cards.map((c) => [c.id, c]));
  }

  get size(): number {
    return this.cards.length;
  }

  get(id: string): Card | undefined {
    return this.byId.get(id);
  }
}

/**
 * 이미 파싱된 JSON 객체를 검증해 CardCatalog로 만든다.
 * traits를 주면 공명(resonance.trait, upgrade.resonance.trait)이 참조하는 특성 id가 실제로 있는지도 확인한다.
 * 파일 읽기는 호출하는 쪽 책임 (브라우저: Vite JSON import, 테스트: import 또는 객체 직접 전달).
 */
export function loadCards(
  data: unknown,
  traits?: TraitCatalog,
  validator: CardValidator = new CardValidator(),
): CardCatalog {
  const cards = validator.validateFile(data).cards;
  if (traits) {
    cards.forEach((card, index) => {
      const refs = [
        { trait: card.resonance?.trait, where: 'resonance.trait' },
        { trait: card.upgrade?.resonance?.trait, where: 'upgrade.resonance.trait' },
      ];
      for (const { trait, where } of refs) {
        if (trait !== undefined && !traits.get(trait)) {
          throw new DataValidationError(`cards[${index}] (${card.id}).${where}`, `traits.json에 없는 특성 id "${trait}"`);
        }
      }
    });
  }
  return new CardCatalog(cards);
}
