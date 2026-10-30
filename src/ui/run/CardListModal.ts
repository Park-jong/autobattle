import { cardFaceElement } from '../cards/cardFace';
import type { CardFaceSpec } from '../cards/cardFace';
import { cardListTotal, type CardListEntry } from '../cards/cardListView';
import { button, el, tagged } from './dom';
import { iconButton, type IconName } from './iconButton';
import type { EquipmentView } from './runViews';
import { appSkin } from '../skin/SkinStore';
import { unitSkinName } from '../skin/skins';

/** 카드 목록 창에 보여줄 내용 */
export interface CardListSpec {
  /** 창 제목 (장수는 창이 붙인다) */
  title: string;
  entries: readonly CardListEntry[];
  /** 목록 아래 안내 문구 (선택) */
  note?: string;
  /** 카드가 하나도 없을 때의 문구 (기본 "비어 있음") */
  emptyText?: string;
  /** 목록 아래 추가 구역 (덱 보기의 "장착 중인 장비" 등): 카드마다 설명 한 줄과 버튼 */
  extra?: CardListExtra;
}

export interface CardListExtra {
  title: string;
  /** actionIcon이 있으면 아이콘 버튼(actionLabel은 마우스를 올리면 뜨는 설명), 없으면 글자 버튼 */
  items: readonly { card: CardFaceSpec; caption: string; actionLabel: string; actionIcon?: IconName; onAction: () => void; disabled: boolean; testId?: string }[];
  /** 버튼을 쓸 수 없을 때 등 안내 (선택) */
  note?: string | null;
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
  private readonly extra = tagged(el('section', 'cl-extra'), 'card-list-extra');
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
    this.panel.append(header, this.body, this.note, this.extra);
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
    this.fillExtra(spec.extra);
  }

  private fillExtra(extra: CardListExtra | undefined): void {
    this.extra.hidden = !extra;
    if (!extra) {
      this.extra.replaceChildren();
      return;
    }
    const grid = el('div', 'cl-grid');
    for (const entry of extra.items) {
      const item = el('div', 'cl-item cl-extra-item');
      const face = cardFaceElement(entry.card);
      face.classList.add('cl-card');
      const action = entry.actionIcon
        ? iconButton(entry.actionIcon, entry.actionLabel, entry.onAction, 'rw-btn cl-extra-action')
        : button(entry.actionLabel, entry.onAction, 'rw-btn cl-extra-action');
      action.disabled = entry.disabled;
      if (entry.testId) tagged(action, entry.testId);
      item.append(face, el('div', 'cl-extra-caption', entry.caption), action);
      grid.append(item);
    }
    if (extra.items.length === 0) grid.append(el('p', 'cl-empty', extra.emptyText ?? '없음'));
    const parts: HTMLElement[] = [el('h3', 'cl-extra-title', `${extra.title} (${extra.items.length})`), grid];
    if (extra.note) parts.push(el('p', 'rw-hint', extra.note));
    this.extra.replaceChildren(...parts);
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

/** 덱 보기 창의 "장착 중인 장비" 구역: 장비 카드 + 장착 유닛 + 장착 해제 아이콘 버튼 (전투 중이면 버튼을 끄고 사유 표시) */
export function equipmentExtra(equipment: EquipmentView | null, onUnequip: (ownedId: number, index: number) => void): CardListExtra | undefined {
  if (!equipment) return undefined;
  return {
    title: '장착 중인 장비',
    items: equipment.items.map((item) => ({
      card: item.card,
      caption: `${unitSkinName(appSkin.current, item.unitId, item.unitName)} ${'★'.repeat(item.star)}`,
      actionLabel: '장착 해제',
      actionIcon: 'unequip',
      onAction: () => onUnequip(item.ownedId, item.index),
      disabled: !equipment.canUnequip,
      testId: `unequip-${item.ownedId}-${item.index}`,
    })),
    note: equipment.items.length > 0
      ? (equipment.reason ?? '장착 해제한 장비는 카드로 덱에 돌아갑니다. 장비를 낀 유닛을 팔아도 장비는 덱으로 돌아옵니다.')
      : null,
    emptyText: '장착한 장비가 없습니다.',
  };
}
