import { unitAbbreviation } from '../gameData';
import { appSkin } from '../skin/SkinStore';
import { unitArtUrl, unitSkinName } from '../skin/skins';
import { motionPreferences } from '../skin/presentation';
import type { RunScreenId, RunSnapshot, UnitPromotionNotice } from './contracts';
import { el, tagged } from './dom';
import './unitPromotionEffect.css';

type SourceRect = Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>;
const IMPACT = 620;
const DURATION = 2100;

/** Nonblocking celebration of a confirmed promotion, including after camp changes to the map. */
export class UnitPromotionEffect {
  readonly root = tagged(el('div', 'promotion-fx-layer'), 'unit-promotion-effect');
  private shown = 0;
  private screen: RunScreenId | null = null;
  private generation = 0;

  constructor() {
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    this.root.setAttribute('aria-atomic', 'true');
    motionPreferences.subscribe(() => { if (motionPreferences.reduced) this.clear(); });
  }

  render(snap: RunSnapshot, source?: SourceRect): void {
    const notice = snap.unitPromotion;
    const fresh = notice !== null && notice.id !== this.shown;
    if (snap.screen !== this.screen || !notice) this.clear();
    this.screen = snap.screen;
    if (!fresh || !notice) return;
    this.shown = notice.id;
    this.play(notice, source);
  }

