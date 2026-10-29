import type { CommanderCatalog, MetaCatalog, RelicCatalog, ThreatCatalog, UnlockTarget } from '../../core/data';
import { describeCondition, type MetaStats, type PointsBreakdown, type RunSummary, type UnlockItemView, type UnlockVia } from '../../core/meta';
import type { MetaStatus } from './MetaStore';
import { threatName } from './threatViews';

/** 해금 항목 한 줄의 상태: 잠김 / 조건 달성(아직 정산 전) / 해금됨 */
export type MetaItemState = 'locked' | 'ready' | 'unlocked';

export interface MetaItemRow {
  id: string;
  target: UnlockTarget;
  targetLabel: string;
  name: string;
  /** 달성 조건 문장 */
  conditionText: string;
  /** 진행도 "현재/목표" */
  progressText: string;
  met: boolean;
  price: number;
  state: MetaItemState;
  stateLabel: string;
  /** 지금 전공 포인트로 살 수 있는가 */
  canPurchase: boolean;
  /** 살 수 없을 때 부족한 포인트 (살 수 있거나 이미 해금이면 0) */
  shortfall: number;
  purchaseLabel: string;
}

/** 시작 화면·전공 패널이 쓰는 메타 표시 정보 */
export interface MetaStartView {
  status: 'ok' | 'broken';
  /** 손상일 때 안내 (아니면 빈 문자열) */
  message: string;
  points: number;
  totalEarned: number;
  /** meta.json 순서의 해금 항목 전체 (손상이면 빈 목록) */
  items: MetaItemRow[];
  /** 지휘관 id → 해금 항목 (잠글 수 있는 지휘관만) */
  commanders: Record<string, MetaItemRow>;
  statLines: string[];
  /** 처음부터 열려 있는 항목 안내 문구 */
  baseText: string;
}

const TARGET_LABEL: Record<UnlockTarget, string> = { commander: '지휘관', relic: '유물' };

const VIA_LABEL: Record<UnlockVia, string> = { condition: '해금됨 (조건 달성)', purchase: '해금됨 (구매)' };

export function buildMetaRow(item: UnlockItemView, names: (target: UnlockTarget, id: string) => string, points: number): MetaItemRow {
  const state: MetaItemState = item.unlocked ? 'unlocked' : item.progress.met ? 'ready' : 'locked';
  const shortfall = item.unlocked ? 0 : Math.max(0, item.price - points);
  return {
    id: item.id,
    target: item.target,
    targetLabel: TARGET_LABEL[item.target],
    name: names(item.target, item.id),
    conditionText: describeCondition(item.condition),
    progressText: `${item.progress.current}/${item.progress.target}`,
    met: item.progress.met,
    price: item.price,
    state,
    stateLabel: item.via ? VIA_LABEL[item.via] : state === 'ready' ? '조건 달성' : '잠김',
    canPurchase: item.canPurchase,
    shortfall,
    purchaseLabel: item.unlocked ? '' : item.canPurchase ? `전공 ${item.price}으로 해금` : `전공 ${item.price} 필요 (${shortfall} 부족)`,
  };
}

export function buildStatLines(stats: MetaStats, totalEarned: number): string[] {
  return [
    `끝난 런 ${stats.runsCompleted}회`,
    `정예 처치 ${stats.eliteKills}회`,
    `궁극기 사용 ${stats.ultimateUses}회`,
    `상점 방문 ${stats.shopVisits}회`,
    `처치한 보스: ${stats.bossActsKilled.length > 0 ? stats.bossActsKilled.map((a) => `액트 ${a}`).join(', ') : '없음'}`,
    `유닛 3성 달성: ${stats.unitStar3 ? '예' : '아니오'}`,
    `끝낸 런의 최대 덱 ${stats.bestCompletedDeckSize}장`,
    `보스 도달 시 최대 골드 ${stats.bestBossEntryGold}G`,
    `지금까지 번 전공 합계 ${totalEarned}`,
  ];
}

