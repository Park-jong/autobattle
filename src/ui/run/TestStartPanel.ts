import type { DeckPreset } from '../../core/cards';
import type { TestCardSpec, TestRunSetup, TestStartPosition, TestUnitSpec } from '../../core/run';
import type { StartInfo, TestCommands } from './contracts';
import { button, el, tagged } from './dom';

type StartSetup = Omit<TestRunSetup, 'seed'>;

/** 숫자 입력칸 하나: 비어 있으면 undefined (= 일반 새 런의 기본값) */
function numberField(label: string, testId: string, placeholder: string, min: number, max: number): { row: HTMLElement; input: HTMLInputElement } {
  const input = tagged(el('input', 'dbg-input'), testId);
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.placeholder = placeholder;
  const row = el('label', 'run-test-field');
  row.append(el('span', '', label), input);
  return { row, input };
}

function selectField<T extends string>(
  label: string, testId: string, options: readonly (readonly [T, string])[],
): { row: HTMLElement; select: HTMLSelectElement } {
  const select = tagged(el('select', 'dbg-input'), testId);
  for (const [value, text] of options) select.append(new Option(text, value));
  const row = el('label', 'run-test-field');
  row.append(el('span', '', label), select);
  return { row, select };
}

const readNumber = (input: HTMLInputElement): number | undefined => (input.value.trim() === '' ? undefined : input.valueAsNumber);

/**
 * 시작 화면의 "테스트 시작" 접이식 패널. 지휘관·시드·덱·시작 액트와 위치, 골드·HP·레벨, 유물·카드·유닛을 골라
 * 플레이 테스트 런을 시작한다. 입력 상태를 유지하려고 DOM을 한 번만 만들고(시작 화면이 다시 그려져도 같은 노드를 쓴다)
 * 저장 상태·시드 제안만 갱신한다. 규칙 검증은 core(RunController.createTest)가 하고 오류는 알림으로 나온다.
 */
export class TestStartPanel {
  readonly root = tagged(el('details', 'run-test-start'), 'test-start');
  private built = false;
  private save: StartInfo['save'] = { kind: 'none' };
  private confirming = false;
  private seedDirty = false;
  private shownSuggestion: number | null = null;

  private readonly seed = tagged(el('input', 'dbg-input'), 'test-seed');
  private readonly commander = tagged(el('select', 'dbg-input'), 'test-commander');
  private deck!: HTMLSelectElement;
  private startAct!: HTMLSelectElement;
  private threat!: HTMLSelectElement;
  private startPosition!: HTMLSelectElement;
  private gold!: HTMLInputElement;
  private hp!: HTMLInputElement;
  private maxHp!: HTMLInputElement;
  private level!: HTMLInputElement;
  private readonly relicBoxes = new Map<string, HTMLInputElement>();
  private readonly cardRows = new Map<string, { row: HTMLElement; owner: string; count: HTMLInputElement; upgraded: HTMLInputElement }>();
  private readonly unitRows = new Map<string, { star: HTMLSelectElement; place: HTMLSelectElement }>();
  private readonly confirmHost = el('div');
  private readonly startButton = tagged(button('테스트 런 시작', () => this.requestStart(), 'dbg-btn dbg-primary run-big-button'), 'start-test-run');

