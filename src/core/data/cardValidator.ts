import {
  CARD_TYPES,
  KEYWORDS,
  RARITIES,
  TARGET_KINDS,
  type Card,
  type CardChain,
  type CardEffect,
  type CardCurse,
  type CardHpCost,
  type CardType,
  type CardFile,
  type CardLimits,
  type CardResonance,
  type CardTarget,
  type CardUpgrade,
  type Keyword,
} from './card';
import { assertEffectsUsable } from './effectUsage';
import { EffectValidator } from './effectValidator';
import { DataValidationError } from './errors';
import { FieldReader } from './fieldReader';

const CARD_KEYS = [
  'id', 'name', 'owner', 'rarity', 'type', 'cost', 'target', 'keywords',
  'limits', 'commanderHpCost', 'resonance', 'chain', 'curse', 'grantOnly', 'text', 'effects', 'upgrade',
] as const;
const UPGRADE_KEYS = ['text', 'effects', 'cost', 'resonance', 'chain', 'keywords', 'commanderHpCost'] as const;

/** cards.json 구조를 검증해 타입 있는 Card로 변환한다. 파일 I/O는 하지 않는다. */
export class CardValidator {
  /** 카드에는 성급이 없으므로 성급 배열을 거부하는 공통 효과 검증기를 쓴다 */
  constructor(private readonly effects: EffectValidator = new EffectValidator({ allowStarArrays: false, allowCardEffects: true })) {}

  validateFile(data: unknown): CardFile {
    const root = FieldReader.of(data, '');
    const version = root.int('version', 1);
    const rawCards = root.array('cards');

    const seen = new Map<string, number>();
    const cards = rawCards.map((raw, index) => {
      const card = this.validateCard(raw, index);
      const prev = seen.get(card.id);
      if (prev !== undefined) {
        throw new DataValidationError(
          `cards[${index}] (${card.id}).id`,
          `중복된 id "${card.id}" (cards[${prev}]와 동일)`,
        );
      }
      seen.set(card.id, index);
      return card;
    });
    return { version, cards };
  }

  private validateCard(raw: unknown, index: number): Card {
    let path = `cards[${index}]`;
    // id를 읽을 수 있으면 경로에 덧붙여 어느 카드인지 알려 준다
    if (typeof raw === 'object' && raw !== null && typeof (raw as { id?: unknown }).id === 'string') {
      path += ` (${(raw as { id: string }).id})`;
    }
    const r = FieldReader.of(raw, path);
    r.onlyKeys(CARD_KEYS);

    const target = this.validateTarget(r.object('target'));
    const type = r.enum('type', CARD_TYPES);
    const card: Card = {
      id: r.string('id'),
      name: r.string('name'),
      owner: r.string('owner'),
      rarity: r.enum('rarity', RARITIES),
      type,
      cost: r.int('cost', 0),
      target,
      keywords: this.validateKeywords(r),
      text: r.string('text'),
      // 저주 카드는 효과가 없을 수 있다 (사용 불가 저주)
      effects: this.validateEffects(r, 'effects', target, type, type === 'curse'),
    };
    if (type === 'curse' && target.kind !== 'none') r.fail('target.kind', '저주 카드는 대상을 지정하지 않음 (none이어야 함)');
    if (r.has('curse')) {
      if (type !== 'curse') r.fail('curse', 'type이 curse인 카드만 curse 동작을 가질 수 있음');
      card.curse = this.validateCurse(r.object('curse'), card);
    }
    if (r.has('grantOnly')) {
      card.grantOnly = r.boolean('grantOnly');
      if (card.grantOnly && type === 'curse') r.fail('grantOnly', '저주 카드는 이미 보상 풀에서 제외됨 (grantOnly 불필요)');
    }
    if (card.type === 'equipment' && target.kind !== 'allyUnit') r.fail('target.kind', '장비는 아군 유닛 1명을 지정해야 함');
    if (r.has('limits')) card.limits = this.validateLimits(r.object('limits'));
    if (r.has('commanderHpCost')) card.commanderHpCost = this.validateHpCost(r.object('commanderHpCost'));
    if (r.has('resonance')) card.resonance = this.validateResonance(r.object('resonance'), target, type);
    const hasChainKeyword = card.keywords.includes('chain');
    if (r.has('chain')) {
      if (!hasChainKeyword) r.fail('chain', 'keywords에 chain이 없는 카드는 chain 효과를 가질 수 없음');
      card.chain = this.validateChain(r.object('chain'), target, type);
    } else if (hasChainKeyword) {
      r.fail('chain', 'keywords에 chain이 있으면 chain 효과가 필요함');
    }
    if (r.has('upgrade')) card.upgrade = this.validateUpgrade(r.object('upgrade'), card);
    return card;
  }

