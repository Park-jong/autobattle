import type { CardCatalog } from '../../../core/data/cardLoader';
import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import type { OwnedUnit } from '../../../core/management';
import type { DebugController } from '../../debug/contracts';
import type { UnitView } from '../../replay/ReplayState';
import type { ActiveTrait } from '../../../core/combat/traits';
import { appSkin } from '../../skin/SkinStore';
import { unitArtUrl, unitSkinName } from '../../skin/skins';
import { button, el, tagged } from '../dom';
import type { HoverPop } from './hoverPop';
import { bindTraitChip } from './TraitPanel';
import { unitFace } from './unitFace';
import { buildUnitInfo, sellRefund, statusLabel, type StarLevel, type StatOverride, type UnitInfoView } from './unitInfoView';

/** 정보 패널에 띄울 대상: 준비 단계의 소유 유닛(이동·판매 가능) 또는 전투 중 보드 위 유닛(읽기 전용) */
export type InfoSubject =
  | { kind: 'owned'; unit: OwnedUnit; canManage: boolean }
  | { kind: 'live'; view: UnitView; stats?: StatOverride };

/**
 * 보드 오른쪽의 유닛 정보 패널: 얼굴·이름·성급·등급·기원/직업, 능력치, 1·2·3성 스킬 설명(지금 성급 강조),
 * 제공 카드·장비, 준비 단계면 벤치로·판매 버튼.
 */
export class UnitInfoPanel {
  readonly root = tagged(el('section', 'bt-panel bt-info'), 'unit-info');
  private signature = '';

  constructor(
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    private readonly cards: CardCatalog,
    private readonly controller: DebugController,
    private readonly onClose: () => void,
    private readonly traitPop: HoverPop,
    /** 진영(0 아군 / 1 적)의 지금 특성 — 특성 칩 팝업의 종류 수·단계 */
    private readonly sideTraits: (side: 0 | 1) => readonly ActiveTrait[],
  ) {
    this.root.hidden = true;
  }

  render(subject: InfoSubject | null): void {
    const signature = subject === null ? 'none' : appSkin.current + JSON.stringify(subject.kind === 'owned'
      ? [subject.unit, subject.canManage]
      : [subject.view.uid, subject.view.unitId, subject.view.star, subject.view.hp, subject.view.maxHp, subject.view.shield, subject.view.statuses.map((s) => s.name), subject.view.alive]);
    if (signature === this.signature) return;
    this.signature = signature;
    const unitId = subject?.kind === 'owned' ? subject.unit.unitId : subject?.view.unitId;
    const def = unitId ? this.units.get(unitId) : undefined;
    if (!subject || !def) {
      this.root.hidden = true;
      this.root.replaceChildren();
      this.traitPop.reattach(this.root);
      return;
    }
    const star = (subject.kind === 'owned' ? subject.unit.star : subject.view.star) as StarLevel;
    const info = buildUnitInfo(def, star, { traitName: (id) => this.traits.get(id)?.name ?? id }, subject.kind === 'live' ? subject.stats : undefined);
    const enemy = subject.kind === 'live' && subject.view.side === 1;

    const close = tagged(button('×', () => this.onClose(), 'bt-info-close'), 'unit-info-close');
    close.title = '닫기 (Esc)';
    const side = enemy ? 1 : 0;
    const nodes: HTMLElement[] = [close, infoHead(info, enemy, {
      large: true,
      onTraitChip: (chip, traitId) => bindTraitChip(chip, traitId, this.traits, this.traitPop, () => this.sideTraits(side)),
    })];
    const artUrl = unitArtUrl(appSkin.current, def.id, 'illustration');
    if (artUrl) {
      const art = el('img', 'academy-unit-illustration');
      art.src = artUrl;
      art.alt = `${unitSkinName(appSkin.current, def.id, info.name)} 전신 원화`;
      art.draggable = false;
      art.addEventListener('error', () => art.remove());
      nodes.push(art);
    }
    if (subject.kind === 'live') nodes.push(liveLine(subject.view));
    nodes.push(statsGrid(info), skillBlock(info));

    const extra = el('div', 'bt-info-extra');
    if (def.grantedCard) {
      const name = this.cards.get(def.grantedCard)?.name ?? def.grantedCard;
      extra.append(el('div', '', '배치 중 제공 카드: '), el('b', '', name));
    }
    if (subject.kind === 'owned' && subject.unit.equipment.length > 0) {
      const names = subject.unit.equipment.map((id) => {
        const upgraded = id.endsWith('+');
        return `${this.cards.get(upgraded ? id.slice(0, -1) : id)?.name ?? '장비'}${upgraded ? '+' : ''}`;
      });
      extra.append(el('div', '', `장비: ${names.join(', ')}`));
    }
    if (extra.childNodes.length > 0) nodes.push(extra);

    if (subject.kind === 'owned') {
      const unit = subject.unit;
      const actions = el('div', 'bt-info-actions');
      const toBench = tagged(button('벤치로', () => this.controller.moveManagedToBench(unit.id), 'bt-btn'), 'unit-to-bench');
      const sell = tagged(button(`판매 +${sellRefund(def.tier, unit.star)}G`, () => this.controller.sellManagedUnit(unit.id), 'bt-btn'), 'unit-sell');
      toBench.disabled = !subject.canManage || unit.benchIndex !== null;
      sell.disabled = !subject.canManage;
      actions.append(toBench, sell);
      nodes.push(actions);
    }
    this.root.replaceChildren(...nodes);
    this.root.hidden = false;
    this.traitPop.reattach(this.root);
  }
}

