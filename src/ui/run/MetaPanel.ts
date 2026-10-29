import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import type { MetaItemRow } from './metaViews';

/**
 * 시작 화면의 접이식 "전공" 패널: 보유 전공 포인트, 해금 목록(조건·진행도·가격·상태·구매), 누적 통계, 전공 기록 초기화.
 * DOM을 한 번만 만들어 두고(열림 상태 유지) 다시 그릴 때마다 내용만 바꾼다.
 */
export class MetaPanel {
  readonly root = tagged(el('details', 'run-meta'), 'meta-panel');
  /** 초기화 확인 단계를 기다리는 중인가 */
  private confirmingReset = false;
  private autoOpened = false;
  private last: RunSnapshot | null = null;

  constructor(private readonly commands: RunCommands) {}

  render(snap: RunSnapshot): void {
    const meta = snap.start?.meta;
    if (!meta) return;
    this.last = snap;
    if (meta.status === 'broken' && !this.autoOpened) {
      this.root.open = true;
      this.autoOpened = true;
    }
    const summary = el('summary', 'run-meta-summary', meta.status === 'ok' ? `전공 · 해금 (보유 전공 ${meta.points})` : '전공 · 해금 (기록 손상)');
    const body = el('div', 'run-meta-body');

    if (meta.status === 'broken') {
      const box = tagged(el('div', 'dbg-error run-save-error'), 'meta-error');
      box.append(el('p', '', meta.message), el('p', '', '초기화하면 전공 포인트·해금·통계가 처음 상태로 돌아갑니다. 진행 중인 런 저장본은 그대로입니다.'));
      body.append(box);
    } else {
      body.append(
        tagged(el('p', 'run-meta-points', `보유 전공 ${meta.points} (지금까지 ${meta.totalEarned})`), 'meta-points-detail'),
        el('p', 'dbg-hint', '조건을 달성하면 런이 끝날 때 자동으로 해금됩니다. 전공 포인트로 미리 구매할 수도 있습니다.'),
        this.itemTable(meta.items),
        el('p', 'dbg-hint', meta.baseText),
      );
      const stats = tagged(el('ul', 'run-meta-stats'), 'meta-stats');
      for (const line of meta.statLines) stats.append(el('li', '', line));
      body.append(el('h3', 'run-meta-heading', '누적 통계'), stats);
    }
    body.append(this.resetControls());
    this.root.replaceChildren(summary, body);
  }

  private itemTable(items: MetaItemRow[]): HTMLElement {
    const table = tagged(el('table', 'run-meta-table'), 'meta-items');
    const head = el('tr');
    for (const h of ['종류', '대상', '조건', '진행도', '가격', '상태', '']) head.append(el('th', '', h));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const tbody = el('tbody');
    for (const row of items) {
      const tr = tagged(el('tr', `run-meta-row ${row.state}`), `meta-item-${row.id}`);
      const act = el('td');
      if (row.state !== 'unlocked') {
        const buy = tagged(button(row.purchaseLabel, () => this.commands.purchaseUnlock(row.id), 'dbg-btn'), `meta-buy-${row.id}`);
        buy.disabled = !row.canPurchase;
        act.append(buy);
      }
      tr.append(
        el('td', '', row.targetLabel), el('td', 'run-meta-name', row.name), el('td', '', row.conditionText),
        el('td', '', row.progressText), el('td', '', `${row.price}`), tagged(el('td', 'run-meta-state', row.stateLabel), `meta-state-${row.id}`), act,
      );
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  /** 전공 기록 초기화: 한 번 누르면 확인 단계가 나온다 */
  private resetControls(): HTMLElement {
    const box = el('div', 'run-meta-reset');
    if (!this.confirmingReset) {
      box.append(tagged(button('전공 기록 초기화', () => this.setConfirming(true), 'dbg-btn'), 'meta-reset'));
      return box;
    }
    const confirm = tagged(el('div', 'run-confirm'), 'meta-reset-confirm');
    confirm.append(
      el('p', '', '전공 포인트·해금·누적 통계가 모두 처음 상태로 돌아가며 되돌릴 수 없습니다. 진행 중인 런 저장본은 건드리지 않습니다. 초기화할까요?'),
      tagged(button('초기화', () => { this.confirmingReset = false; this.commands.resetMeta(); }, 'dbg-btn dbg-primary'), 'meta-reset-yes'),
      tagged(button('취소', () => this.setConfirming(false), 'dbg-btn'), 'meta-reset-no'),
    );
    box.append(confirm);
    return box;
  }

  private setConfirming(value: boolean): void {
    this.confirmingReset = value;
    if (this.last) this.render(this.last);
  }
}
