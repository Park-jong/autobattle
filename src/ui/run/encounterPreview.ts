import { el, tagged } from './dom';
import type { EncounterPreviewView } from './runViews';

/** 적 편성 미리보기: 편성 이름·층 보정·변이·유닛(등급·성급·보정 후 HP/ATK) */
export function encounterPreviewElement(view: EncounterPreviewView): HTMLElement {
  const root = tagged(el('section', `run-preview kind-${view.kind}`), 'encounter-preview');
  const head = el('div', 'run-preview-head');
  head.append(el('strong', '', `${view.floor}층 ${view.kindLabel}`), el('span', 'run-preview-name', view.name));
  root.append(head, el('p', 'dbg-hint', view.text), el('p', 'run-preview-scale', `층 보정: ${view.scaleLabel}`));
  if (view.mutations.length > 0) {
    const box = el('div', 'run-preview-mutations');
    for (const m of view.mutations) {
      const row = el('div', 'run-mutation');
      row.append(el('strong', '', `변이 [${m.name}]`), el('span', '', m.text));
      box.append(row);
    }
    root.append(box);
  }
  const table = el('div', 'run-preview-units');
  for (const u of view.units) {
    const row = el('div', `run-preview-unit${u.boss ? ' boss' : ''}`);
    row.append(
      el('strong', '', `${u.name} ${'★'.repeat(u.star)}`),
      el('span', 'run-preview-tier', `${u.tier}등급`),
      el('span', '', `HP ${u.hp}`),
      el('span', '', `ATK ${u.atk}`),
      el('span', 'run-preview-skill', `스킬 ${u.skillName}`),
    );
    table.append(row);
  }
  root.append(table);
  return root;
}
