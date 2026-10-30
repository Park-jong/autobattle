import { button, el, tagged } from './dom';
import type { RelicView } from './runViews';
import { relicArtUrl } from './relicArt';
import './relicArt.css';

/** Shared generated image for inventory chips, rewards, shops, and inspection. */
export function relicIcon(relic: RelicView, large = false): HTMLElement {
  const frame = el('span', `run-relic-icon relic-art rarity-${relic.rarity}${large ? ' relic-art-large' : ''}`);
  const url = relicArtUrl(relic.id);
  if (url) {
    const img = el('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
    img.addEventListener('error', () => { img.remove(); frame.append(el('span', 'relic-art-fallback', relic.icon)); });
    frame.append(img);
  } else frame.append(el('span', 'relic-art-fallback', relic.icon));
  return frame;
}

let detail: HTMLDialogElement | undefined;
let collection: HTMLDialogElement | undefined;

function closeButton(dialog: HTMLDialogElement): HTMLButtonElement {
  return button('닫기', () => dialog.close(), 'relic-dialog-close');
}

export function inspectRelic(relic: RelicView): void {
  if (!detail) {
    detail = tagged(el('dialog', 'relic-detail-dialog'), 'relic-detail');
    detail.addEventListener('click', (event) => { if (event.target === detail) detail!.close(); });
    document.body.append(detail);
  }
  detail.className = `relic-detail-dialog rarity-${relic.rarity}`;
  detail.setAttribute('aria-label', `${relic.name} · ${relic.rarityLabel} 유물`);
  const art = el('div', 'relic-detail-art'); art.append(relicIcon(relic, true));
  const body = el('div', 'relic-detail-copy');
  body.append(el('span', 'relic-rarity-badge', `${relic.rarityLabel} 유물`), el('h2', '', relic.name), el('span', 'relic-effect-label', '유물 효과'), el('p', '', relic.text));
  detail.replaceChildren(closeButton(detail), art, body);
  if (!detail.open) detail.showModal();
}

export function openRelicCollection(relics: readonly RelicView[], title = '보유 유물'): void {
  if (!collection) {
    collection = tagged(el('dialog', 'relic-collection-dialog'), 'relic-collection');
    document.body.append(collection);
  }
  collection.setAttribute('aria-label', title);
  const head = el('header', 'relic-collection-head');
  const copy = el('div'); copy.append(el('span', 'relic-collection-eyebrow', 'RELIC COLLECTION'), el('h2', '', `${title} · ${relics.length}`));
  head.append(copy, closeButton(collection));
  const filters = el('nav', 'relic-collection-filters'); filters.setAttribute('aria-label', '유물 등급');
  const grid = el('div', 'relic-collection-grid');
  const show = (rarity: string) => {
    grid.replaceChildren(...relics.filter((relic) => rarity === 'all' || relic.rarity === rarity).map(relicCard));
    for (const node of filters.querySelectorAll<HTMLButtonElement>('button')) node.setAttribute('aria-pressed', String(node.dataset.rarity === rarity));
  };
  for (const [id, name] of [['all', '전체'], ['common', '일반'], ['rare', '희귀'], ['boss', '보스']] as const) {
    const count = relics.filter((relic) => id === 'all' || relic.rarity === id).length;
    const filter = button(`${name} ${count}`, () => show(id), 'relic-filter'); filter.dataset.rarity = id; filters.append(filter);
  }
  collection.replaceChildren(head, filters, grid); show('all');
  if (!collection.open) collection.showModal();
}

/** 유물 한 개: 아이콘 + 이름. 마우스를 올리거나 눌러(키보드 포커스) 설명을 본다 */
export function relicChip(relic: RelicView): HTMLElement {
  const chip = tagged(el('button', `run-relic rarity-${relic.rarity}`), `relic-${relic.id}`);
  chip.type = 'button';
  chip.dataset.relicId = relic.id;
  chip.setAttribute('aria-label', `${relic.name} (${relic.rarityLabel} 유물): ${relic.text}`);
  const tip = el('span', 'run-relic-tip');
  tip.append(el('strong', '', `${relic.name} · ${relic.rarityLabel}`), el('span', '', relic.text));
  chip.append(relicIcon(relic), el('span', 'run-relic-name', relic.name), tip);
  chip.addEventListener('click', () => inspectRelic(relic));
  return chip;
}

/** 유물 목록 줄 (비어 있으면 안내 문구) */
export function relicRow(relics: readonly RelicView[], emptyText = '유물 없음'): HTMLElement {
  const row = tagged(el('div', 'run-relic-row'), 'relic-row');
  if (relics.length === 0) row.append(el('span', 'run-relic-empty', emptyText));
  for (const relic of relics) row.append(relicChip(relic));
  if (relics.length > 0) row.append(tagged(button(`유물함 ${relics.length}`, () => openRelicCollection(relics), 'relic-inventory-open'), 'open-relic-inventory'));
  return row;
}

/** 보상·상점에서 쓰는 유물 설명 카드 (이름·희귀도·설명) */
export function relicCard(relic: RelicView): HTMLElement {
  const root = el('div', `run-relic-card relic-visual-card rarity-${relic.rarity}`);
  root.dataset.relicId = relic.id;
  const art = button('', () => inspectRelic(relic), 'relic-card-art');
  art.setAttribute('aria-label', `${relic.name} 이미지와 효과 자세히 보기`);
  art.append(relicIcon(relic, true), el('span', 'relic-rarity-badge', relic.rarityLabel));
  const head = el('div', 'run-relic-card-head');
  head.append(el('strong', '', relic.name));
  root.append(art, head, el('div', 'run-card-meta', `${relic.rarityLabel} 유물`), el('p', 'run-card-text', relic.text));
  return root;
}
