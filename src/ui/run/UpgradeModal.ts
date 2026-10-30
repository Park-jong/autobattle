import { cardFaceElement } from '../cards/cardFace';
import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import type { CardView } from './runViews';
import { motionPreferences } from '../skin/presentation';
import './upgradeMotion.css';

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
    this.root.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    this.root.hidden = notice === null;
    if (!notice) {
      this.root.replaceChildren();
      return;
    }
    const panel = el('div', 'rw-panel up-panel');
    const list = tagged(el('div', 'up-list'), 'upgrade-cards');
    for (const { before, after } of notice.cards) {
      const row = el('div', 'up-row');
      const source = face(before), destination = face(after);
      source.classList.add('up-fusion-source'); destination.classList.add('up-fusion-result');
      source.prepend(el('span', 'up-face-label', '강화 전'));
      destination.prepend(el('span', 'up-face-label', '강화 후'));
      row.append(source, el('span', 'up-arrow', '→'), destination);
      const entry = el('section', 'up-entry');
      entry.append(row, el('p', 'up-effect-summary', `${after.name}${before.cost !== after.cost ? ` · 비용 ${before.cost} → ${after.cost} CP` : ''}: ${after.text}`));
      list.append(entry);
    }
    const ok = tagged(button('확인', () => this.commands.dismissUpgradeNotice(), 'rw-btn rw-primary'), 'dismiss-upgrade');
    panel.append(
      el('h2', 'rw-title', notice.cards.length > 1 ? `카드 ${notice.cards.length}장이 강화되었습니다` : '카드가 강화되었습니다'),
      list,
      ok,
    );
    this.root.replaceChildren(panel);
    queueMicrotask(() => { ok.focus(); this.animateFusion(); });
  }

  /** A single original card flows into its actual upgraded result; no extra cards are consumed. */
  private animateFusion(): void {
    if (motionPreferences.reduced || this.root.hidden) return;
    for (const row of this.root.querySelectorAll<HTMLElement>('.up-row')) {
      const source = row.querySelector<HTMLElement>('.up-fusion-source .hcard');
      const result = row.querySelector<HTMLElement>('.up-fusion-result .hcard');
      if (!source || !result) continue;
      const from = source.getBoundingClientRect(), to = result.getBoundingClientRect();
      if (from.bottom < 0 || from.top > innerHeight) continue;
      const ghost = source.cloneNode(true) as HTMLElement;
      ghost.classList.add('up-fusion-ghost'); ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, { left: `${from.left + from.width / 2}px`, top: `${from.top + from.height / 2}px`, width: `${from.width}px`, height: `${from.height}px` });
      this.root.append(ghost);
      const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const flight = ghost.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: .95 },
        { transform: 'translate(-50%,-65%) scale(1.04)', opacity: 1, offset: .22 },
        { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.12) rotate(12deg)`, opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.25,.65,.3,1)', fill: 'both' });
      flight.finished.then(() => ghost.remove(), () => ghost.remove());
      source.animate([{ opacity: 1 }, { opacity: .5 }], { duration: 400, fill: 'forwards' });
      result.animate([{ transform: 'scale(.94)', filter: 'brightness(.55)', boxShadow: '0 0 0 transparent' },
        { transform: 'scale(1.07)', filter: 'brightness(1.5)', boxShadow: '0 0 34px #ffe094', offset: .48 },
        { transform: 'scale(1)', filter: 'brightness(1)', boxShadow: '0 0 14px #ffe09466' }], { duration: 1100, delay: 200, easing: 'ease-out', fill: 'both' });
    }
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
