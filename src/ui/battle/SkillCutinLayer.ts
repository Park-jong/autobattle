import Phaser from 'phaser';
import { createText, visibleStageInset, type HiDpiMetrics } from '../hidpi';
import type { ReplayEffect, UnitView } from '../replay/ReplayState';
import { STAGE, TIMING } from '../theme';
import { appSkin } from '../skin/SkinStore';
import { isIllustratedSkin, unitSkinName, unitSkillName, unitTextureKey } from '../skin/skins';
import { MODERN_UNITS } from '../skin/modernRoster';
import { activeSkillCutins } from './skillCutin';

interface CutinPanel {
  aura: Phaser.GameObjects.Image;
  art: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  skill: Phaser.GameObjects.Text;
}

/** 전투 시각만 사용하므로 정지·배속·되감기에도 컷인이 전투와 함께 움직인다. */
export class SkillCutinLayer {
  private readonly backdrop: Phaser.GameObjects.Graphics;
  private readonly sparks: Phaser.GameObjects.Graphics;
  private readonly panels = new Map<number, CutinPanel>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly unitName: (id: string) => string,
  ) {
    this.backdrop = scene.add.graphics().setDepth(32);
    this.sparks = scene.add.graphics().setDepth(35);
  }

  clear(): void {
    this.backdrop.clear();
    this.sparks.clear();
    for (const panel of this.panels.values()) {
      panel.aura.setVisible(false);
      panel.art.setVisible(false);
      panel.name.setVisible(false);
      panel.skill.setVisible(false);
    }
  }

  update(time: number, effects: readonly ReplayEffect[], views: ReadonlyMap<number, UnitView>, reduced: boolean): void {
    this.clear();
    const skin = appSkin.current;
    // 지휘관 궁극기가 겹칠 때는 궁극기를 우선한다. 축소 설정에서는 기존 유닛 위 이름만 유지한다.
    if (reduced || !isIllustratedSkin(skin) || effects.some(e => e.kind === 'ultimate' && time >= e.t && time - e.t < 1.25)) return;
    const active = activeSkillCutins(time, effects, views).filter(e => {
      const key = unitTextureKey(skin, views.get(e.unit)!.unitId, 'illustration');
      return key !== null && this.scene.textures.exists(key);
    });
    if (!active.length) return;
    const strength = Math.max(...active.map(e => this.opacity((time - e.t) / TIMING.SKILL_CUTIN)));
    this.backdrop.fillStyle(0x060c19, 0.16 * strength).fillRect(0, 0, STAGE.WIDTH, STAGE.HEIGHT);
    const inset = visibleStageInset(this.scene);

    for (const event of active) {
      const unit = views.get(event.unit)!;
      const progress = (time - event.t) / TIMING.SKILL_CUTIN;
      const alpha = this.opacity(progress);
      const entrance = 1 - Math.pow(1 - Math.min(1, progress / 0.22), 3);
      const exit = Math.max(0, (progress - 0.7) / 0.3);
      const side = unit.side;
      const direction = side === 0 ? 1 : -1;
      const anchor = side === 0 ? inset + 164 : STAGE.WIDTH - inset - 164;
      const x = anchor - direction * (1 - entrance) * 90 + direction * exit * 28;
      const colorHex = skin === 'modern' ? MODERN_UNITS[unit.unitId]?.color : undefined;
      const color = colorHex ? Number.parseInt(colorHex.slice(1), 16) : side === 0 ? 0x86d5ff : 0xffab91;
      const key = unitTextureKey(skin, unit.unitId, 'illustration')!;
      const panel = this.panel(side, key);
      const source = this.scene.textures.get(key).getSourceImage();
      const scale = Math.min(310 / source.width, 450 / source.height);
      const width = source.width * scale;
      const height = source.height * scale;

      const edge = side === 0 ? inset : STAGE.WIDTH - inset;
      this.backdrop.fillStyle(0x071323, 0.78 * alpha);
      this.backdrop.fillPoints([
        { x: edge, y: 160 }, { x: edge + direction * 285, y: 160 },
        { x: edge + direction * 415, y: 635 }, { x: edge, y: 635 },
      ], true);
      this.backdrop.lineStyle(2, color, 0.5 * alpha);
      this.backdrop.lineBetween(edge + direction * 285, 160, edge + direction * 415, 635);
      this.backdrop.fillStyle(color, 0.08 * alpha);
      this.backdrop.fillTriangle(x - 130, 600, x + 130, 600, x, 185);

      panel.aura.setTexture(key).setDisplaySize(width + 9, height + 12).setPosition(x, 626)
        .setTintFill(color).setAlpha(alpha * (0.38 + 0.2 * (1 - progress))).setVisible(true);
      panel.art.setTexture(key).setDisplaySize(width, height).setPosition(x, 620).setAlpha(alpha).setVisible(true);
      const flash = Math.max(0, 1 - progress / 0.16);
      if (flash > 0.15) panel.art.setTint(0xdcefff);
      else panel.art.clearTint();

      // 단발성 참격과 몸을 따라 올라가는 빛 조각. 중앙 전장의 시야를 남겨 둔다.
      for (let i = 0; i < 7; i++) {
        const travel = (progress * 1.15 + i / 7) % 1;
        const px = x + Math.sin(i * 2.4) * (95 + i * 5);
        const py = 600 - travel * 410;
        this.sparks.fillStyle(color, alpha * (1 - travel) * 0.8);
        this.sparks.fillRect(px, py, 2, 9 + i % 3 * 5);
      }
      const slash = Math.max(0, 1 - Math.abs(progress - 0.29) / 0.17);
      this.sparks.lineStyle(3 + slash * 4, color, alpha * slash * 0.85);
      this.sparks.lineBetween(x - 135, 482, x + 160, 354);
      this.sparks.lineStyle(2, 0xffffff, alpha * slash);
      this.sparks.lineBetween(x - 135, 479, x + 160, 351);

      // 발끝 아래에 명패를 두고 긴 스킬명도 진영 영역 안에 맞춘다.
      this.sparks.fillStyle(0x07101d, alpha * 0.9).fillRect(anchor - 156, 633, 312, 71);
      this.sparks.lineStyle(2, color, alpha).lineBetween(anchor - 156, 633, anchor + 156, 633);
      panel.name.setText(`${side === 0 ? '아군' : '적군'} · ${unitSkinName(skin, unit.unitId, this.unitName(unit.unitId))}`)
        .setPosition(anchor, 644).setAlpha(alpha).setColor(`#${color.toString(16).padStart(6, '0')}`).setVisible(true);
      panel.skill.setText(unitSkillName(skin, unit.unitId, event.skill)).setPosition(anchor, 667).setAlpha(alpha).setVisible(true);
      panel.skill.setScale(Math.min(1, 286 / Math.max(1, panel.skill.width)));
    }
  }

  private opacity(progress: number): number {
    return Math.min(1, progress / 0.09, (1 - progress) / 0.25);
  }

  private panel(side: number, key: string): CutinPanel {
    let panel = this.panels.get(side);
    if (panel) return panel;
    const textStyle = { fontFamily: 'sans-serif', color: '#ffffff', fontStyle: 'bold', stroke: '#07101d', strokeThickness: 3 };
    panel = {
      aura: this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(33),
      art: this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(34),
      name: createText(this.scene, this.metrics, 0, 0, '', { ...textStyle, fontSize: '14px' }).setOrigin(0.5, 0).setDepth(36),
      skill: createText(this.scene, this.metrics, 0, 0, '', { ...textStyle, fontSize: '24px' }).setOrigin(0.5, 0).setDepth(36),
    };
    this.panels.set(side, panel);
    return panel;
  }
}
