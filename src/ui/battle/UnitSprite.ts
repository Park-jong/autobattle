import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { UnitView } from '../replay/ReplayState';
import { COLORS, LAYOUT, STATUS_BADGES, TEXT_COLORS, TIMING } from '../theme';
import type { BoardLayout } from './BoardLayout';
import type { UnitPose } from './combatVisuals';

/**
 * 유닛 하나의 표시: 진영색 도형 + 이름 약자(또는 스킨 원화) + 성급 + HP/보호막/마나 바 + 상태 배지. UnitView만 보고 그린다.
 * 원화 텍스처 키를 주면(아카데미 스킨) 도형은 반투명 받침이 되고 그 위에 원화를 올린다. 적은 원화를 좌우 반전해 왼쪽을 보게 한다.
 */
export class UnitSprite {
  private readonly container: Phaser.GameObjects.Container;
  private readonly actor: Phaser.GameObjects.Container;
  /** 몸체 도형 (원화가 있으면 그 아래 받침) */
  private readonly base: Phaser.GameObjects.Graphics;
  /** 오라·막대·배지 (원화 위에 그린다) */
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly art: Phaser.GameObjects.Image | null;
  private readonly badgeTexts: Phaser.GameObjects.Text[] = [];
  /** 중첩이 2겹 이상인 배지 모서리에 붙이는 겹 수 */
  private readonly stackTexts: Phaser.GameObjects.Text[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly layout: BoardLayout,
    abbreviation: string,
    star: number,
    artKey: string | null = null,
    private readonly bossCrest = false,
  ) {
    this.base = scene.add.graphics();
    this.gfx = scene.add.graphics();
    this.art = artKey && scene.textures.exists(artKey)
      ? scene.add.image(0, LAYOUT.SKIN_ART_Y, artKey).setDisplaySize(LAYOUT.SKIN_ART_SIZE, LAYOUT.SKIN_ART_SIZE)
      : null;
    const stars = createText(scene, metrics, 0, LAYOUT.STAR_Y, '★'.repeat(star), {
      fontSize: '14px',
      color: TEXT_COLORS.STAR,
    }).setOrigin(0.5);
    const middle: Phaser.GameObjects.GameObject[] = this.art
      ? [this.art]
      : [this.base, createText(scene, metrics, 0, 0, abbreviation, {
        fontSize: '20px',
        fontStyle: 'bold',
        color: TEXT_COLORS.UNIT_NAME,
      }).setOrigin(0.5)];
    this.actor = scene.add.container(0, 0, middle);
    this.container = scene.add.container(0, 0, [...(this.art ? [this.base] : []), this.actor, this.gfx, stars]).setDepth(10);
  }

  update(view: UnitView, time: number, pose?: UnitPose): void {
    const alpha = this.alphaOf(view, time);
    this.container.setVisible(alpha > 0);
    if (alpha <= 0) return;
    this.container.setAlpha(alpha);
    const p = this.layout.center(view.pos.col, view.pos.row);
    this.container.setPosition(p.x, p.y);
    // 죽은 유닛은 살아 있는 유닛 아래에 깔리게 한다
    this.container.setDepth(view.alive ? 10 + view.pos.row * 0.03 + view.uid * 0.0001 : 5);
    this.actor.setPosition(pose?.x ?? 0, pose?.y ?? 0);
    this.actor.setRotation(pose?.rotation ?? 0).setScale(pose?.scaleX ?? 1, pose?.scaleY ?? 1);

    this.drawBody(view);
    if (pose?.flash) this.art?.setTintFill(0xffffff);
    else if (pose?.hurt) this.art?.setTint(0xffbabd);
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
    const b = this.base;
    const g = this.gfx;
    b.clear();
    g.clear();
    const ally = view.side === 0;
    const stunned = view.statuses.some((s) => s.name === 'stun');
    const burning = view.statuses.some((s) => s.name === 'burn');

    b.fillStyle(ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, this.art ? LAYOUT.SKIN_BASE_ALPHA : 1);
    b.lineStyle(3, stunned ? 0xffd54a : burning ? 0xff8a3d : ally || !this.art ? COLORS.UNIT_OUTLINE : COLORS.ENEMY_UNIT, 1);
    if (this.bossCrest && !this.art) {
      const points = Array.from({ length: 7 }, (_, i) => ({ x: Math.cos(Math.PI / 6 + i * Math.PI / 3) * 29, y: Math.sin(Math.PI / 6 + i * Math.PI / 3) * 29 }));
      b.fillStyle(0x40283f, 1);
      b.fillPoints(points, true);
      b.lineStyle(3, 0xd7a586, 1);
      b.strokePoints(points, true);
      b.lineStyle(1, 0xf09ca4, 0.65);
      b.strokeCircle(0, 0, 35);
      b.fillStyle(0xe5c694, 1);
      b.fillTriangle(-14, -26, -8, -38, -3, -27);
      b.fillTriangle(3, -27, 8, -38, 14, -26);
    } else if (this.art) {
      b.fillStyle(0x080c17, 0.6);
      b.fillEllipse(0, 29, 54, 14);
      b.fillStyle(ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, 0.23);
      b.fillEllipse(0, 27, 52, 16);
      b.lineStyle(2, ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, 0.85);
      if (ally) b.strokeEllipse(0, 27, 52, 16);
      else b.strokeRoundedRect(-25, 21, 50, 13, 3);
    } else if (ally) {
      b.fillCircle(0, 0, LAYOUT.UNIT_RADIUS);
      b.strokeCircle(0, 0, LAYOUT.UNIT_RADIUS);
    } else {
      // 적은 사각형으로 구분 (색약 대비)
      const r = LAYOUT.UNIT_RADIUS;
      b.fillRoundedRect(-r, -r, r * 2, r * 2, 6);
      b.strokeRoundedRect(-r, -r, r * 2, r * 2, 6);
    }
    if (this.art) {
      this.art.setFlipX(!ally);
      if (burning) this.art.setTint(0xffb27a);
      else this.art.clearTint();
    } else if (burning) {
      b.fillStyle(0xff8a3d, 0.35);
      b.fillCircle(0, 0, LAYOUT.UNIT_RADIUS);
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
