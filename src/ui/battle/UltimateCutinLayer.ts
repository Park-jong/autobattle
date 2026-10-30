import Phaser from 'phaser';
import { createText, visibleStageInset, type HiDpiMetrics } from '../hidpi';
import type { ReplayEffect, UnitView } from '../replay/ReplayState';
import { appSkin } from '../skin/SkinStore';
import { commanderProfile, commanderSkillName, commanderTextureKey, isIllustratedSkin } from '../skin/skins';
import { STAGE } from '../theme';
import type { BoardLayout } from './BoardLayout';
import { activeUltimate, ultimateEnvelope } from './ultimateVisuals';

/** 풀사이즈 원화와 시네마틱 프레임. 그래픽·텍스트를 재사용하고 전투 시각에 맞춰 그린다. */
export class UltimateCutinLayer {
  private readonly field: Phaser.GameObjects.Graphics;
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly accents: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private readonly quote: Phaser.GameObjects.Text;
  private art: Phaser.GameObjects.Image | null = null;
  private glow: Phaser.GameObjects.Image | null = null;

  constructor(private readonly scene: Phaser.Scene, metrics: HiDpiMetrics, private readonly layout: BoardLayout) {
    this.field = scene.add.graphics().setDepth(24);
    this.backdrop = scene.add.graphics().setDepth(43);
    this.accents = scene.add.graphics().setDepth(46);
    const style = { fontStyle: 'bold', color: '#ffffff', stroke: '#050b18', strokeThickness: 6 };
    this.label = createText(scene, metrics, 0, 0, '', { ...style, fontSize: '17px', letterSpacing: 4 }).setOrigin(0.5).setDepth(47);
    this.title = createText(scene, metrics, 0, 0, '', { ...style, fontSize: '56px', letterSpacing: 1 }).setOrigin(0.5).setDepth(47);
    this.quote = createText(scene, metrics, 0, 0, '', { ...style, fontSize: '19px', fontStyle: 'normal', strokeThickness: 3 }).setOrigin(0.5).setDepth(47);
    this.clear();
  }

  clear(): void {
    this.field.clear();
    this.backdrop.clear();
    this.accents.clear();
    this.title.setVisible(false);
    this.label.setVisible(false);
    this.quote.setVisible(false);
    this.art?.setVisible(false);
    this.glow?.setVisible(false);
  }

