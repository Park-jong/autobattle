import type { RelicView } from './runViews';
import type { RunViewSource, TestCommands } from './contracts';
import { button, el, tagged } from './dom';
import type { TestCardOption, TestToolsView } from './testViews';
import './testTools.css';

/** 사유가 있으면 눌러도 소용없는 버튼: 끄고 마우스를 올리면 사유를 보여 준다 */
function gate(target: HTMLButtonElement | HTMLInputElement | HTMLSelectElement, reason: string | null): void {
  target.disabled = reason !== null;
  target.title = reason ?? '';
}

/** 한 묶음(제목 + 컨트롤 + 사용 불가 사유 줄) */
class Section {
  readonly root = el('section', 'tt-section');
  readonly body = el('div', 'tt-body');
  private readonly reason = el('p', 'tt-reason');

  constructor(title: string) {
    this.reason.hidden = true;
    this.root.append(el('h3', 'tt-title', title), this.body, this.reason);
  }

  setReason(reason: string | null): void {
    this.reason.hidden = reason === null;
    this.reason.textContent = reason ?? '';
  }
}

/**
 * 테스트 런 중에만 보이는 "테스트 도구" 패널 (DOM). 맵·노드·전투 어느 화면에서든 오른쪽 아래 버튼이나 단축키 T(또는 `)로 연다.
 * 값(골드·HP·레벨)·유물·카드·유닛 편집, 보스/다음 액트 이동, 전투 강제 승리·패배를 TestCommands로 내린다.
 * 입력 중인 값이 사라지지 않도록 골격은 한 번만 만들고 갱신할 때는 목록·상태·활성 여부만 바꾼다.
 */
export class TestToolsPanel {
  readonly root = el('div', 'tt-root');
  private readonly toggle = tagged(button('테스트 도구 (T)', () => this.setOpen(!this.open), 'tt-toggle'), 'test-tools-toggle');
  private readonly panel = tagged(el('div', 'tt-panel'), 'test-tools-panel');
  private readonly status = tagged(el('p', 'tt-status'), 'tt-status');
  private open = false;
  private view: TestToolsView | null = null;

  // 값
  private readonly valueSection = new Section('값');
  private readonly goldInput = this.numberInput('tt-gold-input', '골드', '0', '99999');
  private readonly setGoldButton: HTMLButtonElement;
  private readonly addGoldButton: HTMLButtonElement;
  private readonly hpInput = this.numberInput('tt-hp-input', '현재 HP', '1', '9999');
  private readonly maxHpInput = this.numberInput('tt-max-hp-input', '최대 HP', '1', '9999');
  private readonly setHpButton: HTMLButtonElement;
  private readonly levelSelect = tagged(el('select', 'tt-input'), 'tt-level');
  private readonly setLevelButton: HTMLButtonElement;

  // 유물
  private readonly relicSection = new Section('유물');
  private readonly relicSelect = tagged(el('select', 'tt-input'), 'tt-relic-select');
  private readonly relicInfo = el('p', 'tt-info');
  private readonly addRelicButton: HTMLButtonElement;
  private readonly ownedRelics = tagged(el('div', 'tt-chips'), 'tt-owned-relics');
  private relicKey = '';

  // 카드
  private readonly cardSection = new Section('카드');
  private readonly cardSelect = tagged(el('select', 'tt-input'), 'tt-card-select');
  private readonly cardInfo = el('p', 'tt-info');
  private readonly cardCount = this.numberInput('tt-card-count', '장수', '1', '20');
  private readonly cardUpgraded = tagged(el('input'), 'tt-card-upgraded');
  private readonly addCardButton: HTMLButtonElement;
  private readonly deckSelect = tagged(el('select', 'tt-input'), 'tt-deck-select');
  private readonly removeCardButton: HTMLButtonElement;
  private cardKey = '';
  private deckKey = '';
  private cardOptions = new Map<string, TestCardOption>();

  // 유닛
  private readonly unitSection = new Section('유닛');
  private readonly unitSelect = tagged(el('select', 'tt-input'), 'tt-unit-select');
  private readonly unitInfo = el('p', 'tt-info');
  private readonly unitStar = tagged(el('select', 'tt-input'), 'tt-unit-star');
  private readonly unitPlace = tagged(el('select', 'tt-input'), 'tt-unit-place');
  private readonly grantUnitButton: HTMLButtonElement;
  private unitKey = '';

  // 이동·전투
  private readonly moveSection = new Section('이동');
  private readonly battleSection = new Section('전투');
  private readonly moveButtons: HTMLButtonElement[];
  private readonly nextActButtons: HTMLButtonElement[];
  private readonly battleButtons: HTMLButtonElement[];

