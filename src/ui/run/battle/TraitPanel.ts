import type { ActiveTrait } from '../../../core/combat/traits';
import type { TraitCatalog } from '../../../core/data/traitLoader';
import { el, tagged } from '../dom';
import { traitPopContent, type HoverPop } from './hoverPop';
import { buildTraitRows, traitRowFor, type TraitRowView } from './traitPanelView';
import { appSkin } from '../../skin/SkinStore';
import { traitSkinName } from '../../skin/skins';

/**
 * 보드 왼쪽의 특성 패널: 아군 특성(켜진 것 먼저, 미달은 흐리게)과 적의 켜진 특성.
 * 줄에 마우스를 올리면 지금 단계의 효과와 단계별 원문을 줄 오른쪽 팝업(공용 특성 팝업)으로 보여 준다.
 */
export class TraitPanel {
  readonly root = tagged(el('section', 'bt-panel bt-traits'), 'battle-traits');
  private signature = '';

  constructor(
    private readonly traits: TraitCatalog,
    private readonly pop: HoverPop,
  ) {}

  render(ally: readonly ActiveTrait[], enemy: readonly ActiveTrait[]): void {
    const signature = JSON.stringify([appSkin.current, ally, enemy]);
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
    // 종류 수가 바뀌어 다시 그렸으므로 이 패널에서 띄운 팝업은 닫는다 (다른 곳의 특성 칩 팝업은 유지)
    this.pop.reattach(this.root);
  }

  private row(row: TraitRowView): HTMLElement {
    row = { ...row, name: traitSkinName(appSkin.current, row.traitId, row.name) };
    const node = tagged(el('div', `bt-trait tier-${row.tier}${row.tier === 0 ? ' inactive' : ''}`), `trait-${row.traitId}`);
    const steps = el('div', 'bt-trait-steps');
    row.thresholds.forEach((n, i) => {
      if (i > 0) steps.append(' › ');
      steps.append(el('span', row.count >= n ? 'reached' : '', String(n)));
    });
    node.append(el('div', 'bt-trait-badge', String(row.count)), el('div', 'bt-trait-name', row.name), steps);
    node.addEventListener('mouseenter', () => this.pop.show(node, () => traitPopContent(row)));
    node.addEventListener('mouseleave', () => this.pop.hide());
    return node;
  }
}

/**
 * 특성 칩(상점·유닛 정보 창)에 마우스를 올리면 공용 특성 팝업을 띄운다.
 * 종류 수·단계는 올린 순간의 진영 특성(side)으로 계산한다.
 */
export function bindTraitChip(
  chip: HTMLElement,
  traitId: string,
  traits: TraitCatalog,
  pop: HoverPop,
  active: () => readonly ActiveTrait[],
): void {
  chip.dataset.traitId = traitId;
  chip.dataset.popKey = `trait:${traitId}`;
  chip.classList.add('bt-trait-hover');
  chip.addEventListener('mouseenter', () => {
    const def = traits.get(traitId);
    if (def) pop.show(chip, () => traitPopContent(traitRowFor(def, active().find((t) => t.traitId === traitId))));
  });
  chip.addEventListener('mouseleave', () => pop.hide());
}
