import { el, tagged } from './dom';
import { iconButton, iconSvg } from './iconButton';
import { relicChip, relicRow } from './relicElements';
import type { RunHud } from './runViews';
import { actPresentation, commanderSkinName } from '../skin/skins';
import { appSkin } from '../skin/SkinStore';
import { commanderArt } from '../skin/commanderArt';
import './expeditionHeader.css';

interface ExpeditionActions {
  onHome: () => void;
  onDeck?: () => void;
  region?: string;
  description?: string;
}

const CREST = '<path d="m12 2 3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2z"/><path d="m12 7 2 5-2 5-2-5z"/><circle cx="12" cy="12" r="8"/>';
const SIGILS = {
  shield: '<path d="m12 3 7 3v6c0 4-7 8-7 8s-7-4-7-8V6z"/><path d="M12 7v9M8 11h8"/>',
  flame: '<path d="M13 3c1 5-3 5-2 9 2-1 3-3 3-5 5 4 6 8 3 11-3 4-10 3-12-1-2-4 1-7 4-10-1 4 0 5 1 6-1-5 3-6 3-10z"/>',
  book: '<path d="M12 6C9 3 5 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1zM12 6v14M6 8l3 1M15 9l3-1M6 12l3 1M15 13l3-1"/>',
  banner: '<path d="M6 21V3M6 4h13l-3 5 3 5H6M3 21h6"/><path d="m11 7 2 2-2 2"/>',
  crown: '<path d="m3 7 5 4 4-7 4 7 5-4-2 12H5zM5 22h14"/><path d="m12 12-2 3 2 2 2-2z"/>',
  scales: '<path d="M12 3v18M7 21h10M4 7h16M6 7l-4 8h8L6 7zM18 7l-4 8h8l-4-8z"/>',
  gem: '<path d="m12 2 8 7-8 13L4 9zM4 9h16M12 2 9 9l3 13 3-13z"/>',
} as const;

function sigil(id: string): string {
  if (/crown|banner|baton/.test(id)) return /crown/.test(id) ? SIGILS.crown : SIGILS.banner;
  if (/ember|phoenix|forge/.test(id)) return SIGILS.flame;
  if (/ledger|manual|journal|record|codex/.test(id)) return SIGILS.book;
  if (/scale|purse|voucher|sack|bag|satchel/.test(id)) return SIGILS.scales;
  if (/crest|heart|seal|tent|oath/.test(id)) return SIGILS.shield;
  return SIGILS.gem;
}

function ornament(paths: string, className: string): HTMLElement {
  const mark = el('span', className);
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return mark;
}

function popover(trigger: HTMLButtonElement, panel: HTMLElement): void {
  panel.popover = 'auto';
  trigger.popoverTargetElement = panel;
}

