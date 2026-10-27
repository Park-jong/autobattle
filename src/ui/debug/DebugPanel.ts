import type { Side, StarLevel } from '../../core/combat';
import type { CommanderCatalog } from '../../core/data/commanderLoader';
import type { TraitCatalog } from '../../core/data/traitLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import { PLAYBACK_SPEEDS, type Brush, type DebugController, type SessionSnapshot } from './contracts';
import './debugPanel.css';
import { AGENTS, portraitStyle, unitSkinIndex, unitSkinName, unitSkinRole } from '../skin';

const SIDE_NAMES = ['아군', '적'] as const;
const STARS: readonly StarLevel[] = [1, 2, 3];

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** 표의 한 줄 */
function tableRow(cells: readonly string[], className: string): HTMLElement {
  const r = el('div', className);
  for (const c of cells) r.append(el('span', undefined, c));
  return r;
}

/**
 * 디버그 패널 (HTML/CSS 레이어). Phaser 씬을 모르고 DebugController 인터페이스로만 세션과 통신한다.
 * DOM은 한 번만 만들고, 상태가 바뀌면 필요한 부분만 갱신한다 (입력 포커스 유지).
 */
export class DebugPanel {
  private readonly errorBox = el('div', 'dbg-error');
  private readonly unitButtons = new Map<string, HTMLButtonElement>();
  private readonly starButtons = new Map<StarLevel, HTMLButtonElement>();
  private readonly eraseButton: HTMLButtonElement;
  private readonly seedInput = el('input');
  private readonly startButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly speedButtons = new Map<number, HTMLButtonElement>();
  private readonly traitBoxes: [HTMLElement, HTMLElement] = [el('div', 'dbg-traits'), el('div', 'dbg-traits')];
  private readonly resultBox = el('div', 'dbg-result');
  private readonly fileButtons: HTMLButtonElement[] = [];
  private readonly countLabels: [HTMLElement, HTMLElement] = [el('span'), el('span')];
  private readonly commanderSelect = el('select', 'dbg-input');
  private readonly passiveBox = el('div', 'dbg-hint');
  private readonly startFormationButton: HTMLButtonElement;
  private readonly pauseOnHoldBox = el('input');
  private readonly scaleLabel = el('div', 'dbg-hint');
  private readonly noCardsBox = el('input');
  private readonly seriesStartButton: HTMLButtonElement;
  private readonly seriesNextButton: HTMLButtonElement;
  private readonly seriesEndButton: HTMLButtonElement;
  private readonly seriesStatus = el('div', 'dbg-winner');
  private readonly seriesTable = el('div', 'dbg-series');

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: DebugController,
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    private readonly commanders: CommanderCatalog,
  ) {
    this.eraseButton = button('지우기 모드', () => controller.setBrush({ kind: 'erase' }), 'dbg-btn');
    this.startButton = button('전투 시작', () => this.onStart(), 'dbg-btn dbg-primary');
    this.pauseButton = button('일시정지', () => controller.togglePause(), 'dbg-btn');
    this.resetButton = button('리셋', () => controller.reset(), 'dbg-btn');
    this.startFormationButton = button('시작 편성 불러오기', () => controller.loadCommanderStart(), 'dbg-btn');
    this.seriesStartButton = button('5연전 시작', () => controller.startSeries(!this.noCardsBox.checked), 'dbg-btn dbg-primary');
    this.seriesNextButton = button('다음 전투', () => controller.nextSeriesBattle(), 'dbg-btn dbg-primary');
    this.seriesEndButton = button('5연전 중단', () => controller.endSeries(), 'dbg-btn');
    this.build();
    controller.subscribe(() => this.render());
    this.render();
  }

  // ---- 구성 ----

  private build(): void {
    this.root.classList.add('dbg-panel');
    this.root.replaceChildren(
      el('p', 'panel-eyebrow', 'SQUAD MANAGEMENT'),
      el('h1', 'dbg-title', '당신의 작전, 당신의 팀.'),
      this.errorBox,
      this.buildBattleControls(),
      this.buildCommander(),
      this.buildPalette(),
      this.buildResult(),
      this.fold('팀 시너지', this.buildTraits()),
      this.fold('연속 작전 · 5연전', this.buildSeries()),
      this.fold('편성 저장 / 불러오기', this.buildFiles()),
    );
  }

  private section(title: string): HTMLElement {
    const s = el('section', 'dbg-section');
    s.append(el('h2', undefined, title));
    return s;
  }

  private fold(title: string, content: HTMLElement): HTMLElement {
    const details = el('details', 'dbg-section');
    details.append(el('summary', undefined, title), content);
    return details;
  }

  private buildCommander(): HTMLElement {
    const s = this.section('01 / FIELD COMMANDER');
    const dossier = el('div', 'commander-dossier');
    const copy = el('div', 'dossier-copy');
    copy.append(el('small', undefined, 'AFTER HOURS / COMMAND'), el('strong', undefined, 'SERA'), el('span', undefined, '세라 · 철벽 전술 지휘관'), el('b', undefined, '내 신호만 기다려.'));
    dossier.append(copy);
    const row = el('div', 'dbg-row');
    this.commanderSelect.setAttribute('aria-label', '지휘관');
    const none = el('option', undefined, '없음 (카드 시스템 끔)');
    none.value = '';
    this.commanderSelect.append(none);
    for (const c of this.commanders.commanders) {
      const option = el('option', undefined, c.id === 'cmd_harten' ? '세라 · 철벽 전술' : c.name);
      option.value = c.id;
      this.commanderSelect.append(option);
    }
    this.commanderSelect.addEventListener('change', () => this.controller.setCommander(this.commanderSelect.value || null));
    row.append(el('span', 'dbg-label', '지휘관'), this.commanderSelect);

    const startRow = el('div', 'dbg-row');
    startRow.append(this.startFormationButton);

    const holdRow = el('label', 'dbg-row');
    this.pauseOnHoldBox.type = 'checkbox';
    this.pauseOnHoldBox.addEventListener('change', () => this.controller.setPauseOnCardHold(this.pauseOnHoldBox.checked));
    holdRow.append(this.pauseOnHoldBox, el('span', undefined, '카드 선택 중 일시정지 (끄면 25% 슬로모션)'));
    s.append(dossier, row, this.passiveBox, startRow, holdRow, this.scaleLabel);
    return s;
  }

  private buildPalette(): HTMLElement {
    const s = this.section('02 / AGENT LINEUP');
    const list = el('div', 'dbg-units');
    for (const def of this.units.units) {
      const b = el('button', 'dbg-unit');
      b.type = 'button';
      b.title = `${unitSkinName(def.id)} · ${def.name}\n${def.skill.text}`;
      portraitStyle(b, unitSkinIndex(def.id));
      b.append(
        el('strong', undefined, unitSkinName(def.id)),
        el('span', 'dbg-tier', `★ ${def.tier} · ${unitSkinRole(def.id)}`),
        el('span', 'dbg-unit-traits', AGENTS[unitSkinIndex(def.id)]!.role),
      );
      b.addEventListener('click', () => this.selectUnit(def.id));
      this.unitButtons.set(def.id, b);
      list.append(b);
    }
    s.append(list);

    const stars = el('div', 'dbg-row');
    stars.append(el('span', 'dbg-label', '성급'));
    for (const star of STARS) {
      const b = button(`${star}성`, () => this.selectStar(star), 'dbg-btn');
      this.starButtons.set(star, b);
      stars.append(b);
    }
    stars.append(this.eraseButton);
    s.append(stars, el('p', 'dbg-hint', '보드 좌클릭: 배치 (아군·적 영역 모두) / 우클릭: 제거'));
    return s;
  }

  private buildBattleControls(): HTMLElement {
    const s = this.section('OPERATION CONTROL');
    const seedRow = el('div', 'dbg-row');
    this.seedInput.type = 'number';
    this.seedInput.value = '1';
    this.seedInput.step = '1';
    this.seedInput.className = 'dbg-input';
    this.seedInput.setAttribute('aria-label', '시드');
    this.seedInput.addEventListener('input', () => {
      const text = this.seedInput.value.trim();
      const seed = Number(text);
      if (text !== '' && Number.isInteger(seed)) this.controller.setSeed(seed);
    });
    seedRow.append(el('span', 'dbg-label', '시드'), this.seedInput);

    const actions = el('div', 'dbg-row');
    actions.append(this.startButton, this.pauseButton, this.resetButton);

    const speed = el('div', 'dbg-row');
    speed.append(el('span', 'dbg-label', '배속'));
    for (const value of PLAYBACK_SPEEDS) {
      const b = button(`×${value}`, () => this.controller.setSpeed(value), 'dbg-btn');
      this.speedButtons.set(value, b);
      speed.append(b);
    }
    s.append(seedRow, actions, speed);
    return s;
  }

  private buildSeries(): HTMLElement {
    const s = this.section('5연전 (플레이테스트)');
    const options = el('label', 'dbg-row');
    this.noCardsBox.type = 'checkbox';
    options.append(this.noCardsBox, el('span', undefined, '카드 사용 금지 (지휘관 패시브는 유지)'));
    const actions = el('div', 'dbg-row');
    actions.append(this.seriesStartButton, this.seriesNextButton, this.seriesEndButton);
    s.append(
      el('p', 'dbg-hint', '현재 아군 편성으로 고정된 적 5판을 차례로 상대합니다. 덱은 판 사이에 이어지고 매 판 준비 단계에서 5장을 뽑습니다.'),
      options,
      actions,
      this.seriesStatus,
      this.seriesTable,
    );
    return s;
  }

  private buildTraits(): HTMLElement {
    const s = this.section('활성 특성');
    const cols = el('div', 'dbg-cols');
    for (const side of [0, 1] as const) {
      const col = el('div');
      const head = el('h3', undefined, SIDE_NAMES[side]);
      head.append(' ', this.countLabels[side]);
      col.append(head, this.traitBoxes[side]);
      cols.append(col);
    }
    s.append(cols);
    return s;
  }

  private buildResult(): HTMLElement {
    const s = this.section('결과');
    s.append(this.resultBox);
    return s;
  }

  private buildFiles(): HTMLElement {
    const s = this.section('편성 파일 (JSON)');
    for (const side of [0, 1] as const) {
      const row = el('div', 'dbg-row');
      row.append(el('span', 'dbg-label', SIDE_NAMES[side]));
      const input = el('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.hidden = true;
      input.addEventListener('change', () => void this.onFile(side, input));
      const load = button('불러오기', () => input.click(), 'dbg-btn');
      const clear = button('비우기', () => this.controller.clearSide(side), 'dbg-btn');
      this.fileButtons.push(load, clear);
      row.append(button('저장', () => this.onSave(side), 'dbg-btn'), load, clear, input);
      s.append(row);
    }
    return s;
  }

  // ---- 동작 ----

  private selectUnit(unitId: string): void {
    const current = this.currentBrush();
    const star = current.kind === 'unit' ? current.star : 1;
    this.controller.setBrush({ kind: 'unit', unitId, star });
  }

  private selectStar(star: StarLevel): void {
    const current = this.currentBrush();
    if (current.kind === 'unit') {
      this.controller.setBrush({ ...current, star });
      return;
    }
    const first = this.units.units[0];
    if (first) this.controller.setBrush({ kind: 'unit', unitId: first.id, star });
  }

  private currentBrush(): Brush {
    return this.controller.snapshot().brush;
  }

  private onStart(): void {
    const text = this.seedInput.value.trim();
    const seed = Number(text);
    if (text === '' || !Number.isInteger(seed)) {
      this.controller.reportError('시드는 정수여야 합니다.');
      return;
    }
    this.controller.start(seed);
  }

  private onSave(side: Side): void {
    const blob = new Blob([this.controller.exportFormation(side)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = side === 0 ? 'formation-ally.json' : 'formation-enemy.json';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private async onFile(side: Side, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.controller.importFormation(side, await file.text());
    } catch (e) {
      this.controller.reportError(`${SIDE_NAMES[side]} 편성 불러오기 실패: ${(e as Error).message}`);
    }
  }

  // ---- 갱신 ----

  private render(): void {
    const snap = this.controller.snapshot();
    const editing = snap.phase === 'edit';
    const editable = snap.editable;

    this.errorBox.hidden = snap.error === null;
    this.errorBox.textContent = snap.error ?? '';

    for (const [id, b] of this.unitButtons) {
      b.classList.toggle('selected', snap.brush.kind === 'unit' && snap.brush.unitId === id);
      b.disabled = !editable;
    }
    for (const [star, b] of this.starButtons) {
      b.classList.toggle('selected', snap.brush.kind === 'unit' && snap.brush.star === star);
      b.disabled = !editable;
    }
    this.eraseButton.classList.toggle('selected', snap.brush.kind === 'erase');
    this.eraseButton.disabled = !editable;

    this.seedInput.disabled = !editable;
    this.startButton.disabled = !editing;
    this.startButton.textContent = snap.series
      ? `전투 시작 (${Math.min(snap.series.index + 1, snap.series.total)}/${snap.series.total})`
      : '전투 시작';
    this.pauseButton.disabled = snap.phase !== 'playing' && snap.phase !== 'paused';
    this.pauseButton.textContent = snap.phase === 'paused' ? '재개' : '일시정지';
    this.resetButton.disabled = editing || (snap.series !== null && snap.phase === 'finished');
    for (const [value, b] of this.speedButtons) b.classList.toggle('selected', snap.speed === value);
    for (const b of this.fileButtons) b.disabled = !editable;
    this.renderCommander(snap);
    this.renderSeries(snap);

    for (const side of [0, 1] as const) {
      this.countLabels[side].textContent = `(${snap.formations[side].length}기)`;
      this.renderTraits(side, snap);
    }
    this.renderResult(snap);
  }

  private renderCommander(snap: SessionSnapshot): void {
    const commander = snap.commanderId ? this.commanders.get(snap.commanderId) : undefined;
    this.commanderSelect.value = snap.commanderId ?? '';
    this.commanderSelect.disabled = !snap.editable;
    this.passiveBox.textContent = commander
      ? `패시브 [${commander.passive.name}] ${commander.passive.text}`
      : '지휘관이 없으면 카드 UI가 숨겨지고 M1 디버그 전투와 같습니다.';
    this.startFormationButton.disabled = !snap.editable || !commander;
    this.pauseOnHoldBox.checked = snap.pauseOnCardHold;
    const scale = snap.timeScale;
    this.scaleLabel.textContent =
      snap.phase === 'edit' ? '' : scale === 0 ? '시간 배율 ×0 (정지)' : `시간 배율 ×${Number(scale.toFixed(2))}`;
  }

  private renderSeries(snap: SessionSnapshot): void {
    const series = snap.series;
    const hasCommander = snap.commanderId !== null;
    this.noCardsBox.disabled = series !== null || !hasCommander;
    this.seriesStartButton.disabled = series !== null || snap.phase !== 'edit';
    this.seriesNextButton.hidden = series === null;
    this.seriesEndButton.hidden = series === null;
    this.seriesNextButton.disabled = !series || series.done || snap.phase !== 'finished';
    this.seriesEndButton.textContent = series?.done ? '5연전 종료' : '5연전 중단';
    if (!series) {
      this.seriesStatus.textContent = '';
      this.seriesTable.replaceChildren();
      return;
    }
    const mode = hasCommander ? (series.cardsEnabled ? '카드 사용' : '카드 사용 금지') : '카드 없음';
    this.seriesStatus.textContent = series.done
      ? `5연전 종료 (${mode})`
      : `${series.index + 1}/${series.total}전 ${snap.phase === 'finished' ? '다음' : '준비'}: ${series.stageName ?? ''} (${mode})`;

    const rows: HTMLElement[] = [tableRow(['전', '결과', '시간', '카드'], 'dbg-series-head')];
    for (const r of series.records) {
      const outcome = r.winner === 'draw' ? '무' : r.winner === 0 ? '승' : '패';
      const reason = r.reason === 'timeout' ? '(시간초과)' : '';
      rows.push(
        tableRow(
          [String(r.index + 1), `${outcome}${reason}`, `${r.endTime.toFixed(1)}초`, `${r.cardsUsed}장`],
          `dbg-series-row ${r.winner === 0 ? 'win' : 'lose'}`,
        ),
      );
    }
    if (series.summary.played > 0) {
      const t = series.summary;
      rows.push(
        el('div', 'dbg-hint', `요약: ${t.wins}승 ${t.losses}패 ${t.draws}무, 총 ${t.totalTime.toFixed(1)}초, 카드 ${t.totalCards}회 사용`),
      );
    }
    this.seriesTable.replaceChildren(...rows);
  }

  private renderTraits(side: Side, snap: SessionSnapshot): void {
    const box = this.traitBoxes[side];
    const active = [...snap.traits[side]].sort((a, b) => b.tier - a.tier || b.count - a.count);
    if (active.length === 0) {
      box.replaceChildren(el('p', 'dbg-hint', '없음'));
      return;
    }
    box.replaceChildren(
      ...active.map((t) => {
        const def = this.traits.get(t.traitId);
        const next = def?.thresholds.find((th) => t.count < th);
        const stage = t.tier > 0 ? `${t.tier}단계` : '미달';
        const progress = next === undefined ? `${t.count}종` : `${t.count}/${next}종`;
        const row = el('div', t.tier > 0 ? 'dbg-trait active' : 'dbg-trait', `${def?.name ?? t.traitId} ${progress} · ${stage}`);
        if (def) row.title = def.text;
        return row;
      }),
    );
  }

  private renderResult(snap: SessionSnapshot): void {
    const result = snap.result;
    if (!result) {
      this.resultBox.replaceChildren(
        el('p', 'dbg-hint', snap.phase === 'edit' ? '전투를 시작하면 결과가 표시됩니다.' : '전투 진행 중...'),
      );
      return;
    }
    const winner = result.winner === 'draw' ? '무승부' : `${SIDE_NAMES[result.winner]} 승리`;
    const reason = result.reason === 'annihilation' ? '전멸' : '시간 초과';
    const head = el('p', 'dbg-winner', `${winner} (${reason}, ${result.endTime.toFixed(1)}초)`);
    const list = el('ul', 'dbg-survivors');
    if (result.survivors.length === 0) list.append(el('li', undefined, '생존 유닛 없음'));
    for (const s of result.survivors) {
      const name = this.units.get(s.unitId)?.name ?? s.unitId;
      list.append(
        el('li', undefined, `[${SIDE_NAMES[s.side]}] ${name} ${'★'.repeat(s.star)} HP ${s.hp}/${s.maxHp} (${s.cell.col},${s.cell.row})`),
      );
    }
    this.resultBox.replaceChildren(head, el('p', 'dbg-label', '생존 유닛'), list);
  }
}
