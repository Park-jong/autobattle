import {
  EVENT_CARD_MODES,
  EVENT_PICK_MODES,
  EVENT_RARITIES,
  type EventChoice,
  type EventDef,
  type EventEffect,
  type EventFile,
} from './event';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';

const EFFECT_KINDS = ['gold', 'commanderHp', 'gainCard', 'removeCard', 'upgradeCard', 'gainUnit'] as const;
const MIN_CHOICES = 2;
const MAX_CHOICES = 3;

/** events.json 구조를 검증한다. 카드·유닛 id 참조는 loadEvents가 확인한다. 파일 I/O는 하지 않는다. */
export class EventValidator {
  validateFile(data: unknown): EventFile {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'events']);
    const version = root.int('version', 1);
    const seen = new Map<string, number>();
    const events = root.array('events').map((raw, index) => {
      const event = this.validateEvent(raw, index);
      const prev = seen.get(event.id);
      if (prev !== undefined) {
        throw new DataValidationError(`events[${index}] (${event.id}).id`, `중복된 id "${event.id}" (events[${prev}]와 동일)`);
      }
      seen.set(event.id, index);
      return event;
    });
    return { version, events };
  }

  private validateEvent(raw: unknown, index: number): EventDef {
    let path = `events[${index}]`;
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(['id', 'title', 'text', 'choices']);
    const choicesRaw = r.array('choices');
    if (choicesRaw.length < MIN_CHOICES || choicesRaw.length > MAX_CHOICES) {
      r.fail('choices', `선택지는 ${MIN_CHOICES}~${MAX_CHOICES}개여야 함 (실제: ${choicesRaw.length})`);
    }
    const choices = choicesRaw.map((c, i) => this.validateChoice(FieldReader.of(c, `${path}.choices[${i}]`)));
    return { id: r.string('id'), title: r.string('title'), text: r.string('text'), choices };
  }

  private validateChoice(r: FieldReader): EventChoice {
    r.onlyKeys(['text', 'result', 'effects']);
    const effects = r.array('effects').map((e, i) => this.validateEffect(FieldReader.of(e, `${r.path}.effects[${i}]`)));
    return { text: r.string('text'), result: r.string('result'), effects };
  }

  private validateEffect(r: FieldReader): EventEffect {
    const kind = r.enum('kind', EFFECT_KINDS);
    switch (kind) {
      case 'gold':
      case 'commanderHp': {
        r.onlyKeys(['kind', 'amount']);
        const amount = r.number('amount');
        if (!Number.isInteger(amount) || amount === 0) r.fail('amount', `0이 아닌 정수여야 함 (실제: ${amount})`);
        return { kind, amount };
      }
      case 'gainCard': {
        const mode = r.enum('mode', EVENT_CARD_MODES);
        if (mode === 'fixed') {
          r.onlyKeys(['kind', 'mode', 'cardId']);
          return { kind, mode, cardId: r.string('cardId') };
        }
        if (mode === 'random') {
          r.onlyKeys(['kind', 'mode', 'rarity']);
          return { kind, mode, rarity: r.enum('rarity', EVENT_RARITIES) };
        }
        r.onlyKeys(['kind', 'mode', 'rarity', 'count']);
        return { kind, mode, rarity: r.enum('rarity', EVENT_RARITIES), count: r.int('count', 2) };
      }
      case 'removeCard':
      case 'upgradeCard':
        r.onlyKeys(['kind', 'mode']);
        return { kind, mode: r.enum('mode', EVENT_PICK_MODES) };
      case 'gainUnit':
        r.onlyKeys(['kind', 'tier']);
        return { kind, tier: r.int('tier', 1) };
    }
  }
}