  private validateTarget(r: FieldReader): CardTarget {
    r.onlyKeys(['kind', 'count']);
    const kind = r.enum('kind', TARGET_KINDS);
    if (kind === 'allyUnits') return { kind, count: r.int('count', 1) };
    if (r.has('count')) r.fail('count', `kind "${kind}"에서는 count를 쓸 수 없음`);
    return { kind };
  }

  private validateKeywords(r: FieldReader): Keyword[] {
    return r.array('keywords').map((value, i) => {
      if (typeof value !== 'string' || !(KEYWORDS as readonly string[]).includes(value)) {
        r.fail(`keywords[${i}]`, `알 수 없는 값 ${JSON.stringify(value)} (허용: ${KEYWORDS.join(', ')})`);
      }
      return value as Keyword;
    });
  }

  private validateLimits(r: FieldReader): CardLimits {
    r.onlyKeys(['perCombat']);
    const limits: CardLimits = {};
    if (r.has('perCombat')) limits.perCombat = r.int('perCombat', 1);
    return limits;
  }

  private validateHpCost(r: FieldReader): CardHpCost {
    r.onlyKeys(['amount', 'waivedByTrait']);
    const cost: CardHpCost = { amount: r.int('amount', 1) };
    if (r.has('waivedByTrait')) cost.waivedByTrait = r.string('waivedByTrait');
    return cost;
  }

  private validateCurse(r: FieldReader, card: Card): CardCurse {
    r.onlyKeys(['playable', 'onDraw', 'goldLossAtEnd']);
    const curse: CardCurse = {};
    if (r.has('playable')) {
      curse.playable = r.boolean('playable');
      if (curse.playable && !card.keywords.includes('exhaust')) r.fail('playable', '사용할 수 있는 저주는 exhaust 키워드가 있어야 함 (써서 없애는 저주)');
    }
    if (r.has('onDraw')) curse.onDraw = this.validateEffects(r, 'onDraw', card.target, 'curse');
    if (r.has('goldLossAtEnd')) curse.goldLossAtEnd = r.int('goldLossAtEnd', 1);
    return curse;
  }

  private validateResonance(r: FieldReader, target: CardTarget, type: CardType): CardResonance {
    r.onlyKeys(['trait', 'effects']);
    return { trait: r.string('trait'), effects: this.validateEffects(r, 'effects', target, type) };
  }

  private validateChain(r: FieldReader, target: CardTarget, type: CardType): CardChain {
    r.onlyKeys(['effects', 'cost']);
    const chain: CardChain = { effects: this.validateEffects(r, 'effects', target, type, true) };
    if (r.has('cost')) chain.cost = r.int('cost', 0);
    if (chain.effects.length === 0 && chain.cost === undefined) r.fail('effects', '연쇄 효과 또는 비용이 필요함');
    return chain;
  }

  private validateUpgrade(r: FieldReader, card: Card): CardUpgrade {
    const { target, type } = card;
    const hasChainKeyword = card.keywords.includes('chain');
    r.onlyKeys(UPGRADE_KEYS);
    const upgrade: CardUpgrade = {
      text: r.string('text'),
      effects: this.validateEffects(r, 'effects', target, type, type === 'curse'),
    };
    if (r.has('cost')) upgrade.cost = r.int('cost', 0);
    if (r.has('resonance')) upgrade.resonance = this.validateResonance(r.object('resonance'), target, type);
    if (r.has('chain')) {
      if (!hasChainKeyword) r.fail('chain', 'keywords에 chain이 없는 카드는 chain 효과를 가질 수 없음');
      upgrade.chain = this.validateChain(r.object('chain'), target, type);
    }
    if (r.has('keywords')) {
      const keywords = this.validateKeywords(r);
      if (keywords.includes('chain') !== hasChainKeyword) r.fail('keywords', '강화로 chain 키워드를 더하거나 뺄 수 없음 (기본 카드와 같아야 함)');
      if (card.curse?.playable && !keywords.includes('exhaust')) r.fail('keywords', '사용할 수 있는 저주는 강화해도 exhaust 키워드가 있어야 함');
      upgrade.keywords = keywords;
    }
    if (r.has('commanderHpCost')) {
      if (!card.commanderHpCost) r.fail('commanderHpCost', '기본 카드에 지휘관 HP 비용이 없으면 강화로 더할 수 없음');
      upgrade.commanderHpCost = this.validateHpCost(r.object('commanderHpCost'));
    }
    return upgrade;
  }

  /** 공통 효과 검증기로 형식을 확인한 뒤, 카드 문맥(시전자 없음, 대상 종류)에서 실행 가능한지 검사한다 */
  private validateEffects(parent: FieldReader, key: string, target: CardTarget, type: CardType, allowEmpty = false): CardEffect[] {
    const effects = this.effects.validateList(parent, key, allowEmpty);
    assertEffectsUsable(parent, key, effects, { targetKind: target.kind, cardType: type });
    return effects;
  }
}
