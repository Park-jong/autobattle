import { FieldReader } from '../data/fieldReader';
import type { PointsRule, UnlockCondition, UnlockTarget } from '../data/meta';
import { MAX_THREAT_LEVEL } from '../data/threat';
import type { MetaCatalog } from '../data/metaLoader';
import { conditionProgress, emptyStats, type ConditionProgress, type MetaStats } from './conditions';
import type { RunSummary, RunUnlocks } from './runSummary';

export const META_SAVE_FORMAT = 'autochess-meta';
export const META_SAVE_VERSION = 1;
/** 중복 정산 방지를 위해 기억하는 최근 정산 런 수 (저장 크기 제한) */
export const META_SETTLED_RUNS_LIMIT = 100;

/** 해금된 경로: 조건 달성(자동) / 전공 포인트 구매 */
export type UnlockVia = 'condition' | 'purchase';

/** 저장 형식 (localStorage 저장은 UI 단계의 몫이고 core는 JSON 변환만 한다) */
export interface MetaSave {
  format: typeof META_SAVE_FORMAT;
  version: number;
  points: number;
  /** 지금까지 번 전공 포인트 합계 (구매로 쓴 만큼은 빠지지 않는다) */
  totalEarned: number;
  stats: MetaStats;
  unlocked: { id: string; via: UnlockVia }[];
  /** 최근 정산한 런 id (오래된 순) */
  settledRuns: string[];
  /** 선택 필드: 고를 수 있는 최고 위협 레벨 (0이면 저장하지 않고, 없는 저장본은 0으로 읽는다) */
  threatUnlocked?: number;
}

export type MetaResult = { ok: true } | { ok: false; reason: string };

/** 런 하나의 전공 포인트 내역 */
export interface PointsBreakdown {
  floors: number;
  bosses: number;
  elites: number;
  victory: number;
  /** 위협 레벨 보너스 (위 항목 합계 × 레벨당 비율, 반올림. 레벨 0이면 0) */
  threat: number;
  total: number;
}

export type SettleRunResult =
  | { ok: true; earned: PointsBreakdown; newUnlocks: string[]; balance: number; threatUnlocked: number | null }
  | { ok: false; reason: string };

/**
 * 전공 포인트 공식: 도달 층 + 보스 처치 + 정예 처치 + 승리 보너스 (계수는 meta.json points)에
 * 위협 레벨 보너스(합계 × threatBonusPctPerLevel × 레벨 / 100, 반올림)를 더한다. 레벨 0이면 보너스 없음
 */
export function calculateRunPoints(rule: PointsRule, summary: RunSummary): PointsBreakdown {
  const floors = summary.floorsReached * rule.perFloor;
  const bosses = summary.bossActsKilled.length * rule.perBoss;
  const elites = summary.eliteKills * rule.perElite;
  const victory = summary.outcome === 'victory' ? rule.victoryBonus : 0;
  const base = floors + bosses + elites + victory;
  const threat = Math.round((base * rule.threatBonusPctPerLevel * summary.threatLevel) / 100);
  return { floors, bosses, elites, victory, threat, total: base + threat };
}

/** UI가 해금 화면을 그리는 데 쓰는 항목 한 개의 상태 */
export interface UnlockItemView {
  id: string;
  target: UnlockTarget;
  price: number;
  condition: UnlockCondition;
  progress: ConditionProgress;
  unlocked: boolean;
  /** 해금됐다면 어떻게 (아니면 null) */
  via: UnlockVia | null;
  /** 지금 구매할 수 있는가 (잠겨 있고 포인트가 충분) */
  canPurchase: boolean;
}

/**
 * 런을 넘어 이어지는 메타 진행: 전공 포인트, 누적 통계, 해금 집합, 정산 기록.
 * 지휘관(이세라·녹스)과 unlock 조건이 있는 유물만 잠글 수 있고(meta.json), 나머지는 처음부터 열려 있다.
 * 해금은 달성 조건을 만족하면 정산 때 자동으로, 또는 전공 포인트로 먼저 구매해서 얻는다.
 * Phaser·DOM 비의존이고 난수를 쓰지 않는다. 저장 매체는 모른다 (serialize/restore만).
 */
export class MetaProgress {
  private balance = 0;
  private earned = 0;
  private stats: MetaStats = emptyStats();
  private unlocked = new Map<string, UnlockVia>();
  private settled: string[] = [];
  private threatMax = 0;

  constructor(private readonly catalog: MetaCatalog) {}

