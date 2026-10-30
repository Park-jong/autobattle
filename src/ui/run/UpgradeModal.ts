import { cardFaceElement } from '../cards/cardFace';
import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import type { CardView } from './runViews';

function face(card: CardView): HTMLElement {
  const node = cardFaceElement({ ...card, tags: [...card.tags, ...(card.hpCostLabel ? [card.hpCostLabel] : [])] });
  node.classList.add('rw-card');
  const holder = el('div', 'rw-card-zoom up-card');
  holder.append(node);
  return holder;
}

/**
 * 강화 결과 창(모달): 야영지 단련·이벤트·유물 등으로 카드가 강화되면 어떤 카드가 어떻게 바뀌었는지
 * 강화 전 → 강화 후 카드 모양으로 다시 보여 준다. "확인"(또는 Enter·Esc·배경 클릭)으로 닫는다.
 * 어느 화면(야영지·이벤트·맵·보스 유물 등) 위에도 뜨고, 열려 있는 동안 키 입력은 이 창이 받는다.
 */
export class UpgradeModal {
  readonly root = tagged(el('div', 'rw-backdrop up-backdrop'), 'upgrade-modal');
  private signature = '';

  constructor(private readonly commands: RunCommands) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '카드 강화 결과');
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.commands.dismissUpgradeNotice();
    });
    document.addEventListener('keydown', this.onKey, true);
  }

  render(snap: RunSnapshot): void {
    const notice = snap.upgraded;
    const signature = notice ? JSON.stringify(notice.cards.map((c) => c.instanceId)) : '';
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.hidden = notice === null;
    if (!notice) {
      this.root.replaceChildren();
      return;
    }
    const panel = el('div', 'rw-panel up-panel');
    const list = tagged(el('div', 'up-list'), 'upgrade-cards');
    for (const { before, after } of notice.cards) {
      const row = el('div', 'up-row');
      row.append(face(before), el('span', 'up-arrow', '→'), face(after));
      list.append(row);
    }
    const ok = tagged(button('확인', () => this.commands.dismissUpgradeNotice(), 'rw-btn rw-primary'), 'dismiss-upgrade');
    panel.append(
      el('h2', 'rw-title', notice.cards.length > 1 ? `카드 ${notice.cards.length}장이 강화되었습니다` : '카드가 강화되었습니다'),
      list,
      ok,
    );
    this.root.replaceChildren(panel);
    queueMicrotask(() => ok.focus());
  }

  /** 열려 있는 동안: Enter·Esc는 닫고, 나머지 키는 뒤 화면의 단축키로 가지 않게 막는다 */
  private onKey = (e: KeyboardEvent): void => {
    if (this.root.hidden) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      this.commands.dismissUpgradeNotice();
    }
    e.stopPropagation();
  };
}