  constructor(private readonly commands: TestCommands) {
    this.seed.type = 'text';
    this.seed.inputMode = 'numeric';
    this.seed.setAttribute('aria-label', '테스트 런 시드');
    this.seed.addEventListener('input', () => { this.seedDirty = true; });
    this.seed.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.requestStart(); });
  }

  render(start: StartInfo): void {
    if (!this.built) this.build(start);
    this.save = start.save;
    if (start.save.kind !== 'ok') this.confirming = false;
    if (!this.seedDirty && this.shownSuggestion !== start.suggestedSeed) {
      this.seed.value = String(start.suggestedSeed);
      this.shownSuggestion = start.suggestedSeed;
    }
    this.renderConfirm();
  }

  private build(start: StartInfo): void {
    this.built = true;
    const catalog = start.testCatalog;
    for (const c of start.commanders) this.commander.append(new Option(`${c.name} (HP ${c.maxHp})`, c.id));
    this.commander.value = start.defaultCommanderId;
    this.commander.addEventListener('change', () => this.filterCards());

    const body = el('div', 'run-test-body');
    body.append(
      el('p', 'dbg-hint', '밸런스를 직접 확인하기 위한 테스트 런입니다. 일반 런과 구분되어 화면 위에 "테스트 런" 표시가 붙고, 런 중 "테스트 도구"로 골드·유물·카드·유닛·위치를 바꿀 수 있습니다. 비워 둔 항목은 일반 새 런과 같습니다.'),
    );

    const basics = el('div', 'run-test-grid');
    const commanderRow = el('label', 'run-test-field');
    commanderRow.append(el('span', '', '지휘관'), this.commander);
    const seedRow = el('label', 'run-test-field');
    seedRow.append(el('span', '', '시드'), this.seed);
    const deck = selectField<DeckPreset>('시작 덱', 'test-deck', [['starter', '지휘관 기본 덱'], ['test', '확장 카드 테스트 덱']]);
    const threat = selectField('위협 레벨', 'test-threat', catalog.threat.rows.map((row) => [String(row.level), row.label] as [string, string]));
    const act = selectField('시작 액트', 'test-act', [['1', '액트 1'], ['2', '액트 2'], ['3', '액트 3']]);
    const position = selectField<TestStartPosition>('시작 위치', 'test-position', [['actStart', '액트 처음 (1층 노드 선택)'], ['bossGate', '보스 직전 (12층 야영지를 지남)']]);
    const gold = numberField('골드', 'test-gold', '10', 0, 99999);
    const hp = numberField('지휘관 현재 HP', 'test-hp', '최대 HP', 1, 9999);
    const maxHp = numberField('지휘관 최대 HP', 'test-max-hp', '지휘관 기본값', 1, 9999);
    const level = numberField('레벨 (인구)', 'test-level', '3', 3, 9);
    this.deck = deck.select; this.threat = threat.select; this.startAct = act.select; this.startPosition = position.select;
    this.gold = gold.input; this.hp = hp.input; this.maxHp = maxHp.input; this.level = level.input;
    basics.append(commanderRow, seedRow, deck.row, threat.row, act.row, position.row, gold.row, hp.row, maxHp.row, level.row);
    body.append(basics);

    // 유물 체크리스트
    const relics = tagged(el('div', 'run-test-list'), 'test-relic-list');
    for (const relic of catalog.relics) {
      const box = tagged(el('input'), `test-relic-${relic.id}`);
      box.type = 'checkbox';
      this.relicBoxes.set(relic.id, box);
      const label = el('label', `run-test-item rarity-${relic.rarity}`);
      const text = el('span', 'run-test-item-text');
      text.append(el('strong', '', relic.name), el('span', 'run-test-tag', relic.rarityLabel), el('small', '', relic.text));
      label.append(box, text);
      relics.append(label);
    }
    body.append(el('h3', 'run-test-title', '보유 유물'), relics);

    // 카드: 장수 + 강화
    const cards = tagged(el('div', 'run-test-list'), 'test-card-list');
    for (const card of catalog.cards) {
      const count = tagged(el('input', 'dbg-input run-test-count'), `test-card-count-${card.id}`);
      count.type = 'number'; count.min = '0'; count.max = '20'; count.step = '1'; count.placeholder = '0';
      count.setAttribute('aria-label', `${card.name} 추가 장수`);
      const upgraded = tagged(el('input'), `test-card-upgraded-${card.id}`);
      upgraded.type = 'checkbox';
      upgraded.disabled = !card.hasUpgrade;
      upgraded.setAttribute('aria-label', `${card.name} 강화`);
      const row = el('div', 'run-test-item');
      const text = el('span', 'run-test-item-text');
      text.append(
        el('strong', '', card.name), el('span', 'run-test-tag', `${card.cost}CP · ${card.typeLabel} · ${card.rarityLabel}`),
        ...(card.owner === 'neutral' ? [] : [el('span', 'run-test-tag owner', '고유')]), el('small', '', card.text),
      );
      const controls = el('span', 'run-test-controls');
      const upLabel = el('label', 'run-test-inline');
      upLabel.append(upgraded, document.createTextNode('강화'));
      controls.append(count, upLabel);
      row.append(text, controls);
      cards.append(row);
      this.cardRows.set(card.id, { row, owner: card.owner, count, upgraded });
    }
    body.append(el('h3', 'run-test-title', '덱에 추가할 카드 (장수 · 강화 여부)'), cards);

    // 유닛: 성급 + 위치
    const units = tagged(el('div', 'run-test-list'), 'test-unit-list');
    for (const unit of catalog.units) {
      const star = tagged(el('select', 'dbg-input'), `test-unit-star-${unit.id}`);
      star.append(new Option('지급 안 함', '0'), new Option('1성', '1'), new Option('2성', '2'), new Option('3성', '3'));
      star.setAttribute('aria-label', `${unit.name} 성급`);
      const place = tagged(el('select', 'dbg-input'), `test-unit-place-${unit.id}`);
      place.append(new Option('벤치', 'bench'), new Option('보드', 'board'));
      place.setAttribute('aria-label', `${unit.name} 위치`);
      const row = el('div', 'run-test-item');
      const text = el('span', 'run-test-item-text');
      text.append(el('strong', '', unit.name), el('span', 'run-test-tag', `${unit.tier}등급 · ${unit.traits}`), el('small', '', unit.skillText));
      const controls = el('span', 'run-test-controls');
      controls.append(star, place);
      row.append(text, controls);
      units.append(row);
      this.unitRows.set(unit.id, { star, place });
    }
    body.append(el('h3', 'run-test-title', '지급할 유닛 (성급 · 위치)'), units);

    body.append(this.startButton, this.confirmHost);
    this.root.append(el('summary', 'run-test-summary', '테스트 시작 (플레이 테스트 도구)'), body);
    this.filterCards();
  }

  /** 다른 지휘관의 고유 카드는 숨긴다 (core도 거부한다) */
  private filterCards(): void {
    const commanderId = this.commander.value;
    for (const entry of this.cardRows.values()) entry.row.hidden = entry.owner !== 'neutral' && entry.owner !== commanderId;
  }

  private requestStart(): void {
    if (this.save.kind === 'ok' && !this.confirming) {
      this.confirming = true;
      this.renderConfirm();
      return;
    }
    this.submit();
  }

  private renderConfirm(): void {
    this.startButton.hidden = this.confirming;
    if (!this.confirming || this.save.kind !== 'ok') {
      this.confirmHost.replaceChildren();
      return;
    }
    const s = this.save.summary;
    const box = tagged(el('div', 'run-confirm'), 'confirm-test-run');
    box.append(
      el('p', '', `진행 중인 런이 있습니다 (액트 ${s.act} ${s.floor}층 · HP ${s.hp}/${s.maxHp} · 시드 ${s.seed}). 테스트 런을 시작하면 저장본이 지워집니다.`),
      tagged(button('진행 중인 런을 지우고 테스트 시작', () => this.submit(), 'dbg-btn dbg-primary run-big-button'), 'confirm-test-run-yes'),
      tagged(button('취소', () => { this.confirming = false; this.renderConfirm(); }, 'dbg-btn run-big-button'), 'confirm-test-run-no'),
    );
    this.confirmHost.replaceChildren(box);
  }

  private submit(): void {
    this.confirming = false;
    this.renderConfirm();
    const text = this.seed.value.trim();
    const seed = text === '' ? null : /^-?\d+$/.test(text) ? Number(text) : Number.NaN;
    this.commands.startTestRun(seed, this.collect());
  }

  /** 입력값을 core 설정으로 모은다 (비어 있는 항목은 생략) */
  private collect(): StartSetup {
    const commanderId = this.commander.value;
    const setup: StartSetup = {
      commanderId,
      deckPreset: this.deck.value as DeckPreset,
      startAct: Number(this.startAct.value),
      startPosition: this.startPosition.value as TestStartPosition,
    };
    const threatLevel = Number(this.threat.value);
    if (threatLevel > 0) setup.threatLevel = threatLevel;
    const gold = readNumber(this.gold);
    const hp = readNumber(this.hp);
    const maxHp = readNumber(this.maxHp);
    const level = readNumber(this.level);
    if (gold !== undefined) setup.gold = gold;
    if (hp !== undefined) setup.hp = hp;
    if (maxHp !== undefined) setup.maxHp = maxHp;
    if (level !== undefined) setup.level = level;
    const relics = [...this.relicBoxes].filter(([, box]) => box.checked).map(([id]) => id);
    if (relics.length > 0) setup.relics = relics;
    const cards: TestCardSpec[] = [];
    for (const [cardId, entry] of this.cardRows) {
      if (entry.row.hidden) continue;
      const count = readNumber(entry.count);
      if (count !== undefined && (Number.isNaN(count) || count !== 0)) cards.push({ cardId, count, upgraded: entry.upgraded.checked });
    }
    if (cards.length > 0) setup.cards = cards;
    const units: TestUnitSpec[] = [];
    for (const [unitId, entry] of this.unitRows) {
      const star = Number(entry.star.value);
      if (star > 0) units.push({ unitId, star, place: entry.place.value as 'board' | 'bench' });
    }
    if (units.length > 0) setup.units = units;
    return setup;
  }
}
