import { button, el, tagged } from './dom';
import type { CardView, DeckCardView } from './runViews';

/** 카드 한 장의 표시 (이름·비용·희귀도·종류·설명·키워드) */
export function cardElement(card: CardView): HTMLElement {
  const root = el('div', `run-card rarity-${card.rarity}${card.upgraded ? ' upgraded' : ''}`);
  const head = el('div', 'run-card-head');
  head.append(el('span', 'run-card-cost', String(card.cost)), el('strong', 'run-card-name', card.name));
  const meta = el('div', 'run-card-meta', `${card.typeLabel} · ${card.rarityLabel} · ${card.targetLabel}`);
  const body = el('p', 'run-card-text', card.text);
  root.append(head, meta, body);
  const tags = [...card.tags, ...(card.hpCostLabel ? [card.hpCostLabel] : [])];
  if (tags.length > 0) root.append(el('div', 'run-card-tags', tags.join(' · ')));
  return root;
}

export interface ChoiceOptions {
  /** 카드 아래 버튼 문구 */
  label: string;
  onChoose: () => void;
  disabled?: boolean;
  /** 비활성 사유 (버튼 아래에 표시) */
  reason?: string | null;
  /** 카드 위에 붙이는 한 줄 (가격 등) */
  badge?: string;
  testId?: string;
}

/** 카드 + 선택 버튼. 보상·상점·이벤트·덱 고르기가 모두 이 모양을 쓴다 */
export function cardChoice(card: CardView | DeckCardView, options: ChoiceOptions): HTMLElement {
  const root = el('div', 'run-choice');
  if (options.badge) root.append(el('div', 'run-choice-badge', options.badge));
  root.append(cardElement(card));
  if ('upgradePreview' in card && card.upgradePreview) {
    const up = card.upgradePreview;
    root.append(el('p', 'run-card-upgrade', `강화 후: ${up.name} (비용 ${up.cost}) ${up.text}`));
  }
  const action = button(options.label, options.onChoose, 'dbg-btn run-choice-button');
  action.disabled = options.disabled === true;
  if (options.testId) tagged(action, options.testId);
  root.append(action);
  if (options.reason) root.append(el('p', 'run-choice-reason', options.reason));
  return root;
}

export interface DeckPickItem {
  /** 선택 시 명령에 넘기는 값 (인스턴스 ID 또는 후보 번호) */
  key: number;
  card: DeckCardView;
}

export interface DeckPickerOptions {
  title: string;
  items: readonly DeckPickItem[];
  /** 카드 아래 버튼 문구 (예: '강화', '제거') */
  actionLabel: string;
  onPick: (key: number) => void;
  /** 전체 비활성 (예: 골드 부족) */
  disabled?: boolean;
  reason?: string | null;
  /** 취소 버튼 (없으면 표시하지 않음) */
  onCancel?: () => void;
  testId?: string;
}

/** 덱 카드를 골라 제거·강화하는 공통 선택 UI (상점 제거, 야영지 강화, 이벤트 선택) */
export function deckPicker(options: DeckPickerOptions): HTMLElement {
  const root = tagged(el('section', 'run-picker'), options.testId ?? 'deck-picker');
  const head = el('div', 'run-picker-head');
  head.append(el('h3', '', options.title));
  if (options.onCancel) head.append(button('닫기', options.onCancel));
  root.append(head);
  if (options.reason) root.append(el('p', 'run-choice-reason', options.reason));
  const grid = el('div', 'run-card-grid');
  for (const item of options.items) {
    grid.append(cardChoice(item.card, {
      label: options.actionLabel,
      disabled: options.disabled === true,
      onChoose: () => options.onPick(item.key),
      testId: `pick-card-${item.key}`,
    }));
  }
  if (options.items.length === 0) grid.append(el('p', 'dbg-hint', '고를 수 있는 카드가 없습니다.'));
  root.append(grid);
  return root;
}
