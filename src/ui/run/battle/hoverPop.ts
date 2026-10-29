import { el, tagged } from '../dom';
import type { TraitRowView } from './traitPanelView';
import { appSkin } from '../../skin/SkinStore';
import { traitSkinName } from '../../skin/skins';

/** 팝업을 기준 요소의 어디에 띄울지: 오른쪽(넘치면 왼쪽) / 위(넘치면 아래) */
export type PopPlacement = 'right' | 'above';

/**
 * 마우스를 올린 요소 옆에 뜨는 설명 팝업. body에 하나만 두고 화면 좌표(fixed)로 맞춘다 —
 * 스크롤·overflow가 있는 패널 안에 두면 경계에 잘리거나 스크롤바가 생기기 때문.
 */
export class HoverPop {
  private readonly root: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(className: string, testId: string) {
    this.root = tagged(el('div', `bt-pop bt-float-pop ${className}`), testId);
    document.body.append(this.root);
  }

  /** 같은 기준 요소에 이미 떠 있으면 다시 그리지 않는다 */
  show(anchor: HTMLElement, content: () => readonly Node[], placement: PopPlacement = 'right'): void {
    if (this.anchor === anchor && this.root.classList.contains('open')) return;
    this.anchor = anchor;
    this.root.replaceChildren(...content());
    this.root.classList.add('open');
    const rect = anchor.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    const clampX = (x: number) => Math.max(4, Math.min(x, window.innerWidth - width - 4));
    const clampY = (y: number) => Math.max(4, Math.min(y, window.innerHeight - height - 4));
    let left: number;
    let top: number;
    if (placement === 'above') {
      left = clampX(rect.left + rect.width / 2 - width / 2);
      top = rect.top - height - 8 >= 4 ? rect.top - height - 8 : clampY(rect.bottom + 8);
    } else {
      left = rect.right + 8 + width <= window.innerWidth - 4 ? rect.right + 8 : clampX(rect.left - width - 8);
      top = clampY(rect.top);
    }
    this.root.style.left = `${Math.round(left)}px`;
    this.root.style.top = `${Math.round(top)}px`;
  }

  /**
   * 컨테이너를 다시 그린 뒤 부른다: 기준 요소가 사라졌으면 같은 data-pop-key를 가진 새 요소로 옮겨 붙이고(내용 유지),
   * 없으면 닫는다. 전투 중 정보 창이 HP 변화로 자주 다시 그려져도 특성 팝업이 깜박이지 않게 한다.
   */
  reattach(container: HTMLElement): void {
    const anchor = this.anchor;
    if (!anchor || anchor.isConnected) return;
    const key = anchor.dataset.popKey;
    const next = key ? container.querySelector<HTMLElement>(`[data-pop-key="${CSS.escape(key)}"]`) : null;
    if (!next) return this.hide();
    this.anchor = next;
  }

  hide(): void {
    this.anchor = null;
    this.root.classList.remove('open');
  }
}

/** 특성 설명 팝업 내용: 이름·종류·현재 종류 수, 지금 단계(또는 1단계까지 남은 수) 효과, 단계 기준과 원문 */
export function traitPopContent(row: TraitRowView): HTMLElement[] {
  const nodes = [
    el('strong', '', `${traitSkinName(appSkin.current, row.traitId, row.name)} (${row.kind === 'origin' ? '기원' : '직업'}) · ${row.count}종`),
    el('div', '', row.tier > 0 ? `${row.tier}단계: ${row.currentText}` : `미달 — ${row.nextAt}종이 되면 1단계: ${row.currentText}`),
    el('div', 'bt-trait-steps', `단계 기준 ${row.thresholds.join(' / ')}종 · ${row.fullText}`),
  ];
  if (row.tier > 0 && row.nextAt !== null) nodes.push(el('div', 'bt-trait-steps', `다음 단계까지 ${row.nextAt - row.count}종`));
  return nodes;
}
