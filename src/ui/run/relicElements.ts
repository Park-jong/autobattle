import { el, tagged } from './dom';
import type { RelicView } from './runViews';

/** 유물 한 개: 아이콘 + 이름. 마우스를 올리거나 눌러(키보드 포커스) 설명을 본다 */
export function relicChip(relic: RelicView): HTMLElement {
  const chip = tagged(el('button', `run-relic rarity-${relic.rarity}`), `relic-${relic.id}`);
  chip.type = 'button';
  chip.dataset.relicId = relic.id;
  chip.setAttribute('aria-label', `${relic.name} (${relic.rarityLabel} 유물): ${relic.text}`);
  const tip = el('span', 'run-relic-tip');
  tip.append(el('strong', '', `${relic.name} · ${relic.rarityLabel}`), el('span', '', relic.text));
  chip.append(el('span', 'run-relic-icon', relic.icon), el('span', 'run-relic-name', relic.name), tip);
  return chip;
}

/** 유물 목록 줄 (비어 있으면 안내 문구) */
export function relicRow(relics: readonly RelicView[], emptyText = '유물 없음'): HTMLElement {
  const row = tagged(el('div', 'run-relic-row'), 'relic-row');
  if (relics.length === 0) row.append(el('span', 'run-relic-empty', emptyText));
  for (const relic of relics) row.append(relicChip(relic));
  return row;
}

/** 보상·상점에서 쓰는 유물 설명 카드 (이름·희귀도·설명) */
export function relicCard(relic: RelicView): HTMLElement {
  const root = el('div', `run-relic-card rarity-${relic.rarity}`);
  const head = el('div', 'run-relic-card-head');
  head.append(el('span', 'run-relic-icon', relic.icon), el('strong', '', relic.name));
  root.append(head, el('div', 'run-card-meta', `${relic.rarityLabel} 유물`), el('p', 'run-card-text', relic.text));
  return root;
}