  private clear(): void {
    this.generation++;
    this.root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  private play(notice: UnitPromotionNotice, source?: SourceRect): void {
    this.clear();
    const generation = this.generation;
    const reduced = motionPreferences.reduced;
    const name = unitSkinName(appSkin.current, notice.unitId, notice.unitName);
    this.root.classList.toggle('triple', notice.star === 3);
    this.root.classList.toggle('reduced', reduced);
    const status = el('span', 'promotion-fx-status', `${name} ${notice.fromStar}성에서 ${notice.star}성으로 승급 완료 · ${notice.cost}G 사용`);
    const scene = el('div', 'promotion-fx-scene');
    scene.setAttribute('aria-hidden', 'true');
    const aura = el('div', 'promotion-fx-aura');
    const hero = el('div', 'promotion-fx-hero');
    const heading = el('div', 'promotion-fx-title', notice.star === 3 ? '3성 달성' : '승급 완료');
    const card = el('div', 'promotion-fx-card');
    const url = unitArtUrl(appSkin.current, notice.unitId, 'portrait');
    const fallback = () => card.prepend(el('span', 'promotion-fx-glyph', unitAbbreviation(name)));
    if (url) {
      const art = el('img');
      art.src = url; art.alt = ''; art.draggable = false;
      art.addEventListener('error', () => { art.remove(); fallback(); });
      card.append(art);
    } else fallback();
    const sheen = el('div', 'promotion-fx-sheen');
    const nameplate = el('strong', 'promotion-fx-name', name);
    const before = el('div', 'promotion-fx-stars before', '★'.repeat(notice.fromStar));
    const after = el('div', 'promotion-fx-stars after');
    const stars = Array.from({ length: notice.star }, (_, index) => {
      const star = el('span', index >= notice.fromStar ? 'new-star' : '', '★');
      after.append(star);
      return star;
    });
    card.append(sheen, nameplate, before, after);
    const summary = el('div', 'promotion-fx-summary', `${notice.fromStar}성 → ${notice.star}성 · −${notice.cost}G`);
    hero.append(heading, card, summary);
    scene.append(aura, hero);
    this.root.append(status, scene);
    this.root.hidden = false;

    const lifetime = this.animate(this.root, [
      { opacity: 0 }, { opacity: 1, offset: .07 }, { opacity: 1, offset: .84 }, { opacity: 0 },
    ], reduced ? 1500 : DURATION);
    lifetime.finished.then(() => { if (generation === this.generation) this.clear(); }, () => {});
    if (reduced) {
      before.hidden = true;
      return;
    }

    const bounds = hero.getBoundingClientRect();
    const dx = source ? Math.max(50, Math.min(innerWidth - 50, source.x + source.width / 2)) - innerWidth / 2 : 0;
    const dy = source ? Math.max(70, Math.min(innerHeight - 70, source.y + source.height / 2)) - innerHeight / 2 : 24;
    const scale = source ? Math.max(.45, Math.min(.9, source.width / bounds.width)) : .8;
    this.animate(hero, [
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scale}) rotate(-5deg)`, opacity: .7 },
      { transform: 'translate(-50%, -56%) scale(.98) rotate(0)', opacity: 1, offset: .18 },
      { transform: 'translate(-50%, -50%) scale(.92)', offset: .28 },
      { transform: 'translate(-50%, -51%) scale(1.12)', offset: .33 },
      { transform: 'translate(-50%, -49%) scale(.98)', offset: .39 },
      { transform: 'translate(-50%, -50%) scale(1.02)', offset: .46 },
      { transform: 'translate(-50%, -50%) scale(1)', offset: .55 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .84 },
      { transform: 'translate(-50%, -56%) scale(.95)', opacity: 0 },
    ], DURATION);
    this.animate(aura, [
      { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(.8)', opacity: .5, offset: .28 },
      { transform: 'translate(-50%, -50%) scale(1.3)', opacity: 1, offset: .34 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: .7, offset: .65 },
      { transform: 'translate(-50%, -50%) scale(1.2)', opacity: 0 },
    ], DURATION);
    this.animate(sheen, [
      { transform: 'translateX(-160%) skewX(-18deg)', opacity: 0 },
      { opacity: .85, offset: .2 },
      { transform: 'translateX(160%) skewX(-18deg)', opacity: 0 },
    ], 500, IMPACT - 70);
    this.animate(before, [{ opacity: 1 }, { opacity: 0 }], 120, IMPACT - 80);
    this.animate(heading, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 260, IMPACT);
    this.animate(summary, [{ opacity: 0 }, { opacity: 1 }], 220, IMPACT + 100);
    stars.forEach((star, index) => this.animate(star, [
      { opacity: 0, transform: 'scale(.15) translateY(12px)' },
      { opacity: 1, transform: `scale(${index >= notice.fromStar ? 1.8 : 1.2}) translateY(-3px)`, offset: .42 },
      { opacity: 1, transform: 'scale(1) translateY(0)' },
    ], 470, IMPACT + index * 75));

    for (let i = 0; i < 2; i++) {
      const ring = el('div', 'promotion-fx-ring');
      scene.append(ring);
      this.animate(ring, [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
        { opacity: .8, offset: .12 },
        { transform: `translate(-50%, -50%) scale(${i ? 2.3 : 1.8})`, opacity: 0 },
      ], 680, IMPACT + i * 90);
    }
    const count = notice.star === 3 ? 18 : 12;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const radius = 110 + i % 4 * 30;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      const charge = el('i', 'promotion-fx-particle');
      const spark = el('i', 'promotion-fx-particle spark');
      scene.append(charge, spark);
      this.animate(charge, [
        { transform: `translate(${x}px, ${y}px) scale(.3)`, opacity: 0 },
        { opacity: .8, offset: .3 },
        { transform: 'translate(0, 0) scale(.1)', opacity: 0 },
      ], IMPACT - 80, i * 5);
      this.animate(spark, [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${x * 1.3}px, ${y * 1.3}px) rotate(${i * 35}deg) scale(.1)`, opacity: 0 },
      ], 650, IMPACT + i * 7);
    }
  }

  private animate(node: HTMLElement, frames: Keyframe[], duration: number, delay = 0): Animation {
    // Ease each segment without moving the timed impact and hold earlier in the sequence.
    return node.animate(frames.map(frame => ({ easing: 'cubic-bezier(.2,.75,.3,1)', ...frame })), { duration, delay, fill: 'both', easing: 'linear' });
  }
}
