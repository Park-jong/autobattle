import type { Cell, Side } from '../../core/combat/board';
import type { PlayTarget } from '../../core/combat/cardCommand';
import type { CombatEvent, CpReason, StatusDuration, Winner } from '../../core/combat/events';
import type { CpPool } from '../../core/cards/commandPoints';
import type { DamageType } from '../../core/data/effect';
import { TIMING } from '../theme';

/** 칸 좌표(소수 가능): 이동 보간 결과 */
export interface CellPos {
  col: number;
  row: number;
}

/** 현재 시각에 유지 중인 상태(기절·화상 등) */
export interface ActiveStatus {
  name: string;
  /** 끝나는 시각. 전투 끝까지면 Infinity */
  until: number;
  /** 남은 시간(초). 전투 끝까지면 Infinity */
  remaining: number;
  value?: number;
}

/** 한 시각의 유닛 표시 상태 */
export interface UnitView {
  uid: number;
  unitId: string;
  side: Side;
  star: number;
  hp: number;
  maxHp: number;
  /** 남은 보호막 합계 */
  shield: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  /** 사망 시각. 생존이면 null */
  deadAt: number | null;
  /** 논리 칸 (이동 중이면 출발 칸) */
  cell: Cell;
  /** 이동 보간: 출발 칸, 도착 칸, 진행률 0~1. 이동 중이 아니면 from = to = cell, 진행률 0 */
  moveFrom: Cell;
  moveTo: Cell;
  moveProgress: number;
  /** 보간된 현재 위치 */
  pos: CellPos;
  statuses: ActiveStatus[];
  /** 집중 포화 등 "우선 공격 대상" 표식이 켜져 있는지 (조준 마크) */
  marked: boolean;
}

/** 일정 시간 보여줄 연출 이벤트. seq는 이벤트 로그 안의 순번(고유 키) */
export type ReplayEffect =
  | { kind: 'attack'; seq: number; t: number; unit: number; target: number; shots: number }
  | {
      kind: 'damage';
      seq: number;
      t: number;
      unit: number;
      amount: number;
      absorbed: number;
      dmgType: DamageType;
    }
  | { kind: 'heal'; seq: number; t: number; unit: number; amount: number }
  | { kind: 'skill'; seq: number; t: number; unit: number; skill: string }
  | { kind: 'death'; seq: number; t: number; unit: number }
  | { kind: 'overheat'; seq: number; t: number }
  | { kind: 'card'; seq: number; t: number; cardId: string; upgraded: boolean; target: PlayTarget }
  | { kind: 'cp'; seq: number; t: number; pool: CpPool; delta: number; cp: number; reason: CpReason }
  | { kind: 'teleport'; seq: number; t: number; unit: number; from: Cell; to: Cell }
  /** 보스 패턴 예고: t부터 fireAt까지 cells를 강조한다 */
  | { kind: 'telegraph'; seq: number; t: number; id: number; cells: Cell[]; fireAt: number }
  /** 예고된 패턴 발동 */
  | { kind: 'strike'; seq: number; t: number; id: number; cells: Cell[] }
  /** 궁극기 발동 (배너) */
  | { kind: 'ultimate'; seq: number; t: number; commanderId: string; name: string; durationSeconds: number }
  /** 궁극기 운석 착탄 (번쩍임) */
  | { kind: 'impact'; seq: number; t: number; id: number; cell: Cell; radius: number };

/** 지금 하늘에서 떨어지는 중인 궁극기 운석 한 발 */
export interface MeteorView {
  id: number;
  cell: Cell;
  /** 착탄 범위 반경(체비쇼프, 1 = 3×3) */
  radius: number;
  startedAt: number;
  fireAt: number;
  /** 낙하 진행률 0~1 */
  progress: number;
}

/** 지속 효과가 있는 궁극기가 유지되는 동안의 표시 정보 (방진·대가 지불 등) */
export interface UltimateAuraView {
  commanderId: string;
  name: string;
  startedAt: number;
  until: number;
}

