import type { RunViewSource } from './contracts';
import { button, el, tagged } from './dom';
import { MapExplorer } from './MapExplorer';
import { appSkin } from '../skin/SkinStore';
import { actPresentation } from '../skin/skins';

/**
 * 맵 보기 창(모달): 전투 중에도 지금 액트의 경로를 확인한다. 읽기 전용 — 노드에 마우스를 올리거나 누르면
 * 노드 근처에 설명 창이 나오지만 이동은 할 수 없다.
 * 닫기는 ×·Esc·배경 클릭. 열려 있는 동안 막이 뒤 화면 조작을 막고, 키 입력은 캡처 단계에서 가로채 단축키가 새지 않는다.
 */
export class MapModal {
  readonly root = tagged(el('div', 'rw-backdrop cl-backdrop'), 'map-modal');
  private readonly panel = el('div', 'rw-panel cl-panel mp-panel');
  private readonly title = tagged(el('h2', 'rw-title'), 'map-modal-title');
  private readonly explorer: MapExplorer;
  private readonly closeButton = tagged(button('×', () => this.close(), 'rw-btn cl-close'), 'map-modal-close');
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly view: RunViewSource) {
    this.explorer = new MapExplorer(view);
    this.explorer.root.classList.add('route-modal-explorer');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '맵');
    this.closeButton.setAttribute('aria-label', '닫기');
    const header = el('div', 'cl-header');
    header.append(this.title, this.closeButton);
    this.panel.append(header, this.explorer.root);
    this.root.append(this.panel);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    document.addEventListener('keydown', this.onKey, true);
    document.body.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    const map = this.view.mapView();
    if (!map) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.title.textContent = `맵 — 액트 ${map.act} ${actPresentation(appSkin.current, map.act)?.name ?? map.actName}`;
    this.root.hidden = false;
    this.explorer.render(map, this.view.snapshot().hud?.commanderId);
    this.closeButton.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.explorer.close();
    this.root.hidden = true;
    this.returnFocus?.focus();
    this.returnFocus = null;
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
      if (!this.explorer.close(true)) this.close();
    }
    e.stopPropagation();
  };
}