export function buildMetaStartView(status: MetaStatus, catalog: MetaCatalog, commanders: CommanderCatalog, relics: RelicCatalog): MetaStartView {
  if (status.kind === 'broken') {
    return { status: 'broken', message: status.message, points: 0, totalEarned: 0, items: [], commanders: {}, statLines: [], baseText: '' };
  }
  const progress = status.progress;
  const names = metaNameResolver(commanders, relics);
  const items = progress.items().map((item) => buildMetaRow(item, names, progress.points));
  const byCommander: Record<string, MetaItemRow> = {};
  for (const row of items) if (row.target === 'commander') byCommander[row.id] = row;
  const lockedCommanders = new Set(catalog.ofTarget('commander').map((e) => e.id));
  const lockedRelics = new Set(catalog.ofTarget('relic').map((e) => e.id));
  const baseCommanders = commanders.commanders.filter((c) => !lockedCommanders.has(c.id)).map((c) => c.name);
  const baseRelics = relics.relics.filter((r) => !lockedRelics.has(r.id)).length;
  return {
    status: 'ok',
    message: '',
    points: progress.points,
    totalEarned: progress.totalEarned,
    items,
    commanders: byCommander,
    statLines: [...buildStatLines(progress.statsView(), progress.totalEarned), `해금한 최고 위협 레벨 ${progress.maxThreatLevel}`],
    baseText: `처음부터 열려 있음: 지휘관 ${baseCommanders.join(', ') || '없음'} · 유물 ${baseRelics}개 · 카드와 유닛은 잠기지 않습니다`,
  };
}

export function metaNameResolver(commanders: CommanderCatalog, relics: RelicCatalog): (target: UnlockTarget, id: string) => string {
  return (target, id) => (target === 'commander' ? commanders.get(id)?.name : relics.get(id)?.name) ?? id;
}

// ---- 런 종료 정산 ----

/** 종료 화면에 보여줄 정산 결과 */
export type EndMetaView =
  | {
    kind: 'settled'; rows: { label: string; value: string }[]; total: number; balance: number;
    unlocks: { name: string; targetLabel: string; conditionText: string }[];
    /** 이번 런에서 새로 열린 위협 레벨 (없으면 null) */
    newThreat: { level: number; name: string } | null;
  }
  | { kind: 'test'; message: string }
  | { kind: 'failed'; reason: string };

/** 세션이 정산 한 번의 결과를 화면용으로 들고 있는 형태 */
export type EndSettlement =
  | { kind: 'settled'; summary: RunSummary; earned: PointsBreakdown; newUnlocks: string[]; balance: number; threatUnlocked: number | null }
  | { kind: 'test' }
  | { kind: 'failed'; reason: string };

export function buildEndMetaView(
  settlement: EndSettlement, catalog: MetaCatalog, commanders: CommanderCatalog, relics: RelicCatalog, threat: ThreatCatalog,
): EndMetaView {
  if (settlement.kind === 'test') return { kind: 'test', message: '테스트 런은 전공에 반영되지 않습니다.' };
  if (settlement.kind === 'failed') return { kind: 'failed', reason: settlement.reason };
  const { summary, earned } = settlement;
  const rule = catalog.points;
  const rows = [
    { label: '도달 층', value: `${summary.floorsReached}층 × ${rule.perFloor} = ${earned.floors}` },
    { label: '보스 처치', value: `${summary.bossActsKilled.length}회 × ${rule.perBoss} = ${earned.bosses}` },
    { label: '정예 처치', value: `${summary.eliteKills}회 × ${rule.perElite} = ${earned.elites}` },
    { label: '승리 보너스', value: `${earned.victory}` },
  ];
  if (summary.threatLevel > 0) {
    rows.push({ label: `위협 레벨 ${summary.threatLevel} 보너스`, value: `+${earned.threat} (×${summary.threatLevel * rule.threatBonusPctPerLevel}%)` });
  }
  const names = metaNameResolver(commanders, relics);
  const unlocks = settlement.newUnlocks.flatMap((id) => {
    const entry = catalog.get(id);
    return entry ? [{ name: names(entry.target, id), targetLabel: TARGET_LABEL[entry.target], conditionText: describeCondition(entry.condition) }] : [];
  });
  const level = settlement.threatUnlocked;
  const newThreat = level === null ? null : { level, name: threatName(threat, level) };
  return { kind: 'settled', rows, total: earned.total, balance: settlement.balance, unlocks, newThreat };
}