/** 지금 화면에 강조할 보스 예고 한 건 */
export interface TelegraphView {
  id: number;
  cells: readonly Cell[];
  /** 예고가 시작된 시각 / 발동 예정 시각 */
  startedAt: number;
  fireAt: number;
  /** 예고 진행률 0~1 (발동 시 1) */
  progress: number;
}

export interface ReplayOutcome {
  winner: Winner;
  reason: 'annihilation' | 'timeout';
  t: number;
}

const EPS = 1e-9;

interface ShieldEntry {
  amount: number;
  expiresAt: number;
}

interface StatusEntry {
  until: number;
  value?: number;
}

/** 우선 공격 대상 표식: 카드로 지정한 적과 끝나는 시각 */
interface ForceMark {
  uid: number;
  until: number;
}

interface MutableUnit {
  uid: number;
  unitId: string;
  side: Side;
  star: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  alive: boolean;
  deadAt: number | null;
  deathPos: CellPos | null;
  cell: Cell;
  move: { from: Cell; to: Cell; startT: number; duration: number } | null;
  /** 순간이동(진형 교대 등)을 짧게 미끄러지듯 보여주는 구간. 논리 칸(cell)은 이미 도착 칸 */
  slide: { from: Cell; to: Cell; startT: number } | null;
  shields: ShieldEntry[];
  statuses: Map<string, StatusEntry[]>;
}

function toUntil(t: number, duration: StatusDuration): number {
  return duration === 'combat' ? Infinity : t + duration;
}

/**
 * 이벤트 로그와 시각 t로부터 유닛별 표시 상태와 연출 이벤트를 계산한다 (Phaser·DOM 비의존).
 * 시간은 앞으로만 이동할 수 있고, reset()으로 처음부터 다시 시작할 수 있다.
 * events는 읽기 전용 배열이며 진행 중인 시뮬의 로그처럼 뒤에 계속 늘어나도 된다
 * (advanceTo를 다시 부르면 새로 쌓인 이벤트 중 시각 t 이하의 것만 이어서 반영한다).
 */
export class ReplayState {
  private cursor = 0;
  private currentTime = 0;
  private units = new Map<number, MutableUnit>();
  private effects: ReplayEffect[] = [];
  private overheatStarted = false;
  private outcome: ReplayOutcome | null = null;
  private forceMarks: ForceMark[] = [];
  private lastCardUnitTarget: number | null = null;
  /** 아직 발동하지 않은 보스 예고 (id 기준) */
  private openTelegraphs = new Map<number, Extract<ReplayEffect, { kind: 'telegraph' }>>();
  /** 아직 떨어지지 않은 궁극기 운석 (id 기준) */
  private openMeteors = new Map<number, { id: number; cell: Cell; radius: number; startedAt: number; fireAt: number }>();
  private aura: UltimateAuraView | null = null;

  constructor(private readonly events: readonly CombatEvent[]) {
    this.reset();
  }

  /** 처음 상태(t=0, 스폰 직후)로 되돌린다. */
  reset(): void {
    this.cursor = 0;
    this.currentTime = 0;
    this.units = new Map();
    this.effects = [];
    this.overheatStarted = false;
    this.outcome = null;
    this.forceMarks = [];
    this.lastCardUnitTarget = null;
    this.openTelegraphs = new Map();
    this.openMeteors = new Map();
    this.aura = null;
    this.advanceTo(0);
  }

  get time(): number {
    return this.currentTime;
  }

  /** 로그의 마지막 이벤트 시각 */
  get endTime(): number {
    return this.events[this.events.length - 1]?.t ?? 0;
  }

  get overheating(): boolean {
    return this.overheatStarted;
  }

  /** 종료 이벤트까지 재생했으면 결과, 아니면 null */
  get result(): ReplayOutcome | null {
    return this.outcome;
  }

