import { cardFaceElement } from '../cards/cardFace';
import { cardListTotal, type CardListEntry } from '../cards/cardListView';
import { button, el, tagged } from './dom';

/** 카드 목록 창에 보여줄 내용 */
export interface CardListSpec {
  /** 창 제목 (장수는 창이 붙인다) */
  title: string;
  entries: readonly CardListEntry[];
  /** 목록 아래 안내 문구 (선택) */
  note?: string;
  /** 카드가 하나도 없을 때의 문구 (기본 "비어 있음") */
  emptyText?: string;
}

/**
 * 카드 목록 창(모달): 덱 전체나 뽑을·버린·소모 더미를 손패와 같은 카드 모양으로 보여준다 (같은 카드는 ×N 배지로 묶음).
 * 닫기는 ×·Esc·배경 클릭. 열려 있는 동안 막이 뒤 화면 조작을 막고, 키 입력은 캡처 단계에서 가로채 단축키가 새지 않는다.
 */
export class CardListModal {
  readonly root = tagged(el('div', 'rw-backdrop cl-backdrop'), 'card-list-modal');
  private readonly panel = el('div', 'rw-panel cl-panel');
  private readonly title = tagged(el('h2', 'rw-title'), 'card-list-title');
  private readonly body = tagged(el('div', 'cl-grid'), 'card-list-cards');
  private readonly note = el('p', 'rw-hint');
  private readonly closeButton = tagged(button('×', () => this.close(), 'rw-btn cl-close'), 'card-list-close');
  private onClose: (() => void) | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.closeButton.setAttribute('aria-label', '닫기');
    const header = el('div', 'cl-header');
    header.append(this.title, this.closeButton);
    this.panel.append(header, this.body, this.note);
    this.root.append(this.panel);
    // 배경(막)을 직접 누르면 닫는다
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', this.onKey, true);
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** 목록을 연다. onClose는 어떤 방식으로 닫히든 한 번 불린다 */
  open(spec: CardListSpec, onClose?: () => void): void {
    if (this.isOpen) this.finish();
    this.onClose = onClose ?? null;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.fill(spec);
    this.root.hidden = false;
    this.closeButton.focus();
  }

  /** 열려 있을 때만 내용을 바꾼다 (전투 중 더미가 바뀌었을 때) */
  update(spec: CardListSpec): void {
    if (this.isOpen) this.fill(spec);
  }

  /** 창을 없앤다: 키 가로채기를 풀고 DOM에서 뗀다 */
  dispose(): void {
    document.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  close(): void {
    if (!this.isOpen) return;
    this.finish();
    this.returnFocus?.focus();
    this.returnFocus = null;
  }

  private finish(): void {
    this.root.hidden = true;
    const callback = this.onClose;
    this.onClose = null;
    callback?.();
  }

  private fill(spec: CardListSpec): void {
    const total = cardListTotal(spec.entries);
    this.title.textContent = `${spec.title} (${total}장)`;
    this.root.setAttribute('aria-label', spec.title);
    const items = spec.entries.map((entry) => {
      const item = el('div', 'cl-item');
      const face = cardFaceElement(entry);
      face.classList.add('cl-card');
      item.append(face);
      if (entry.count > 1) item.append(tagged(el('span', 'cl-count', `×${entry.count}`), 'card-list-count'));
      return item;
    });
    if (items.length === 0) this.body.replaceChildren(tagged(el('p', 'cl-empty', spec.emptyText ?? '비어 있음'), 'card-list-empty'));
    else this.body.replaceChildren(...items);
    this.note.textContent = spec.note ?? '';
    this.note.hidden = !spec.note;
  }

  /** 열려 있는 동안 모든 키를 이 창이 받는다: Esc는 닫고, 나머지는 뒤 화면의 단축키로 가지 않게 막는다 */
  private onKey = (e: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (e.key === 'Tab' && !this.root.contains(document.activeElement)) {
      e.preventDefault();
      this.closeButton.focus();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
    e.stopPropagation();
  };
}
