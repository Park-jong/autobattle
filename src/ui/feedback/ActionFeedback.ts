import type { DebugController } from '../debug/contracts';
import type { ActionCue } from './ActionCue';
import { appSkin } from '../skin/SkinStore';
import { unitArtUrl, unitSkinName } from '../skin/skins';
import { motionPreferences } from '../skin/presentation';
import { LAYOUT, STAGE } from '../theme';
import './actionFeedback.css';

type Point = { x: number; y: number };
let layer: ActionFeedback | undefined;

export function installActionFeedback(controller: DebugController, canvas: HTMLElement): void {
  layer ??= new ActionFeedback(canvas);
  controller.subscribeActionFeedback?.((cue) => layer?.show(cue));
}

/** Node UI calls this only after a confirmed change in the displayed state. */
export function playNodeFeedback(cue: ActionCue, anchor: HTMLElement): void {
  layer ??= new ActionFeedback(document.getElementById('game'));
  layer.show(cue, center(anchor));
}

function center(node: Element): Point {
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

class ActionFeedback {
  private readonly root = document.createElement('div');
  private readonly status = document.createElement('div');

  constructor(private readonly canvas: HTMLElement | null) {
    this.root.className = 'action-fx-layer';
    this.root.setAttribute('aria-hidden', 'true');
    this.status.className = 'action-fx-status';
    this.status.setAttribute('role', 'status');
    document.body.append(this.root, this.status);
    new MutationObserver(() => {
      this.root.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      this.root.replaceChildren();
    }).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  }

  show(cue: ActionCue, anchor?: Point): void {
    if (!anchor && !['battle', 'debug'].includes(document.body.dataset.screen ?? '')) return;
    const board = this.canvas?.querySelector('canvas');
    const viewport = this.canvas?.closest('.bt-board-viewport');
    const fallback = viewport ? center(viewport) : { x: innerWidth / 2, y: innerHeight / 2 };
    const stagePoint = (cell: { col: number; row: number }): Point => {
      if (!board) return fallback;
      const rect = board.getBoundingClientRect();
      return { x: rect.left + (LAYOUT.BOARD_X + (cell.col + .5) * LAYOUT.CELL_SIZE) / STAGE.WIDTH * rect.width,
        y: rect.top + (LAYOUT.BOARD_Y + (cell.row + .5) * LAYOUT.CELL_SIZE) / STAGE.HEIGHT * rect.height };
    };
    const bench = cue.benchIndex != null ? document.querySelector(`[data-bench-index="${cue.benchIndex}"]`) : null;
    const origin = anchor ?? (cue.origin ? stagePoint(cue.origin) : bench ? center(bench) : fallback);
    const points = cue.targets?.length ? cue.targets.map(stagePoint) : [origin];
    const tone = cue.kind === 'sale' || cue.kind === 'purchase' ? 'gold' : cue.kind === 'equipment' ? 'mint' : cue.cardType === 'spell' ? 'violet' : 'blue';
    const unitLabel = cue.unitId ? unitSkinName(appSkin.current, cue.unitId, cue.label) : cue.label;
    const label = cue.kind === 'sale' ? `${unitLabel} 판매 · +${cue.amount ?? 0}G`
      : cue.kind === 'equipment' ? `${cue.label} · 장비 적용` : cue.kind === 'card' ? `${cue.label} · 적용 완료` : cue.label;
    this.status.textContent = label;
    this.float(label, points[0]!, tone);
    if (motionPreferences.reduced) return;
    for (const point of points.slice(0, 5)) this.burst(point, tone);
    if (cue.kind === 'card' || cue.kind === 'equipment') this.cardFlight(cue.instanceId, points[0]!);
    if (cue.kind === 'sale') {
      const url = cue.unitId && unitArtUrl(appSkin.current, cue.unitId, 'sd');
      if (url) {
        const ghost = this.element('img', 'action-fx-unit', origin);
        ghost.src = url;
        this.animate(ghost, [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: 'translate(-50%, -95%) scale(.2) rotate(12deg)', opacity: 0 }], 520);
      }
    }
    if (cue.kind === 'sale' || cue.kind === 'purchase') {
      const hud = [...document.querySelectorAll('[data-testid="hud-gold"], .run-hud-gold')].find((node) => node.getBoundingClientRect().width > 0);
      if (hud) {
        const wallet = center(hud);
        const from = cue.kind === 'sale' ? origin : wallet;
        const to = cue.kind === 'sale' ? wallet : origin;
        for (let i = 0; i < 5; i++) {
          const coin = this.element('span', 'action-fx-coin', from); coin.textContent = 'G';
          this.animate(coin, [{ transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
            { transform: `translate(${(to.x - from.x) * .4 + (i - 2) * 16}px, ${(to.y - from.y) * .3 - 36}px) scale(1)`, opacity: 1, offset: .42 },
            { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.3)`, opacity: 0 }], 700 + i * 55);
        }
        hud.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 700 });
      }
    }
  }

  private float(label: string, point: Point, tone: string): void {
    const node = this.element('div', `action-fx-label ${tone}`, point);
    node.textContent = label;
    if (motionPreferences.reduced) {
      node.style.transform = 'translate(-50%, -100%)';
      this.animate(node, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], 1100);
      return;
    }
    this.animate(node, [{ transform: 'translate(-50%, -30%) scale(.9)', opacity: 0 },
      { transform: 'translate(-50%, -80%) scale(1)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%, -160%) scale(1)', opacity: 0 }], 1250);
  }

  private burst(point: Point, tone: string): void {
    const ring = this.element('i', `action-fx-ring ${tone}`, point);
    this.animate(ring, [{ transform: 'translate(-50%, -50%) scale(.25)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0 }], 650);
    for (let i = 0; i < 7; i++) {
      const spark = this.element('i', `action-fx-spark ${tone}`, point);
      const angle = i * Math.PI * 2 / 7;
      this.animate(spark, [{ transform: 'scale(.4)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * 48}px, ${Math.sin(angle) * 48}px) scale(0)`, opacity: 0 }], 450 + i * 35);
    }
  }

  private cardFlight(instanceId: number | undefined, destination: Point): void {
    const source = document.querySelector<HTMLElement>(`[data-testid="hand-card-${instanceId}"]`);
    if (!source) return;
    const start = center(source), clone = source.cloneNode(true) as HTMLElement;
    clone.removeAttribute('data-testid'); clone.removeAttribute('tabindex');
    clone.querySelectorAll('button').forEach((node) => node.remove());
    clone.classList.add('action-fx-card');
    Object.assign(clone.style, { left: `${start.x}px`, top: `${start.y}px` });
    this.root.append(clone);
    this.animate(clone, [{ transform: 'translate(-50%, -50%) scale(.7) rotate(-8deg)', opacity: .95 },
      { transform: `translate(calc(-50% + ${destination.x - start.x}px), calc(-50% + ${destination.y - start.y}px)) scale(.1) rotate(8deg)`, opacity: 0 }], 520);
  }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, point: Point): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); node.className = className;
    node.style.left = `${Math.max(12, Math.min(innerWidth - 12, point.x))}px`;
    node.style.top = `${Math.max(24, Math.min(innerHeight - 24, point.y))}px`;
    this.root.append(node);
    return node;
  }

  private animate(node: HTMLElement, frames: Keyframe[], duration: number): void {
    const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.18,.7,.3,1)', fill: 'forwards' });
    animation.finished.then(() => node.remove(), () => node.remove());
  }
}
