import { button } from './dom';
import './iconButton.css';

/** 아이콘 버튼에 쓰는 그림 (24x24 SVG, 선 색은 글자색을 따른다) */
const ICONS = {
  /** 덱 보기: 겹친 카드 */
  deck: '<rect x="7" y="3" width="11" height="15" rx="2"/><path d="M4.5 6.5v11.5a2 2 0 0 0 2 2h9"/>',
  /** 시작 화면: 집 */
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5h3v5H18V9.5"/>',
  /** 일시정지 */
  pause: '<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>',
  /** 재개 */
  play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
  /** 준비로 돌아가기: 되돌리기 화살표 */
  undo: '<path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/>',
  /** 맵 보기: 접힌 지도 */
  map: '<path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  // ---- 맵 노드 종류 ----
  /** 전투: 교차한 두 검 */
  combat: '<path d="M4 4l9.5 9.5M20 4l-9.5 9.5"/><path d="M13.5 13.5 16 16M10.5 13.5 8 16"/><path d="M14.5 18.5l4-4M9.5 18.5l-4-4"/><path d="M18 18l2 2M6 18l-2 2"/>',
  /** 정예: 뿔 달린 해골 */
  elite: '<path d="M4 4.5c.5 3 2 4.5 3.5 5M20 4.5c-.5 3-2 4.5-3.5 5"/><path d="M12 7c-3.6 0-6 2.4-6 5.6 0 2 1 3.4 2.5 4.2V20h7v-3.2c1.5-.8 2.5-2.2 2.5-4.2C18 9.4 15.6 7 12 7z"/><circle cx="9.6" cy="12.6" r="1.3" fill="currentColor"/><circle cx="14.4" cy="12.6" r="1.3" fill="currentColor"/><path d="M11 20v-2M13 20v-2"/>',
  /** 상점: 동전 주머니 */
  shop: '<path d="M9 4h6l-1.5 3h-3z"/><path d="M10.5 7C6.5 9 4.5 12.5 4.5 15.5 4.5 18.5 7.5 20 12 20s7.5-1.5 7.5-4.5c0-3-2-6.5-6-8.5"/><path d="M12 10.5v6M14 11.8c-.4-.6-1.1-.9-2-.9-1.1 0-2 .6-2 1.4 0 1.9 4 1 4 2.9 0 .8-.9 1.4-2 1.4-.9 0-1.7-.4-2.1-1"/>',
  /** 이벤트: 물음표 */
  event: '<path d="M8.5 8.5a3.5 3.5 0 1 1 5.2 3.1c-1 .6-1.7 1.4-1.7 2.6v.8"/><circle cx="12" cy="18.6" r="1.1" fill="currentColor"/>',
  /** 야영지: 모닥불 */
  camp: '<path d="M12 3.5c2.6 2.8 4 4.9 4 7.2a4 4 0 0 1-8 0c0-1.4.6-2.6 1.6-3.6.2 1.4.9 2.2 1.7 2.5-.2-2.2.1-4.1.7-6.1z"/><path d="M4.5 20.5 19.5 16M4.5 16l15 4.5"/>',
  /** 보스: 왕관 */
  boss: '<path d="M4 8l3.8 3.5L12 5l4.2 6.5L20 8l-1.6 10H5.6z"/><path d="M5.6 20.5h12.8"/>',
} as const;

export type IconName = keyof typeof ICONS;

/**
 * 글자 대신 아이콘을 보여 주는 버튼. 마우스를 올리거나 키보드로 포커스하면 설명 말풍선(data-tip)이 뜨고,
 * 스크린 리더에는 aria-label로 같은 설명을 준다.
 */
export function iconButton(icon: IconName, tip: string, onClick: () => void, className = 'dbg-btn'): HTMLButtonElement {
  const node = button('', onClick, `${className} icon-btn`);
  node.innerHTML = iconSvg(icon);
  setIconTip(node, tip);
  return node;
}

/** 아이콘 SVG 마크업 (장식용, 스크린 리더에는 숨김) */
export function iconSvg(icon: IconName, size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>`;
}

/** 설명만 바꾼다 (일시정지 ↔ 재개처럼 상태에 따라) */
export function setIconTip(node: HTMLElement, tip: string): void {
  node.dataset.tip = tip;
  node.setAttribute('aria-label', tip);
}
