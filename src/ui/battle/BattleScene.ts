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

  constructor(
    private readonly source: BattleViewSource,
    private readonly metrics: HiDpiMetrics,
    private readonly labels: SceneLabels,
  ) {
    super('BattleScene');
  }

  create(): void {
    applyHiDpiCamera(this, this.metrics);
    this.cameras.main.setBackgroundColor(COLORS.BACKGROUND);
    this.layout = new BoardLayout(LAYOUT.BOARD_X, LAYOUT.BOARD_Y, LAYOUT.CELL_SIZE);
    this.board = new BoardRenderer(this, this.layout, this.metrics);
    this.targetingOverlay = new TargetingOverlay(this, this.layout);
    this.effects = new EffectsLayer(this, this.metrics, this.layout, (id, upgraded) => this.labels.cardName(id, upgraded));

    this.timeText = createText(this, this.metrics, STAGE.WIDTH / 2, LAYOUT.TIME_Y, '', {
      fontSize: '34px',
      fontStyle: 'bold',
      color: TEXT_COLORS.TITLE,
    }).setOrigin(0.5);
    this.hintText = createText(this, this.metrics, 20, 20, '', { fontSize: '16px', color: TEXT_COLORS.MUTED });

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
    });
  }

  override update(_time: number, delta: number): void {
    this.source.advance(delta / 1000);
    const views = this.source.views();
    this.syncSprites(views);

    const time = this.source.time;
    const byUid = new Map<number, UnitView>();
    for (const view of views) {
      byUid.set(view.uid, view);
      this.sprites.get(view.uid)?.update(view, time);
    }
    this.effects.update(time, this.source.recentEffects(TIMING.EFFECT_WINDOW), byUid, this.source.telegraphs(), {
      meteors: this.source.meteors(),
      aura: this.source.ultimateAura(),
    }, { revives: this.source.reviveWatches(), zones: this.source.zones() });

    const targeting = this.source.targeting();
    this.targetingOverlay.update(targeting, byUid, performance.now());

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
        new UnitSprite(this, this.metrics, this.layout, this.labels.unitAbbreviation(view.unitId), view.star),
      );
    }
    this.effects.clear();
  }
}
