import type { DamageType } from '../data/effect';
import type { CpPool } from '../cards/commandPoints';
import type { Cell, Side } from './board';
import type { PlayTarget } from './cardCommand';

/** 시뮬이 내보내는 상태 변화 이벤트. UI는 이 로그만으로 전투를 재생한다. unit/source/target은 유닛 인스턴스 id(uid). */
export type Winner = 0 | 1 | 'draw';
export type StatusDuration = number | 'combat';
/** CP가 바뀐 이유: 시작 / 자연 증가 / 카드 사용 / 심연 특성 */
export type CpReason = 'start' | 'regen' | 'card' | 'abyss';

export type CombatEvent = { t: number } & (
  | {
      type: 'spawn';
      unit: number;
      unitId: string;
      side: Side;
      star: number;
      cell: Cell;
      hp: number;
      maxHp: number;
      mana: number;
      maxMana: number;
    }
  | { type: 'moveStart'; unit: number; from: Cell; to: Cell; duration: number }
  | { type: 'moveEnd'; unit: number; cell: Cell }
  | { type: 'teleport'; unit: number; from: Cell; to: Cell }
  | { type: 'attack'; unit: number; target: number; shots: number }
  | {
      type: 'damage';
      unit: number;
      source: number | null;
      /** 방어·배율 적용 후 피해 (보호막 흡수 전) */
      amount: number;
      /** 보호막이 흡수한 양 */
      absorbed: number;
      dmgType: DamageType;
      /** 피해 적용 후 HP */
      hp: number;
    }
  | { type: 'heal'; unit: number; source: number | null; amount: number; hp: number }
  | { type: 'shield'; unit: number; amount: number; duration: StatusDuration }
  | { type: 'skillCast'; unit: number; skill: string; targets: number[] }
  | { type: 'mana'; unit: number; mana: number }
  | {
      type: 'statusApplied';
      unit: number;
      status: string;
      duration: StatusDuration;
      source: number | null;
      /** 수치: statMod=pct, statAdd=고정값, damageTakenMult=mult, burn=초당 피해, healAura=초당 회복량. 수치 없는 상태는 키 없음 */
      value?: number;
    }
  | { type: 'statusRemoved'; unit: number; status: string }
  | { type: 'death'; unit: number; killer: number | null }
  | { type: 'overheat' }
  | {
      type: 'cardPlayed';
      cardId: string;
      instanceId: number;
      upgraded: boolean;
      target: PlayTarget;
      /** 사용 후 남은 CP (사용한 풀 기준) */
      cp: number;
      pool: CpPool;
    }
  /** 아군(side 0)의 CP 변화. delta는 실제로 변한 양, cp는 변화 후 값 */
  | { type: 'cp'; pool: CpPool; delta: number; cp: number; reason: CpReason }
  | { type: 'end'; winner: Winner; reason: 'annihilation' | 'timeout' }
);

export type CombatEventType = CombatEvent['type'];
