import { button, el } from '../dom';
import { boardViewportLayout } from './boardViewportLayout';

/** Crop empty stage gutters without changing game coordinates or pointer mapping. */
export class BoardViewport {
  private readonly viewport = el('div', 'bt-board-viewport');
  private readonly surface = el('div', 'bt-board-surface');
  private readonly mobile = window.matchMedia('(max-width: 900px), (max-width: 1000px) and (max-height: 620px)');
  private readonly zoomButton = button('판 확대', () => this.toggleZoom(), 'bt-btn bt-board-zoom');
  private zoomed = false;

  constructor(arena: HTMLElement, private readonly canvasHost: HTMLElement) {
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('aria-label', '전투 보드 · 확대 시 밀어서 이동');
    canvasHost.before(this.viewport);
    this.viewport.append(this.surface);
    this.surface.append(canvasHost);
    this.zoomButton.setAttribute('aria-pressed', 'false');
    arena.append(this.zoomButton);
    new ResizeObserver(() => this.fit()).observe(this.viewport);
    this.mobile.addEventListener('change', () => this.fit());
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
    this.zoomButton.hidden = !mobile;
    const zoomed = mobile && this.zoomed;
    this.viewport.classList.toggle('zoomed', zoomed);
    this.zoomButton.textContent = zoomed ? '전체 보기' : '판 확대';
    this.zoomButton.title = zoomed ? '확대 중 · 보드를 밀어서 이동합니다' : '보드와 유닛을 40% 확대합니다';
    this.zoomButton.setAttribute('aria-pressed', String(zoomed));
    if (!mobile) {
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
