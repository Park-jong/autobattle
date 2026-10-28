import { button, el, tagged } from './dom';
import type { RunCommands, RunSnapshot, TestCommands } from './contracts';
import { TestStartPanel } from './TestStartPanel';

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
  /** 테스트 시작 패널 (입력 상태를 유지하려고 한 번만 만들어 다시 그릴 때마다 같은 노드를 붙인다) */
  private readonly testPanel: TestStartPanel;

  constructor(private readonly commands: RunCommands, testCommands: TestCommands) {
    this.testPanel = new TestStartPanel(testCommands);
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
    card.append(el('h1', 'run-title', '전술 지휘관'), el('p', 'run-subtitle', '오토체스 + 덱빌딩 로그라이크 · 1액트 (13층)'));

    card.append(this.commanderPicker(start));
    const seedRow = el('label', 'run-seed-row');
    seedRow.append(el('span', '', '시드'), this.seedInput);
    const newRun = tagged(button('새 런', () => this.startNew(), 'dbg-btn dbg-primary run-big-button'), 'new-run');
    card.append(seedRow, el('p', 'dbg-hint', '같은 시드는 같은 맵·적·보상을 만듭니다. 비워 두면 위의 제안 시드를 씁니다.'));
    if (this.confirming && start.save.kind === 'ok') {
      const s = start.save.summary;
      const box = tagged(el('div', 'run-confirm'), 'confirm-new-run');
      box.append(
        el('p', '', `진행 중인 런이 있습니다 (액트 ${s.act} ${s.floor}층 · HP ${s.hp}/${s.maxHp} · 시드 ${s.seed}). 새로 시작하면 저장본이 지워집니다.`),
        tagged(button('진행 중인 런을 지우고 새로 시작', () => this.submit(), 'dbg-btn dbg-primary run-big-button'), 'confirm-new-run-yes'),
        tagged(button('취소', () => this.cancelConfirm(), 'dbg-btn run-big-button'), 'confirm-new-run-no'),
      );
      card.append(box);
    } else {
      card.append(newRun);
    }

    const save = start.save;
    const resume = tagged(button('이어하기', () => this.commands.continueRun(), 'dbg-btn run-big-button'), 'continue-run');
    resume.disabled = save.kind !== 'ok';
    card.append(resume);
    if (save.kind === 'ok') {
      const s = save.summary;
      card.append(el('p', 'dbg-hint', `${s.test ? '[테스트 런] ' : ''}${s.commanderName} · 시드 ${s.seed} · 액트 ${s.act} ${s.floor}층 · HP ${s.hp}/${s.maxHp} · ${s.gold}G`));
    } else if (save.kind === 'none') {
      card.append(el('p', 'dbg-hint', '저장된 런이 없습니다.'));
    } else {
      const box = tagged(el('div', 'dbg-error run-save-error'), 'save-error');
      box.append(el('p', '', save.message));
      box.append(tagged(button('저장 삭제', () => this.commands.deleteSave()), 'delete-save'));
      card.append(box);
    }

    const legacy = el('div', 'run-start-legacy');
    legacy.append(
      el('h2', '', '테스트 모드'),
      tagged(button('경제 플레이 (5연전)', () => this.commands.openManagement()), 'open-management'),
      tagged(button('편성 디버그', () => this.commands.openDebug()), 'open-debug'),
    );
    card.append(legacy);
    this.testPanel.render(start);
    card.append(this.testPanel.root);
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
      const root = tagged(el('button', `run-commander${c.id === selected ? ' selected' : ''}`), `commander-${c.id}`);
      root.type = 'button';
      root.setAttribute('aria-pressed', String(c.id === selected));
      root.addEventListener('click', () => {
        this.selectedCommander = c.id;
        if (this.lastSnapshot) this.render(this.lastSnapshot);
      });
      root.append(
        el('strong', 'run-commander-name', c.name),
        el('span', 'run-commander-hp', `지휘관 HP ${c.maxHp}`),
        el('p', 'run-commander-skill', `패시브 ${c.passiveName}: ${c.passiveText}`),
        el('p', 'run-commander-skill ultimate', `궁극기 ${c.ultimateName}: ${c.ultimateText}`),
        el('p', 'run-commander-line', `시작 유닛: ${c.units.join(', ')}`),
        el('p', 'run-commander-line', `시작 덱 ${c.deckCount}장: ${c.deck.join(', ')}`),
      );
      if (c.unlock) root.append(el('p', 'run-commander-unlock', `해금 조건: ${c.unlock} (메타 진행 구현 전까지 모두 선택 가능)`));
      list.append(root);
    }
    box.append(list);
    return box;
  }

  /** 저장본이 있으면 덮어쓰기 확인 단계를 먼저 보여 주고, 없으면 바로 시작한다 */
  private startNew(): void {
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
    if (text === '') return this.commands.newRun(null, commanderId);
    this.commands.newRun(/^-?\d+$/.test(text) ? Number(text) : Number.NaN, commanderId);
  }
}
