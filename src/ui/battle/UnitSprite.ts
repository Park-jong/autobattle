import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { UnitView } from '../replay/ReplayState';
import { COLORS, LAYOUT, STATUS_BADGES, TEXT_COLORS, TIMING } from '../theme';
import type { BoardLayout } from './BoardLayout';
import { SD_TEXTURE, SKIN_TEXTURE, unitSkinIndex } from '../skin';

/** SD agent body and combat-clock-driven motion; bars and badges stay fixed for readability. */
export class UnitSprite {
  private readonly container: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly badgeTexts: Phaser.GameObjects.Text[] = [];
  private readonly figure: Phaser.GameObjects.Image | null;
  private readonly sd: boolean;
  private baseScaleX = 1;
  private baseScaleY = 1;
  private attackAt = -Infinity;
  private hitAt = -Infinity;
  private skillAt = -Infinity;
  private attackX = 1;
  private attackY = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly layout: BoardLayout,
    abbreviation: string,
    star: number,
    unitId = '',
  ) {
    this.gfx = scene.add.graphics();
    this.sd = scene.textures.exists(SD_TEXTURE);
    this.figure = this.sd
      ? scene.add.image(0, -7, SD_TEXTURE, `agent-${unitSkinIndex(unitId)}`)
      : scene.textures.exists(SKIN_TEXTURE)
        ? scene.add.image(0, -2, SKIN_TEXTURE, `face-${unitSkinIndex(unitId)}`).setDisplaySize(52, 52)
        : null;
    if (this.figure) {
      if (this.sd) this.figure.setScale(Math.min(78 / this.figure.height, 72 / this.figure.width));
      this.baseScaleX = this.figure.scaleX;
      this.baseScaleY = this.figure.scaleY;
    }
    const name = createText(scene, metrics, 0, 27, abbreviation, {
      fontSize: '11px',
      fontStyle: 'bold',
      color: TEXT_COLORS.UNIT_NAME,
      backgroundColor: '#211a2b',
      padding: { x: 4, y: 1 },
    }).setOrigin(0.5);
    const stars = createText(scene, metrics, 0, LAYOUT.STAR_Y, '★'.repeat(star), {
      fontSize: '10px',
      color: TEXT_COLORS.STAR,
    }).setOrigin(0.5);
    this.container = scene.add.container(0, 0, this.figure ? [this.gfx, this.figure, name, stars] : [this.gfx, name, stars]).setDepth(10);
  }

  attack(time: number, dx: number, dy: number): void {
    if (time <= this.attackAt) return;
    this.attackAt = time;
    const distance = Math.hypot(dx, dy) || 1;
    this.attackX = dx / distance;
    this.attackY = dy / distance;
  }

  hit(time: number): void { this.hitAt = Math.max(time, this.hitAt); }
  skill(time: number): void { this.skillAt = Math.max(time, this.skillAt); }

  update(view: UnitView, time: number, combatActive = true): void {
    if (!combatActive) {
      this.attackAt = -Infinity;
      this.hitAt = -Infinity;
      this.skillAt = -Infinity;
    }
    const alpha = this.alphaOf(view, time);
    this.container.setVisible(alpha > 0);
    if (alpha <= 0) return;
    this.container.setAlpha(alpha);
    const p = this.layout.center(view.pos.col, view.pos.row);
    this.container.setPosition(p.x, p.y);
    // 죽은 유닛은 살아 있는 유닛 아래에 깔리게 한다
    this.container.setDepth(view.alive ? 10 + view.uid * 0.001 : 5);

    this.drawBody(view);
    this.animate(view, time);
    this.syncBadges(view);
  }

  private animate(view: UnitView, time: number): void {
    if (!this.figure || !this.sd) return;
    const stunned = view.statuses.some((s) => s.name === 'stun');
    const moving = view.alive && !stunned && view.moveProgress > 0 && view.moveProgress < 1;
    const step = moving ? Math.sin(view.moveProgress * Math.PI * 4) : 0;
    const idle = view.alive && !stunned ? Math.sin(time * 3 + view.uid) * .65 : 0;
    const attackAge = time - this.attackAt;
    const lunge = view.alive && !stunned && attackAge >= 0 && attackAge < .28 ? Math.sin(attackAge / .28 * Math.PI) : 0;
    const hitAge = time - this.hitAt;
    const hurt = view.alive && hitAge >= 0 && hitAge < .18;
    const skillAge = time - this.skillAt;
    const surge = view.alive && skillAge >= 0 && skillAge < .45 ? Math.sin(skillAge / .45 * Math.PI) : 0;
    const death = !view.alive && view.deadAt !== null ? Math.min(1, Math.max(0, time - view.deadAt) / TIMING.DEATH_FADE) : 0;
    const direction = moving ? view.moveTo.col - view.moveFrom.col : lunge > 0 ? this.attackX : view.side === 0 ? 1 : -1;
    this.figure.setFlipX(direction < 0);
    this.figure.setPosition(
      this.attackX * lunge * 13 + (hurt ? Math.sin(hitAge * 100) * 2 : 0),
      -7 - Math.abs(step) * 4 - idle + this.attackY * lunge * 8 - surge * 6 + death * 14,
    );
    this.figure.setRotation(step * .06 + lunge * .12 * Math.sign(this.attackX) + death * .9);
    this.figure.setScale(this.baseScaleX * (1 + lunge * .08 + surge * .1), this.baseScaleY * (1 - Math.abs(step) * .035 + surge * .1));
    if (hurt) this.figure.setTintFill(0xffcfdf);
    else if (stunned) this.figure.setTint(0xc0adc9);
    else this.figure.clearTint();
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

    g.fillStyle(ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, this.sd ? .16 : 1);
    g.lineStyle(3, stunned ? 0xffd54a : burning ? 0xff8a3d : ally ? COLORS.ALLY_UNIT : COLORS.ENEMY_UNIT, 1);
    if (this.sd) {
      // Ground markers identify sides without enclosing the full-body character.
      g.fillEllipse(0, 26, 58, 17);
      if (ally) g.strokeEllipse(0, 26, 58, 17);
      else g.strokeTriangle(-29, 30, 29, 30, 0, 13);
    } else if (ally) {
      const r = LAYOUT.UNIT_RADIUS;
      g.fillRoundedRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4, 9);
      g.strokeRoundedRect(-r - 2, -r - 2, r * 2 + 4, r * 2 + 4, 9);
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
    });
    for (let i = badges.length; i < this.badgeTexts.length; i++) this.badgeTexts[i]?.setVisible(false);
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
