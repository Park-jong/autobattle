import Phaser from 'phaser';
import { COMBAT } from '../../core/combat';
import type { Cell } from '../../core/combat';
import type { BattleViewSource } from '../debug/contracts';
import { applyHiDpiCamera, createText, type HiDpiMetrics } from '../hidpi';
import type { UnitView } from '../replay/ReplayState';
import { COLORS, LAYOUT, STAGE, TEXT_COLORS, TIMING } from '../theme';
import { BoardLayout } from './BoardLayout';
import { BoardRenderer } from './BoardRenderer';
import { EffectsLayer } from './EffectsLayer';
import { TargetingOverlay } from './TargetingOverlay';
import { UnitSprite } from './UnitSprite';
import { CharacterMoments } from './CharacterMoments';
import { CharacterMomentsState } from './CharacterMomentsState';
import { AGENTS, selectedAgent, SKIN_ATLAS_URL, SKIN_EVENT, SKIN_TEXTURE, SD_ATLAS_URL, SD_TEXTURE } from '../skin';

/** 씬이 화면에 쓸 이름을 얻는 창구 (데이터 카탈로그를 직접 알 필요가 없게) */
export interface SceneLabels {
  /** 유닛 id → 화면에 쓸 이름 약자 */
  unitAbbreviation(unitId: string): string;
  /** 카드 id → 카드 이름 (강화면 + 표기) */
  cardName(cardId: string, upgraded: boolean): string;
}

/**
 * 전투 화면 씬. 재생 상태(BattleViewSource)만 보고 그리며, 입력은 게임 좌표 포인터 이벤트로 세션에 전달한다
 * (어떤 칸·유닛을 눌렀는지는 세션이 보간 위치 기준으로 판정). 패널(DOM)과는 직접 통신하지 않는다.
 */
export class BattleScene extends Phaser.Scene {
  private layout!: BoardLayout;
  private board!: BoardRenderer;
  private effects!: EffectsLayer;
  private targetingOverlay!: TargetingOverlay;
  private timeText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private sprites = new Map<number, UnitSprite>();
  private signature = '';
  private hoverCell: Cell | null = null;
  private moments!: CharacterMoments;
  private readonly momentsState = new CharacterMomentsState();

  constructor(
    private readonly source: BattleViewSource,
    private readonly metrics: HiDpiMetrics,
    private readonly labels: SceneLabels,
  ) {
    super('BattleScene');
  }

  preload(): void {
    this.load.image(SKIN_TEXTURE, SKIN_ATLAS_URL);
    this.load.image(SD_TEXTURE, SD_ATLAS_URL);
  }

