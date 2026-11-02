import { button, el, tagged } from '../run/dom';
import { MODERN_ROSTER, type ModernCharacter } from './modernRoster';
import { THREE_KINGDOMS_ROSTER, type ThreeKingdomsCharacter } from './threeKingdomsRoster';
import { commanderArtUrl, unitArtUrl, type ArtKind, type SkinId } from './skins';
import { appSkin } from './SkinStore';

type GalleryCharacter = ModernCharacter | ThreeKingdomsCharacter;

/** 현대전 대원·삼국지 장수의 원화와 설정을 볼 수 있는 도감. 런 상태에는 관여하지 않는다. */
export class RosterGallery {
  private readonly dialog = tagged(el('dialog', 'modern-gallery'), 'modern-gallery');
  private readonly detail = el('section', 'modern-gallery-detail');
  private readonly list = el('div', 'modern-gallery-list');
  private readonly title = el('h2');
  private skin: SkinId = 'modern';

  constructor() {
    this.dialog.setAttribute('aria-label', '시티 오퍼레이션 대원 도감');
    const close = tagged(button('닫기', () => this.dialog.close(), 'bt-btn'), 'gallery-close');
    const header = el('header', 'modern-gallery-header');
    header.append(this.title, close);
    const body = el('div', 'modern-gallery-body');
    body.append(this.list, this.detail);
    this.dialog.append(header, body);
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.dialog.close(); });
    document.body.append(this.dialog);
  }

  open(): void {
    this.skin = appSkin.current === 'three_kingdoms' ? 'three_kingdoms' : 'modern';
    const characters: readonly GalleryCharacter[] = this.skin === 'three_kingdoms' ? THREE_KINGDOMS_ROSTER.characters : MODERN_ROSTER.characters.filter(c => c.code.startsWith('U'));
    this.title.textContent = this.skin === 'three_kingdoms' ? '장수 도감 · 37' : '대원 도감 · 30';
    this.dialog.setAttribute('aria-label', this.title.textContent);
    this.list.replaceChildren(...characters.map(c => this.card(c)));
    this.show(characters[0]!);
    if (!this.dialog.open) this.dialog.showModal();
  }

  private art(c: GalleryCharacter, kind: ArtKind): string {
    return (c.code.startsWith('C') ? commanderArtUrl(this.skin, c.id, kind) : unitArtUrl(this.skin, c.id, kind))!;
  }

  private card(c: GalleryCharacter): HTMLElement {
    const card = tagged(button('', () => this.show(c), 'modern-gallery-card'), `gallery-${c.code}`);
    const img = el('img');
    img.src = this.art(c, 'portrait');
    img.alt = ''; img.loading = 'lazy'; img.draggable = false;
    img.addEventListener('error', () => img.remove());
    card.style.setProperty('--unit-color', c.color);
    card.append(img, el('strong', '', c.name), el('span', '', c.role));
    return card;
  }

  private show(c: GalleryCharacter): void {
    const img = el('img', 'modern-gallery-full');
    img.src = this.art(c, 'illustration');
    img.alt = `${c.name} 전신 원화`; img.draggable = false;
    img.addEventListener('error', () => img.remove());
    this.detail.replaceChildren(img, el('span', 'modern-unit-role', `${c.code} · ${c.faction}`), el('h3', '', c.name),
      el('p', '', `${c.role} · ${c.age}세 · ${c.height}cm`), el('p', '', c.equipment), el('p', 'modern-unit-bio', c.bio), el('p', 'modern-unit-quote', `“${c.quote}”`));
    this.list.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.testid === `gallery-${c.code}`)));
  }
}