  update(time: number, effects: readonly ReplayEffect[], views: ReadonlyMap<number, UnitView>, reduced: boolean): void {
    this.clear();
    const event = activeUltimate(time, effects);
    if (!event) return;
    const skin = appSkin.current;
    const age = time - event.t;
    const { alpha, entrance, exit, burst, flash } = ultimateEnvelope(age);
    const profile = commanderProfile(skin, event.commanderId);
    const color = profile ? Number.parseInt(profile.color.slice(1), 16)
      : event.commanderId === 'cmd_harten' ? 0x83bfff : event.commanderId === 'cmd_nox' ? 0xc6a1ef : 0xf5a06d;
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const name = commanderSkillName(skin, event.commanderId, 'ultimate', event.name);
    const inset = visibleStageInset(this.scene);
    const width = STAGE.WIDTH - inset * 2;
    const center = STAGE.WIDTH / 2;

    if (reduced) {
      this.backdrop.fillStyle(0x07101d, 0.92 * alpha).fillRoundedRect(center - Math.min(250, width / 2 - 12), 76, Math.min(500, width - 24), 70, 10);
      this.title.setText(`✦ ${name} ✦`).setPosition(center, 111).setColor(hex).setScale(1).setAlpha(alpha).setVisible(true);
      this.fit(this.title, width - 60, 0.55);
      return;
    }

    this.drawField(event.commanderId, age, alpha, color, views);
    const g = this.backdrop, sparks = this.accents;
    // 중앙 무대를 가르는 사선 패널과 서서히 열리는 상하 레터박스.
    g.fillStyle(0x030916, 0.38 * alpha).fillRect(-12, -12, STAGE.WIDTH + 24, STAGE.HEIGHT + 24);
    g.fillStyle(0x030812, 0.84 * alpha).fillPoints([
      { x: inset - 16, y: 181 }, { x: STAGE.WIDTH - inset + 16, y: 139 },
      { x: STAGE.WIDTH - inset + 16, y: 523 }, { x: inset - 16, y: 575 },
    ], true);
    g.fillStyle(color, 0.1 * alpha).fillTriangle(inset, 575, inset + width * 0.53, 146, inset + width * 0.52, 575);
    const bars = 64 * entrance * (1 - exit);
    sparks.fillStyle(0x02050b, alpha * 0.96).fillRect(-12, -12, STAGE.WIDTH + 24, bars + 12)
      .fillRect(-12, STAGE.HEIGHT - bars, STAGE.WIDTH + 24, bars + 12);
    sparks.lineStyle(2, color, alpha * 0.8).lineBetween(inset, 181, STAGE.WIDTH - inset, 139)
      .lineBetween(inset, 575, STAGE.WIDTH - inset, 523);

    const artX = inset + width * 0.25 - (1 - entrance) * 120 - exit * 45;
    let key = commanderTextureKey(event.commanderId, skin, 'illustration');
    if (!this.scene.textures.exists(key)) key = commanderTextureKey(event.commanderId, skin);
    const hasArt = isIllustratedSkin(skin) && this.scene.textures.exists(key);
    if (hasArt) {
      if (!this.art) {
        this.glow = this.scene.add.image(0, 0, key).setDepth(44);
        this.art = this.scene.add.image(0, 0, key).setDepth(45);
      }
      const source = this.scene.textures.get(key).getSourceImage();
      const scale = Math.min(Math.min(375, width * 0.43) / source.width, 470 / source.height) * (1.06 - entrance * 0.06 + exit * 0.04);
      const artWidth = source.width * scale, artHeight = source.height * scale;
      this.glow!.setTexture(key).setDisplaySize(artWidth + 14, artHeight + 14).setPosition(artX - 4, 365)
        .setTintFill(color).setAlpha(alpha * 0.45).setVisible(true);
      this.art.setTexture(key).setDisplaySize(artWidth, artHeight).setPosition(artX, 360).setAlpha(alpha).clearTint().setVisible(true);
      if (flash > 0.05) this.art.setTint(0xe8efff);
    } else {
      this.emblem(sparks, event.commanderId, artX, 353, Math.min(110, width * 0.14), color, alpha, age);
    }

    // 고정된 시드의 광선·파편: 재생 위치를 옮겨도 같은 모양이다.
    for (let i = 0; i < 24; i++) {
      const phase = (age * (0.55 + i % 4 * 0.12) + i * 0.618) % 1;
      const y = 195 + (i * 83 % 325);
      const x = inset + phase * width;
      const length = 22 + i % 5 * 17;
      sparks.lineStyle(i % 3 === 0 ? 2 : 1, i % 4 === 0 ? 0xffffff : color, alpha * Math.sin(phase * Math.PI) * 0.5);
      sparks.lineBetween(x, y, x - length, y + length * 0.045);
    }
    if (age >= 0.22 && burst < 1) {
      sparks.lineStyle(3, color, (1 - burst) * alpha * 0.65);
      sparks.strokeCircle(artX, 360, 40 + burst * width * 0.75);
      sparks.lineStyle(1, 0xffffff, (1 - burst) * alpha * 0.55);
      sparks.strokeCircle(artX, 360, 25 + burst * width * 0.62);
    }

    const textX = inset + width * (hasArt ? 0.70 : 0.66) + (1 - entrance) * 95 + exit * 30;
    const textWidth = width * 0.49;
    this.label.setText('✦  U L T I M A T E  ✦').setPosition(textX, 272).setColor(hex).setScale(1).setAlpha(alpha).setVisible(true);
    this.fit(this.label, textWidth, 1);
    this.title.setText(name).setPosition(textX, 340).setColor('#fff7e9').setScale(1).setAlpha(alpha).setVisible(true);
    this.fit(this.title, textWidth, 1 + Math.max(0, 1 - Math.abs(age - 0.24) / 0.14) * 0.12);
    this.quote.setText(profile?.quote ?? '전장의 흐름을 바꿀 단 한 번의 명령.').setPosition(textX, 411).setColor('#d6e1f0').setScale(1).setAlpha(alpha * 0.9).setVisible(true);
    this.fit(this.quote, textWidth, 1);
    sparks.lineStyle(2, color, alpha * 0.8).lineBetween(textX - textWidth * 0.42, 383, textX + textWidth * 0.42, 383);
    sparks.fillStyle(color, alpha).fillTriangle(textX - 5, 383, textX, 378, textX + 5, 383)
      .fillTriangle(textX - 5, 383, textX, 388, textX + 5, 383);
    // 단발성 낮은 강도의 섬광만 사용한다.
    if (flash > 0) sparks.fillStyle(0xfff3df, flash).fillRect(-12, -12, STAGE.WIDTH + 24, STAGE.HEIGHT + 24);
  }

