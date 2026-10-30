import { el, tagged } from '../dom';
import { motionPreferences } from '../../skin/presentation';

export type TrayLayerId = 'shop' | 'cards';

interface LayerSpec {
  id: TrayLayerId;
  label: string;
  /** 단축키 (KeyboardEvent.code: 한글 입력 상태에서도 같은 키) */
  code: string;
  key: string;
}

const LAYERS: readonly LayerSpec[] = [
  { id: 'shop', label: '유닛 상점', code: 'KeyS', key: 'S' },
  { id: 'cards', label: '통합 손패', code: 'KeyC', key: 'C' },
];

/**
 * 하단 트레이: 유닛 상점 층과 카드(손패) 층을 겹쳐 두고, 탭·단축키로 고른 층이 앞으로 나오고
 * 나머지는 뒤로 물러나 위쪽 탭만 보이게 한다. 겹침 모드가 꺼지면(디버그 화면) 카드 층만 평소처럼 보인다.
 */
export class TrayStack {
  private readonly layers = new Map<TrayLayerId, HTMLElement>();
  private frontId: TrayLayerId = 'cards';
  private stacked = false;
  private readonly shortViewport = window.matchMedia('(max-height: 620px)');
  private collapsed = this.shortViewport.matches;
  private readonly collapseButton = tagged(el('button', 'tray-collapse'), 'tray-collapse');
  private readonly tabs = new Map<TrayLayerId, HTMLButtonElement>();
  private motions: Animation[] = [];

  constructor(private readonly tray: HTMLElement, contents: Record<TrayLayerId, HTMLElement>) {
    const tabBar = el('div', 'tray-tabs');
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', '전투 도구');
    tray.append(tabBar);
    for (const spec of LAYERS) {
      const layer = tagged(el('div', `tray-layer ${spec.id}`), `tray-${spec.id}`);
      const tab = tagged(el('button', 'tray-tab'), `tray-tab-${spec.id}`);
      tab.type = 'button';
      tab.id = `battle-tab-${spec.id}`;
      layer.id = `battle-layer-${spec.id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', layer.id);
      layer.setAttribute('role', 'tabpanel');
      layer.setAttribute('aria-labelledby', tab.id);
      tab.append(spec.label, el('span', 'bt-key', spec.key));
      tab.addEventListener('click', () => this.bringFront(spec.id));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const other = spec.id === 'shop' ? 'cards' : 'shop';
        this.bringFront(other);
        this.tabs.get(other)?.focus();
      });
      tabBar.append(tab);
      this.tabs.set(spec.id, tab);
      layer.append(contents[spec.id]);
      this.layers.set(spec.id, layer);
      tray.append(layer);
    }
    this.collapseButton.type = 'button';
    this.collapseButton.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.apply(false);
    });
    tray.append(this.collapseButton);
    this.shortViewport.addEventListener('change', () => {
      this.collapsed = this.shortViewport.matches;
      this.apply(false);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.stacked || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const spec = LAYERS.find((l) => l.code === e.code);
      if (spec) this.bringFront(spec.id);
    });
    motionPreferences.subscribe(() => this.apply(false));
    this.apply(false);
  }

  get front(): TrayLayerId {
    return this.frontId;
  }

  setCardCount(count: number, units = 0): void {
    const tab = this.tabs.get('cards');
    const label = `손패 ${count + units}장`;
    if (tab && tab.firstChild?.textContent !== label) tab.firstChild!.textContent = label;
  }

  /** 런 전투 화면이면 겹침 모드, 아니면 카드 층만 */
  setStacked(stacked: boolean): void {
    if (stacked === this.stacked) return;
    this.stacked = stacked;
    this.apply(false);
  }

  bringFront(id: TrayLayerId, expand = true): void {
    if (this.frontId === id && (!this.collapsed || !expand)) return;
    this.frontId = id;
    if (expand) this.collapsed = false;
    this.apply(true);
  }

  private apply(animate: boolean): void {
    const outgoing = [...this.layers.entries()].find(([id, layer]) => id !== this.frontId && !layer.hidden && !layer.inert)?.[1];
    for (const motion of this.motions) motion.cancel();
    this.motions = [];
    this.tray.classList.toggle('stacked', this.stacked);
    this.tray.classList.toggle('collapsed', this.stacked && this.collapsed);
    this.collapseButton.hidden = !this.stacked;
    this.collapseButton.textContent = this.collapsed ? '트레이 펼치기 ▴' : '보드 크게 ▾';
    this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
    for (const [id, layer] of this.layers) {
      const front = id === this.frontId;
      layer.hidden = this.stacked ? !front || this.collapsed : id !== 'cards';
      layer.inert = this.stacked && !front;
      layer.setAttribute('aria-hidden', String(layer.hidden));
      const tab = this.tabs.get(id)!;
      tab.setAttribute('aria-selected', String(front));
      tab.tabIndex = front ? 0 : -1;
      layer.classList.toggle('front', !this.stacked || front);
      layer.classList.toggle('back', this.stacked && !front);
      layer.classList.remove('raised');
    }
    if (animate && this.stacked && !this.collapsed && !motionPreferences.reduced) {
      const front = this.layers.get(this.frontId)!;
      this.motions.push(front.animate([
        { transform: 'translateY(22px) scale(.97)', opacity: .35, filter: 'brightness(.7)' },
        { transform: 'translateY(-9px) scale(1.005)', opacity: 1, filter: 'brightness(1.12)', offset: .55 },
        { transform: 'translateY(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
      ], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      if (outgoing) {
        outgoing.hidden = false;
        // Keep the departing panel visible for motion while excluding its controls from input.
        outgoing.inert = true;
        outgoing.setAttribute('aria-hidden', 'true');
        const departure = outgoing.animate([
          { transform: 'translateY(0) scale(1)', opacity: 1 },
          { transform: 'translateY(-22px) scale(.96)', opacity: 0 },
        ], { duration: 240, easing: 'ease-out' });
        this.motions.push(departure);
        departure.finished.then(() => { outgoing.hidden = true; }, () => {});
      }
    }
    // 겹침 모드가 바뀌면 트레이 높이가 달라지므로 캔버스(Scale.FIT)가 남는 공간에 맞춰 다시 잡도록 알린다
    window.dispatchEvent(new Event('resize'));
  }
}

export function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return node !== null && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable === true);
}
