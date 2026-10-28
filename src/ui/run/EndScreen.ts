import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';

/** 종료 화면: 승리/사망, 도달 층, 남은 HP, 골드, 덱·로스터 요약 */
export class EndScreen {
  readonly root = el('div', 'run-end');

  constructor(private readonly commands: RunCommands) {}

  render(snap: RunSnapshot): void {
    const end = snap.ended;
    if (!end) return;
    const card = el('div', `run-end-card ${end.outcome}`);
    card.append(
      tagged(el('h1', 'run-title', end.outcome === 'victory' ? '승리' : '패배'), 'end-title'),
      el('p', 'run-subtitle', end.title),
    );
    const stats = tagged(el('dl', 'run-end-stats'), 'end-stats');
    const stat = (label: string, value: string): void => {
      stats.append(el('dt', '', label), el('dd', '', value));
    };
    stat('지휘관', end.commanderName);
    stat('시드', String(end.seed));
    stat('도달 층', `${end.floorReached} / ${end.floorCount}`);
    stat('남은 HP', `${end.hp} / ${end.maxHp}`);
    stat('골드', `${end.gold}G`);
    stat('전투', `${end.battles.played}회 (${end.battles.wins}승 ${end.battles.losses}패 ${end.battles.draws}무)`);
    card.append(stats);

    const deck = el('section', 'run-end-section');
    deck.append(el('h3', '', `덱 ${end.deckCount}장`), el('p', 'run-end-list', end.deck.map((c) => `${c.name} ×${c.count}`).join(' · ') || '없음'));
    const roster = el('section', 'run-end-section');
    roster.append(el('h3', '', `유닛 ${end.roster.length}기`), el('p', 'run-end-list', end.roster.map((u) => `${u.name} ${'★'.repeat(u.star)}${u.onBoard ? '' : ' (벤치)'}`).join(' · ') || '없음'));
    card.append(deck, roster);

    const actions = el('div', 'run-end-actions');
    actions.append(
      tagged(button('새 런', () => this.commands.newRun(null), 'dbg-btn dbg-primary run-big-button'), 'end-new-run'),
      tagged(button('시작 화면', () => this.commands.toStart(), 'dbg-btn run-big-button'), 'end-to-start'),
    );
    card.append(actions);
    this.root.replaceChildren(card);
  }
}
