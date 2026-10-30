import type { RunCommands, RunSnapshot, RunViewSource } from './contracts';
import { CardListModal, equipmentExtra, type CardListSpec } from './CardListModal';
import { el } from './dom';
import { expeditionHeader } from './expeditionHeader';
import { MapExplorer } from './MapExplorer';

/** 원정 지도: 노드 옆 미리보기와 클릭으로 고정하는 상세 정보. */
export class MapScreen {
  readonly root = el('div', 'run-map-screen');
  private readonly explorer: MapExplorer;

  constructor(
    private readonly view: RunViewSource,
    private readonly commands: RunCommands,
    private readonly deckModal = new CardListModal(),
  ) {
    this.explorer = new MapExplorer(view, (id) => commands.chooseNode(id));
  }

  private deckSpec(snap: RunSnapshot): CardListSpec {
    return { title: '덱', entries: snap.deck ?? [], extra: equipmentExtra(snap.equipment, (ownedId, index) => this.commands.unequipItem(ownedId, index)) };
  }

  render(snap: RunSnapshot): void {
    const { map, hud } = snap;
    if (!map || !hud) return;
    const header = expeditionHeader(hud, {
      onHome: () => { this.explorer.close(); this.commands.toStart(); },
      onDeck: () => { this.explorer.close(); this.deckModal.open(this.deckSpec(this.view.snapshot())); },
      region: map.region,
      description: map.actText,
    });
    this.deckModal.update(this.deckSpec(snap));
    this.root.replaceChildren(header, this.explorer.root);
    this.explorer.render(map, hud.commanderId);
  }
}