  /** 시각 t까지의 이벤트를 모두 반영한다. 과거로는 갈 수 없다(reset 사용). */
  advanceTo(t: number): void {
    if (t < this.currentTime - EPS) {
      throw new Error(`재생 시간은 되돌릴 수 없음 (${this.currentTime} → ${t}), reset()을 사용`);
    }
    this.currentTime = Math.max(t, this.currentTime);
    while (this.cursor < this.events.length) {
      const event = this.events[this.cursor] as CombatEvent;
      if (event.t > t + EPS) break;
      this.apply(event, this.cursor);
      this.cursor++;
    }
  }

  /** 현재 시각의 모든 유닛 표시 상태 (uid 오름차순) */
  views(): UnitView[] {
    return [...this.units.values()].sort((a, b) => a.uid - b.uid).map((u) => this.toView(u));
  }

  viewOf(uid: number): UnitView | undefined {
    const unit = this.units.get(uid);
    return unit ? this.toView(unit) : undefined;
  }

  /** 현재 시각 기준 maxAge초 이내에 발생한 연출 이벤트 (오래된 순) */
  recentEffects(maxAge: number): ReplayEffect[] {
    return this.effects.filter((e) => this.currentTime - e.t <= maxAge + EPS);
  }

  /** 현재 시각에 유효한 보스 예고 (발동 전까지). strike가 재생되었거나 발동 시각이 지났으면 제외 */
  telegraphs(): TelegraphView[] {
    const t = this.currentTime;
    const out: TelegraphView[] = [];
    for (const e of this.openTelegraphs.values()) {
      if (t >= e.fireAt - EPS) continue;
      const span = Math.max(EPS, e.fireAt - e.t);
      out.push({ id: e.id, cells: e.cells, startedAt: e.t, fireAt: e.fireAt, progress: Math.min(1, Math.max(0, (t - e.t) / span)) });
    }
    return out;
  }

  /** 현재 시각에 떨어지는 중인 궁극기 운석 */
  meteors(): MeteorView[] {
    const t = this.currentTime;
    const out: MeteorView[] = [];
    for (const m of this.openMeteors.values()) {
      if (t >= m.fireAt - EPS) continue;
      const span = Math.max(EPS, m.fireAt - m.startedAt);
      out.push({ ...m, progress: Math.min(1, Math.max(0, (t - m.startedAt) / span)) });
    }
    return out;
  }

  /** 지속 효과가 있는 궁극기가 아직 유지 중이면 그 정보 (없으면 null) */
  ultimateAura(): UltimateAuraView | null {
    return this.aura && this.currentTime < this.aura.until - EPS ? this.aura : null;
  }

  // ---- 이벤트 적용 ----