  private fit(text: Phaser.GameObjects.Text, width: number, max: number): void {
    text.setScale(Math.min(max, width / Math.max(1, text.width)));
  }

  private emblem(g: Phaser.GameObjects.Graphics, id: string, x: number, y: number, r: number, color: number, alpha: number, age: number): void {
    g.lineStyle(3, color, alpha);
    if (id === 'cmd_harten') {
      g.strokePoints([{ x: x - r * 0.7, y: y - r * 0.65 }, { x: x + r * 0.7, y: y - r * 0.65 },
        { x: x + r * 0.6, y: y + r * 0.35 }, { x, y: y + r }, { x: x - r * 0.6, y: y + r * 0.35 }], true);
      g.lineBetween(x, y - r * 0.4, x, y + r * 0.6).lineBetween(x - r * 0.4, y - r * 0.05, x + r * 0.4, y - r * 0.05);
    } else {
      g.strokeCircle(x, y, r);
      const count = id === 'cmd_nox' ? 6 : 8;
      const points = Array.from({ length: count }, (_, i) => {
        const a = i * Math.PI * 2 / count + age * 0.35;
        return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
      });
      g.strokePoints(points, true);
      for (const p of points) g.lineBetween(x, y, p.x, p.y);
    }
  }

  private drawField(id: string, age: number, alpha: number, color: number, views: ReadonlyMap<number, UnitView>): void {
    const g = this.field;
    const progress = Math.min(1, age / 1.4);
    const center = { x: this.layout.originX + this.layout.width / 2, y: this.layout.originY + this.layout.height / 2 };
    g.lineStyle(7 * (1 - progress) + 1, color, (1 - progress) * 0.85);
    g.strokeEllipse(center.x, center.y, 60 + progress * this.layout.width * 1.3, 25 + progress * this.layout.height * 1.4);
    if (id === 'cmd_isera') return; // 실제 운석 궤적과 착탄은 EffectsLayer에서 표시한다.
    for (const view of views.values()) {
      if (!view.alive || view.side !== 0) continue;
      const p = this.layout.center(view.pos.col, view.pos.row);
      const rise = 1 - Math.pow(1 - Math.min(1, age / 0.35), 3);
      g.fillStyle(color, 0.08 * alpha).fillEllipse(p.x, p.y + 22, 84, 30);
      if (id === 'cmd_harten') {
        this.emblem(g, id, p.x, p.y - 10 - rise * 14, 37, color, alpha * 0.8, 0);
      } else {
        g.lineStyle(2, color, alpha * 0.8).strokeEllipse(p.x, p.y + 20, 90, 35);
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 - age * 1.4;
          const x = p.x + Math.cos(a) * 43, y = p.y + 20 + Math.sin(a) * 17;
          g.lineBetween(x, y, x, y - 18 - rise * 36);
          g.fillStyle(0xeee1ff, alpha * 0.7).fillCircle(x, y - 18 - rise * 36, 2);
        }
      }
    }
  }
}
