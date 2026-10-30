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
    const bench = this.reserveCard(cue.benchIndex);
    const origin = anchor ?? (cue.origin ? stagePoint(cue.origin) : bench ? center(bench) : fallback);
    const points = cue.targets?.length ? cue.targets.map(stagePoint) : [origin];
    const tone = cue.kind === 'sale' || cue.kind === 'purchase' || cue.kind === 'merge' ? 'gold' : cue.kind === 'equipment' ? 'mint' : cue.cardType === 'spell' ? 'violet' : 'blue';
    const unitLabel = cue.unitId ? unitSkinName(appSkin.current, cue.unitId, cue.label) : cue.label;
    const label = cue.kind === 'merge' ? `${unitLabel} · ${'★'.repeat(cue.star ?? 2)} 합성`
      : cue.kind === 'sale' ? `${unitLabel} 판매 · +${cue.amount ?? 0}G`
      : cue.kind === 'purchase' && cue.shopSlot !== undefined ? `${unitLabel} 영입 · −${cue.amount ?? 0}G`
      : cue.kind === 'summon' ? `${unitLabel} 소환`
      : cue.kind === 'recall' ? `${unitLabel} · 손패로 회수`
      : cue.kind === 'equipment' ? `${cue.label} · 장비 적용` : cue.kind === 'card' ? `${cue.label} · 적용 완료` : cue.label;
    this.status.textContent = label;
    if (cue.kind === 'reroll' || cue.kind === 'experience' || cue.kind === 'shopLock') {
      this.shopAction(cue);
      return;
    }
    if (cue.kind === 'purchase' && cue.shopSlot !== undefined) {
      requestAnimationFrame(() => this.recruit(cue, this.reservePoint(cue.benchIndex, fallback)));
      return;
    }
    if (cue.kind === 'summon') {
      this.float(label, origin, 'mint');
      if (!motionPreferences.reduced) {
        this.flyUnit(cue, bench ? center(bench) : this.reservePoint(null, fallback), origin);
        this.burst(origin, 'mint');
      }
      return;
    }
    if (cue.kind === 'recall') {
      requestAnimationFrame(() => {
        const destination = this.reservePoint(cue.benchIndex, fallback);
        this.float(label, destination, 'mint');
        if (!motionPreferences.reduced) this.flyUnit(cue, origin, destination);
      });
      return;
    }
    if (cue.kind === 'merge' && !cue.origin && cue.benchIndex != null) {
      requestAnimationFrame(() => {
        const destination = this.reservePoint(cue.benchIndex, fallback);
        if (!motionPreferences.reduced) this.mergeCards(cue, destination, stagePoint);
        this.float(label, destination, tone, motionPreferences.reduced ? 0 : 680);
      });
      return;
    }
    if (cue.kind === 'merge' && !motionPreferences.reduced) {
      this.mergeCards(cue, origin, stagePoint);
      this.float(label, origin, tone, 680);
      return;
    }
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

  private reserveCard(index: number | null | undefined): Element | null {
    if (index == null) return null;
    const card = document.querySelector(`[data-reserve-index="${index}"], [data-bench-index="${index}"]`);
    return card && card.getBoundingClientRect().width > 0 ? card : null;
  }

  private reservePoint(index: number | null | undefined, fallback: Point): Point {
    const card = this.reserveCard(index);
    const tab = document.querySelector('[data-testid="tray-tab-cards"]');
    return card ? center(card) : tab && tab.getBoundingClientRect().width > 0 ? center(tab) : fallback;
  }

  private shopAction(cue: ActionCue): void {
    const id = cue.kind === 'reroll' ? 'shop-reroll' : cue.kind === 'experience' ? 'shop-xp' : 'shop-lock';
    const control = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!control || control.getBoundingClientRect().width === 0) return;
    const point = center(control);
    this.float(cue.label, point, cue.kind === 'experience' ? 'blue' : 'gold');
    if (motionPreferences.reduced) return;
    control.animate([{ boxShadow: '0 0 0 0 #e8c46a00' }, { boxShadow: '0 0 0 3px #e8c46a88', offset: .3 }, { boxShadow: '0 0 0 8px #e8c46a00' }], { duration: 550 });
    const icon = control.querySelector('svg');
    if (cue.kind === 'reroll') {
      icon?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      document.querySelectorAll<HTMLElement>('.unit-market .bt-offer').forEach((card, index) => {
        card.animate([{ transform: 'perspective(600px) rotateY(-12deg) translateY(12px)', opacity: .3, filter: 'brightness(1.7)' },
          { transform: 'perspective(600px) rotateY(0) translateY(0)', opacity: 1, filter: 'brightness(1)' }],
        { duration: 380, delay: index * 45, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    } else if (cue.kind === 'experience') {
      icon?.animate([{ transform: 'translateY(4px)' }, { transform: 'translateY(-5px)', offset: .4 }, { transform: 'none' }], { duration: 450 });
      const progression = document.querySelector<HTMLElement>('.unit-market .bt-shop-progression');
      if (progression) {
        progression.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(2)', offset: .3 }, { filter: 'brightness(1)' }], { duration: 700 });
        this.burst(center(progression), cue.level! > cue.previousLevel! ? 'gold' : 'blue');
      }
    } else {
      icon?.animate([{ transform: 'scale(.7) rotate(-14deg)' }, { transform: 'scale(1.2) rotate(8deg)', offset: .45 }, { transform: 'none' }], { duration: 420 });
      document.querySelector<HTMLElement>('.unit-market .bt-offers')?.animate([
        { filter: 'brightness(1)' }, { filter: `brightness(${cue.locked ? 1.45 : 1.15})`, offset: .3 }, { filter: 'brightness(1)' },
      ], { duration: 500 });
    }
  }

  private recruit(cue: ActionCue, destination: Point): void {
    const offer = document.querySelector<HTMLElement>(`[data-testid="shop-offer-${cue.shopSlot}"]`);
    const source = offer && offer.getBoundingClientRect().width > 0 ? center(offer) : destination;
    const name = cue.unitId ? unitSkinName(appSkin.current, cue.unitId, cue.label) : cue.label;
    this.float(`${name} 영입 · −${cue.amount ?? 0}G`, source, 'gold');
    if (motionPreferences.reduced) return;
    this.burst(source, 'gold');
    this.flyUnit(cue, source, destination);
    const wallet = document.querySelector<HTMLElement>('[data-testid="shop-gold"]');
    wallet?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.9)', offset: .3 }, { filter: 'brightness(1)' }], { duration: 550 });
  }

  private flyUnit(cue: ActionCue, source: Point, destination: Point): void {
    const card = this.element('div', 'action-fx-recruit', source);
    const name = cue.unitId ? unitSkinName(appSkin.current, cue.unitId, cue.label) : cue.label;
    const url = cue.unitId && unitArtUrl(appSkin.current, cue.unitId, 'portrait');
    if (url) {
      const image = document.createElement('img'); image.src = url; image.alt = ''; card.append(image);
    }
    const title = document.createElement('b'); title.textContent = name; card.append(title);
    this.animate(card, [{ transform: 'translate(-50%, -50%) scale(.7)', opacity: 0 },
      { transform: 'translate(-50%, -65%) scale(1.15)', opacity: 1, offset: .2 },
      { transform: `translate(calc(-50% + ${destination.x - source.x}px), calc(-50% + ${destination.y - source.y}px)) scale(.4)`, opacity: .9, offset: .85 },
      { transform: `translate(calc(-50% + ${destination.x - source.x}px), calc(-50% + ${destination.y - source.y}px)) scale(.2)`, opacity: 0 }], 760);
    const ring = this.element('i', 'action-fx-ring gold', destination);
    this.animate(ring, [{ transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 }], 450, 550);
  }

  private float(label: string, point: Point, tone: string, delay = 0): void {
    const node = this.element('div', `action-fx-label ${tone}`, point);
    node.textContent = label;
    if (motionPreferences.reduced) {
      node.style.transform = 'translate(-50%, -100%)';
      this.animate(node, [{ opacity: 0 }, { opacity: 1, offset: .15 }, { opacity: 1, offset: .8 }, { opacity: 0 }], 1100);
      return;
    }
    this.animate(node, [{ transform: 'translate(-50%, -30%) scale(.9)', opacity: 0 },
      { transform: 'translate(-50%, -80%) scale(1)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%, -160%) scale(1)', opacity: 0 }], 1250, delay);
  }

  private mergeCards(cue: ActionCue, destination: Point, stagePoint: (cell: { col: number; row: number }) => Point): void {
    const name = cue.unitId ? unitSkinName(appSkin.current, cue.unitId, cue.label) : cue.label;
    const makeCard = (star: number, point: Point) => {
      const card = this.element('div', 'action-fx-merge-card', point);
      const url = cue.unitId && unitArtUrl(appSkin.current, cue.unitId, 'portrait');
      if (url) { const art = document.createElement('img'); art.src = url; art.alt = ''; card.append(art); }
      else { const glyph = document.createElement('span'); glyph.className = 'merge-glyph'; glyph.textContent = name.slice(0, 2); card.append(glyph); }
      const title = document.createElement('b'); title.textContent = name;
      const stars = document.createElement('span'); stars.className = 'merge-stars'; stars.textContent = '★'.repeat(star);
      card.append(title, stars);
      return card;
    };
    const sources = cue.mergeSources?.slice(0, 6) ?? [{ star: 1 }, { star: 1 }, { star: 1 }];
    sources.forEach((source, index) => {
      const bench = this.reserveCard(source.benchIndex);
      const offer = source.shopSlot != null ? document.querySelector('.bt-offers')?.children[source.shopSlot] : null;
      const angle = (index / sources.length) * Math.PI * 2;
      const start = source.origin ? stagePoint(source.origin) : bench ? center(bench) : offer ? center(offer)
        : { x: destination.x + Math.cos(angle) * 100, y: destination.y + Math.sin(angle) * 70 };
      const card = makeCard(source.star, start);
      this.animate(card, [{ transform: `translate(-50%, -65%) scale(.7) rotate(${(index - sources.length / 2) * 7}deg)`, opacity: 0 },
        { transform: `translate(-50%, -95%) scale(1) rotate(${(index - sources.length / 2) * 7}deg)`, opacity: 1, offset: .22 },
        { transform: `translate(calc(-50% + ${destination.x - start.x}px), calc(-50% + ${destination.y - start.y}px)) scale(.18) rotate(0deg)`, opacity: 0 }], 640 + index * 30);
    });
    const final = makeCard(cue.star ?? 2, destination);
    final.classList.add('merge-result');
    this.animate(final, [{ transform: 'translate(-50%, -65%) scale(.25)', opacity: 0 },
      { transform: 'translate(-50%, -85%) scale(1.35)', opacity: 1, offset: .22 },
      { transform: 'translate(-50%, -85%) scale(1.12)', opacity: 1, offset: .65 },
      { transform: 'translate(-50%, -100%) scale(.9)', opacity: 0 }], 960, 620);
    const ring = this.element('i', 'action-fx-ring gold', destination);
    this.animate(ring, [{ transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%, -50%) scale(2.5)', opacity: 0 }], 730, 650);
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

  private animate(node: HTMLElement, frames: Keyframe[], duration: number, delay = 0): void {
    const animation = node.animate(frames, { duration, delay, easing: 'cubic-bezier(.18,.7,.3,1)', fill: 'both' });
    animation.finished.then(() => node.remove(), () => node.remove());
  }
}
