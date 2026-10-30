import type { SessionSnapshot } from '../../debug/contracts';
import { button, el, tagged } from '../dom';

/** A compact deployment count replaces the nine physical bench slots. */
export class DeploymentBar {
  private signature = '';

  constructor(readonly root: HTMLElement, private readonly onStart: () => void, private readonly onHand: () => void) {
    root.classList.add('bt-deployment');
  }

  render(session: SessionSnapshot, stage: 'prep' | 'playing' | 'result'): void {
    const management = session.management;
    const signature = JSON.stringify([management?.state.population, management?.state.level, management?.state.bench.filter(Boolean).length, stage]);
    if (signature === this.signature) return;
    this.signature = signature;
    if (!management) { this.root.replaceChildren(); return; }
    const state = management.state;
    const status = el('div', 'bt-deployment-status');
    const count = el('strong', state.population < state.level && stage === 'prep' ? 'bt-under' : '', `소환 ${state.population} / ${state.level}`);
    const hand = tagged(button(`유닛 카드 ${state.bench.filter(Boolean).length}`, this.onHand, 'bt-deployment-hand'), 'open-unit-hand');
    status.append(count, hand);
    const recall = el('div', 'bt-deployment-recall', '여기에 놓아 손패로 회수');
    recall.dataset.unitHandZone = 'true';
    const start = tagged(button('전투 시작', this.onStart, 'bt-btn primary bt-start'), 'start-battle');
    start.title = '단축키 Enter';
    start.hidden = stage !== 'prep';
    this.root.replaceChildren(status, recall, start);
  }
}
