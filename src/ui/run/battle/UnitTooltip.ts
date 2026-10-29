import type { TraitCatalog } from '../../../core/data/traitLoader';
import type { UnitCatalog } from '../../../core/data/unitLoader';
import { clientToStage } from '../../cards/stagePoint';
import type { UnitHoverSource } from '../../debug/contracts';
import type { UnitView } from '../../replay/ReplayState';
import { el, tagged } from '../dom';
import type { EncounterPreviewView } from '../runViews';
import { infoHead, liveLine, skillBlock, statsGrid } from './UnitInfoPanel';
import { buildUnitInfo, type StarLevel, type StatOverride } from './unitInfoView';
import { appSkin } from '../../skin/SkinStore';
import { traitSkinName, unitSkillName } from '../../skin/skins';

/** 툴팁이 붙는 쪽: 캔버스 기준 오프셋 (px) */
const OFFSET = 18;

/**
 * 적 유닛 툴팁: 캔버스 위 적에게 마우스를 올리면 포인터 옆에 이름·성급·등급·기원/직업, 현재 HP·상태,
 * 실제 전투 수치(층 보정·변이 반영), 지금 성급 스킬, 정예 변이·보스 패턴을 보여 준다.
 * 포인터 아래 유닛은 세션이 보간 위치 기준으로 판정한다(UnitHoverSource).
 */
export class UnitTooltip {
  readonly root = tagged(el('div', 'bt-panel bt-tooltip'), 'enemy-tooltip');
  private hoverUid: number | null = null;
  private client: { x: number; y: number } | null = null;
  private plan: EncounterPreviewView | null = null;
  private signature = '';
  private enabled = false;
  private frame = 0;

  constructor(
    private readonly arena: HTMLElement,
    private readonly canvasHost: HTMLElement,
    private readonly source: UnitHoverSource,
    private readonly units: UnitCatalog,
    private readonly traits: TraitCatalog,
    private readonly blocked: () => boolean,
  ) {
    this.root.hidden = true;
    canvasHost.addEventListener('pointermove', (e) => {
      this.client = { x: e.clientX, y: e.clientY };
      this.refresh();
    });
    canvasHost.addEventListener('pointerleave', () => {
      this.client = null;
      this.refresh();
    });
  }

  /** 런 전투 화면에서만 켠다. plan은 적 실제 수치의 출처 */
  setEnabled(enabled: boolean, plan: EncounterPreviewView | null): void {
    this.enabled = enabled;
    this.plan = plan;
    if (!enabled) this.hide();
  }

  private refresh(): void {
    if (!this.enabled || !this.client || this.blocked()) return this.hide();
    const canvas = this.canvasHost.querySelector('canvas');
    const point = canvas ? clientToStage(this.client.x, this.client.y, canvas.getBoundingClientRect()) : null;
    const view = point ? this.source.unitAtStage(point.x, point.y) : null;
    if (!view || view.side !== 1) return this.hide();
    this.hoverUid = view.uid;
    this.draw(view);
    this.place();
    if (!this.frame) this.frame = requestAnimationFrame(this.loop);
  }

  /** 보이는 동안 HP·상태를 따라가고 유닛이 움직여 포인터에서 벗어나면 숨긴다 */
  private loop = (): void => {
    this.frame = 0;
    if (this.hoverUid === null) return;
    this.refresh();
  };

  private draw(view: UnitView): void {
    const signature = JSON.stringify([appSkin.current, view.uid, view.hp, view.maxHp, view.shield, view.mana, view.statuses.map((s) => s.name), this.plan?.nodeId]);
    if (signature === this.signature) return;
    this.signature = signature;
    const def = this.units.get(view.unitId);
    if (!def) return this.hide();
    const star = view.star as StarLevel;
    const planned = this.plan?.units.find((u) => u.unitId === view.unitId && u.star === view.star);
    const stats: StatOverride | undefined = planned
      ? { hp: view.maxHp, atk: planned.atk, as: planned.as, range: planned.range, arm: planned.arm, res: planned.res, mana: planned.mana }
      : undefined;
    const info = buildUnitInfo(def, star, { traitName: (id) => traitSkinName(appSkin.current, id, this.traits.get(id)?.name ?? id) }, stats);
    info.skillName = unitSkillName(appSkin.current, def.id, info.skillName);
    const nodes: HTMLElement[] = [infoHead(info, true, { large: false }), liveLine(view), statsGrid(info), skillBlock(info, true)];
    const plan = this.plan;
    if (plan && plan.mutations.length > 0) {
      const note = el('div', 'bt-tooltip-note');
      note.append(el('b', '', '변이 '), plan.mutations.map((m) => `${m.name}: ${m.text}`).join(' / '));
      nodes.push(note);
    }
    const pattern = plan?.bossPatterns.find((p) => p.unitName === def.name);
    if (pattern) {
      const note = el('div', 'bt-tooltip-note');
      note.append(el('b', '', `보스 패턴 [${pattern.title}] `), pattern.lines.join(' '));
      nodes.push(note);
    }
    if (!planned && this.plan) nodes.push(el('div', 'bt-tooltip-note', '전투 중 소환된 유닛 (기본 수치 표시)'));
    this.root.replaceChildren(...nodes);
    this.root.hidden = false;
  }

  /** 포인터 오른쪽 아래에 두되 보드 영역 밖으로 나가면 반대쪽으로 */
  private place(): void {
    if (!this.client) return;
    const area = this.arena.getBoundingClientRect();
    const width = this.root.offsetWidth;
    const height = this.root.offsetHeight;
    let x = this.client.x - area.left + OFFSET;
    let y = this.client.y - area.top + OFFSET;
    if (x + width > area.width - 4) x = this.client.x - area.left - OFFSET - width;
    if (y + height > area.height - 4) y = Math.max(4, area.height - height - 4);
    this.root.style.left = `${Math.max(4, x)}px`;
    this.root.style.top = `${Math.max(4, y)}px`;
  }

  private hide(): void {
    this.hoverUid = null;
    this.signature = '';
    this.root.hidden = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
