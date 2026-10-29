import {
  COMBAT_EFFECT_KINDS,
  COMBAT_STATS,
  DAMAGE_TYPES,
  DELAYED_AREAS,
  EFFECT_SELECTORS,
  RADIUS_SELECTORS,
  TELEPORT_DESTINATIONS,
  type CombatEffectKind,
  type EffectDef,
  type EffectDuration,
  type StarValue,
} from './effect';
import { FieldReader } from './fieldReader';

/** 효과 종류별 허용 파라미터 (공통: kind, selector) */
const PARAM_KEYS: Record<CombatEffectKind, readonly string[]> = {
  shield: ['pctMaxHp', 'duration'],
  damageTakenMult: ['mult', 'duration', 'dmgType'],
  statMod: ['stat', 'pct', 'duration', 'refreshOnKill', 'maxStacks'],
  statAdd: ['stat', 'amount', 'duration'],
  forceTarget: ['duration'],
  undying: ['duration'],
  swapPositions: [],
  damage: ['pctAtk', 'dmgType', 'ignoreArmorPct', 'maxHpOnKill', 'manaOnKill'],
  stun: ['duration'],
  heal: ['amount'],
  healAura: ['perSecond', 'radius', 'duration'],
  burn: ['dpsPctAtk', 'dps', 'duration'],
  teleport: ['destination'],
  extraShots: ['count'],
  flatDamage: ['amount', 'dmgType', 'ignoreArmorPct'],
  silence: ['duration'],
  manaDrain: ['amount'],
  cpOnKill: ['amount', 'maxPerCombat'],
  manaFill: [],
  drawCards: ['count'],
  cpGain: ['amount'],
  root: ['duration'], hpCost: ['pctMaxHp'], lifesteal: ['pct', 'duration'],
  onAttackBurn: ['pctAtk', 'duration'], killFeast: ['healPct', 'atkPct'], marksman: ['rangeBonus', 'chance'],
  attackMana: ['amount'], summon: ['count', 'tier'], scout: ['count', 'pctMaxHp'],
  taunt: ['radius', 'duration'],
  flatShield: ['amount', 'duration'],
  cleanse: [],
  damageAura: ['amount', 'dmgType', 'radius', 'intervalSeconds', 'count'],
  empoweredAttack: ['pctAtk', 'dmgType', 'manaPctOnKill'],
  reflect: ['pct', 'duration'],
  regen: ['pctMaxHp', 'duration'],
  delayedStrike: ['delay', 'area', 'effects'],
  skillCpGain: ['amount', 'maxPerCombat'],
  stackingStatMod: ['stat', 'pct', 'intervalSeconds', 'maxStacks'],
  startMana: ['amount'],
  handCostReduction: ['amount', 'maxPerCombat'],
  backRowLeap: [],
  critical: ['chance', 'damagePct'],
};

export interface EffectValidatorOptions {
  /** false면 [1성, 2성, 3성] 성급 배열을 거부한다 (카드·지휘관 패시브처럼 성급이 없는 곳) */
  allowStarArrays: boolean;
  /** 카드 덱이 있어야 실행할 수 있는 효과 허용 */
  allowCardEffects?: boolean;
}

/**
 * 전투 효과 목록을 검증한다 (스킬·특성·카드·지휘관 패시브 공용).
 * 기본은 수치에 숫자 또는 길이 3 배열을 허용하며, 성급이 없는 곳은 allowStarArrays: false를 준다.
 * 효과가 놓인 문맥(시전자·대상 유무)에 따른 제약은 effectUsage.ts가 따로 검사한다.
 */
export class EffectValidator {
  constructor(private readonly options: EffectValidatorOptions = { allowStarArrays: true }) {}

