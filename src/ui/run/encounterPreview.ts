import { el, tagged } from './dom';
import type { EncounterPreviewView } from './runViews';
import { appSkin } from '../skin/SkinStore';
import { encounterSkinName, isIllustratedSkin, unitArtUrl, unitSkinName, unitSkillName } from '../skin/skins';
import { bossProfile } from '../skin/bossRoster';
import { unitFace } from './battle/unitFace';

/** 적 편성 미리보기: 편성 이름·층 보정·변이·유닛(등급·성급·보정 후 HP/ATK) */
export function encounterPreviewElement(view: EncounterPreviewView): HTMLElement {
  const root = tagged(el('section', `run-preview kind-${view.kind}`), 'encounter-preview');
  const head = el('div', 'run-preview-head');
  head.append(el('strong', '', `액트 ${view.act} · ${view.floor}층 ${view.kindLabel}`), el('span', 'run-preview-name', encounterSkinName(appSkin.current, view.kind, view.name)));
  root.append(head, el('p', 'dbg-hint', view.text), el('p', 'run-preview-scale', `층 보정: ${view.scaleLabel}`));
  if (view.kind === 'boss' && isIllustratedSkin(appSkin.current)) {
    const art = tagged(el('div', 'run-preview-bosses'), 'boss-art');
    for (const u of view.units.filter((unit) => unit.boss)) {
      const url = unitArtUrl(appSkin.current, u.unitId, 'illustration');
      if (!url) continue;
      const card = el('figure', 'run-preview-boss');
      const name = unitSkinName(appSkin.current, u.unitId, u.name);
      const image = el('img');
      image.src = url; image.alt = `${name} 전신 원화`; image.draggable = false;
      image.addEventListener('error', () => card.remove());
      const caption = el('figcaption');
      caption.append(el('strong', '', name), el('span', '', bossProfile(appSkin.current, u.unitId)?.role ?? '보스'));
      card.append(image, caption);
      art.append(card);
    }
    if (art.childElementCount > 0) root.append(art);
  }
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
    const name = el('strong', 'academy-preview-name');
    if (isIllustratedSkin(appSkin.current)) name.append(unitFace(u.unitId, u.name, u.tier, { enemy: true }));
    name.append(`${unitSkinName(appSkin.current, u.unitId, u.name)} ${'★'.repeat(u.star)}`);
    name.title = u.name;
    row.append(
      name,
      el('span', 'run-preview-tier', `${u.tier}등급`),
      el('span', '', `HP ${u.hp}`),
      el('span', '', `ATK ${u.atk}`),
      el('span', 'run-preview-skill', `스킬 ${unitSkillName(appSkin.current, u.unitId, u.skillName)}`),
    );
    table.append(row);
  }
  root.append(table);
  if (view.bossPatterns.length > 0) {
    const box = tagged(el('div', 'run-preview-patterns'), 'boss-patterns');
    for (const pattern of view.bossPatterns) {
      const row = el('div', 'run-boss-pattern');
      const unit = view.units.find((u) => u.name === pattern.unitName);
      const name = unit ? unitSkinName(appSkin.current, unit.unitId, pattern.unitName) : pattern.unitName;
      row.append(el('strong', '', `보스 패턴 [${pattern.title}] — ${name}`));
      for (const line of pattern.lines) row.append(el('span', '', line));
      box.append(row);
    }
    root.append(box);
  }
  return root;
}
