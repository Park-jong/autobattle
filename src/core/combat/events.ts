import type { DamageType } from '../data/effect';
import type { CpPool } from '../cards/commandPoints';
import type { Cell, Side } from './board';
import type { PlayTarget } from './cardCommand';

/** 시뮬이 내보내는 상태 변화 이벤트. UI는 이 로그만으로 전투를 재생한다. unit/source/target은 유닛 인스턴스 id(uid). */
export type Winner = 0 | 1 | 'draw';
export type StatusDuration = number | 'combat';
/** CP가 바뀐 이유: 시작 / 자연 증가 / 카드 사용 / 심연 특성 */
export type CpReason = 'start' | 'regen' | 'card' | 'abyss' | 'effect';

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
  | { type: 'maxHp'; unit: number; maxHp: number; hp: number }
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
  /** 적 진영에 걸린 정예 변이 (전투 시작 시각에 한 번씩) */
  | { type: 'mutation'; id: string }
  /** 방해 변이: 손패 카드의 비용이 올랐다. surcharge는 그 카드의 누적 추가 비용 */
  | { type: 'cardCost'; instanceId: number; cardId: string; surcharge: number }
  /** 보스 패턴 예고: fireAt(초)에 cells 칸의 유닛이 공격받는다. id는 같은 시전의 strike와 짝 */
  | { type: 'telegraph'; id: number; source: number; pattern: string; cells: Cell[]; fireAt: number }
  /** 예고된 패턴 발동 (피해는 이어지는 damage 이벤트) */
  | { type: 'strike'; id: number; source: number; cells: Cell[] }
  /**
   * 쌍둥이 보스 한쪽(unit)이 죽었다: 짝(partner)이 fireAt(초)까지 죽지 않으면 unit이 부활한다.
   * 짝도 그 전에 죽으면 부활은 취소되고(reviveCancel) 둘 다 처치된 것이다
   */
  | { type: 'reviveTelegraph'; unit: number; partner: number; fireAt: number }
  /** 쌍둥이 부활이 취소됨 (둘 다 제한 시간 안에 처치). reason 'noCell' = 부활 시점에 진영에 빈 칸이 없음 (정상 경로에는 필드 없음) */
  | { type: 'reviveCancel'; unit: number; reason?: 'noCell' }
  /** 쌍둥이 부활: unit이 hp/maxHp로 cell에 되살아났다 (상태는 모두 초기화) */
  | { type: 'revive'; unit: number; hp: number; maxHp: number; cell: Cell }
  /** 보스 페이즈 전환: phase(2부터)로 넘어갔다. summoned = 증원 유닛 uid(이어지는 spawn 이벤트), dispelled = 버프가 해제된 아군 수 */
  | { type: 'bossPhase'; unit: number; phase: number; hpPct: number; summoned: number[]; dispelled: number }
  /** 버프 해제(보스 페이즈 전환): unit에서 statuses(상태 이름)의 버프가 사라졌다. 'shield'는 보호막 전부 */
  | { type: 'dispel'; unit: number; statuses: string[] }
  /** 카드로 지휘관 HP를 잃었다 (런이 정산). remaining은 이 전투에서 아직 쓸 수 있는 HP */
  | { type: 'commanderHp'; delta: number; remaining: number; cardId: string; instanceId: number }
  /** 궁극기 발동. durationSeconds = 지속 효과(받는 피해 감소·흡수·CP 가속 등)가 이어지는 길이. 운석처럼 지속 효과가 없으면 0 */
  | { type: 'ultimateUsed'; commanderId: string; name: string; durationSeconds: number }
  /** 궁극기 운석 예고: fireAt(초)에 cell 중심 radius칸 범위에 떨어진다. id는 같은 낙하의 ultimateImpact와 짝 */
  | { type: 'ultimateTelegraph'; id: number; cell: Cell; radius: number; fireAt: number }
  /** 궁극기 운석 착탄 (피해는 이어지는 damage 이벤트) */
  | { type: 'ultimateImpact'; id: number; cell: Cell; radius: number }
  | { type: 'end'; winner: Winner; reason: 'annihilation' | 'timeout' }
);

export type CombatEventType = CombatEvent['type'];