  /** 저장된 상태로 복원한다. 잘못된 데이터는 위치가 담긴 한국어 오류. 저장본에 있지만 meta.json에 없는 해금 id는 무시한다 */
  static restore(catalog: MetaCatalog, data: unknown): MetaProgress {
    const meta = new MetaProgress(catalog);
    const r = FieldReader.of(data, 'meta');
    r.onlyKeys(['format', 'version', 'points', 'totalEarned', 'stats', 'unlocked', 'settledRuns', 'threatUnlocked']);
    if (r.rawValue('format') !== META_SAVE_FORMAT) r.fail('format', `"${META_SAVE_FORMAT}"여야 함 (메타 진행 저장 파일이 아님)`);
    const version = r.int('version', 1);
    if (version > META_SAVE_VERSION) r.fail('version', `지원하지 않는 저장 버전 ${version} (지원: ${META_SAVE_VERSION})`);
    meta.balance = r.int('points', 0);
    meta.earned = r.int('totalEarned', 0);
    if (meta.balance > meta.earned) r.fail('points', `번 포인트 합계(${meta.earned})보다 많을 수 없음 (실제: ${meta.balance})`);
    meta.stats = MetaProgress.parseStats(r.object('stats'));
    r.array('unlocked').forEach((raw, i) => {
      const item = FieldReader.of(raw, `meta.unlocked[${i}]`);
      item.onlyKeys(['id', 'via']);
      const id = item.string('id');
      const via = item.enum('via', ['condition', 'purchase'] as const);
      if (meta.unlocked.has(id)) item.fail('id', `중복된 해금 "${id}"`);
      if (catalog.get(id)) meta.unlocked.set(id, via);
    });
    meta.settled = r.array('settledRuns').map((id, i) => {
      if (typeof id !== 'string' || id === '') r.fail(`settledRuns[${i}]`, `비어 있지 않은 문자열이어야 함 (실제: ${JSON.stringify(id)})`);
      return id as string;
    });
    if (r.has('threatUnlocked')) {
      meta.threatMax = r.int('threatUnlocked', 0);
      if (meta.threatMax > MAX_THREAT_LEVEL) r.fail('threatUnlocked', `0~${MAX_THREAT_LEVEL}이어야 함 (실제: ${meta.threatMax})`);
    }
    if (meta.settled.length > META_SETTLED_RUNS_LIMIT) r.fail('settledRuns', `${META_SETTLED_RUNS_LIMIT}개 이하여야 함 (실제: ${meta.settled.length})`);
    return meta;
  }

  private static parseStats(r: FieldReader): MetaStats {
    r.onlyKeys(['runsCompleted', 'eliteKills', 'ultimateUses', 'shopVisits', 'bossActsKilled', 'unitStar3', 'bestCompletedDeckSize', 'bestBossEntryGold']);
    const acts = r.array('bossActsKilled').map((act, i) => {
      if (typeof act !== 'number' || !Number.isInteger(act) || act < 1) r.fail(`bossActsKilled[${i}]`, `1 이상의 정수여야 함 (실제: ${JSON.stringify(act)})`);
      return act as number;
    });
    return {
      runsCompleted: r.int('runsCompleted', 0),
      eliteKills: r.int('eliteKills', 0),
      ultimateUses: r.int('ultimateUses', 0),
      shopVisits: r.int('shopVisits', 0),
      bossActsKilled: [...new Set(acts)].sort((a, b) => a - b),
      unitStar3: r.boolean('unitStar3'),
      bestCompletedDeckSize: r.int('bestCompletedDeckSize', 0),
      bestBossEntryGold: r.int('bestBossEntryGold', 0),
    };
  }

  serialize(): MetaSave {
    return {
      format: META_SAVE_FORMAT,
      version: META_SAVE_VERSION,
      points: this.balance,
      totalEarned: this.earned,
      stats: this.statsView(),
      unlocked: [...this.unlocked].map(([id, via]) => ({ id, via })),
      settledRuns: [...this.settled],
      ...(this.threatMax > 0 ? { threatUnlocked: this.threatMax } : {}),
    };
  }

  // ---- 조회 ----

  /** 쓸 수 있는 전공 포인트 */
  get points(): number { return this.balance; }
  /** 지금까지 번 전공 포인트 합계 */
  get totalEarned(): number { return this.earned; }

  /** 고를 수 있는 최고 위협 레벨 (기본 0 = 패널티 없는 기본 난이도만) */
  get maxThreatLevel(): number { return this.threatMax; }

  /** 누적 통계의 사본 */
  statsView(): MetaStats {
    return { ...this.stats, bossActsKilled: [...this.stats.bossActsKilled] };
  }

  /** 이 id를 잠글 수 있는 항목인가 (meta.json에 해금 항목이 있는가) */
  isLockable(id: string): boolean {
    return this.catalog.get(id) !== undefined;
  }

  /** 쓸 수 있는가: 잠글 수 없는 항목은 항상 true, 잠글 수 있으면 해금된 경우만 */
  isUnlocked(id: string): boolean {
    return !this.isLockable(id) || this.unlocked.has(id);
  }

