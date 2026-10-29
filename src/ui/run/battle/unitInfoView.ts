import { COMBAT } from '../../../core/combat/constants';
import type { UnitDef } from '../../../core/data/unit';

/**
 * 전투 화면의 유닛 정보(클릭 패널·적 툴팁) 표시 정보 순수 빌더. DOM·Phaser 비의존.
 * 스킬 설명의 "a / b / c" 표기(1·2·3성 값)를 성급별 문장으로 풀어 준다.
 */

export type StarLevel = 1 | 2 | 3;

export interface StatRow {
  key: 'hp' | 'atk' | 'as' | 'rng' | 'arm' | 'res' | 'mana';
  label: string;
  value: string;
}

export interface SkillStarLine {
  star: StarLevel;
  text: string;
  current: boolean;
}

export interface UnitInfoView {
  unitId: string;
  name: string;
  star: StarLevel;
  tier: number;
  /** 기원·직업 이름 */
  traits: string[];
  /** 기원·직업 id (traits와 같은 순서) */
  traitIds: string[];
  stats: StatRow[];
  skillName: string;
  /** 1·2·3성 스킬 설명 (값 표기가 없으면 한 줄만) */
  skillLines: SkillStarLine[];
  boss: boolean;
}

/** 이름 조회 창구 (카탈로그를 직접 알 필요가 없게) */
export interface InfoNames {
  traitName(id: string): string;
}

/** 실제 전투 수치를 알 때 덮어쓴다 (적 편성 미리보기: 층 보정·변이 반영 값) */
export interface StatOverride {
  hp: number;
  atk: number;
  as?: number;
  range?: number;
  arm?: number;
  res?: number;
  mana?: number;
}

/** "a / b / c" (부호·% 허용: "+15 / +35 / +60", "-15% / -30% / -45%") */
const STAR_VALUE = /([+-]?\d+(?:\.\d+)?)(%?)\s*\/\s*([+-]?\d+(?:\.\d+)?)(%?)\s*\/\s*([+-]?\d+(?:\.\d+)?)(%?)/g;

/** 스킬 설명에 성급별 값 표기("1 / 1.25 / 1.5")가 있는가 */
export function hasStarValues(text: string): boolean {
  return new RegExp(STAR_VALUE.source).test(text);
}

/** "기절 1 / 1.25 / 1.5초" → 2성이면 "기절 1.25초" */
export function skillTextForStar(text: string, star: StarLevel): string {
  return text.replace(STAR_VALUE, (_all, a: string, ap: string, b: string, bp: string, c: string, cp: string) => {
    const picked = star === 1 ? [a, ap] : star === 2 ? [b, bp] : [c, cp];
    return `${picked[0]}${picked[1] || cp || bp || ap}`;
  });
}

/** 성급 배율을 반영한 HP·ATK (전투 유닛과 같은 식) */
export function starHpAtk(def: UnitDef, star: StarLevel): { hp: number; atk: number } {
  const mult = COMBAT.STAR_MULTIPLIER[star - 1] ?? 1;
  return { hp: Math.round(def.stats.hp * mult), atk: Math.round(def.stats.atk * mult) };
}

/** 판매 시 돌려받는 골드 (Management.sell과 같은 식: 등급 × 원본 수, 2성 이상은 −1) */
export function sellRefund(tier: number, star: StarLevel): number {
  return tier * 3 ** (star - 1) - (star === 1 ? 0 : 1);
}

export function buildUnitInfo(def: UnitDef, star: StarLevel, names: InfoNames, override?: StatOverride): UnitInfoView {
  const base = override ?? starHpAtk(def, star);
  const s = def.stats;
  const stats: StatRow[] = [
    { key: 'hp', label: '체력', value: String(base.hp) },
    { key: 'atk', label: '공격력', value: String(base.atk) },
    { key: 'as', label: '공격 속도', value: (override?.as ?? s.as).toFixed(2) },
    { key: 'rng', label: '사거리', value: String(override?.range ?? s.rng) },
    { key: 'arm', label: '방어', value: String(override?.arm ?? s.arm) },
    { key: 'res', label: '마법 저항', value: String(override?.res ?? s.res) },
    { key: 'mana', label: '최대 마나', value: String(override?.mana ?? s.mana) },
  ];
  const text = def.skill.text;
  const skillLines: SkillStarLine[] = hasStarValues(text)
    ? ([1, 2, 3] as const).map((n) => ({ star: n, text: skillTextForStar(text, n), current: n === star }))
    : [{ star, text, current: true }];
  return {
    unitId: def.id,
    name: def.name,
    star,
    tier: def.tier,
    traits: [names.traitName(def.origin), names.traitName(def.job)],
    traitIds: [def.origin, def.job],
    stats,
    skillName: def.skill.name,
    skillLines,
    boss: def.boss === true,
  };
}

/** 상태 이름 → 툴팁에 쓸 한국어 이름 */
const STATUS_NAMES: Record<string, string> = {
  stun: '기절',
  burn: '화상',
  damageTakenMult: '받는 피해 변화',
  undying: '불사',
  silence: '침묵',
  root: '속박',
  lifesteal: '흡혈',
  forceTarget: '우선 공격 대상',
  taunted: '도발당함',
  healAura: '치유 오라',
  extraShots: '추가 사격',
  reflect: '피해 반사',
  regen: '재생',
  damageAura: '피해 오라',
  empoweredAttack: '강화 공격',
};

export function statusLabel(name: string): string {
  if (name.startsWith('statMod:')) return `능력치 변화 (${name.slice('statMod:'.length)})`;
  return STATUS_NAMES[name] ?? name;
}