  constructor(
    private readonly source: RunViewSource,
    private readonly commands: TestCommands,
  ) {
    this.root.hidden = true;
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', '테스트 도구');
    this.toggle.setAttribute('aria-expanded', 'false');

    const header = el('div', 'tt-header');
    header.append(el('strong', '', '테스트 도구'), tagged(button('닫기', () => this.setOpen(false), 'tt-close'), 'tt-close'));

    // 값
    this.setGoldButton = this.action('설정', 'tt-set-gold', () => this.withNumber(this.goldInput, (amount) => this.commands.testCommand({ kind: 'setGold', amount })));
    this.addGoldButton = this.action('추가', 'tt-add-gold', () => this.withNumber(this.goldInput, (amount) => this.commands.testCommand({ kind: 'addGold', amount })));
    this.goldInput.addEventListener('input', () => this.refreshButtons());
    this.setHpButton = this.action('HP 적용', 'tt-set-hp', () => this.applyHp());
    for (let level = 3; level <= 9; level++) this.levelSelect.append(new Option(`레벨 ${level}`, String(level)));
    this.setLevelButton = this.action('레벨 적용', 'tt-set-level', () => this.commands.testCommand({ kind: 'setLevel', level: Number(this.levelSelect.value) }));
    this.valueSection.body.append(
      this.row(this.labeled('골드', this.goldInput), this.setGoldButton, this.addGoldButton),
      this.row(this.labeled('현재 HP', this.hpInput), this.labeled('최대 HP', this.maxHpInput), this.setHpButton),
      this.row(this.levelSelect, this.setLevelButton),
    );

    // 유물
    this.addRelicButton = this.action('유물 추가', 'tt-add-relic', () => {
      if (this.relicSelect.value) this.commands.testCommand({ kind: 'addRelic', relicId: this.relicSelect.value });
    });
    this.relicSelect.addEventListener('change', () => this.showRelicInfo());
    this.relicSection.body.append(this.row(this.relicSelect, this.addRelicButton), this.relicInfo, el('p', 'tt-label', '보유 유물 (누르면 제거)'), this.ownedRelics);

    // 카드
    this.cardUpgraded.type = 'checkbox';
    this.cardCount.value = '1';
    this.addCardButton = this.action('카드 추가', 'tt-add-card', () => this.addCard());
    this.cardSelect.addEventListener('change', () => this.showCardInfo());
    const upLabel = el('label', 'tt-inline');
    upLabel.append(this.cardUpgraded, document.createTextNode('강화'));
    this.removeCardButton = this.action('카드 제거', 'tt-remove-card', () => {
      if (this.deckSelect.value) this.commands.testCommand({ kind: 'removeCard', instanceId: Number(this.deckSelect.value) });
    });
    this.cardSection.body.append(
      this.row(this.cardSelect), this.cardInfo, this.row(this.labeled('장수', this.cardCount), upLabel, this.addCardButton),
      el('p', 'tt-label', '덱에서 제거'), this.row(this.deckSelect, this.removeCardButton),
    );

    // 유닛
    this.unitStar.append(new Option('1성', '1'), new Option('2성', '2'), new Option('3성', '3'));
    this.unitPlace.append(new Option('벤치', 'bench'), new Option('보드', 'board'));
    this.grantUnitButton = this.action('유닛 지급', 'tt-grant-unit', () => {
      if (this.unitSelect.value) {
        this.commands.testCommand({ kind: 'grantUnit', unitId: this.unitSelect.value, star: Number(this.unitStar.value), place: this.unitPlace.value as 'board' | 'bench' });
      }
    });
    this.unitSelect.addEventListener('change', () => this.showUnitInfo());
    this.unitSection.body.append(this.row(this.unitSelect), this.unitInfo, this.row(this.unitStar, this.unitPlace, this.grantUnitButton));

    // 이동
    const campJump = this.action('보스 직전 야영지로', 'tt-jump-boss-camp', () => this.commands.testCommand({ kind: 'jumpToBoss', viaCamp: true }));
    const bossJump = this.action('보스 전투 준비로', 'tt-jump-boss', () => this.commands.testCommand({ kind: 'jumpToBoss', viaCamp: false }));
    const nextRelic = this.action('다음 액트 (보스 유물 선택)', 'tt-next-act-relic', () => this.commands.testCommand({ kind: 'nextAct', withBossRelic: true }));
    const nextAct = this.action('다음 액트 (유물 건너뛰기)', 'tt-next-act', () => this.commands.testCommand({ kind: 'nextAct', withBossRelic: false }));
    this.moveButtons = [campJump, bossJump, nextRelic, nextAct];
    this.nextActButtons = [nextRelic, nextAct];
    this.moveSection.body.append(this.row(campJump, bossJump), this.row(nextRelic, nextAct));
    this.moveSection.body.append(el('p', 'tt-info', '지나간 노드는 승리·진행한 것으로 기록됩니다. 보스 유물 선택이나 액트 소개 화면으로 이어집니다.'));

    // 전투
    const win = this.action('강제 승리', 'tt-force-win', () => this.commands.testCommand({ kind: 'forceResult', result: 'win' }));
    const loss = this.action('강제 패배', 'tt-force-loss', () => this.commands.testCommand({ kind: 'forceResult', result: 'loss' }));
    this.battleButtons = [win, loss];
    this.battleSection.body.append(this.row(win, loss), el('p', 'tt-info', '현재 전투를 바로 끝내고 일반 전투와 같은 골드·피해·보상 정산을 합니다.'));

    this.panel.append(
      header, this.status, this.battleSection.root, this.valueSection.root, this.relicSection.root,
      this.cardSection.root, this.unitSection.root, this.moveSection.root,
    );
    this.root.append(this.toggle, this.panel);

    source.subscribe(() => this.render());
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.render();
  }