  /** 잠글 수 있는 항목의 조건 진행도 (잠글 수 없는 id면 null) */
  progress(id: string): ConditionProgress | null {
    const entry = this.catalog.get(id);
    return entry ? conditionProgress(entry.condition, this.stats) : null;
  }

  /** 해금 화면용 전체 항목 (meta.json 순서) */
  items(): UnlockItemView[] {
    return this.catalog.unlocks.map((entry) => {
      const via = this.unlocked.get(entry.id) ?? null;
      return {
        id: entry.id, target: entry.target, price: entry.price, condition: entry.condition,
        progress: conditionProgress(entry.condition, this.stats),
        unlocked: via !== null, via,
        canPurchase: via === null && this.balance >= entry.price,
      };
    });
  }

  /**
   * 일반 런이 쓸 수 있는 지휘관·유물 목록: 주어진 전체 id 중 잠기지 않았거나 해금된 것.
   * 런 시작 때 이 값을 RunOptions.unlocks로 넘기면 런이 그 집합을 저장한다.
   */
  runUnlocks(allCommanderIds: readonly string[], allRelicIds: readonly string[]): RunUnlocks {
    return {
      commanders: allCommanderIds.filter((id) => this.isUnlocked(id)),
      relics: allRelicIds.filter((id) => this.isUnlocked(id)),
      maxThreat: this.threatMax,
    };
  }

  // ---- 변경 ----

  /** 전공 포인트로 해금을 구매한다 (조건 달성 전이라도 가능). 실패하면 상태는 그대로 */
  purchase(id: string): MetaResult {
    const entry = this.catalog.get(id);
    if (!entry) return { ok: false, reason: `해금할 수 없는 항목입니다 ("${id}")` };
    if (this.unlocked.has(id)) return { ok: false, reason: '이미 해금했습니다' };
    if (this.balance < entry.price) return { ok: false, reason: `전공 포인트가 부족합니다 (필요 ${entry.price}, 보유 ${this.balance})` };
    this.balance -= entry.price;
    this.unlocked.set(id, 'purchase');
    return { ok: true };
  }

  /**
   * 끝난 런을 정산한다: 통계 누적 → 전공 포인트 지급 → 새로 조건을 만족한 항목 자동 해금.
   * 같은 런 id는 한 번만 정산된다. 테스트 런·끝나지 않은 런·런 id가 없는 요약은 거부하며 상태는 그대로다.
   */
  settleRun(summary: RunSummary): SettleRunResult {
    if (summary.test) return { ok: false, reason: '테스트 런은 메타 진행에 정산하지 않습니다' };
    if (summary.outcome === null) return { ok: false, reason: '아직 끝나지 않은 런은 정산할 수 없습니다' };
    if (summary.runId === null) return { ok: false, reason: '런 식별자가 없어 정산할 수 없습니다' };
    if (this.settled.includes(summary.runId)) return { ok: false, reason: '이미 정산한 런입니다' };

    const stats = this.stats;
    stats.runsCompleted += 1;
    stats.eliteKills += summary.eliteKills;
    stats.ultimateUses += summary.ultimateUses;
    stats.shopVisits += summary.shopVisits;
    stats.bossActsKilled = [...new Set([...stats.bossActsKilled, ...summary.bossActsKilled])].sort((a, b) => a - b);
    stats.unitStar3 = stats.unitStar3 || summary.unitStar3;
    stats.bestCompletedDeckSize = Math.max(stats.bestCompletedDeckSize, summary.deckSize);
    stats.bestBossEntryGold = Math.max(stats.bestBossEntryGold, summary.bossEntryGold);

    const earned = calculateRunPoints(this.catalog.points, summary);
    this.balance += earned.total;
    this.earned += earned.total;

    this.settled.push(summary.runId);
    if (this.settled.length > META_SETTLED_RUNS_LIMIT) this.settled.shift();

    const newUnlocks: string[] = [];
    for (const entry of this.catalog.unlocks) {
      if (this.unlocked.has(entry.id)) continue;
      if (conditionProgress(entry.condition, this.stats).met) {
        this.unlocked.set(entry.id, 'condition');
        newUnlocks.push(entry.id);
      }
    }
    // 위협 레벨: 지금 고를 수 있는 최고 레벨과 같은 레벨로 승리하면 다음 레벨이 열린다 (최대 10).
    // 더 높은 레벨의 런(전공 기록을 초기화한 뒤 끝난 옛 런 등)은 한 번에 여러 레벨을 열지 못하게 같은 레벨일 때만 센다
    let threatUnlocked: number | null = null;
    if (summary.outcome === 'victory' && summary.threatLevel === this.threatMax && this.threatMax < MAX_THREAT_LEVEL) {
      this.threatMax += 1;
      threatUnlocked = this.threatMax;
    }
    return { ok: true, earned, newUnlocks, balance: this.balance, threatUnlocked };
  }
}
