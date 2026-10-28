/**
 * 전투 효과 데이터 타입. 카드·스킬·특성이 공유한다 (DESIGN 10장 핵심 결정 1).
 * 값 목록과 의미는 data/README.md 기준.
 *
 * 수치 파라미터는 `StarValue`로 쓸 수 있다: 숫자 하나 또는 [1성, 2성, 3성] 배열.
 * 특성에서는 같은 배열을 [1단계, 2단계, 3단계]로 해석한다.
 */

export const COMBAT_STATS = ['atk', 'as', 'arm', 'res'] as const;
export const DAMAGE_TYPES = ['physical', 'magic'] as const;
export const EFFECT_SELECTORS = [
  'target',
  'self',
  'allAllies',
  'alliesFrontRow',
  'alliesMelee',
  'lineThroughTarget',
  'targetAndAdjacent',
  'enemiesInTargetArea',
  'alliesInTargetArea',
  'traitUnits',
  'selfAndAdjacent',
  'targetArea2x2',
] as const;
export const TELEPORT_DESTINATIONS = ['behindTarget'] as const;
export const COMBAT_EFFECT_KINDS = [
  'shield',
  'damageTakenMult',
  'statMod',
  'statAdd',
  'forceTarget',
  'undying',
  'swapPositions',
  'damage',
  'stun',
  'heal',
  'healAura',
  'burn',
  'teleport',
  'extraShots',
  'flatDamage',
  'silence',
  'manaDrain',
  'cpOnKill',
  'manaFill',
  'drawCards',
  'cpGain',
  'root', 'hpCost', 'lifesteal', 'onAttackBurn', 'killFeast', 'marksman', 'attackMana', 'summon', 'scout',
  'taunt',
] as const;

export type CombatStat = (typeof COMBAT_STATS)[number];
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type EffectSelector = (typeof EFFECT_SELECTORS)[number];
export type TeleportDestination = (typeof TELEPORT_DESTINATIONS)[number];
export type CombatEffectKind = (typeof COMBAT_EFFECT_KINDS)[number];

/** 숫자 하나 또는 [1성, 2성, 3성] */
export type StarValue = number | readonly [number, number, number];
/** 초 단위 숫자, 또는 전투 끝까지("combat") */
export type EffectDuration<V> = V | 'combat';

/** V = StarValue이면 데이터 형태, V = number이면 성급이 확정된 실행 형태 */
export type EffectOf<V> =
  | { kind: 'shield'; selector: EffectSelector; pctMaxHp: V; duration: EffectDuration<V> }
  | { kind: 'damageTakenMult'; selector: EffectSelector; mult: V; duration: EffectDuration<V> }
  | {
      kind: 'statMod';
      selector: EffectSelector;
      stat: CombatStat;
      pct: V;
      duration: EffectDuration<V>;
      /** true면 효과 지속 중 적을 처치할 때 지속 시간이 초기화됨 */
      refreshOnKill?: boolean;
    }
  | { kind: 'statAdd'; selector: EffectSelector; stat: CombatStat; amount: V; duration: EffectDuration<V> }
  | { kind: 'forceTarget'; selector: EffectSelector; duration: V }
  | { kind: 'undying'; selector: EffectSelector; duration: V }
  | { kind: 'swapPositions'; selector: EffectSelector }
  | {
      kind: 'damage';
      selector: EffectSelector;
      pctAtk: V;
      dmgType: DamageType;
      /** 대상 방어력 무시 비율(%) */
      ignoreArmorPct?: V;
      maxHpOnKill?: V;
    }
  | { kind: 'stun'; selector: EffectSelector; duration: V }
  | { kind: 'heal'; selector: EffectSelector; amount: V }
  | { kind: 'healAura'; selector: EffectSelector; perSecond: V; radius: V; duration: V }
  | {
      kind: 'burn';
      selector: EffectSelector;
      /** 시전자 ATK 대비 초당 피해(%). 시전자가 없는 카드·패시브는 dps를 쓴다 (둘 중 정확히 하나) */
      dpsPctAtk?: V;
      /** 고정 초당 피해 */
      dps?: V;
      duration: V;
    }
  | { kind: 'teleport'; selector: EffectSelector; destination: TeleportDestination }
  | { kind: 'extraShots'; selector: EffectSelector; count: V }
  /** 시전자 ATK와 무관한 고정 피해 (시전자 없이도 쓸 수 있음) */
  | { kind: 'flatDamage'; selector: EffectSelector; amount: V; dmgType: DamageType; ignoreArmorPct?: V }
  /** 침묵: 스킬 시전 불가 (이동·기본 공격은 가능). 중첩 없이 더 늦게 끝나는 쪽으로 갱신 */
  | { kind: 'silence'; selector: EffectSelector; duration: V }
  /** 대상 마나 감소 (0 미만으로 내려가지 않음) */
  | { kind: 'manaDrain'; selector: EffectSelector; amount: V }
  /** 지정 유닛의 마나를 최대로 채운다 */
  | { kind: 'manaFill'; selector: EffectSelector }
  /** 플레이어 카드 전용. selector는 allAllies, 유닛 수와 무관하게 한 번 뽑는다 */
  | { kind: 'drawCards'; selector: EffectSelector; count: V }
  /** 플레이어 카드 전용. selector는 allAllies, 유닛 수와 무관하게 한 번 전투 CP를 얻는다 (상한 6) */
  | { kind: 'cpGain'; selector: EffectSelector; amount: V }
  | { kind: 'root'; selector: EffectSelector; duration: V }
  | { kind: 'hpCost'; selector: EffectSelector; pctMaxHp: V }
  | { kind: 'lifesteal'; selector: EffectSelector; pct: V; duration: V }
  | { kind: 'onAttackBurn'; selector: EffectSelector; pctAtk: V; duration: V }
  | { kind: 'killFeast'; selector: EffectSelector; healPct: V; atkPct: V }
  | { kind: 'marksman'; selector: EffectSelector; rangeBonus: V; chance: V }
  | { kind: 'attackMana'; selector: EffectSelector; amount: V }
  | { kind: 'summon'; selector: EffectSelector; count: V; tier: V }
  | { kind: 'scout'; selector: EffectSelector; count: V; pctMaxHp: V }
  /** 도발: 실행 시점에 selector 유닛 반경 radius칸(체비쇼프) 안의 적이 duration초 동안 그 유닛을 우선 공격. 여러 도발자가 겹치면 가장 가까운 쪽 */
  | { kind: 'taunt'; selector: EffectSelector; radius: V; duration: V }
  /**
   * 전투 시작 시 등록되는 트리거: 효과를 적용한 진영의 유닛이 적을 처치하면 CP를 amount만큼 얻는다.
   * 실제로 얻은 CP 합계가 maxPerCombat에 도달하면 더 얻지 않는다. selector는 allAllies만 허용.
   */
  | { kind: 'cpOnKill'; selector: EffectSelector; amount: V; maxPerCombat: V };

export type EffectDef = EffectOf<StarValue>;
export type ResolvedEffect = EffectOf<number>;

/** 배열 파라미터를 성급(또는 단계) 인덱스(0~2)로 확정한다. */
export function resolveEffect(def: EffectDef, index: number): ResolvedEffect {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(def)) {
    out[key] = Array.isArray(value) ? value[index] : value;
  }
  return out as ResolvedEffect;
}
