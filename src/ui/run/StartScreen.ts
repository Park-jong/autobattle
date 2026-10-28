import { button, el, tagged } from './dom';
import type { RunCommands, RunSnapshot } from './contracts';

/** 시작 화면: 새 런(시드 표시·입력) / 이어하기 / 경제 플레이 / 편성 디버그 */
export class StartScreen {
  readonly root = el('div', 'run-start');
  private readonly seedInput = el('input', 'dbg-input run-seed-input');
  private seedDirty = false;
  private shownSuggestion: number | null = null;

  constructor(private readonly commands: RunCommands) {
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
    if (!this.seedDirty && this.shownSuggestion !== start.suggestedSeed) {
      this.seedInput.value = String(start.suggestedSeed);
      this.shownSuggestion = start.suggestedSeed;
    }

    const card = el('div', 'run-start-card');
    card.append(el('h1', 'run-title', '전술 지휘관'), el('p', 'run-subtitle', '오토체스 + 덱빌딩 로그라이크 · 1액트 (13층)'));

    const seedRow = el('label', 'run-seed-row');
    seedRow.append(el('span', '', '시드'), this.seedInput);
    const newRun = tagged(button('새 런', () => this.startNew(), 'dbg-btn dbg-primary run-big-button'), 'new-run');
    card.append(seedRow, el('p', 'dbg-hint', '같은 시드는 같은 맵·적·보상을 만듭니다. 비워 두면 위의 제안 시드를 씁니다.'), newRun);

    const save = start.save;
    const resume = tagged(button('이어하기', () => this.commands.continueRun(), 'dbg-btn run-big-button'), 'continue-run');
    resume.disabled = save.kind !== 'ok';
    card.append(resume);
    if (save.kind === 'ok') {
      const s = save.summary;
      card.append(el('p', 'dbg-hint', `${s.commanderName} · 시드 ${s.seed} · ${s.floor}층 · HP ${s.hp}/${s.maxHp} · ${s.gold}G`));
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
    this.root.replaceChildren(card);
  }

  private startNew(): void {
    const text = this.seedInput.value.trim();
    if (text === '') return this.commands.newRun(null);
    this.commands.newRun(/^-?\d+$/.test(text) ? Number(text) : Number.NaN);
  }
}