  private apply(e: CombatEvent, seq: number): void {
    switch (e.type) {
      case 'spawn':
        this.units.set(e.unit, {
          uid: e.unit,
          unitId: e.unitId,
          side: e.side,
          star: e.star,
          hp: e.hp,
          maxHp: e.maxHp,
          mana: e.mana,
          maxMana: e.maxMana,
          alive: true,
          deadAt: null,
          deathPos: null,
          cell: e.cell,
          move: null,
          slide: null,
          shields: [],
          statuses: new Map(),
        });
        break;

      case 'moveStart': {
        const u = this.units.get(e.unit);
        if (u) {
          u.move = { from: e.from, to: e.to, startT: e.t, duration: e.duration };
          u.slide = null;
        }
        break;
      }
      case 'moveEnd': {
        const u = this.units.get(e.unit);
        if (u) {
          u.cell = e.cell;
          u.move = null;
        }
        break;
      }
      case 'teleport': {
        const u = this.units.get(e.unit);
        if (u) {
          u.cell = e.to;
          u.move = null;
          u.slide = { from: e.from, to: e.to, startT: e.t };
        }
        this.effects.push({ kind: 'teleport', seq, t: e.t, unit: e.unit, from: e.from, to: e.to });
        break;
      }

      case 'attack':
        this.effects.push({ kind: 'attack', seq, t: e.t, unit: e.unit, target: e.target, shots: e.shots });
        break;

      case 'damage': {
        const u = this.units.get(e.unit);
        if (u) {
          this.consumeShield(u, e.absorbed, e.t);
          u.hp = e.hp;
        }
        this.effects.push({
          kind: 'damage',
          seq,
          t: e.t,
          unit: e.unit,
          amount: e.amount,
          absorbed: e.absorbed,
          dmgType: e.dmgType,
        });
        break;
      }
      case 'heal': {
        const u = this.units.get(e.unit);
        if (u) u.hp = e.hp;
        this.effects.push({ kind: 'heal', seq, t: e.t, unit: e.unit, amount: e.amount });
        break;
      }
      case 'shield': {
        const u = this.units.get(e.unit);
        if (u) u.shields.push({ amount: e.amount, expiresAt: toUntil(e.t, e.duration) });
        break;
      }

      case 'skillCast':
        this.effects.push({ kind: 'skill', seq, t: e.t, unit: e.unit, skill: e.skill });
        break;
      case 'mana': {
        const u = this.units.get(e.unit);
        if (u) u.mana = e.mana;
        break;
      }
      case 'maxHp': {
        const u = this.units.get(e.unit);
        if (u) { u.maxHp = e.maxHp; u.hp = e.hp; }
        break;
      }

      case 'statusApplied': {
        const u = this.units.get(e.unit);
        if (!u || !u.alive) break;
        const list = u.statuses.get(e.status) ?? [];
        const entry: StatusEntry = { until: toUntil(e.t, e.duration) };
        if (e.status === 'forceTarget' && this.lastCardUnitTarget !== null) this.addForceMark(this.lastCardUnitTarget, entry.until);
        if (e.value !== undefined) entry.value = e.value;
        list.push(entry);
        u.statuses.set(e.status, list);
        break;
      }
      case 'statusRemoved': {
        const u = this.units.get(e.unit);
        if (u) this.removeStatus(u, e.status, e.t);
        break;
      }

      case 'death': {
        const u = this.units.get(e.unit);
        if (u) {
          u.deathPos = this.positionOf(u, e.t);
          u.alive = false;
          u.deadAt = e.t;
          u.hp = 0;
          u.move = null;
          u.slide = null;
          u.shields = [];
          u.statuses.clear();
        }
        this.effects.push({ kind: 'death', seq, t: e.t, unit: e.unit });
        break;
      }

      case 'cardPlayed':
        this.lastCardUnitTarget = e.target.kind === 'unit' ? e.target.uid : null;
        this.effects.push({ kind: 'card', seq, t: e.t, cardId: e.cardId, upgraded: e.upgraded, target: e.target });
        break;
      case 'cp':
        this.effects.push({ kind: 'cp', seq, t: e.t, pool: e.pool, delta: e.delta, cp: e.cp, reason: e.reason });
        break;

      case 'telegraph': {
        const effect = { kind: 'telegraph', seq, t: e.t, id: e.id, cells: e.cells, fireAt: e.fireAt } as const;
        this.effects.push(effect);
        this.openTelegraphs.set(e.id, effect);
        break;
      }
      case 'strike':
        this.openTelegraphs.delete(e.id);
        this.effects.push({ kind: 'strike', seq, t: e.t, id: e.id, cells: e.cells });
        break;

      case 'ultimateUsed':
        this.effects.push({ kind: 'ultimate', seq, t: e.t, commanderId: e.commanderId, name: e.name, durationSeconds: e.durationSeconds });
        if (e.durationSeconds > 0) this.aura = { commanderId: e.commanderId, name: e.name, startedAt: e.t, until: e.t + e.durationSeconds };
        break;
      case 'ultimateTelegraph':
        this.openMeteors.set(e.id, { id: e.id, cell: e.cell, radius: e.radius, startedAt: e.t, fireAt: e.fireAt });
        break;
      case 'ultimateImpact':
        this.openMeteors.delete(e.id);
        this.effects.push({ kind: 'impact', seq, t: e.t, id: e.id, cell: e.cell, radius: e.radius });
        break;

      case 'overheat':
        this.overheatStarted = true;
        this.effects.push({ kind: 'overheat', seq, t: e.t });
        break;
      case 'end':
        this.outcome = { winner: e.winner, reason: e.reason, t: e.t };
        break;
    }
  }

