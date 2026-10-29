import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import { relicRow } from './relicElements';

/** 종료 화면: 승리/사망, 도달 액트·층, 남은 HP, 골드, 덱·로스터 요약 */
export class EndScreen {
  readonly root = el('div', 'run-end');

  constructor(private readonly commands: RunCommands) {}

  /** 전공 정산 내역: 항목별 포인트·합계·보유 전공·새로 해금된 항목 (테스트 런은 제외 안내) */
  private metaSection(meta: NonNullable<RunSnapshot['endMeta']>): HTMLElement {
    const box = tagged(el('section', `run-end-meta ${meta.kind}`), 'end-meta');
    if (meta.kind === 'test') {
      box.append(el('h3', '', '전공'), tagged(el('p', '', meta.message), 'end-meta-test'));
      return box;
    }
    if (meta.kind === 'failed') {
      box.append(el('h3', '', '전공'), tagged(el('p', '', meta.reason), 'end-meta-failed'));
      return box;
    }
    box.append(el('h3', '', '획득 전공'));
    const list = tagged(el('dl'), 'end-meta-rows');
    for (const row of meta.rows) list.append(el('dt', '', row.label), el('dd', '', row.value));
    list.append(el('dt', 'total', '합계'), tagged(el('dd', 'total', `+${meta.total}`), 'end-meta-total'));
    box.append(list, tagged(el('p', '', `보유 전공 ${meta.balance}`), 'end-meta-balance'));
    if (meta.unlocks.length > 0) {
      const unlocks = tagged(el('ul', 'run-end-unlocks'), 'end-meta-unlocks');
      for (const u of meta.unlocks) unlocks.append(el('li', '', `새로 해금: ${u.targetLabel} ${u.name} (${u.conditionText})`));
      box.append(unlocks);
    }
    return box;
  }

  render(snap: RunSnapshot): void {
    const end = snap.ended;
    if (!end) return;
    const card = el('div', `run-end-card ${end.outcome}`);
    card.append(
      tagged(el('h1', 'run-title', end.outcome === 'victory' ? '승리' : '패배'), 'end-title'),
      el('p', 'run-subtitle', end.title),
    );
    if (end.testRun) {
      const note = tagged(el('p', 'run-end-test', `${end.testRun.badge}${end.testRun.skippedRecords > 0 ? ` — 건너뛴 구간 기록 ${end.testRun.skippedRecords}건은 통계에서 제외` : ''}`), 'end-test-badge');
      card.append(note);
    }
    const stats = tagged(el('dl', 'run-end-stats'), 'end-stats');
    const stat = (label: string, value: string): void => {
      stats.append(el('dt', '', label), el('dd', '', value));
    };
    stat('지휘관', end.commanderName);
    stat('시드', String(end.seed));
    stat('도달 액트', `${end.act} / ${end.actCount} — ${end.actName}`);
    stat('도달 층', `${end.floorReached} / ${end.floorCount}`);
    stat('남은 HP', `${end.hp} / ${end.maxHp}`);
    stat('골드', `${end.gold}G`);
    stat('전투', `${end.battles.played}회 (${end.battles.wins}승 ${end.battles.losses}패 ${end.battles.draws}무)`);
    card.append(stats);

    const deck = el('section', 'run-end-section');
    deck.append(el('h3', '', `덱 ${end.deckCount}장`), el('p', 'run-end-list', end.deck.map((c) => `${c.name} ×${c.count}`).join(' · ') || '없음'));
    const roster = el('section', 'run-end-section');
    roster.append(el('h3', '', `유닛 ${end.roster.length}기`), el('p', 'run-end-list', end.roster.map((u) => `${u.name} ${'★'.repeat(u.star)}${u.onBoard ? '' : ' (벤치)'}`).join(' · ') || '없음'));
    const relics = el('section', 'run-end-section');
    relics.append(el('h3', '', `유물 ${end.relics.length}개`), relicRow(end.relics, '없음'));
    card.append(deck, roster, relics);
    if (snap.endMeta) card.append(this.metaSection(snap.endMeta));
    if (end.outcome === 'victory' && end.bossRelicOffer.length > 0) {
      const boss = tagged(el('section', 'run-end-section'), 'boss-relic-offer');
      boss.append(
        el('h3', '', '보스 유물 후보'),
        relicRow(end.bossRelicOffer),
        el('p', 'dbg-hint', '런이 끝나 받을 수는 없습니다 (마지막 보스 처치 때 남아 있던 후보).'),
      );
      card.append(boss);
    }

    const actions = el('div', 'run-end-actions');
    actions.append(
      tagged(button('새 런', () => this.commands.newRun(null, end.commanderId), 'dbg-btn dbg-primary run-big-button'), 'end-new-run'),
      tagged(button('시작 화면', () => this.commands.toStart(), 'dbg-btn run-big-button'), 'end-to-start'),
    );
    card.append(actions);
    this.root.replaceChildren(card);
  }
}
