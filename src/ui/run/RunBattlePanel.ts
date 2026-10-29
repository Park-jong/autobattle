import type { CardCatalog } from '../../core/data/cardLoader';
import type { TraitCatalog } from '../../core/data/traitLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import { ManagementPanel } from '../economy/ManagementPanel';
import { PLAYBACK_SPEEDS, type DebugController } from '../debug/contracts';
import type { RunCommands, RunSnapshot, RunViewSource } from './contracts';
import { button, el, tagged } from './dom';
import { encounterPreviewElement } from './encounterPreview';
import { hudElement } from './hudElement';

/**
 * 런 전투 화면의 오른쪽 패널(HTML): 상태 줄, 적 편성, 전투 준비(기존 상점·벤치·배치 UI 재사용),
 * 재생 조작(시작·일시정지·배속·준비로 돌아가기), 결과와 "계속" 버튼.
 * 캔버스(보드)와 손패는 기존 BattleScene/HandPanel이 그린다.
 */
export class RunBattlePanel {
  private readonly top = el('div', 'run-battle-top');
  private readonly controls = el('div', 'run-battle-controls');
  private readonly result = el('div', 'run-battle-result');
  private readonly errorBox = el('div', 'dbg-error');
  private readonly managementHost = el('div');
  private readonly previewHost = el('div');

  constructor(
    private readonly root: HTMLElement,
    private readonly view: RunViewSource,
    private readonly commands: RunCommands,
    private readonly battle: DebugController,
    units: UnitCatalog,
    cards: CardCatalog,
    canvasHost: HTMLElement,
    traits?: TraitCatalog,
  ) {
    root.classList.add('run-battle-panel');
    root.replaceChildren(this.top, this.errorBox, this.result, this.controls, this.previewHost, this.managementHost);
    new ManagementPanel(this.managementHost, battle, units, cards, canvasHost, { title: '유닛 상점 / 배치', modeControls: false, ...(traits ? { traits } : {}) });
    view.subscribe(() => this.render());
    battle.subscribe(() => this.render());
  }

  render(): void {
    const snap = this.view.snapshot();
    const info = snap.battle;
    if (snap.screen !== 'battle' || !info || !snap.hud) return;
    const session = this.battle.snapshot();
    const stage = info.stage;

    this.top.replaceChildren(
      el('h1', 'dbg-title', `액트 ${info.plan.act} · ${info.plan.floor}층 ${info.plan.kindLabel}${info.attempt > 1 ? ` (${info.attempt}번째 도전)` : ''}`),
      hudElement(snap.hud),
    );
    this.errorBox.hidden = session.error === null;
    this.errorBox.textContent = session.error ?? '';

    this.managementHost.hidden = stage !== 'prep';
    this.previewHost.replaceChildren(encounterPreviewElement(info.plan));
    this.renderControls(snap, session.speed, session.phase, session.timeScale);
    this.renderResult(snap);
  }

  private renderControls(snap: RunSnapshot, speed: number, phase: string, timeScale: number): void {
    const stage = snap.battle?.stage;
    this.controls.hidden = stage === 'result';
    if (stage === 'result') return;
    const row = el('div', 'dbg-row');
    if (stage === 'prep') {
      row.append(tagged(button('전투 시작', () => this.commands.startBattle(), 'dbg-btn dbg-primary'), 'start-battle'));
    } else {
      row.append(
        tagged(button(phase === 'paused' ? '재개' : '일시정지', () => this.battle.togglePause()), 'toggle-pause'),
        tagged(button('준비로 돌아가기', () => this.battle.reset()), 'back-to-prep'),
      );
    }
    const speeds = el('div', 'dbg-row');
    speeds.append(el('span', 'dbg-label', '배속'));
    for (const value of PLAYBACK_SPEEDS) {
      const b = tagged(button(`×${value}`, () => this.battle.setSpeed(value), `dbg-btn${speed === value ? ' selected' : ''}`), `speed-${value}`);
      speeds.append(b);
    }
    const note = el('p', 'dbg-hint', stage === 'prep'
      ? '유닛을 사고 배치한 뒤 준비 카드를 쓰고 전투를 시작하세요. 시작하면 유닛 관리는 잠깁니다.'
      : timeScale === 0 ? '시간 정지 (카드 선택 중)' : timeScale < 1 ? `슬로모션 ×${timeScale.toFixed(2)}` : '카드는 아래 손패에서 사용합니다.');
    this.controls.replaceChildren(row, speeds, note);
  }

  private renderResult(snap: RunSnapshot): void {
    const settlement = snap.battle?.settlement ?? null;
    this.result.hidden = settlement === null;
    if (!settlement) return;
    const box = el('div', `run-settlement ${settlement.outcome}`);
    box.append(tagged(el('h2', '', settlement.headline), 'settlement-headline'), el('p', '', `골드 ${settlement.goldLine}`));
    for (const line of settlement.hpLines) box.append(el('p', 'run-settlement-hp', line));
    box.append(el('p', '', `지휘관 HP ${settlement.hpBefore} → ${settlement.hpAfter}`));
    if (settlement.runEnded === 'dead') box.append(el('p', 'run-settlement-hp', '지휘관이 쓰러졌습니다.'));
    if (settlement.runEnded === 'victory') box.append(el('p', 'run-settlement-win', '보스를 쓰러뜨렸습니다!'));
    if (settlement.actCleared !== null) box.append(tagged(el('p', 'run-settlement-win', `액트 ${settlement.actCleared} 보스를 쓰러뜨렸습니다!`), 'act-cleared'));
    box.append(tagged(button(settlement.continueLabel, () => this.commands.continueAfterBattle(), 'dbg-btn dbg-primary run-big-button'), 'continue-battle'));
    this.result.replaceChildren(box);
  }
}