export interface InfoHeadOptions {
  large?: boolean;
  /** 특성 칩마다 불린다 (마우스를 올리면 특성 설명을 띄우는 등) */
  onTraitChip?: (chip: HTMLElement, traitId: string) => void;
}

export function infoHead(info: UnitInfoView, enemy: boolean, options: InfoHeadOptions = { large: true }): HTMLElement {
  const head = el('div', 'bt-info-head');
  const text = el('div');
  const name = el('div', 'bt-info-name', unitSkinName(appSkin.current, info.unitId, info.name));
  name.append(' ', el('span', 'bt-info-stars', '★'.repeat(info.star)));
  if (info.boss) name.append(el('span', 'bt-tooltip-tag', '보스'));
  const chips = el('div', 'bt-traitchips');
  info.traits.forEach((trait, i) => {
    const chip = el('span', 'bt-traitchip', trait);
    const id = info.traitIds[i];
    if (id !== undefined) options.onTraitChip?.(chip, id);
    chips.append(chip);
  });
  text.append(name, el('div', 'bt-info-sub', `${appSkin.current === 'academy' ? `${info.name} · ` : ''}${info.tier}등급${enemy ? ' · 적' : ''}`), chips);
  head.append(unitFace(info.unitId, info.name, info.tier, { large: options.large ?? true, enemy }), text);
  return head;
}

export function statsGrid(info: UnitInfoView): HTMLElement {
  const grid = el('div', 'bt-stats');
  for (const stat of info.stats) {
    const row = el('div', 'bt-stat');
    row.append(el('span', '', stat.label), el('b', '', stat.value));
    grid.append(row);
  }
  return grid;
}

export function skillBlock(info: UnitInfoView, onlyCurrent = false): HTMLElement {
  const box = el('div');
  box.append(el('div', 'bt-skill-name', `스킬 · ${info.skillName}`));
  for (const line of info.skillLines) {
    if (onlyCurrent && !line.current) continue;
    const row = el('div', `bt-skill-line${line.current ? ' current' : ''}`);
    row.append(el('span', 'bt-skill-star', '★'.repeat(line.star)), el('span', '', line.text));
    box.append(row);
  }
  return box;
}

/** 전투 중 현재 HP·보호막·마나와 걸린 상태 */
export function liveLine(view: UnitView): HTMLElement {
  const box = el('div');
  const line = el('div', 'bt-hpline');
  const bar = el('div', 'bt-unit-hp');
  const fill = el('div', `bt-unit-hp-fill${view.side === 1 ? ' enemy' : ''}`);
  fill.style.width = `${view.maxHp > 0 ? Math.round((Math.max(0, view.hp) / view.maxHp) * 100) : 0}%`;
  bar.append(fill);
  if (view.shield > 0 && view.maxHp > 0) {
    const shield = el('div', 'bt-unit-shield');
    shield.style.width = `${Math.min(100, Math.round((view.shield / view.maxHp) * 100))}%`;
    bar.append(shield);
  }
  line.append(bar, el('span', '', `${Math.max(0, Math.round(view.hp))} / ${view.maxHp}${view.shield > 0 ? ` (+${Math.round(view.shield)})` : ''}`), el('span', '', `마나 ${Math.round(view.mana)}/${view.maxMana}`));
  box.append(line);
  const names = [...new Set(view.statuses.map((s) => statusLabel(s.name)))];
  if (names.length > 0) {
    const list = el('div', 'bt-statuses');
    for (const name of names) list.append(el('span', 'bt-status', name));
    box.append(list);
  }
  return box;
}