  // ---- 표시 ----

  private render(): void {
    const view = this.source.snapshot().testTools;
    this.view = view;
    this.root.hidden = view === null;
    if (!view) {
      this.setOpen(false);
      return;
    }
    const { availability: a } = view;
    this.status.textContent = `${view.badge} · ${view.phaseLabel} · ${view.gold}G · HP ${view.hp}/${view.maxHp} · 레벨 ${view.level} (보드 ${view.boardCount}/${view.level})`;
    this.toggle.title = view.badge;

    this.valueSection.setReason(a.edit);
    this.relicSection.setReason(a.edit);
    this.cardSection.setReason(a.edit);
    this.unitSection.setReason(a.edit);
    this.moveSection.setReason(a.move ?? (a.nextAct ? `다음 액트로 넘기기: ${a.nextAct}` : null));
    this.battleSection.setReason(a.battle);
    this.hpInput.placeholder = String(view.hp);
    this.maxHpInput.placeholder = String(view.maxHp);
    this.goldInput.placeholder = String(view.gold);
    if (document.activeElement !== this.levelSelect) this.levelSelect.value = String(view.level);

    this.fillRelics(view);
    this.fillCards(view);
    this.fillUnits(view);
    this.refreshButtons();
  }

  /** 입력 상태와 사유에 따라 버튼 활성 여부를 정한다 */
  private refreshButtons(): void {
    const view = this.view;
    if (!view) return;
    const { edit, move, battle, nextAct } = view.availability;
    const goldReason = edit ?? (this.goldInput.value.trim() === '' ? '골드 값을 입력하세요' : null);
    gate(this.setGoldButton, goldReason);
    gate(this.addGoldButton, goldReason);
    for (const target of [this.setHpButton, this.setLevelButton, this.addRelicButton, this.addCardButton, this.grantUnitButton]) gate(target, edit);
    gate(this.addRelicButton, edit ?? (this.relicSelect.value ? null : '더 받을 수 있는 유물이 없습니다'));
    gate(this.removeCardButton, edit ?? (this.deckSelect.value ? null : '제거할 카드가 없습니다'));
    for (const chip of this.ownedRelics.querySelectorAll('button')) gate(chip, edit);
    for (const target of [this.goldInput, this.hpInput, this.maxHpInput, this.levelSelect]) gate(target, edit);
    for (const button of this.moveButtons) gate(button, move);
    for (const button of this.nextActButtons) gate(button, move ?? nextAct);
    for (const button of this.battleButtons) gate(button, battle);
  }

  private fillRelics(view: TestToolsView): void {
    const owned = new Set(view.ownedRelics.map((r) => r.id));
    const available = view.catalog.relics.filter((r) => !owned.has(r.id));
    const key = `${available.map((r) => r.id).join(',')}|${view.ownedRelics.map((r) => r.id).join(',')}`;
    if (key === this.relicKey) return;
    this.relicKey = key;
    const previous = this.relicSelect.value;
    this.relicSelect.replaceChildren(...available.map((r) => new Option(`${r.name} (${r.rarityLabel})`, r.id)));
    if (available.some((r) => r.id === previous)) this.relicSelect.value = previous;
    this.showRelicInfo();
    this.ownedRelics.replaceChildren(
      ...(view.ownedRelics.length === 0 ? [el('span', 'tt-empty', '없음')] : view.ownedRelics.map((r) => this.ownedChip(r))),
    );
  }

  private ownedChip(relic: RelicView): HTMLElement {
    const chip = tagged(button(`${relic.name} ✕`, () => this.commands.testCommand({ kind: 'removeRelic', relicId: relic.id }), `tt-chip rarity-${relic.rarity}`), `tt-remove-relic-${relic.id}`);
    chip.title = `${relic.rarityLabel}: ${relic.text}`;
    return chip;
  }