  /** 보호막은 먼저 얻은 것부터 흡수한다 */
  private consumeShield(u: MutableUnit, absorbed: number, t: number): void {
    let left = absorbed;
    for (const s of u.shields) {
      if (left <= 0) break;
      if (s.expiresAt <= t + EPS) continue;
      const used = Math.min(s.amount, left);
      s.amount -= used;
      left -= used;
    }
    u.shields = u.shields.filter((s) => s.amount > 0);
  }

  private removeStatus(u: MutableUnit, status: string, t: number): void {
    if (status === 'shield') {
      u.shields = u.shields.filter((s) => s.expiresAt > t + EPS && s.amount > 0);
      return;
    }
    const list = u.statuses.get(status);
    if (!list) return;
    const kept = list.filter((s) => s.until > t + EPS);
    // 같은 시각의 만료 알림이 여러 번 와도 아직 유효한 중첩은 유지한다.
    // 연발은 시간이 아닌 충전 소모로 해제되므로 예외다.
    if (status === 'extraShots' || kept.length === 0) u.statuses.delete(status);
    else u.statuses.set(status, kept);
  }

  // ---- 뷰 계산 ----

  private positionOf(u: MutableUnit, t: number): CellPos {
    if (u.deathPos) return u.deathPos;
    const m = u.move;
    if (!m) return this.slidePosition(u, t);
    const p = this.progressOf(u, t);
    return { col: m.from.col + (m.to.col - m.from.col) * p, row: m.from.row + (m.to.row - m.from.row) * p };
  }

  /** 이동 중이 아닐 때의 위치: 순간이동 직후 짧은 구간은 출발 칸에서 도착 칸으로 미끄러진다 */
  private slidePosition(u: MutableUnit, t: number): CellPos {
    const s = u.slide;
    if (!s) return { col: u.cell.col, row: u.cell.row };
    const p = Math.min(1, Math.max(0, (t - s.startT) / TIMING.SLIDE));
    return { col: s.from.col + (s.to.col - s.from.col) * p, row: s.from.row + (s.to.row - s.from.row) * p };
  }

  private addForceMark(uid: number, until: number): void {
    if (!this.forceMarks.some((m) => m.uid === uid && m.until === until)) this.forceMarks.push({ uid, until });
  }

  private progressOf(u: MutableUnit, t: number): number {
    const m = u.move;
    if (!m || m.duration <= 0) return 0;
    return Math.min(1, Math.max(0, (t - m.startT) / m.duration));
  }

  private toView(u: MutableUnit): UnitView {
    const t = this.currentTime;
    const m = u.move;
    const statuses: ActiveStatus[] = [];
    for (const [name, list] of u.statuses) {
      const live = list.filter((s) => s.until > t + EPS);
      if (live.length === 0) continue;
      const last = live[live.length - 1] as StatusEntry;
      const until = Math.max(...live.map((s) => s.until));
      const status: ActiveStatus = { name, until, remaining: until - t };
      if (last.value !== undefined) status.value = last.value;
      statuses.push(status);
    }
    const shield = u.shields.reduce((sum, s) => (s.expiresAt > t + EPS ? sum + s.amount : sum), 0);
    return {
      uid: u.uid,
      unitId: u.unitId,
      side: u.side,
      star: u.star,
      hp: u.hp,
      maxHp: u.maxHp,
      shield,
      mana: u.mana,
      maxMana: u.maxMana,
      alive: u.alive,
      deadAt: u.deadAt,
      cell: u.cell,
      moveFrom: m ? m.from : u.cell,
      moveTo: m ? m.to : u.cell,
      moveProgress: m ? this.progressOf(u, t) : 0,
      pos: this.positionOf(u, t),
      statuses,
      marked: u.alive && this.forceMarks.some((m) => m.uid === u.uid && m.until > t + EPS),
    };
  }
}