  create(): void {
    applyHiDpiCamera(this, this.metrics);
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    if (this.textures.exists(SD_TEXTURE)) {
      const texture = this.textures.get(SD_TEXTURE);
      const image = texture.getSourceImage() as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context?.drawImage(image, 0, 0);
      const pixels = context?.getImageData(0, 0, image.width, image.height).data;
      for (let i = 0; i < AGENTS.length; i++) {
        const left = Math.round((i % 3) * image.width / 3);
        const top = Math.round(Math.floor(i / 3) * image.height / 2);
        const right = Math.round(((i % 3) + 1) * image.width / 3);
        const bottom = Math.round((Math.floor(i / 3) + 1) * image.height / 2);
        let minX = right, minY = bottom, maxX = left, maxY = top;
        // Trim transparent cell margins in memory so every agent has the same on-board height.
        if (pixels) for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
          if (pixels[(y * image.width + x) * 4 + 3]! < 32) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        if (minX <= maxX && minY <= maxY) texture.add(`agent-${i}`, 0, minX, minY, maxX - minX + 1, maxY - minY + 1);
        else texture.add(`agent-${i}`, 0, left, top, right - left, bottom - top);
      }
    }
    this.createAgentArt();
    this.layout = new BoardLayout(LAYOUT.BOARD_X, LAYOUT.BOARD_Y, LAYOUT.CELL_SIZE);
    this.board = new BoardRenderer(this, this.layout, this.metrics);
    this.targetingOverlay = new TargetingOverlay(this, this.layout);
    this.effects = new EffectsLayer(this, this.metrics, this.layout, (id, upgraded) => this.labels.cardName(id, upgraded));
    this.moments = new CharacterMoments(this, this.metrics, this.layout);

    this.timeText = createText(this, this.metrics, STAGE.WIDTH / 2, LAYOUT.TIME_Y, '', {
      fontSize: '25px',
      fontStyle: 'bold',
      color: TEXT_COLORS.TITLE,
    }).setOrigin(0.5);
    this.hintText = createText(this, this.metrics, STAGE.WIDTH / 2, 75, '', { fontSize: '12px', color: TEXT_COLORS.MUTED }).setOrigin(0.5);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const world = this.worldOf(p);
      this.hoverCell = this.layout.cellAt(world.x, world.y);
      this.source.pointerMoved(world.x, world.y);
    });
    this.input.on('gameout', () => {
      this.hoverCell = null;
      this.source.pointerLeft();
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const world = this.worldOf(p);
      this.source.pointerMoved(world.x, world.y);
      this.source.pointerDown(world.x, world.y, p.rightButtonDown());
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.effects.clear();
      this.targetingOverlay.clear();
      this.moments.destroy();
      this.momentsState.clear();
    });
  }

  private createAgentArt(): void {
    if (!this.textures.exists(SKIN_TEXTURE)) return;
    const texture = this.textures.get(SKIN_TEXTURE);
    const source = texture.getSourceImage() as HTMLImageElement;
    const panelWidth = source.width / AGENTS.length;
    for (let i = 0; i < AGENTS.length; i++) {
      const x = Math.round(i * panelWidth);
      const width = Math.round((i + 1) * panelWidth) - x;
      texture.add(`portrait-${i}`, 0, x, 0, width, source.height);
      texture.add(`face-${i}`, 0, x, Math.round(source.height * .015), width, Math.min(width, Math.floor(source.height * .53)));
    }
    const agent = selectedAgent();
    const left = this.add.image(110, 368, SKIN_TEXTURE, `portrait-${agent}`).setDisplaySize(204, 470).setAlpha(.9).setDepth(-3);
    this.add.image(1170, 368, SKIN_TEXTURE, 'portrait-5').setDisplaySize(204, 470).setAlpha(.65).setDepth(-3);
    const shades = this.add.graphics().setDepth(-2);
    shades.fillGradientStyle(COLORS.BACKGROUND, COLORS.BACKGROUND, COLORS.BACKGROUND, COLORS.BACKGROUND, 0, 0, 1, 1);
    shades.fillRect(8, 350, 204, 255);
    shades.fillRect(1068, 350, 204, 255);
    shades.lineStyle(1, 0x7d5b78, .5);
    shades.strokeRect(8, 133, 204, 470);
    shades.strokeRect(1068, 133, 204, 470);
    const name = createText(this, this.metrics, 22, 530, AGENTS[agent]!.english, { fontSize: '31px', fontStyle: 'bold', color: '#f3d8ee' }).setDepth(-1);
    const subtitle = createText(this, this.metrics, 22, 571, AGENTS[agent]!.role, { fontSize: '10px', color: '#c7a3c3' }).setDepth(-1);
    createText(this, this.metrics, 22, 610, 'PERSONNEL / ALLIED', { fontSize: '10px', color: '#8e7799' });
    createText(this, this.metrics, 1080, 530, 'RAVEN', { fontSize: '31px', fontStyle: 'bold', color: '#efb7cb' }).setDepth(-1);
    createText(this, this.metrics, 1080, 571, 'HOSTILE / NIGHT DIVISION', { fontSize: '10px', color: '#b18b9e' }).setDepth(-1);
    createText(this, this.metrics, 1080, 610, 'THREAT LEVEL / HIGH', { fontSize: '10px', color: '#8e7799' });
    const onChange = (event: Event): void => {
      const index = (event as CustomEvent<number>).detail;
      const skin = AGENTS[index];
      if (!skin) return;
      left.setTexture(SKIN_TEXTURE, `portrait-${index}`);
      name.setText(skin.english);
      subtitle.setText(skin.role);
    };
    window.addEventListener(SKIN_EVENT, onChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener(SKIN_EVENT, onChange));
  }

  override update(_time: number, delta: number): void {
    this.source.advance(delta / 1000);
    const views = this.source.views();
    this.syncSprites(views);

    const time = this.source.time;
    const byUid = new Map<number, UnitView>();
    for (const view of views) byUid.set(view.uid, view);
    const effects = this.source.recentEffects(TIMING.EFFECT_WINDOW);
    for (const effect of effects) {
      if (effect.kind === 'attack') {
        const from = byUid.get(effect.unit);
        const target = byUid.get(effect.target);
        if (from && target) this.sprites.get(effect.unit)?.attack(effect.t, target.pos.col - from.pos.col, target.pos.row - from.pos.row);
      } else if (effect.kind === 'damage') {
        this.sprites.get(effect.unit)?.hit(effect.t);
      } else if (effect.kind === 'skill') {
        this.sprites.get(effect.unit)?.skill(effect.t);
      }
    }
    for (const view of views) this.sprites.get(view.uid)?.update(view, time, this.source.phase !== 'edit');
    const targeting = this.source.targeting();
    this.momentsState.update({
      phase: this.source.phase,
      combatTime: time,
      delta: delta / 1000,
      timeScale: this.source.timeScale,
      views,
      effects,
    });
    const hiddenSkillLabels = new Set(this.momentsState.bubbles.map((bubble) => bubble.uid));
    if (this.momentsState.cutIn && !targeting.active) hiddenSkillLabels.add(this.momentsState.cutIn.uid);
    this.effects.update(time, effects, byUid, hiddenSkillLabels);
    this.targetingOverlay.update(targeting, byUid, performance.now());
    this.moments.update(this.momentsState, byUid, targeting.active);

    const editing = this.source.phase === 'edit';
    const hover =
      editing && !targeting.active && this.hoverCell
        ? { cell: this.hoverCell, valid: this.source.canPlaceAt(this.hoverCell) }
        : null;
    this.board.drawDynamic(this.source.overheating, hover);
    this.updateTexts(editing, time, targeting.hint);
  }

  private updateTexts(editing: boolean, time: number, targetHint: string): void {
    if (editing) {
      this.timeText.setText(this.source.prepping ? '준비 단계' : '편성 중').setColor(TEXT_COLORS.MUTED);
      this.hintText.setText(targetHint || (this.source.canPlaceAt({ col: 0, row: 0 }) ? '좌클릭: 배치 / 우클릭: 제거' : ''));
      return;
    }
    const overheat = this.source.overheating ? '  [과열]' : '';
    this.timeText
      .setText(`전투 시각 ${time.toFixed(1)}초 / ${COMBAT.HARD_LIMIT_SECONDS}초${overheat}`)
      .setColor(this.source.overheating ? TEXT_COLORS.OVERHEAT : TEXT_COLORS.TITLE);
    this.hintText.setText(targetHint || this.speedNote());
  }

  /** 슬로모션/정지 중이면 현재 배율을 알려준다 */
  private speedNote(): string {
    if (this.source.phase !== 'playing') return '';
    const scale = this.source.timeScale;
    if (scale === 0) return '시간 정지 (카드 선택 중)';
    return scale < 1 ? `슬로모션 ×${scale.toFixed(2)}` : '';
  }

  /** 포인터 화면 좌표 → 카메라(줌) 역변환 → 게임 좌표 */
  private worldOf(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return this.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  /** 화면에 있어야 할 유닛 목록이 바뀌면(편성 편집·새 전투) 스프라이트를 다시 만든다. */
  private syncSprites(views: readonly UnitView[]): void {
    const signature = views.map((v) => `${v.uid}:${v.unitId}:${v.star}:${v.side}`).join('|');
    if (signature === this.signature) return;
    this.signature = signature;
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    for (const view of views) {
      this.sprites.set(
        view.uid,
        new UnitSprite(this, this.metrics, this.layout, this.labels.unitAbbreviation(view.unitId), view.star, view.unitId),
      );
    }
    this.effects.clear();
  }
}
