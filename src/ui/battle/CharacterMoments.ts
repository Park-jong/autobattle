import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { UnitView } from '../replay/ReplayState';
import { AGENTS, SKIN_TEXTURE, unitSkinIndex, unitSkinName } from '../skin';
import { STAGE } from '../theme';
import type { BoardLayout } from './BoardLayout';
import { CharacterMomentsState, type SkillCutIn, type SpeechBubble } from './CharacterMomentsState';

interface BubbleObject {
  container: Phaser.GameObjects.Container;
  graphics: Phaser.GameObjects.Graphics;
  width: number;
  height: number;
}

/** Non-interactive canvas overlays; no timers, tweens or changes to battle state. */
export class CharacterMoments {
  private readonly bubbles = new Map<number, BubbleObject>();
  private readonly cutIn: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly portrait: Phaser.GameObjects.Image | null;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly agentName: Phaser.GameObjects.Text;
  private readonly skillName: Phaser.GameObjects.Text;
  private readonly quote: Phaser.GameObjects.Text;
  private readonly live: HTMLElement | null;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private cutInId = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly layout: BoardLayout,
  ) {
    this.live = document.getElementById('character-live');
    this.panel = scene.add.graphics();
    this.portrait = scene.textures.exists(SKIN_TEXTURE)
      ? scene.add.image(24, 78, SKIN_TEXTURE, 'portrait-0').setOrigin(0).setDisplaySize(270, 540)
      : null;
    const shade = scene.add.graphics();
    shade.fillGradientStyle(0x17121e, 0x17121e, 0x17121e, 0x17121e, 0, 0, 1, 1);
    shade.fillRect(18, 404, 362, 222);
    this.tag = createText(scene, metrics, 36, 98, '', { fontSize: '12px', fontStyle: 'bold', backgroundColor: '#1b1524', padding: { x: 8, y: 5 } });
    this.agentName = createText(scene, metrics, 36, 463, '', { fontSize: '34px', fontStyle: 'bold', color: '#fff1fc' });
    this.skillName = createText(scene, metrics, 36, 512, '', { fontSize: '25px', fontStyle: 'bold', color: '#f3c4de', wordWrap: { width: 330 } });
    this.quote = createText(scene, metrics, 36, 566, '', { fontSize: '17px', color: '#e4d2e8', wordWrap: { width: 330 } });
    const children: Phaser.GameObjects.GameObject[] = [this.panel];
    if (this.portrait) children.push(this.portrait);
    children.push(shade, this.tag, this.agentName, this.skillName, this.quote);
    this.cutIn = scene.add.container(0, 0, children).setDepth(70).setVisible(false);
  }

  update(state: CharacterMomentsState, views: ReadonlyMap<number, UnitView>, hideCutIn: boolean): void {
    const active = new Set<number>();
    const occupied: Phaser.Geom.Rectangle[] = [];
    const announcements: string[] = [];
    for (const speech of state.bubbles) {
      const actor = views.get(speech.uid);
      if (!actor?.alive) continue;
      active.add(speech.id);
      let bubble = this.bubbles.get(speech.id);
      if (!bubble) {
        bubble = this.makeBubble(speech, actor);
        this.bubbles.set(speech.id, bubble);
        announcements.push(`${unitSkinName(actor.unitId)}: ${speech.text}`);
      }
      const point = this.layout.center(actor.pos.col, actor.pos.row);
      let x = Phaser.Math.Clamp(point.x - bubble.width / 2, 12, STAGE.WIDTH - bubble.width - 12);
      let y = Math.max(8, point.y - bubble.height - 72);
      let bounds = new Phaser.Geom.Rectangle(x - 5, y - 5, bubble.width + 10, bubble.height + 10);
      if (occupied.some((other) => Phaser.Geom.Intersects.RectangleToRectangle(bounds, other))) {
        y = Math.max(8, y - bubble.height - 14);
        x = Phaser.Math.Clamp(x + (actor.side === 0 ? -35 : 35), 12, STAGE.WIDTH - bubble.width - 12);
        bounds = new Phaser.Geom.Rectangle(x, y, bubble.width, bubble.height);
      }
      occupied.push(bounds);
      const alpha = this.envelope(state.now - speech.at, speech.duration);
      bubble.container.setPosition(x, y).setAlpha(alpha);
      const color = Phaser.Display.Color.HexStringToColor(AGENTS[unitSkinIndex(actor.unitId)]!.color).color;
      const g = bubble.graphics;
      g.clear();
      g.fillStyle(0x05030a, .25);
      g.fillRoundedRect(2, 4, bubble.width, bubble.height, 10);
      g.fillStyle(actor.side === 0 ? 0xf7effb : 0xffedf2, .97);
      g.fillRoundedRect(0, 0, bubble.width, bubble.height, 10);
      g.lineStyle(2, color, 1);
      g.strokeRoundedRect(0, 0, bubble.width, bubble.height, 10);
      const tail = Phaser.Math.Clamp(point.x - x, 16, bubble.width - 16);
      g.fillTriangle(tail - 7, bubble.height - 1, tail + 7, bubble.height - 1, tail, bubble.height + 9);
    }
    for (const [id, bubble] of this.bubbles) {
      if (active.has(id)) continue;
      bubble.container.destroy();
      this.bubbles.delete(id);
    }

    const cue = state.cutIn;
    this.cutIn.setVisible(cue !== null && !hideCutIn);
    if (cue) {
      if (cue.id !== this.cutInId) {
        this.showCutIn(cue);
        this.cutInId = cue.id;
        announcements.push(`${unitSkinName(cue.unitId)} · ${cue.skill}! ${cue.text}`);
      }
      const age = state.now - cue.at;
      const entry = this.reducedMotion ? 1 : Phaser.Math.Easing.Cubic.Out(Math.min(1, age / .22));
      const anchor = cue.side === 0 ? 4 : STAGE.WIDTH - 396;
      this.cutIn.setPosition(anchor + (cue.side === 0 ? -65 : 65) * (1 - entry), 0).setAlpha(this.envelope(age, cue.duration));
    } else this.cutInId = -1;
    if (announcements.length && this.live) this.live.textContent = announcements.join(' / ');
    else if (!state.bubbles.length && !cue && this.live) this.live.textContent = '';
  }

  clear(): void {
    for (const bubble of this.bubbles.values()) bubble.container.destroy();
    this.bubbles.clear();
    this.cutIn.setVisible(false);
    this.cutInId = -1;
    if (this.live) this.live.textContent = '';
  }

  destroy(): void {
    this.clear();
    this.cutIn.destroy();
  }

  private makeBubble(speech: SpeechBubble, actor: UnitView): BubbleObject {
    const graphics = this.scene.add.graphics();
    const name = createText(this.scene, this.metrics, 12, 6, unitSkinName(actor.unitId), { fontSize: '11px', fontStyle: 'bold', color: '#815c83' });
    const text = createText(this.scene, this.metrics, 12, 23, speech.text, { fontSize: '17px', color: '#2b2032', wordWrap: { width: 190, useAdvancedWrap: true } });
    const width = Math.max(110, Math.ceil(text.width) + 24);
    const height = Math.ceil(text.height) + 34;
    const container = this.scene.add.container(0, 0, [graphics, name, text]).setDepth(65);
    return { container, graphics, width, height };
  }

  private showCutIn(cue: SkillCutIn): void {
    const index = unitSkinIndex(cue.unitId);
    const agent = AGENTS[index]!;
    const color = Phaser.Display.Color.HexStringToColor(agent.color).color;
    const g = this.panel;
    g.clear();
    g.fillStyle(0x100c18, .94);
    g.fillPoints([{ x: 10, y: 65 }, { x: 309, y: 65 }, { x: 391, y: 632 }, { x: 10, y: 632 }], true);
    g.lineStyle(1, color, .8);
    g.strokeRect(22, 76, 274, 544);
    g.fillStyle(color, 1);
    g.fillRect(22, 66, 274, 3);
    g.lineStyle(2, color, .3);
    g.lineBetween(300, 112, 350, 456);
    g.lineBetween(311, 112, 361, 456);
    g.lineStyle(1, color, .8);
    g.lineBetween(36, 506, 365, 506);
    this.portrait?.setTexture(SKIN_TEXTURE, `portrait-${index}`);
    this.tag.setText(cue.side === 0 ? 'SKILL ACTIVATION // ALLIED' : 'SKILL ACTIVATION // HOSTILE').setColor(agent.color);
    this.agentName.setText(`${agent.english} / ${agent.name}`);
    this.skillName.setText(cue.skill).setColor(agent.color);
    this.quote.setText(`“${cue.text}”`);
  }

  private envelope(age: number, duration: number): number {
    if (this.reducedMotion) return age < duration ? 1 : 0;
    return Phaser.Math.Clamp(Math.min(age / .16, (duration - age) / .3), 0, 1);
  }
}