/** 지도와 비전투 노드가 공유하는 작은 원정 프레임. 상세 기록은 접어 둔다. */
export function expeditionHeader(hud: RunHud, actions: ExpeditionActions): HTMLElement {
  const root = el('header', 'run-screen-header expedition-header');
  const bar = tagged(el('div', 'expedition-bar'), 'hud');
  const name = commanderSkinName(appSkin.current, hud.commanderId, hud.commanderName);
  const commander = el('div', 'expedition-commander');
  commander.title = name;
  const seal = el('div', 'expedition-portrait');
  seal.append(el('span', 'expedition-monogram', [...name][0] ?? '◇'));
  const portrait = commanderArt(hud.commanderId, 'portrait', 'expedition-portrait-art');
  if (portrait) seal.append(portrait);
  const copy = el('div', 'expedition-commander-copy');
  copy.append(el('span', 'expedition-commander-name', name));
  const hp = tagged(el('div', `expedition-hp${hud.hp <= hud.maxHp * .3 ? ' low' : ''}`), 'hud-hp');
  hp.setAttribute('aria-label', `지휘관 HP ${hud.hp} / ${hud.maxHp}`);
  hp.append(el('span', 'expedition-hp-value', `${hud.hp} / ${hud.maxHp}`));
  const track = el('span', 'expedition-hp-track');
  const fill = el('span', 'expedition-hp-fill');
  fill.style.width = `${hud.maxHp > 0 ? Math.max(0, Math.min(100, hud.hp / hud.maxHp * 100)) : 0}%`;
  track.append(fill);
  hp.append(track);
  copy.append(hp);
  commander.append(seal, copy);

  const chapter = tagged(el('div', 'expedition-chapter'), 'act-title');
  const chapterCopy = el('div', 'expedition-chapter-copy');
  const act = actPresentation(appSkin.current, hud.act);
  const breadcrumb = el('div', 'expedition-chapter-meta');
  breadcrumb.append(el('span', '', `액트 ${hud.act}`), el('span', 'expedition-chapter-dot', '·'), el('span', '', `${hud.floor} / ${hud.floorCount}층`));
  if (hud.threatLevel > 0) {
    const threat = tagged(el('span', 'expedition-threat', `위협 ${hud.threatLevel}`), 'threat-badge');
    threat.title = hud.threatName ?? '';
    breadcrumb.append(threat);
  }
  chapterCopy.append(breadcrumb, tagged(el('strong', 'expedition-chapter-title', act?.name ?? hud.actName), 'hud-act'));
  chapter.append(ornament(CREST, 'expedition-crest'), chapterCopy);

  const resources = el('div', 'expedition-resources');
  const gold = tagged(el('span', 'expedition-gold'), 'hud-gold');
  gold.setAttribute('aria-label', `골드 ${hud.gold}G`);
  gold.title = '보유 골드';
  gold.innerHTML = iconSvg('coin', 19);
  gold.append(el('strong', '', String(hud.gold)));
  let deck: HTMLElement;
  if (actions.onDeck) {
    deck = tagged(iconButton('deck', `덱 보기 · ${hud.deckCount}장`, actions.onDeck, 'expedition-deck'), 'open-deck');
  } else {
    deck = el('span', 'expedition-deck');
    deck.innerHTML = iconSvg('deck', 18);
  }
  deck.setAttribute('aria-label', actions.onDeck ? `덱 보기 · ${hud.deckCount}장` : `덱 ${hud.deckCount}장`);
  deck.append(el('strong', '', String(hud.deckCount)));
  const tools = el('div', 'expedition-tools');
  const info = tagged(iconButton('info', '원정 기록', () => {}, 'expedition-tool'), 'run-info');
  const home = tagged(iconButton('home', '시작 화면으로', actions.onHome, 'expedition-tool'), 'to-start');
  tools.append(info, home);
  resources.append(gold, deck, tools);
  bar.append(commander, chapter, resources);

  const record = tagged(el('section', 'expedition-popover expedition-record'), 'run-info-panel');
  record.setAttribute('aria-label', '원정 기록');
  record.append(el('span', 'expedition-record-eyebrow', '원정 기록'), el('h3', '', act?.name ?? hud.actName));
  if (actions.region || act?.region) record.append(el('p', '', act?.region ?? actions.region));
  if (actions.description || act?.text) record.append(el('p', '', act?.text ?? actions.description));
  const facts = el('dl', 'expedition-record-facts');
  for (const [label, value] of [
    ['진행', `액트 ${hud.act} / ${hud.actCount} · ${hud.floor} / ${hud.floorCount}층`],
    ['현재 위치', hud.location],
    ['시드', String(hud.seed)],
    ...(hud.threatLevel > 0 ? [['위협', `${hud.threatLevel} · ${hud.threatName ?? ''}`]] : []),
  ]) facts.append(el('dt', '', label), el('dd', '', value));
  record.append(facts);
  if (hud.test) record.append(tagged(el('p', 'expedition-test-note', hud.test), 'test-badge'));
  popover(info, record);

  const relics = el('div', 'expedition-relics');
  relics.setAttribute('aria-label', `보유 유물 ${hud.relics.length}개`);
  const medals = el('div', 'expedition-medals');
  for (const relic of hud.relics.slice(0, 6)) {
    const medal = relicChip(relic);
    medal.classList.add('expedition-medal');
    medal.querySelector('.run-relic-icon')?.append(ornament(sigil(relic.id), 'expedition-sigil'));
    medals.append(medal);
  }
  if (hud.relics.length === 0) medals.append(el('span', 'expedition-relic-empty', '유물 없음'));
  relics.append(medals);
  root.append(bar, relics, record);
  if (hud.relics.length > 6) {
    const more = el('button', 'expedition-relic-more', `+${hud.relics.length - 6}`);
    more.type = 'button';
    more.setAttribute('aria-label', `보유 유물 ${hud.relics.length}개 모두 보기`);
    const collection = el('section', 'expedition-popover expedition-collection');
    collection.setAttribute('aria-label', '보유 유물');
    collection.append(el('h3', '', `보유 유물 · ${hud.relics.length}`), relicRow(hud.relics));
    popover(more, collection);
    medals.append(more);
    root.append(collection);
  }
  return root;
}
