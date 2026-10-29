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
  /** 아군 후열(중앙에서 가장 먼 열) */
  'alliesBackRow',
  'alliesMelee',
  /** 아군 무작위 1명 (sim Rng). 저주 카드의 뽑을 때 효과에서만 쓴다 */
  'randomAlly',
  'lineThroughTarget',
  'targetAndAdjacent',
  'enemiesInTargetArea',
  'alliesInTargetArea',
  'traitUnits',
  'selfAndAdjacent',
  'targetArea2x2',
  /** 시전자 반경 `selectorRadius`칸(기본 1) 안의 아군(시전자 포함) / 적 */
  'alliesAroundSelf',
  'enemiesAroundSelf',
  'allEnemies',
  /** 부채꼴 5발: 화살마다 맞은 첫 적(같은 적이 여러 번 나올 수 있음) / 맞은 적을 한 번씩만 */
  'fanArrows',
  'fanTargets',
] as const;
/** `selectorRadius`를 받을 수 있는 선택자 */
export const RADIUS_SELECTORS = ['alliesAroundSelf', 'enemiesAroundSelf'] as const;
/**
 * 순간이동 목적지.
 * - behindTarget: 대상에 인접한 빈 칸 중 이동자에서 가장 먼 칸
 * - besideTarget: 대상에 인접한 빈 칸 중 이동자에서 가장 가까운 칸 (도약)
 * - enemyBackRow: 상대 진영 후열의 빈 칸 (후열이 차 있으면 한 열씩 앞으로)
 * - lineEnd: 대상 방향 직선 위의 가장 먼 빈 칸 (질주). 빈 칸이 없으면 제자리
 */
export const TELEPORT_DESTINATIONS = ['behindTarget', 'besideTarget', 'enemyBackRow', 'lineEnd'] as const;
/** 지연 타격이 노리는 범위 */
export const DELAYED_AREAS = ['densestEnemies3x3', 'allEnemies', 'targetArea'] as const;
/**
 * 징집 위치.
 * - allyBack: 아군 후열의 빈 칸 (생략했을 때의 기본값)
 * - allyFront: 아군 전열의 빈 칸
 * - enemyBack: 상대 진영 후열의 빈 칸 (후열이 차 있으면 한 열씩 앞으로)
 */
export const SUMMON_PLACEMENTS = ['allyBack', 'allyFront', 'enemyBack'] as const;
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
  // 유닛 스킬용 (M5-4)
  'flatShield', 'cleanse', 'damageAura', 'empoweredAttack', 'reflect', 'regen', 'delayedStrike', 'skillCpGain',
  // 특성 전용 (M5-4)
  'stackingStatMod', 'startMana', 'handCostReduction', 'backRowLeap', 'critical',
  // 카드 확장 (M5-4 2부-A)
  'manaGain', 'handCostCut', 'spellDamageBoost', 'ultimateGain', 'damageZone', 'reviveOnce', 'startCp', 'commanderHeal',
] as const;

export type CombatStat = (typeof COMBAT_STATS)[number];
export type DamageType = (typeof DAMAGE_TYPES)[number];
export type EffectSelector = (typeof EFFECT_SELECTORS)[number];
export type TeleportDestination = (typeof TELEPORT_DESTINATIONS)[number];
export type DelayedArea = (typeof DELAYED_AREAS)[number];
export type SummonPlacement = (typeof SUMMON_PLACEMENTS)[number];
export type CombatEffectKind = (typeof COMBAT_EFFECT_KINDS)[number];

/** 숫자 하나 또는 [1성, 2성, 3성] */
export type StarValue = number | readonly [number, number, number];
/** 초 단위 숫자, 또는 전투 끝까지("combat") */
export type EffectDuration<V> = V | 'combat';

/** V = StarValue이면 데이터 형태, V = number이면 성급이 확정된 실행 형태 */
export type EffectOf<V> = EffectBody<V> & {
  /** `alliesAroundSelf`/`enemiesAroundSelf`의 반경(칸, 체비쇼프). 생략하면 1 */
  selectorRadius?: number;
};

