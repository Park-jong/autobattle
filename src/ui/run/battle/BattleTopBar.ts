import type { CardListEntry } from '../../cards/cardListView';
import type { CardPanelView, PileView } from '../../cards/cardPanelView';
import { PLAYBACK_SPEEDS, type DebugController, type SessionSnapshot } from '../../debug/contracts';
import { SkinPicker } from '../../skin/SkinPicker';
import { commanderArt } from '../../skin/commanderArt';
import { motionPreferences } from '../../skin/presentation';
import type { RunSnapshot } from '../contracts';
import { button, el, tagged } from '../dom';
import { iconButton } from '../iconButton';
import { CardListModal, type CardListSpec } from '../CardListModal';
import { relicRow } from '../relicElements';

type PileKey = 'draw' | 'discard' | 'exhaust';
/** 열려 있는 카드 목록 창이 보여주는 것: 덱 전체 또는 더미 하나 */
type ListKey = PileKey | 'deck';
const PILES: readonly { key: PileKey; label: string; note?: string }[] = [
  { key: 'draw', label: '뽑을 더미', note: '뽑는 순서는 알 수 없어 종류·비용순으로 표시합니다.' },
  { key: 'discard', label: '버린 더미' },
  { key: 'exhaust', label: '소모 더미', note: '이번 런에서 제거된 카드입니다.' },
];

/**
 * 전투 화면 상단 바: 지금 노드(액트·층·전투 종류·편성 이름), 변이·보스 패턴, 런 흐름 정보(HP·골드·덱 더미·유물·위협),
 * 재생 조작(일시정지·배속·준비로 돌아가기)과 스킨 선택.
 */
export class BattleTopBar {
  private readonly node = el('div', 'bt-top-node');
  private readonly chips = el('div', 'bt-top-chips');
  private readonly controls = el('div', 'bt-top-controls');
  private readonly piles = el('span', 'bt-top-piles');
  private readonly skin = new SkinPicker(undefined, 'battle-skin-select');
  private openList: ListKey | null = null;
  private deck: CardListEntry[] = [];
  private pileSignature = '';
  private deckSignature = '';

  constructor(
    readonly root: HTMLElement,
    private readonly battle: DebugController,
    private readonly cardView: () => CardPanelView,
    private readonly listModal = new CardListModal(),
    private readonly onOpenMap: () => void = () => {},
  ) {
    root.replaceChildren(this.node, this.chips, this.controls);
  }

  render(snap: RunSnapshot, session: SessionSnapshot): void {
    const info = snap.battle;
    const hud = snap.hud;
    if (!info || !hud) return;
    const plan = info.plan;
    this.deck = snap.deck ?? [];
    if (this.openList === 'deck') {
      // 덱이 그대로면 카드 DOM을 다시 만들지 않는다 (배속 변경 등으로 render가 자주 불린다)
      const signature = this.deckSignatureOf();
      if (signature !== this.deckSignature) {
        this.deckSignature = signature;
        this.listModal.update(this.listSpec('deck'));
      }
    }

    const title = el('strong');
    title.append(el('span', `bt-kind ${plan.kind}`, plan.kindLabel), `액트 ${plan.act} · ${plan.floor}층`);
    this.node.replaceChildren(title, el('span', '', `${encounterSkinName(appSkin.current, plan.kind, plan.name)}${info.attempt > 1 ? ` · ${info.attempt}번째 도전` : ''} · ${actPresentation(appSkin.current, hud.act)?.name ?? hud.actName}`));
    this.node.title = plan.text;

    const chips: HTMLElement[] = [];
    if (hud.test) chips.push(tagged(el('span', 'bt-chip test', '테스트 런'), 'test-badge'));
    if (hud.threatLevel > 0) chips.push(this.tipChip('bt-chip threat', `위협 ${hud.threatLevel}`, `위협 레벨 ${hud.threatLevel} — ${hud.threatName ?? ''}`));
    const hpRatio = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0;
    const hp = tagged(el('span', 'bt-chip bt-hp'), 'hud-hp');
    hp.classList.toggle('low', hpRatio <= 0.3);
    const portrait = commanderArt(hud.commanderId, 'portrait', 'academy-hud-portrait');
    if (portrait) hp.append(portrait);
    const bar = el('span', 'bt-hp-bar');
    const fill = el('span', 'bt-hp-fill');
    fill.style.display = 'block';
    fill.style.width = `${Math.round(hpRatio * 100)}%`;
    bar.append(fill);
    hp.append(el('span', 'bt-chip-label', '지휘관'), bar, el('b', '', `${hud.hp}/${hud.maxHp}`));
    hp.title = `${commanderSkinName(appSkin.current, hud.commanderId, hud.commanderName)} — 지휘관 HP`;
    const gold = tagged(el('span', 'bt-chip gold'), 'hud-gold');
    gold.append(el('span', 'bt-chip-label', '골드'), el('b', '', `${session.economy.gold}G`));
    chips.push(hp, gold, this.piles);
    for (const m of plan.mutations) chips.push(this.tipChip('bt-chip mutation', `변이 ${m.name}`, m.text));
    for (const p of plan.bossPatterns) {
      const unit = plan.units.find((u) => u.name === p.unitName);
      const name = unit ? unitSkinName(appSkin.current, unit.unitId, p.unitName) : p.unitName;
      chips.push(this.tipChip('bt-chip pattern', `패턴 ${p.title}`, `${name}\n${p.lines.join('\n')}`));
    }
    const relics = el('span', 'bt-chip bt-relics');
    relics.append(el('span', 'bt-chip-label', '유물'), relicRow(hud.relics, '없음'));
    chips.push(relics);
    this.chips.replaceChildren(...chips);
    this.pileSignature = '';
    this.renderPiles();
    this.renderControls(info.stage, session);
  }