  /** parent[key] 배열을 효과 목록으로 검증. allowEmpty가 아니면 최소 1개 필요 */
  validateList(parent: FieldReader, key: string, allowEmpty = false): EffectDef[] {
    const list = parent.array(key);
    if (list.length === 0 && !allowEmpty) parent.fail(key, '효과가 최소 1개 필요함');
    return list.map((raw, i) => this.validateEffect(FieldReader.of(raw, `${parent.path}.${key}[${i}]`)));
  }

  /** nested: 지연 타격 안에 중첩된 효과인지 (중첩된 지연 타격은 거부) */
  validateEffect(r: FieldReader, nested = false): EffectDef {
    const kind = r.enum('kind', COMBAT_EFFECT_KINDS);
    r.onlyKeys(['kind', 'selector', 'selectorRadius', ...PARAM_KEYS[kind]]);
    const selector = r.enum('selector', EFFECT_SELECTORS);
    const effect = this.validateBody(r, kind, selector, nested);
    if (r.has('selectorRadius')) {
      if (!(RADIUS_SELECTORS as readonly string[]).includes(selector)) {
        r.fail('selectorRadius', `selector ${selector}에서는 쓸 수 없음 (허용: ${RADIUS_SELECTORS.join(', ')})`);
      }
      effect.selectorRadius = r.int('selectorRadius', 1);
    }
    return effect;
  }

  private validateBody(r: FieldReader, kind: CombatEffectKind, selector: EffectDef['selector'], nested: boolean): EffectDef {
    switch (kind) {
      case 'flatShield': return { kind, selector, amount: this.star(r, 'amount', 1), duration: this.duration(r) };
      case 'cleanse': return { kind, selector };
      case 'damageAura':
        return {
          kind, selector, amount: this.star(r, 'amount', 0), dmgType: r.enum('dmgType', DAMAGE_TYPES),
          radius: this.star(r, 'radius', 1), intervalSeconds: this.star(r, 'intervalSeconds', 0.1), count: this.star(r, 'count', 1),
        };
      case 'empoweredAttack': {
        const effect: EffectDef = { kind, selector, pctAtk: this.star(r, 'pctAtk', 0), dmgType: r.enum('dmgType', DAMAGE_TYPES) };
        if (r.has('manaPctOnKill')) effect.manaPctOnKill = this.star(r, 'manaPctOnKill', 0);
        return effect;
      }
      case 'reflect': return { kind, selector, pct: this.star(r, 'pct', 0), duration: this.star(r, 'duration', 0) };
      case 'regen': return { kind, selector, pctMaxHp: this.star(r, 'pctMaxHp', 0), duration: this.star(r, 'duration', 0) };
      case 'delayedStrike': {
        if (nested) r.fail('kind', '지연 타격 안에 지연 타격을 중첩할 수 없음');
        if (selector !== 'self') r.fail('selector', 'delayedStrike는 selector가 self여야 함');
        const list = r.array('effects');
        if (list.length === 0) r.fail('effects', '효과가 최소 1개 필요함');
        const effects = list.map((raw, i) => this.validateEffect(FieldReader.of(raw, `${r.path}.effects[${i}]`), true));
        return { kind, selector, delay: this.star(r, 'delay', 0.1), area: r.enum('area', DELAYED_AREAS), effects };
      }
      case 'skillCpGain':
        return { kind, selector, amount: this.star(r, 'amount', 1), maxPerCombat: this.star(r, 'maxPerCombat', 1) };
      case 'stackingStatMod':
        return {
          kind, selector, stat: r.enum('stat', COMBAT_STATS), pct: this.star(r, 'pct'),
          intervalSeconds: this.star(r, 'intervalSeconds', 0.1), maxStacks: this.star(r, 'maxStacks', 1),
        };
      case 'startMana': return { kind, selector, amount: this.star(r, 'amount', 0) };
      case 'handCostReduction':
        return { kind, selector, amount: this.star(r, 'amount', 1), maxPerCombat: this.star(r, 'maxPerCombat', 0) };
      case 'backRowLeap': return { kind, selector };
      case 'critical': {
        const chance = this.star(r, 'chance', 0);
        for (const value of Array.isArray(chance) ? chance : [chance]) if (value > 1) r.fail('chance', `0~1 확률이어야 함 (실제: ${value})`);
        return { kind, selector, chance, damagePct: this.star(r, 'damagePct', 100) };
      }
    }
    return this.validateLegacy(r, kind, selector);
  }