type EffectBody<V> =
  | { kind: 'shield'; selector: EffectSelector; pctMaxHp: V; duration: EffectDuration<V> }
  | {
      kind: 'damageTakenMult';
      selector: EffectSelector;
      mult: V;
      duration: EffectDuration<V>;
      /** 지정하면 그 종류의 피해에만 적용 (생략하면 모든 피해) */
      dmgType?: DamageType;
    }
  | {
      kind: 'statMod';
      selector: EffectSelector;
      stat: CombatStat;
      pct: V;
      duration: EffectDuration<V>;
      /** true면 효과 지속 중 적을 처치할 때 지속 시간이 초기화됨 */
      refreshOnKill?: boolean;
      /** 지정하면 같은 시전자 종류가 건 이 효과가 대상에 최대 이만큼만 쌓인다 (넘치면 새로 걸리지 않음) */
      maxStacks?: V;
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
      /** 이 피해로 대상을 처치하면 시전자 마나 회복 (처치 1명당) */
      manaOnKill?: V;
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
  /**
   * 시전자 ATK와 무관한 고정 피해 (시전자 없이도 쓸 수 있음).
   * 조건부 추가 피해(카드): bonusIfBurning = 대상이 화상 중이면 피해에 더하는 수치,
   * hpBelowPct + belowMult = 대상 HP 비율이 hpBelowPct% 이하이면 피해 × belowMult (둘은 함께 써야 함).
   * 두 조건 모두 맞으면 (amount + bonusIfBurning) × belowMult. killCp = 이 피해로 대상을 처치하면 전투 CP를 얻는다 (카드 전용).
   */
  | {
      kind: 'flatDamage';
      selector: EffectSelector;
      amount: V;
      dmgType: DamageType;
      ignoreArmorPct?: V;
      bonusIfBurning?: V;
      hpBelowPct?: V;
      belowMult?: V;
      killCp?: V;
    }
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
  | { kind: 'lifesteal'; selector: EffectSelector; pct: V; duration: EffectDuration<V> }
  | { kind: 'onAttackBurn'; selector: EffectSelector; pctAtk: V; duration: V }
  | { kind: 'killFeast'; selector: EffectSelector; healPct: V; atkPct: V }
  | { kind: 'marksman'; selector: EffectSelector; rangeBonus: V; chance: V }
  | { kind: 'attackMana'; selector: EffectSelector; amount: V }
  /**
   * 징집(카드 전용). tier를 주면 그 등급의 무작위 유닛, unitId를 주면 그 유닛(둘 중 정확히 하나).
   * star(기본 1), placement(기본 allyBack), manaFull(마나 가득으로 등장)은 unitId와 함께만 쓴다.
   */
  | {
      kind: 'summon';
      selector: EffectSelector;
      count: V;
      tier?: V;
      unitId?: string;
      star?: V;
      placement?: SummonPlacement;
      manaFull?: boolean;
    }
  | { kind: 'scout'; selector: EffectSelector; count: V; pctMaxHp: V }
  /** 도발: 실행 시점에 selector 유닛 반경 radius칸(체비쇼프) 안의 적이 duration초 동안 그 유닛을 우선 공격. 여러 도발자가 겹치면 가장 가까운 쪽 */
  | { kind: 'taunt'; selector: EffectSelector; radius: V; duration: V }
  /**
   * 전투 시작 시 등록되는 트리거: 효과를 적용한 진영의 유닛이 적을 처치하면 CP를 amount만큼 얻는다.
   * 실제로 얻은 CP 합계가 maxPerCombat에 도달하면 더 얻지 않는다. selector는 allAllies만 허용.
   */
  | { kind: 'cpOnKill'; selector: EffectSelector; amount: V; maxPerCombat: V }
  /** 고정 수치 보호막 (최대 HP 비례가 아님) */
  | { kind: 'flatShield'; selector: EffectSelector; amount: V; duration: EffectDuration<V> }
  /** 해로운 상태(기절·침묵·속박·화상·도발당함·받는 피해 증가·스탯 감소) 제거 */
  | { kind: 'cleanse'; selector: EffectSelector }
  /** 시전자 주변 `radius`칸 적에게 `intervalSeconds`마다 고정 피해, 총 `count`회 (첫 피해는 한 간격 뒤) */
  | { kind: 'damageAura'; selector: EffectSelector; amount: V; dmgType: DamageType; radius: V; intervalSeconds: V; count: V }
  /** 다음 기본 공격 1회가 ATK의 pctAtk% 피해. 그 공격으로 대상을 처치하면 최대 마나의 manaPctOnKill% 회복 */
  | { kind: 'empoweredAttack'; selector: EffectSelector; pctAtk: V; dmgType: DamageType; manaPctOnKill?: V }
  /** 받은 피해(방어·보호막 흡수 전 확정 피해)의 pct%를 공격자에게 방어 무시로 돌려준다 */
  | { kind: 'reflect'; selector: EffectSelector; pct: V; duration: V }
  /** 지속 중 1초마다 최대 HP의 pctMaxHp% 회복 */
  | { kind: 'regen'; selector: EffectSelector; pctMaxHp: V; duration: V }
  /**
   * 지연 타격: delay초 뒤 area 범위에 중첩된 effects를 시전자 기준으로 실행한다 (시전자가 그 전에 죽으면 취소).
   * 범위는 시전 시점에 정해져 telegraph 이벤트로 예고되고, 발동 시 strike 이벤트가 나온다.
   * densestEnemies3x3이면 effects 안에서 enemiesInTargetArea, allEnemies면 allEnemies 선택자를 쓴다.
   * targetArea(카드 전용, 시전자 없음): 카드가 지정한 3×3 범위. effects 안에서 enemiesInTargetArea를 쓴다.
   */
  | { kind: 'delayedStrike'; selector: EffectSelector; delay: V; area: DelayedArea; effects: EffectOf<V>[] }
  /** 스킬로 전투 CP를 얻는다 (아군 진영·카드 시스템이 있을 때만). 시전 유닛마다 전투당 maxPerCombat번 */
  | { kind: 'skillCpGain'; selector: EffectSelector; amount: V; maxPerCombat: V }
  /** 특성 전용: intervalSeconds마다 selector 유닛에게 스탯 증가를 전투 끝까지 쌓는다 (최대 maxStacks중첩) */
  | { kind: 'stackingStatMod'; selector: EffectSelector; stat: CombatStat; pct: V; intervalSeconds: V; maxStacks: V }
  /** 특성 전용: 전투 시작 마나 증가 */
  | { kind: 'startMana'; selector: EffectSelector; amount: V }
  /** 특성 전용: selector 유닛이 스킬을 쓸 때마다 손패 무작위 1장의 비용 −amount (전투당 maxPerCombat번, 0 = 무제한) */
  | { kind: 'handCostReduction'; selector: EffectSelector; amount: V; maxPerCombat: V }
  /** 특성 전용: 전투 시작 시 selector 유닛이 상대 후열로 도약 */
  | { kind: 'backRowLeap'; selector: EffectSelector }
  /** 특성 전용: selector 유닛의 ATK 비례 피해(기본 공격·damage 효과)가 chance 확률로 damagePct% 피해 */
  | { kind: 'critical'; selector: EffectSelector; chance: V; damagePct: V }
  /** 지정 유닛의 마나를 amount만큼 회복 (최대치까지) */
  | { kind: 'manaGain'; selector: EffectSelector; amount: V }
  /** 카드 전용: 손패에서 비용이 1 이상인 무작위 1장의 이번 전투 비용을 amount 줄인다 (sim Rng, 최소 0). selector는 allAllies */
  | { kind: 'handCostCut'; selector: EffectSelector; amount: V }
  /** 카드 전용: 이번 전투 동안 주문 카드의 피해(고정 피해·화상)를 pct%p 더 키운다. 지휘관 패시브·유물과 더해진다. selector는 allAllies */
  | { kind: 'spellDamageBoost'; selector: EffectSelector; pct: V }
  /** 카드 전용: 궁극기 게이지를 amount 올린다 (최대 100, 이미 쓴 궁극기는 다시 쓸 수 없다). selector는 allAllies */
  | { kind: 'ultimateGain'; selector: EffectSelector; amount: V }
  /**
   * 카드 전용: 지정한 칸 범위에 duration초 동안 intervalSeconds마다 고정 피해 (첫 피해는 한 간격 뒤, 장판은 칸 기준).
   * selector는 enemiesInTargetArea
   */
  | { kind: 'damageZone'; selector: EffectSelector; amount: V; dmgType: DamageType; duration: V; intervalSeconds: V }
  /** 장비 전용: 대상 유닛이 쓰러질 상황이 되면 전투당 1회 최대 HP의 hpPct%로 되살아난다 */
  | { kind: 'reviveOnce'; selector: EffectSelector; hpPct: V }
  /** 작전 카드 전용: 이번 전투의 시작 CP를 amount 늘린다 (상한 6). selector는 allAllies */
  | { kind: 'startCp'; selector: EffectSelector; amount: V }
  /** 카드 전용: 전투에서 이기면 지휘관 HP를 amount 회복한다 (런이 정산, 최대 HP 초과 불가). selector는 allAllies */
  | { kind: 'commanderHeal'; selector: EffectSelector; amount: V };

export type EffectDef = EffectOf<StarValue>;
export type ResolvedEffect = EffectOf<number>;

/** 배열 파라미터를 성급(또는 단계) 인덱스(0~2)로 확정한다. */
export function resolveEffect(def: EffectDef, index: number): ResolvedEffect {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(def)) {
    if (key === 'effects' && Array.isArray(value)) out[key] = (value as EffectDef[]).map((nested) => resolveEffect(nested, index));
    else out[key] = Array.isArray(value) ? value[index] : value;
  }
  return out as ResolvedEffect;
}