  /** 매 프레임: 더미 장수가 바뀌었을 때만 다시 그린다 */
  tick(): void {
    this.renderPiles();
  }

  private renderPiles(): void {
    const view = this.cardView();
    const open = this.openList !== null && this.openList !== 'deck' ? this.openList : null;
    const signature = JSON.stringify([view.draw.count, view.discard.count, view.exhaust.count, open, open ? view[open].entries : null]);
    if (signature === this.pileSignature) return;
    this.pileSignature = signature;
    if (open) this.listModal.update(this.listSpec(open));
    const nodes = PILES.map(({ key, label, note }) => {
      const pile: PileView = view[key];
      const chip = tagged(el('button', `bt-chip bt-tip${open === key ? ' open' : ''}`), `pile-${key}`);
      chip.type = 'button';
      chip.append(el('span', 'bt-chip-label', label), el('b', '', String(pile.count)));
      chip.addEventListener('click', () => this.openCardList(key));
      return chip;
    });
    const deck = el('span', 'bt-chip-label', '덱');
    this.piles.className = 'bt-top-chips';
    this.piles.style.flex = '0 0 auto';
    this.piles.replaceChildren(deck, ...nodes);
  }

  /** 덱 전체 또는 더미 하나를 카드 목록 창으로 연다 (닫히면 갱신 대상에서 빠진다) */
  private openCardList(key: ListKey): void {
    // 먼저 열어야 앞서 열려 있던 목록의 닫힘 콜백이 새 상태를 지우지 않는다
    this.listModal.open(this.listSpec(key), () => {
      this.openList = null;
      this.pileSignature = '';
      this.deckSignature = '';
    });
    this.openList = key;
    this.deckSignature = key === 'deck' ? this.deckSignatureOf() : '';
    this.pileSignature = '';
    this.renderPiles();
  }

  private deckSignatureOf(): string {
    return JSON.stringify(this.deck.map((e) => [e.cardId, e.upgraded, e.count]));
  }

  private listSpec(key: ListKey): CardListSpec {
    if (key === 'deck') return { title: '덱', entries: this.deck };
    const { label, note } = PILES.find((p) => p.key === key)!;
    return { title: label, entries: this.cardView()[key].entries, note };
  }

  private renderControls(stage: 'prep' | 'playing' | 'result', session: SessionSnapshot): void {
    // 맵 보기·덱 보기: 준비·전투 중·결과 어느 단계에서나 지금 액트의 경로와 덱을 확인한다
    const nodes: HTMLElement[] = [
      tagged(iconButton('map', '맵 보기', () => this.onOpenMap(), 'bt-btn'), 'open-map'),
      tagged(iconButton('deck', '덱 보기', () => this.openCardList('deck'), 'bt-btn'), 'open-deck'),
    ];
    if (stage === 'playing') {
      nodes.push(
        tagged(session.phase === 'paused'
          ? iconButton('play', '재개', () => this.battle.togglePause(), 'bt-btn')
          : iconButton('pause', '일시정지', () => this.battle.togglePause(), 'bt-btn'), 'toggle-pause'),
        tagged(iconButton('undo', '준비로 돌아가기', () => this.battle.reset(), 'bt-btn'), 'back-to-prep'),
      );
    }
    const speeds = el('span', 'bt-speed');
    for (const value of PLAYBACK_SPEEDS) {
      speeds.append(tagged(button(`×${value}`, () => this.battle.setSpeed(value), `bt-btn${session.speed === value ? ' selected' : ''}`), `speed-${value}`));
    }
    speeds.title = '배속';
    nodes.push(speeds, this.skin.root);
    const motion = tagged(button(motionPreferences.reduced ? '연출: 간결' : '연출: 풍부', () => {
      motionPreferences.setReduced(!motionPreferences.reduced);
      this.renderControls(stage, session);
    }, 'bt-btn'), 'motion-toggle');
    motion.setAttribute('aria-pressed', String(motionPreferences.reduced));
    motion.title = '공격 모션과 빛 번짐을 줄입니다. 전투 규칙과 배속은 유지됩니다.';
    nodes.push(motion);
    this.controls.replaceChildren(...nodes);
  }

  private tipChip(className: string, label: string, text: string): HTMLElement {
    const chip = el('span', `${className} bt-tip`);
    chip.tabIndex = 0;
    chip.append(label);
    const pop = el('div', 'bt-pop');
    for (const [i, line] of text.split('\n').entries()) pop.append(i === 0 ? el('strong', '', line) : el('div', '', line));
    chip.append(pop);
    return chip;
  }
}
import { actPresentation, commanderSkinName, encounterSkinName, unitSkinName } from '../../skin/skins';
import { appSkin } from '../../skin/SkinStore';
