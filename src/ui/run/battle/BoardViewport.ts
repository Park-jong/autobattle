import { el } from '../dom';
import { iconButton, iconSvg, setIconTip } from '../iconButton';
import { boardViewportLayout } from './boardViewportLayout';

/** Crop empty stage gutters without changing game coordinates or pointer mapping. */
export class BoardViewport {
  readonly tools = el('div', 'bt-board-tools');
  private readonly viewport = el('div', 'bt-board-viewport');
  private readonly surface = el('div', 'bt-board-surface');
  private readonly mobile = window.matchMedia('(max-width: 900px), (max-width: 1000px) and (max-height: 620px)');
  private readonly zoomButton = iconButton('zoomIn', '전장 확대', () => this.toggleZoom(), 'bt-btn bt-board-tool');
  private zoomed = false;
  private active = false;

  constructor(arena: HTMLElement, private readonly canvasHost: HTMLElement) {
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('aria-label', '전투 보드 · 확대 시 밀어서 이동');
    canvasHost.before(this.viewport);
    this.viewport.append(this.surface);
    this.surface.append(canvasHost);
    this.zoomButton.setAttribute('aria-pressed', 'false');
    this.zoomButton.dataset.testid = 'board-zoom';
    this.tools.setAttribute('role', 'toolbar');
    this.tools.setAttribute('aria-label', '전장 보기');
    this.tools.setAttribute('aria-orientation', 'vertical');
    this.tools.append(this.zoomButton);
    arena.append(this.tools);
    new ResizeObserver(() => this.fit()).observe(this.viewport);
    this.mobile.addEventListener('change', () => this.fit());
    this.fit();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.fit();
  }

  private toggleZoom(): void {
    this.zoomed = !this.zoomed;
    this.fit();
    this.viewport.scrollLeft = (this.surface.clientWidth - this.viewport.clientWidth) / 2;
    this.viewport.scrollTop = (this.surface.clientHeight - this.viewport.clientHeight) / 2;
  }

  private fit(): void {
    const mobile = this.mobile.matches;
    this.viewport.classList.toggle('fitted', this.active);
    this.tools.hidden = !this.active;
    this.zoomButton.hidden = !this.active || !mobile;
    const zoomed = this.active && mobile && this.zoomed;
    this.viewport.classList.toggle('zoomed', zoomed);
    this.zoomButton.innerHTML = iconSvg(zoomed ? 'zoomOut' : 'zoomIn', 20);
    setIconTip(this.zoomButton, zoomed ? '전장 전체 보기' : '전장 확대');
    this.zoomButton.title = zoomed ? '확대 중 · 보드를 밀어서 이동합니다' : '보드와 유닛을 40% 확대합니다';
    this.zoomButton.setAttribute('aria-pressed', String(zoomed));
    if (!this.active) {
      this.surface.removeAttribute('style');
      this.canvasHost.removeAttribute('style');
      return;
    }
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const layout = boardViewportLayout(rect.width, rect.height, zoomed ? 1.4 : 1);
    this.surface.style.width = `${layout.surfaceWidth}px`;
    this.surface.style.height = `${layout.surfaceHeight}px`;
    Object.assign(this.canvasHost.style, {
      width: `${layout.width}px`, height: `${layout.height}px`,
      left: `${layout.left}px`, top: `${layout.top}px`, right: 'auto', bottom: 'auto', transform: 'none',
    });
  }
}
