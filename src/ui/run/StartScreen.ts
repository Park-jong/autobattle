import { button, el, tagged } from './dom';
import type { RunCommands, RunSnapshot, TestCommands } from './contracts';
import { MetaPanel } from './MetaPanel';
import { SkinPicker } from '../skin/SkinPicker';
import { appSkin } from '../skin/SkinStore';
import { commanderProfile, commanderSkillName, commanderSkinName, isIllustratedSkin, skinPresentation, unitSkinName } from '../skin/skins';
import { commanderArt } from '../skin/commanderArt';
import { RosterGallery } from '../skin/RosterGallery';
import { TestStartPanel } from './TestStartPanel';
import { clampThreatLevel } from './threatViews';

/** 마지막으로 고른 위협 레벨을 기억하는 localStorage 키 (보는 사람 편의용. 실패해도 게임에는 영향 없음) */
const THREAT_PREF_KEY = 'autochess-threat-level';

function readThreatPref(): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(THREAT_PREF_KEY) ?? 0);
    return Number.isInteger(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeThreatPref(level: number): void {
  try {
    globalThis.localStorage?.setItem(THREAT_PREF_KEY, String(level));
  } catch {
    // 저장소를 쓸 수 없어도 선택 자체는 유지된다
  }
}

/** 시작 화면: 새 런(시드 표시·입력) / 이어하기 / 경제 플레이 / 편성 디버그 */
export class StartScreen {
  readonly root = el('div', 'run-start');
  private readonly seedInput = el('input', 'dbg-input run-seed-input');
  private seedDirty = false;
  private shownSuggestion: number | null = null;
  /** 진행 중인 저장본이 있을 때 "새 런"을 눌러 덮어쓰기 확인을 기다리는 중인가 */
  private confirming = false;
  private lastSnapshot: RunSnapshot | null = null;
  /** 선택한 지휘관 id (아직 고르지 않았으면 기본 지휘관) */
  private selectedCommander: string | null = null;
  /** 선택한 위협 레벨 (마지막으로 고른 값을 기억해 두었다가 해금된 범위로 맞춘다) */
  private selectedThreat = readThreatPref();
  /** 테스트 시작 패널 (입력 상태를 유지하려고 한 번만 만들어 다시 그릴 때마다 같은 노드를 붙인다) */
  private readonly testPanel: TestStartPanel;
  /** 전공(메타 진행) 패널 */
  private readonly metaPanel: MetaPanel;
  /** 화면 스킨 선택 (기본 / 원화). 런 규칙과 무관한 표시 설정 */
  private readonly skinPicker = new SkinPicker(undefined, 'start-skin-select');
  private readonly gallery = new RosterGallery();

  constructor(private readonly commands: RunCommands, testCommands: TestCommands) {
    this.testPanel = new TestStartPanel(testCommands);
    this.metaPanel = new MetaPanel(commands);
    this.seedInput.type = 'text';
    this.seedInput.inputMode = 'numeric';
    this.seedInput.setAttribute('aria-label', '시드');
    this.seedInput.addEventListener('input', () => { this.seedDirty = true; });
    tagged(this.seedInput, 'seed-input');
    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.startNew();
    });
  }

  render(snap: RunSnapshot): void {
    const start = snap.start;
    if (!start) return;
    this.lastSnapshot = snap;
    if (start.save.kind !== 'ok') this.confirming = false;
    if (!this.seedDirty && this.shownSuggestion !== start.suggestedSeed) {
      this.seedInput.value = String(start.suggestedSeed);
      this.shownSuggestion = start.suggestedSeed;
    }

    const card = el('div', 'run-start-card');
    const academy = isIllustratedSkin(appSkin.current);
    const presentation = skinPresentation(appSkin.current);
    const brand = el('header', 'academy-brand');
    brand.append(el('span', 'academy-eyebrow', presentation.eyebrow));
    brand.append(el('h1', 'run-title', presentation.title));
    brand.append(el('p', 'run-subtitle', presentation.subtitle));
    const tags = el('div', 'academy-brand-tags');
    tags.append(el('span', '', '오토배틀 × 덱빌딩'), el('span', '', '3액트 로그라이크'));
    if (academy) tags.append(el('span', 'academy-adult-label', appSkin.current === 'modern' ? '성인향 현대전 · 전원 성인 여성' : '성인향 판타지 · 전원 성인 설정'));
    brand.append(tags);
    if (appSkin.current === 'modern') brand.append(tagged(button('대원 도감 · 30', () => this.gallery.open(), 'dbg-btn modern-gallery-open'), 'open-roster-gallery'));
    card.append(brand);

    card.append(tagged(el('p', 'run-meta-points-line', start.meta.status === 'ok' ? `보유 전공 ${start.meta.points}` : '전공 기록 손상'), 'meta-points'));
    card.append(this.commanderPicker(start));
    const launch = el('div', 'run-launch');
    const setup = el('div', 'run-start-config');
    const actions = el('div', 'run-start-actions');
    launch.append(setup, actions);
    card.append(launch);
    setup.append(this.threatPicker(start));
    this.skinPicker.root.classList.add('skin-start-row');
    setup.append(this.skinPicker.root);
    const seedRow = el('label', 'run-seed-row');
    seedRow.append(el('span', '', '시드'), this.seedInput);
    const newRun = tagged(button('새 런', () => this.startNew(), 'dbg-btn dbg-primary run-big-button'), 'new-run');
    const blocked = this.newRunBlockedReason(start);
    newRun.disabled = blocked !== null;
    setup.append(seedRow, el('p', 'dbg-hint', '같은 시드로 같은 여정을 다시 도전할 수 있습니다.'));
    if (this.confirming && start.save.kind === 'ok') {
      const s = start.save.summary;
      const box = tagged(el('div', 'run-confirm'), 'confirm-new-run');
      box.append(
        el('p', '', `진행 중인 런이 있습니다 (액트 ${s.act} ${s.floor}층 · HP ${s.hp}/${s.maxHp} · 시드 ${s.seed}). 새로 시작하면 저장본이 지워집니다.`),
        tagged(button('진행 중인 런을 지우고 새로 시작', () => this.submit(), 'dbg-btn dbg-primary run-big-button'), 'confirm-new-run-yes'),
        tagged(button('취소', () => this.cancelConfirm(), 'dbg-btn run-big-button'), 'confirm-new-run-no'),
      );
      actions.append(box);
    } else {
      actions.append(newRun);
      if (blocked) actions.append(tagged(el('p', 'dbg-hint run-new-blocked', blocked), 'new-run-blocked'));
    }

    const save = start.save;
    const resume = tagged(button('이어하기', () => this.commands.continueRun(), 'dbg-btn run-big-button'), 'continue-run');
    resume.disabled = save.kind !== 'ok';
    actions.append(resume);
    if (save.kind === 'ok') {
      const s = save.summary;
      actions.append(el('p', 'dbg-hint', `${s.test ? '[테스트 런] ' : ''}${s.commanderName} · 액트 ${s.act} ${s.floor}층 · HP ${s.hp}/${s.maxHp} · ${s.gold}G`));
    } else if (save.kind === 'none') {
      actions.append(el('p', 'dbg-hint', '저장된 여정이 없습니다.'));
    } else {
      const box = tagged(el('div', 'dbg-error run-save-error'), 'save-error');
      box.append(el('p', '', save.message));
      box.append(tagged(button('저장 삭제', () => this.commands.deleteSave()), 'delete-save'));
      actions.append(box);
    }

    const legacy = el('div', 'run-start-legacy');
    legacy.append(
      el('h2', '', '테스트 모드'),
      tagged(button('경제 플레이 (5연전)', () => this.commands.openManagement()), 'open-management'),
      tagged(button('편성 디버그', () => this.commands.openDebug()), 'open-debug'),
    );
    const tools = el('details', 'academy-test-modes');
    tools.append(el('summary', '', '연습과 플레이 테스트'), legacy);
    card.append(tools);
    this.metaPanel.render(snap);
    card.append(this.metaPanel.root);
    this.testPanel.render(start);
    tools.append(this.testPanel.root);
    this.root.replaceChildren(card);
  }

  private commanderId(start: NonNullable<RunSnapshot['start']>): string {
    const known = start.commanders.some((c) => c.id === this.selectedCommander);
    return known && this.selectedCommander ? this.selectedCommander : start.defaultCommanderId;
  }

  /** 지휘관 3명 선택: 이름·HP·패시브·궁극기·시작 유닛·시작 덱 요약 */
  private commanderPicker(start: NonNullable<RunSnapshot['start']>): HTMLElement {
    const selected = this.commanderId(start);
    const box = tagged(el('div', 'run-commanders'), 'commander-picker');
    box.append(el('h2', 'run-commanders-title', '지휘관 선택'));
    const list = el('div', 'run-commander-list');
    for (const c of start.commanders) {
      const lock = start.meta.commanders[c.id];
      const locked = lock !== undefined && lock.state !== 'unlocked';
      const slot = el('div', 'run-commander-slot');
      const root = tagged(el('button', `run-commander${c.id === selected ? ' selected' : ''}${locked ? ' locked' : ''}`), `commander-${c.id}`);
      root.type = 'button';
      root.setAttribute('aria-pressed', String(c.id === selected));
      const profile = commanderProfile(appSkin.current, c.id);
      if (profile) {
        root.style.setProperty('--commander-accent', profile.color);
        const art = commanderArt(c.id, 'illustration', 'academy-commander-art');
        if (art) root.append(art);
        root.append(el('span', 'academy-commander-title', profile.title));
        root.append(el('span', 'academy-commander-quote', `“${profile.quote}”`));
      }
      root.append(el('span', 'academy-commander-selected', c.id === selected ? '선택한 지휘관' : '지휘관 선택'));
      root.addEventListener('click', () => {
        this.selectedCommander = c.id;
        if (this.lastSnapshot) this.render(this.lastSnapshot);
      });
      root.append(
        el('strong', 'run-commander-name', commanderSkinName(appSkin.current, c.id, c.name)),
        el('span', 'run-commander-hp', `지휘관 HP ${c.maxHp}`),
        el('p', 'run-commander-skill', `패시브 ${commanderSkillName(appSkin.current, c.id, 'passive', c.passiveName)}: ${c.passiveText}`),
        el('p', 'run-commander-skill ultimate', `궁극기 ${commanderSkillName(appSkin.current, c.id, 'ultimate', c.ultimateName)}: ${c.ultimateText}`),
        el('p', 'run-commander-line', `시작 유닛: ${(c.startingUnits?.map((u, i) => `${unitSkinName(appSkin.current, u.unitId, c.units[i]?.replace(/ ×\d+$/, '') ?? u.unitId)} ×${u.count}`) ?? c.units).join(', ')}`),
        el('p', 'run-commander-line', `시작 덱 ${c.deckCount}장: ${c.deck.join(', ')}`),
      );
      if (locked && lock) {
        const box = tagged(el('div', 'run-commander-lock'), `commander-lock-${c.id}`);
        box.append(
          el('strong', '', '잠김'),
          el('p', '', `해금 조건: ${lock.conditionText}`),
          el('p', '', `진행도 ${lock.progressText}`),
        );
        const buy = tagged(button(lock.purchaseLabel, () => this.commands.purchaseUnlock(c.id), 'dbg-btn'), `unlock-commander-${c.id}`);
        buy.disabled = !lock.canPurchase;
        box.append(buy);
        slot.append(root, box);
      } else {
        slot.append(root);
      }
      list.append(slot);
    }
    box.append(list);
    return box;
  }

  private threatLevel(start: NonNullable<RunSnapshot['start']>): number {
    return clampThreatLevel(this.selectedThreat, start.threat);
  }

  /** 위협 레벨 선택: 해금된 레벨만 고를 수 있고, 고른 레벨의 누적 패널티와 전공 보너스를 보여 준다 */
  private threatPicker(start: NonNullable<RunSnapshot['start']>): HTMLElement {
    const picker = start.threat;
    const level = this.threatLevel(start);
    const row = picker.rows[level];
    const box = tagged(el('div', 'run-threat'), 'threat-picker');
    box.append(el('h2', 'run-commanders-title', '위협 레벨'));
    const select = tagged(el('select', 'dbg-input run-threat-select'), 'threat-select');
    select.setAttribute('aria-label', '위협 레벨');
    for (const entry of picker.rows) {
      const option = new Option(entry.selectable ? entry.label : `${entry.label} (잠김 — ${entry.lockText})`, String(entry.level));
      option.disabled = !entry.selectable;
      select.append(option);
    }
    select.value = String(level);
    select.addEventListener('change', () => {
      this.selectedThreat = Number(select.value);
      writeThreatPref(this.selectedThreat);
      if (this.lastSnapshot) this.render(this.lastSnapshot);
    });
    box.append(select);
    if (row) {
      box.append(tagged(el('p', 'dbg-hint', row.bonusText), 'threat-bonus'));
      const list = tagged(el('ul', 'run-threat-penalties'), 'threat-penalties');
      if (row.penalties.length === 0) list.append(el('li', '', '패널티 없음'));
      for (const p of row.penalties) list.append(el('li', '', `레벨 ${p.level} ${p.name}: ${p.text}`));
      box.append(list);
    }
    return box;
  }

  /** 새 런을 시작할 수 없는 사유 (시작할 수 있으면 null): 전공 기록 손상 / 선택한 지휘관이 잠김 */
  private newRunBlockedReason(start: NonNullable<RunSnapshot['start']>): string | null {
    if (start.meta.status === 'broken') return '전공 기록이 손상되어 새 런을 시작할 수 없습니다. 아래 "전공"에서 초기화하세요.';
    const id = this.commanderId(start);
    const lock = start.meta.commanders[id];
    if (lock && lock.state !== 'unlocked') {
      const name = start.commanders.find((c) => c.id === id)?.name ?? id;
      return `${name}은(는) 아직 잠겨 있습니다. 조건(${lock.conditionText})을 달성하거나 전공 ${lock.price}으로 해금하세요.`;
    }
    return null;
  }

  /** 저장본이 있으면 덮어쓰기 확인 단계를 먼저 보여 주고, 없으면 바로 시작한다 */
  private startNew(): void {
    const start = this.lastSnapshot?.start;
    if (start && this.newRunBlockedReason(start) !== null) return;
    if (this.lastSnapshot?.start?.save.kind === 'ok' && !this.confirming) {
      this.confirming = true;
      this.render(this.lastSnapshot);
      return;
    }
    this.submit();
  }

  private cancelConfirm(): void {
    this.confirming = false;
    if (this.lastSnapshot) this.render(this.lastSnapshot);
  }

  private submit(): void {
    this.confirming = false;
    const text = this.seedInput.value.trim();
    const start = this.lastSnapshot?.start;
    const commanderId = start ? this.commanderId(start) : undefined;
    const threatLevel = start ? this.threatLevel(start) : 0;
    if (text === '') return this.commands.newRun(null, commanderId, threatLevel);
    this.commands.newRun(/^-?\d+$/.test(text) ? Number(text) : Number.NaN, commanderId, threatLevel);
  }
}
