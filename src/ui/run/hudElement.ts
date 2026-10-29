import { el, tagged } from './dom';
import { relicRow } from './relicElements';
import type { RunHud } from './runViews';

/** 상단 상태 줄: 액트 · 층 · 지휘관 HP · 골드 · 덱 장수 · 시드 */
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
  const act = tagged(el('div', 'run-hud-item run-hud-act'), 'hud-act');
  act.append(el('strong', 'run-hud-value', `액트 ${hud.act} — ${hud.actName}`));
  if (hud.test) {
    const badge = tagged(el('div', 'run-hud-item run-test-badge'), 'test-badge');
    badge.title = hud.test;
    badge.append(el('strong', 'run-test-badge-title', '테스트 런'), el('span', 'run-test-badge-text', hud.test.replace('테스트 런 · ', '')));
    root.append(badge);
  }
  root.append(act);
  if (hud.threatLevel > 0) {
    const badge = tagged(el('div', 'run-hud-item run-threat-badge'), 'threat-badge');
    badge.title = `위협 레벨 ${hud.threatLevel} — ${hud.threatName ?? ''}`;
    badge.append(el('span', 'run-hud-label', '위협 레벨'), el('strong', 'run-hud-value', `${hud.threatLevel} · ${hud.threatName ?? ''}`));
    root.append(badge);
  }
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
