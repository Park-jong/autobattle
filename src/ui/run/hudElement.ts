import { el, tagged } from './dom';
import { relicRow } from './relicElements';
import type { RunHud } from './runViews';

/** 상단 상태 줄: 층 · 지휘관 HP · 골드 · 덱 장수 · 시드 */
export function hudElement(hud: RunHud): HTMLElement {
  const root = tagged(el('div', 'run-hud'), 'hud');
  const item = (label: string, value: string, className = ''): HTMLElement => {
    const box = el('div', `run-hud-item ${className}`.trim());
    box.append(el('span', 'run-hud-label', label), el('strong', 'run-hud-value', value));
    return box;
  };
  const hpRatio = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0;
  const hp = el('div', `run-hud-item run-hud-hp${hpRatio <= 0.3 ? ' low' : ''}`);
  const bar = el('div', 'run-hp-bar');
  const fill = el('div', 'run-hp-fill');
  fill.style.width = `${Math.round(hpRatio * 100)}%`;
  bar.append(fill);
  hp.append(el('span', 'run-hud-label', '지휘관 HP'), el('strong', 'run-hud-value', `${hud.hp} / ${hud.maxHp}`), bar);
  root.append(
    item('지휘관', hud.commanderName),
    item('층', `${hud.floor} / ${hud.floorCount}`),
    hp,
    item('골드', `${hud.gold}G`, 'run-hud-gold'),
    item('덱', `${hud.deckCount}장`),
    item('위치', hud.location),
    item('시드', String(hud.seed)),
  );
  const relics = el('div', 'run-hud-item run-hud-relics');
  relics.append(el('span', 'run-hud-label', `유물 ${hud.relics.length}개`), relicRow(hud.relics, '없음'));
  root.append(relics);
  return root;
}
