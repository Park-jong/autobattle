import { el, tagged } from '../dom';

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
  { id: 'cards', label: '카드', code: 'KeyC', key: 'C' },
];

/**
 * 하단 트레이: 유닛 상점 층과 카드(손패) 층을 겹쳐 두고, 탭·단축키로 고른 층이 앞으로 나오고
 * 나머지는 뒤로 물러나 위쪽 탭만 보이게 한다. 겹침 모드가 꺼지면(디버그 화면) 카드 층만 평소처럼 보인다.
 */
export class TrayStack {
  private readonly layers = new Map<TrayLayerId, HTMLElement>();
  private frontId: TrayLayerId = 'cards';
  private stacked = false;
  private collapsed = typeof window !== 'undefined' && window.innerHeight < 620;
  private readonly collapseButton = tagged(el('button', 'tray-collapse'), 'tray-collapse');

  constructor(private readonly tray: HTMLElement, contents: Record<TrayLayerId, HTMLElement>) {
    for (const spec of LAYERS) {
      const layer = tagged(el('div', `tray-layer ${spec.id}`), `tray-${spec.id}`);
      const tab = tagged(el('button', 'tray-tab'), `tray-tab-${spec.id}`);
      tab.type = 'button';
      tab.append(spec.label, el('span', 'bt-key', spec.key));
      tab.addEventListener('click', () => this.bringFront(spec.id));
      // 뒤로 물러난 층은 아무 곳이나 눌러도 앞으로 나온다
      layer.addEventListener('pointerdown', (e) => {
        if (this.stacked && this.frontId !== spec.id) {
          e.preventDefault();
          e.stopPropagation();
          this.bringFront(spec.id);
        }
      }, true);
      layer.append(tab, contents[spec.id]);
      this.layers.set(spec.id, layer);
      tray.append(layer);
    }
    this.collapseButton.type = 'button';
    this.collapseButton.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.apply(false);
    });
    tray.append(this.collapseButton);
    window.addEventListener('keydown', (e) => {
      if (!this.stacked || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const spec = LAYERS.find((l) => l.code === e.code);
      if (spec) this.bringFront(spec.id);
    });
    this.apply(false);
  }

  get front(): TrayLayerId {
    return this.frontId;
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
    this.tray.classList.toggle('stacked', this.stacked);
    this.tray.classList.toggle('collapsed', this.stacked && this.collapsed);
    this.collapseButton.hidden = !this.stacked;
    this.collapseButton.textContent = this.collapsed ? '트레이 펼치기 ▴' : '보드 크게 ▾';
    this.collapseButton.setAttribute('aria-expanded', String(!this.collapsed));
    for (const [id, layer] of this.layers) {
      const front = id === this.frontId;
      layer.hidden = !this.stacked && id !== 'cards';
      layer.classList.toggle('front', !this.stacked || front);
      layer.classList.toggle('back', this.stacked && !front);
      layer.classList.remove('raised');
      if (animate && front) {
        void layer.offsetWidth; // 애니메이션 다시 시작
        layer.classList.add('raised');
      }
    }
    // 겹침 모드가 바뀌면 트레이 높이가 달라지므로 캔버스(Scale.FIT)가 남는 공간에 맞춰 다시 잡도록 알린다
    if (!animate) window.dispatchEvent(new Event('resize'));
  }
}

export function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return node !== null && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable === true);
}
