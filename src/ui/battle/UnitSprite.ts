import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { UnitView } from '../replay/ReplayState';
import { COLORS, LAYOUT, STATUS_BADGES, TEXT_COLORS, TIMING } from '../theme';
import type { BoardLayout } from './BoardLayout';

/** 유닛 하나의 표시: 진영색 도형 + 이름 약자 + 성급 + HP/보호막/마나 바 + 상태 배지. UnitView만 보고 그린다. */
export class UnitSprite {
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly badgeTexts: Phaser.GameObjects.Text[] = [];
  /** 중첩이 2겹 이상인 배지 모서리에 붙이는 겹 수 */
  private readonly stackTexts: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly layout: BoardLayout,
    abbreviation: string,
    star: number,
  ) {
    this.gfx = scene.add.graphics();
    const name = createText(scene, metrics, 0, 0, abbreviation, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: TEXT_COLORS.UNIT_NAME,
    }).setOrigin(0.5);
    const stars = createText(scene, metrics, 0, LAYOUT.STAR_Y, '★'.repeat(star), {
      fontSize: '14px',
      color: TEXT_COLORS.STAR,
    }).setOrigin(0.5);
    this.container = scene.add.container(0, 0, [this.gfx, name, stars]).setDepth(10);
  }

  update(view: UnitView, time: number): void {
    const alpha = this.alphaOf(view, time);
    this.container.setVisible(alpha > 0);
    if (alpha <= 0) return;
    this.container.setAlpha(alpha);
    const p = this.layout.center(view.pos.col, view.pos.row);
    this.container.setPosition(p.x, p.y);
    // 죽은 유닛은 살아 있는 유닛 아래에 깔리게 한다
    this.container.setDepth(view.alive ? 10 + view.uid * 0.001 : 5);

    this.drawBody(view);
    this.syncBadges(view);
  }

  destroy(): void {
    this.container.destroy();
  }

  private alphaOf(view: UnitView, time: number): number {
    if (view.alive || view.deadAt === null) return 1;
    return Math.max(0, 1 - (time - view.deadAt) / TIMING.DEATH_FADE);
  }

  private drawBody(view: UnitView): void {
    const g = this.gfx;
    g.clear();
    const ally = view.side === 0;
    const stunned = view.statuses.some((s) => s.name === 'stun');
    const burning = view.statuses.some((s) => s.name === 'burn');

    g.fillStyle(ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, 1);
    g.lineStyle(3, stunned ? 0xffd54a : burning ? 0xff8a3d : COLORS.UNIT_OUTLINE, 1);
    if (ally) {
      g.fillCircle(0, 0, LAYOUT.UNIT_RADIUS);
      g.strokeCircle(0, 0, LAYOUT.UNIT_RADIUS);
    } else {
      // 적은 사각형으로 구분 (색약 대비)
      const r = LAYOUT.UNIT_RADIUS;
      g.fillRoundedRect(-r, -r, r * 2, r * 2, 6);
      g.strokeRoundedRect(-r, -r, r * 2, r * 2, 6);
    }
    if (burning) {
      g.fillStyle(0xff8a3d, 0.35);
      g.fillCircle(0, 0, LAYOUT.UNIT_RADIUS);
    }
    this.drawAuras(view);

    // HP 바 (보호막은 HP 바 위에 덧칠)
    const w = LAYOUT.BAR_WIDTH;
    const x = -w / 2;
    const hpRatio = view.maxHp > 0 ? view.hp / view.maxHp : 0;
    g.fillStyle(COLORS.HP_BACK, 1);
    g.fillRect(x, LAYOUT.HP_BAR_Y, w, LAYOUT.HP_BAR_HEIGHT);
    g.fillStyle(ally ? COLORS.HP_ALLY : COLORS.HP_ENEMY, 1);
    g.fillRect(x, LAYOUT.HP_BAR_Y, w * clamp01(hpRatio), LAYOUT.HP_BAR_HEIGHT);
    if (view.shield > 0 && view.maxHp > 0) {
      g.fillStyle(COLORS.SHIELD, 0.9);
      g.fillRect(x, LAYOUT.HP_BAR_Y, w * clamp01(view.shield / view.maxHp), LAYOUT.HP_BAR_HEIGHT);
    }
    // 마나 바
    const manaRatio = view.maxMana > 0 ? view.mana / view.maxMana : 0;
    g.fillStyle(COLORS.HP_BACK, 1);
    g.fillRect(x, LAYOUT.MANA_BAR_Y, w, LAYOUT.MANA_BAR_HEIGHT);
    g.fillStyle(COLORS.MANA, 1);
    g.fillRect(x, LAYOUT.MANA_BAR_Y, w * clamp01(manaRatio), LAYOUT.MANA_BAR_HEIGHT);
  }

  /** 보호막(하늘색 테두리) · 불사(보라색 이중 테두리) · 우선 공격 대상 조준 표식 */
  private drawAuras(view: UnitView): void {
    const g = this.gfx;
    const r = LAYOUT.UNIT_RADIUS;
    if (view.shield > 0) {
      g.lineStyle(3, COLORS.SHIELD, 0.85);
      g.strokeCircle(0, 0, r + 5);
    }
    if (view.statuses.some((s) => s.name === 'undying')) {
      g.lineStyle(3, COLORS.UNDYING, 1);
      g.strokeCircle(0, 0, r + 10);
      g.lineStyle(1, COLORS.UNDYING, 0.6);
      g.strokeCircle(0, 0, r + 14);
    }
    if (view.marked) {
      const outer = r + 20;
      const inner = r + 8;
      g.lineStyle(3, COLORS.AIM_MARK, 1);
      g.strokeCircle(0, 0, r + 14);
      g.lineBetween(-outer, 0, -inner, 0);
      g.lineBetween(inner, 0, outer, 0);
      g.lineBetween(0, -outer, 0, -inner);
      g.lineBetween(0, inner, 0, outer);
    }
  }

  /** 상태 배지(글자 한 자짜리 색 사각형)를 유닛 아래에 가로로 나열 */
  private syncBadges(view: UnitView): void {
    const badges = STATUS_BADGES.filter((b) => view.statuses.some((s) => b.match(s.name)));
    const size = LAYOUT.BADGE_SIZE;
    const total = badges.length * (size + 2) - 2;
    badges.forEach((badge, i) => {
      const cx = -total / 2 + i * (size + 2) + size / 2;
      this.gfx.fillStyle(badge.color, 1);
      this.gfx.fillRoundedRect(cx - size / 2, LAYOUT.BADGE_Y - size / 2, size, size, 3);
      const text = this.badgeText(i);
      text.setText(badge.label).setPosition(cx, LAYOUT.BADGE_Y).setVisible(true);
      const stacks = Math.max(1, ...view.statuses.filter((s) => badge.match(s.name)).map((s) => s.stacks ?? 1));
      const count = this.stackText(i);
      count.setText(String(stacks)).setPosition(cx + size / 2, LAYOUT.BADGE_Y - size / 2).setVisible(stacks > 1);
    });
    for (let i = badges.length; i < this.badgeTexts.length; i++) this.badgeTexts[i]?.setVisible(false);
    for (let i = badges.length; i < this.stackTexts.length; i++) this.stackTexts[i]?.setVisible(false);
  }

  private stackText(index: number): Phaser.GameObjects.Text {
    let text = this.stackTexts[index];
    if (!text) {
      text = createText(this.scene, this.metrics, 0, 0, '', { fontSize: '10px', fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5);
      this.container.add(text);
      this.stackTexts[index] = text;
    }
    return text;
  }

  private badgeText(index: number): Phaser.GameObjects.Text {
    let text = this.badgeTexts[index];
    if (!text) {
      text = createText(this.scene, this.metrics, 0, 0, '', { fontSize: '11px', fontStyle: 'bold', color: '#10131a' }).setOrigin(0.5);
      this.container.add(text);
      this.badgeTexts[index] = text;
    }
    return text;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
