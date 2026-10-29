import type { ActiveTrait } from '../../../core/combat/traits';
import type { TraitCatalog } from '../../../core/data/traitLoader';
import { el, tagged } from '../dom';
import { buildTraitRows, type TraitRowView } from './traitPanelView';

/**
 * 보드 왼쪽의 특성 패널: 아군 특성(켜진 것 먼저, 미달은 흐리게)과 적의 켜진 특성.
 * 줄에 마우스를 올리면 지금 단계의 효과와 단계별 원문을 오른쪽 팝업으로 보여 준다.
 */
export class TraitPanel {
  readonly root = tagged(el('section', 'bt-panel bt-traits'), 'battle-traits');
  private signature = '';

  constructor(private readonly traits: TraitCatalog) {}

  render(ally: readonly ActiveTrait[], enemy: readonly ActiveTrait[]): void {
    const signature = JSON.stringify([ally, enemy]);
    if (signature === this.signature) return;
    this.signature = signature;
    const lookup = (id: string) => this.traits.get(id);
    const allyRows = buildTraitRows(ally, lookup);
    const enemyRows = buildTraitRows(enemy, lookup).filter((r) => r.tier > 0);

    const allyGroup = el('div', 'bt-trait-group ally');
    allyGroup.append(el('h3', 'bt-title', '아군 특성'));
    if (allyRows.length === 0) allyGroup.append(el('p', 'bt-trait-empty', '유닛을 배치하면 특성이 표시됩니다.'));
    for (const row of allyRows) allyGroup.append(this.row(row));
    const nodes: HTMLElement[] = [allyGroup];
    if (enemyRows.length > 0) {
      const enemyGroup = el('div', 'bt-trait-group enemy');
      enemyGroup.append(el('h3', 'bt-title', '적 특성'));
      for (const row of enemyRows) enemyGroup.append(this.row(row));
      nodes.push(enemyGroup);
    }
    this.root.replaceChildren(...nodes);
  }

  private row(row: TraitRowView): HTMLElement {
    const node = tagged(el('div', `bt-trait tier-${row.tier}${row.tier === 0 ? ' inactive' : ''}`), `trait-${row.traitId}`);
    const steps = el('div', 'bt-trait-steps');
    row.thresholds.forEach((n, i) => {
      if (i > 0) steps.append(' › ');
      steps.append(el('span', row.count >= n ? 'reached' : '', String(n)));
    });
    const pop = el('div', 'bt-pop');
    pop.append(
      el('strong', '', `${row.name} (${row.kind === 'origin' ? '기원' : '직업'}) · ${row.count}종`),
      el('div', '', row.tier > 0 ? `${row.tier}단계: ${row.currentText}` : `미달 — ${row.nextAt}종이 되면 1단계: ${row.currentText}`),
      el('div', 'bt-trait-steps', `단계 기준 ${row.thresholds.join(' / ')}종 · ${row.fullText}`),
    );
    if (row.tier > 0 && row.nextAt !== null) pop.append(el('div', 'bt-trait-steps', `다음 단계까지 ${row.nextAt - row.count}종`));
    node.append(el('div', 'bt-trait-badge', String(row.count)), el('div', 'bt-trait-name', row.name), steps, pop);
    return node;
  }
}