  private validateLegacy(r: FieldReader, kind: CombatEffectKind, selector: EffectDef['selector']): EffectDef {
    switch (kind) {
      case 'root': return { kind, selector, duration: this.star(r, 'duration', 0) };
      case 'hpCost': return { kind, selector, pctMaxHp: this.star(r, 'pctMaxHp', 0) };
      case 'lifesteal': return { kind, selector, pct: this.star(r, 'pct', 0), duration: this.star(r, 'duration', 0) };
      case 'onAttackBurn': return { kind, selector, pctAtk: this.star(r, 'pctAtk', 0), duration: this.star(r, 'duration', 0) };
      case 'killFeast': return { kind, selector, healPct: this.star(r, 'healPct', 0), atkPct: this.star(r, 'atkPct', 0) };
      case 'marksman': return { kind, selector, rangeBonus: this.star(r, 'rangeBonus', 0), chance: this.star(r, 'chance', 0) };
      case 'taunt': return { kind, selector, radius: this.star(r, 'radius', 1), duration: this.star(r, 'duration', 0) };
      case 'attackMana': return { kind, selector, amount: this.star(r, 'amount', 0) };
      case 'summon':
      case 'scout':
        if (!this.options.allowCardEffects) r.fail('kind', `${kind}는 카드 전용 효과임`);
        if (selector !== 'allAllies') r.fail('selector', `${kind}는 selector가 allAllies여야 함`);
        return kind === 'summon'
          ? { kind, selector, count: r.int('count', 1), tier: r.int('tier', 1) }
          : { kind, selector, count: r.int('count', 1), pctMaxHp: this.star(r, 'pctMaxHp', 0) };
      case 'manaFill':
        return { kind, selector };
      case 'cpGain':
        if (!this.options.allowCardEffects) r.fail('kind', 'cpGain은 카드 전용 효과임');
        if (selector !== 'allAllies') r.fail('selector', 'cpGain은 selector가 allAllies여야 함');
        return { kind, selector, amount: r.int('amount', 1) };
      case 'drawCards':
        if (!this.options.allowCardEffects) r.fail('kind', 'drawCards는 카드 전용 효과임');
        if (selector !== 'allAllies') r.fail('selector', 'drawCards는 selector가 allAllies여야 함');
        return { kind, selector, count: r.int('count', 1) };
      case 'shield':
        return { kind, selector, pctMaxHp: this.star(r, 'pctMaxHp', 0), duration: this.duration(r) };
      case 'damageTakenMult': {
        const effect: EffectDef = { kind, selector, mult: this.star(r, 'mult', 0), duration: this.duration(r) };
        if (r.has('dmgType')) effect.dmgType = r.enum('dmgType', DAMAGE_TYPES);
        return effect;
      }
      case 'statMod': {
        const effect: EffectDef = {
          kind,
          selector,
          stat: r.enum('stat', COMBAT_STATS),
          pct: this.star(r, 'pct'),
          duration: this.duration(r),
        };
        if (r.has('refreshOnKill')) effect.refreshOnKill = r.boolean('refreshOnKill');
        if (r.has('maxStacks')) effect.maxStacks = this.star(r, 'maxStacks', 1);
        return effect;
      }
      case 'statAdd':
        return {
          kind,
          selector,
          stat: r.enum('stat', COMBAT_STATS),
          amount: this.star(r, 'amount'),
          duration: this.duration(r),
        };
      case 'forceTarget':
        return { kind, selector, duration: this.star(r, 'duration', 0) };
      case 'undying':
        return { kind, selector, duration: this.star(r, 'duration', 0) };
      case 'swapPositions':
        return { kind, selector };
      case 'damage': {
        const effect: EffectDef = {
          kind,
          selector,
          pctAtk: this.star(r, 'pctAtk', 0),
          dmgType: r.enum('dmgType', DAMAGE_TYPES),
        };
        if (r.has('ignoreArmorPct')) effect.ignoreArmorPct = this.star(r, 'ignoreArmorPct', 0);
        if (r.has('maxHpOnKill')) effect.maxHpOnKill = this.star(r, 'maxHpOnKill', 0);
        if (r.has('manaOnKill')) effect.manaOnKill = this.star(r, 'manaOnKill', 0);
        return effect;
      }
      case 'stun':
        return { kind, selector, duration: this.star(r, 'duration', 0) };
      case 'heal':
        return { kind, selector, amount: this.star(r, 'amount', 0) };
      case 'healAura':
        return {
          kind,
          selector,
          perSecond: this.star(r, 'perSecond', 0),
          radius: this.star(r, 'radius', 1),
          duration: this.star(r, 'duration', 0),
        };
      case 'burn': {
        if (r.has('dpsPctAtk') === r.has('dps')) r.fail('dps', 'dpsPctAtk와 dps 중 정확히 하나만 있어야 함');
        const effect: EffectDef = { kind, selector, duration: this.star(r, 'duration', 0) };
        if (r.has('dpsPctAtk')) effect.dpsPctAtk = this.star(r, 'dpsPctAtk', 0);
        if (r.has('dps')) effect.dps = this.star(r, 'dps', 0);
        return effect;
      }
      case 'teleport':
        return { kind, selector, destination: r.enum('destination', TELEPORT_DESTINATIONS) };
      case 'extraShots':
        return { kind, selector, count: this.star(r, 'count', 1) };
      case 'flatDamage': {
        const effect: EffectDef = {
          kind,
          selector,
          amount: this.star(r, 'amount', 0),
          dmgType: r.enum('dmgType', DAMAGE_TYPES),
        };
        if (r.has('ignoreArmorPct')) effect.ignoreArmorPct = this.star(r, 'ignoreArmorPct', 0);
        return effect;
      }
      case 'silence':
        return { kind, selector, duration: this.star(r, 'duration', 0) };
      case 'manaDrain':
        return { kind, selector, amount: this.star(r, 'amount', 0) };
      case 'cpOnKill':
        if (selector !== 'allAllies') r.fail('selector', 'cpOnKill은 selector가 allAllies여야 함');
        return { kind, selector, amount: this.star(r, 'amount', 1), maxPerCombat: this.star(r, 'maxPerCombat', 1) };
      default:
        throw new Error(`검증기에 없는 효과 종류: ${kind}`);
    }
  }

  /** 숫자 하나 또는 [1성, 2성, 3성] 배열 */
  private star(r: FieldReader, key: string, min?: number): StarValue {
    const raw = r.rawValue(key);
    if (!Array.isArray(raw)) return r.number(key, min);
    if (!this.options.allowStarArrays) r.fail(key, '이 위치에서는 성급별 배열을 쓸 수 없음 (숫자 하나여야 함)');
    if (raw.length !== 3) r.fail(key, `성급별 배열은 길이 3이어야 함 (실제: ${raw.length})`);
    const values = raw.map((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) r.fail(`${key}[${i}]`, '숫자여야 함');
      if (min !== undefined && v < min) r.fail(`${key}[${i}]`, `${min} 이상이어야 함 (실제: ${v})`);
      return v;
    });
    return [values[0] as number, values[1] as number, values[2] as number];
  }

  /** 초 단위 값(숫자 또는 성급 배열) 또는 "combat" */
  private duration(r: FieldReader): EffectDuration<StarValue> {
    if (r.rawValue('duration') === 'combat') return 'combat';
    return this.star(r, 'duration', 0);
  }
}