  private showRelicInfo(): void {
    const relic = this.view?.catalog.relics.find((r) => r.id === this.relicSelect.value);
    this.relicInfo.textContent = relic ? `${relic.rarityLabel} · ${relic.text}` : '받을 수 있는 유물이 없습니다.';
  }

  private fillCards(view: TestToolsView): void {
    const options = view.catalog.cards.filter((c) => c.owner === 'neutral' || c.owner === view.commanderId);
    const cardKey = options.map((c) => c.id).join(',');
    if (cardKey !== this.cardKey) {
      this.cardKey = cardKey;
      this.cardOptions = new Map(options.map((c) => [c.id, c]));
      const previous = this.cardSelect.value;
      this.cardSelect.replaceChildren(...options.map((c) => new Option(`${c.name} (${c.cost}CP)${c.owner === 'neutral' ? '' : ' · 고유'}`, c.id)));
      if (options.some((c) => c.id === previous)) this.cardSelect.value = previous;
      this.showCardInfo();
    }
    const deckKey = view.deck.map((c) => `${c.instanceId}${c.upgraded ? '+' : ''}`).join(',');
    if (deckKey !== this.deckKey) {
      this.deckKey = deckKey;
      const previous = this.deckSelect.value;
      this.deckSelect.replaceChildren(...view.deck.map((c) => new Option(`${c.name} (${c.cost}CP) #${c.instanceId}`, String(c.instanceId))));
      if (view.deck.some((c) => String(c.instanceId) === previous)) this.deckSelect.value = previous;
    }
  }

  private showCardInfo(): void {
    const card = this.cardOptions.get(this.cardSelect.value);
    this.cardInfo.textContent = card ? `${card.typeLabel} · ${card.rarityLabel} · ${card.text}` : '';
    this.cardUpgraded.disabled = !card?.hasUpgrade;
    if (!card?.hasUpgrade) this.cardUpgraded.checked = false;
  }

  private fillUnits(view: TestToolsView): void {
    const key = view.catalog.units.map((u) => u.id).join(',');
    if (key === this.unitKey) return;
    this.unitKey = key;
    this.unitSelect.replaceChildren(...view.catalog.units.map((u) => new Option(`${u.name} (${u.tier}등급)`, u.id)));
    this.showUnitInfo();
  }

  private showUnitInfo(): void {
    const unit = this.view?.catalog.units.find((u) => u.id === this.unitSelect.value);
    this.unitInfo.textContent = unit ? `${unit.traits} · ${unit.skillText}` : '';
  }

  // ---- 입력 ----

  private withNumber(input: HTMLInputElement, run: (value: number) => void): void {
    if (input.value.trim() !== '') run(input.valueAsNumber);
  }

  private applyHp(): void {
    const view = this.view;
    if (!view) return;
    const hp = this.hpInput.value.trim() === '' ? view.hp : this.hpInput.valueAsNumber;
    const maxHp = this.maxHpInput.value.trim() === '' ? undefined : this.maxHpInput.valueAsNumber;
    this.commands.testCommand({ kind: 'setHp', hp, ...(maxHp !== undefined ? { maxHp } : {}) });
  }

  private addCard(): void {
    if (!this.cardSelect.value) return;
    const count = this.cardCount.value.trim() === '' ? 1 : this.cardCount.valueAsNumber;
    this.commands.testCommand({ kind: 'addCard', cardId: this.cardSelect.value, upgraded: this.cardUpgraded.checked, count });
  }

  private setOpen(open: boolean): void {
    this.open = open && this.view !== null;
    this.panel.hidden = !this.open;
    this.toggle.setAttribute('aria-expanded', String(this.open));
  }

  /** T 또는 `로 열고 닫는다 (입력 중이거나 조합키가 눌려 있으면 무시). 닫기는 Esc도 된다 */
  private onKey(e: KeyboardEvent): void {
    if (this.view === null || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      if (e.key === 'Escape' && this.open) this.setOpen(false);
      return;
    }
    if (e.key === 't' || e.key === 'T' || e.key === '`') {
      e.preventDefault();
      this.setOpen(!this.open);
    } else if (e.key === 'Escape' && this.open) {
      this.setOpen(false);
    }
  }

  // ---- 조립 도우미 ----

  private action(text: string, testId: string, onClick: () => void): HTMLButtonElement {
    return tagged(button(text, onClick, 'tt-btn'), testId);
  }

  private numberInput(testId: string, label: string, min: string, max: string): HTMLInputElement {
    const input = tagged(el('input', 'tt-input'), testId);
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = '1';
    input.setAttribute('aria-label', label);
    return input;
  }

  private labeled(text: string, control: HTMLElement): HTMLElement {
    const label = el('label', 'tt-field');
    label.append(el('span', '', text), control);
    return label;
  }

  private row(...children: HTMLElement[]): HTMLElement {
    const row = el('div', 'tt-row');
    row.append(...children);
    return row;
  }
}
