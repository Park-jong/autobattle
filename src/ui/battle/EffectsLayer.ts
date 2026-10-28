import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { MeteorView, ReplayEffect, TelegraphView, UltimateAuraView, UnitView } from '../replay/ReplayState';
import { BOARD_COLS, BOARD_ROWS } from '../../core/combat/board';
import { COLORS, LAYOUT, MOTION, STAGE, TEXT_COLORS, TIMING } from '../theme';
import type { BoardLayout } from './BoardLayout';

interface PooledText {
  text: Phaser.GameObjects.Text;
}

/** CP 변화 이유 → 표시용 한국어 */
const CP_REASON_LABELS = { start: '시작', regen: '회복', card: '카드', abyss: '심연', effect: '카드 효과' } as const;

/** 궁극기 연출 입력: 떨어지는 운석과 지속 효과 표시 */
export interface UltimateVisuals {
  meteors: readonly MeteorView[];
  aura: UltimateAuraView | null;
}

const NO_ULTIMATE: UltimateVisuals = { meteors: [], aura: null };

/** 지휘관별 지속 효과 색 */
function auraColor(commanderId: string): number {
  if (commanderId === 'cmd_harten') return COLORS.ULTIMATE_AURA_HARTEN;
  if (commanderId === 'cmd_nox') return COLORS.ULTIMATE_AURA_NOX;
  return COLORS.ULTIMATE_AURA_DEFAULT;
}

/** 카드 id → 화면에 보일 카드 이름 */
export type CardNamer = (cardId: string, upgraded: boolean) => string;

/**
 * 짧게 보이는 연출: 공격 선/플래시, 피해·회복 숫자, 스킬 이름, 과열 배너,
 * 카드 사용 배너·대상 펄스, 진형 교대 이동선, CP 변화 표시.
 * 전투 시간 기준으로 매 프레임 다시 계산하므로 일시정지·배속·슬로모션을 그대로 따른다.
 */
export class EffectsLayer {
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly texts = new Map<number, PooledText>();
  private readonly banner: Phaser.GameObjects.Text;
  private readonly cardBanner: Phaser.GameObjects.Text;
  private readonly telegraphLabel: Phaser.GameObjects.Text;
  private readonly ultimateBanner: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly metrics: HiDpiMetrics,
    private readonly layout: BoardLayout,
    private readonly cardName: CardNamer,
  ) {
    this.lines = scene.add.graphics().setDepth(20);
    this.banner = createText(scene, metrics, STAGE.WIDTH / 2, 84, '과열 시작! 받는 피해 증가', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: TEXT_COLORS.OVERHEAT,
      stroke: '#000000',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
    this.cardBanner = createText(scene, metrics, STAGE.WIDTH / 2, LAYOUT.CARD_BANNER_Y, '', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: TEXT_COLORS.CARD_BANNER,
      stroke: '#000000',
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setDepth(41)
      .setVisible(false);
    this.ultimateBanner = createText(scene, metrics, STAGE.WIDTH / 2, 118, '', {
      fontSize: '30px',
      fontStyle: 'bold',
      color: TEXT_COLORS.ULTIMATE,
      stroke: '#000000',
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setDepth(42)
      .setVisible(false);
    this.telegraphLabel = createText(scene, metrics, 0, 0, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: TEXT_COLORS.OVERHEAT,
      stroke: '#000000',
      strokeThickness: 4,
    })
      .setOrigin(0.5)
      .setDepth(25)
      .setVisible(false);
  }

  update(
    time: number,
    effects: readonly ReplayEffect[],
    views: ReadonlyMap<number, UnitView>,
    telegraphs: readonly TelegraphView[] = [],
    ultimate: UltimateVisuals = NO_ULTIMATE,
  ): void {
    this.lines.clear();
    let ultimateText: { text: string; alpha: number } | null = null;
    const live = new Set<number>();
    let bannerAlpha = 0;
    let cardBannerText: { text: string; alpha: number } | null = null;

    for (const e of effects) {
      const age = time - e.t;
      switch (e.kind) {
        case 'attack':
          if (age <= TIMING.ATTACK_LINE) this.drawAttack(e, age, views);
          break;
        case 'damage': {
          if (age > TIMING.DAMAGE_TEXT) break;
          const physical = e.dmgType === 'physical';
          this.showFloating(e.seq, live, e.unit, views, `-${e.amount}`, physical ? TEXT_COLORS.PHYSICAL : TEXT_COLORS.MAGIC, age / TIMING.DAMAGE_TEXT, {
            lift: MOTION.DAMAGE_RISE_PX,
            baseY: -62,
            jitter: ((e.seq % 5) - 2) * 9,
            size: '22px',
          });
          break;
        }
        case 'heal':
          if (age > TIMING.HEAL_TEXT) break;
          this.showFloating(e.seq, live, e.unit, views, `+${e.amount}`, TEXT_COLORS.HEAL, age / TIMING.HEAL_TEXT, {
            lift: MOTION.DAMAGE_RISE_PX,
            baseY: -62,
            jitter: ((e.seq % 5) - 2) * 9,
            size: '22px',
          });
          break;
        case 'skill':
          if (age > TIMING.SKILL_TEXT) break;
          this.showFloating(e.seq, live, e.unit, views, e.skill, TEXT_COLORS.SKILL, age / TIMING.SKILL_TEXT, {
            lift: MOTION.SKILL_RISE_PX,
            baseY: -78,
            jitter: 0,
            size: '20px',
          });
          break;
        case 'overheat':
          if (age <= TIMING.OVERHEAT_BANNER) bannerAlpha = 1 - age / TIMING.OVERHEAT_BANNER;
          break;
        case 'card':
          if (age <= TIMING.CARD_BANNER) {
            // 가장 최근 카드의 이름을 보여준다 (효과 목록은 오래된 순)
            cardBannerText = { text: `▶ ${this.cardName(e.cardId, e.upgraded)}`, alpha: 1 - Math.max(0, age / TIMING.CARD_BANNER - 0.6) / 0.4 };
          }
          if (age <= TIMING.CARD_PULSE) this.drawCardPulse(e, age / TIMING.CARD_PULSE, views);
          break;
        case 'teleport':
          if (age <= TIMING.SWAP_TRAIL) this.drawTeleportTrail(e, age / TIMING.SWAP_TRAIL);
          break;
        case 'cp':
          if (age <= TIMING.CP_TEXT && e.reason !== 'start' && e.delta !== 0) this.showCp(e, live, age / TIMING.CP_TEXT);
          break;
        case 'strike':
          if (age <= TIMING.STRIKE_FLASH) this.drawStrike(e.cells, age / TIMING.STRIKE_FLASH);
          break;
        case 'ultimate':
          if (age <= TIMING.ULTIMATE_BANNER) {
            ultimateText = { text: `✦ ${e.name} ✦`, alpha: 1 - Math.max(0, age / TIMING.ULTIMATE_BANNER - 0.6) / 0.4 };
          }
          break;
        case 'impact':
          if (age <= TIMING.IMPACT_FLASH) this.drawImpact(e.cell, e.radius, age / TIMING.IMPACT_FLASH);
          break;
        case 'telegraph':
        case 'death':
          break;
      }
    }
    this.drawTelegraphs(time, telegraphs);
    this.drawMeteors(time, ultimate.meteors);
    this.drawAura(time, ultimate.aura, views);
    if (ultimateText) this.ultimateBanner.setText(ultimateText.text).setAlpha(ultimateText.alpha).setVisible(true);
    else this.ultimateBanner.setVisible(false);

    this.banner.setVisible(bannerAlpha > 0).setAlpha(bannerAlpha);
    if (cardBannerText) this.cardBanner.setText(cardBannerText.text).setAlpha(cardBannerText.alpha).setVisible(true);
    else this.cardBanner.setVisible(false);
    for (const [seq, pooled] of this.texts) {
      if (live.has(seq)) continue;
      pooled.text.destroy();
      this.texts.delete(seq);
    }
  }

  /** 모든 연출을 지운다 (리셋용) */
  clear(): void {
    this.lines.clear();
    for (const pooled of this.texts.values()) pooled.text.destroy();
    this.texts.clear();
    this.banner.setVisible(false);
    this.cardBanner.setVisible(false);
    this.ultimateBanner.setVisible(false);
    this.telegraphLabel.setVisible(false);
  }

  /** 낙하 중인 운석: 착탄 범위를 주황으로 칠하고, 수축하는 링과 위에서 내려오는 불덩이를 그린다 */
  private drawMeteors(time: number, meteors: readonly MeteorView[]): void {
    const size = this.layout.cellSize;
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);
    for (const m of meteors) {
      for (let dc = -m.radius; dc <= m.radius; dc++) {
        for (let dr = -m.radius; dr <= m.radius; dr++) {
          const col = m.cell.col + dc;
          const row = m.cell.row + dr;
          if (col < 0 || col >= BOARD_COLS || row < 0 || row >= BOARD_ROWS) continue;
          const p = this.layout.topLeft(col, row);
          this.lines.fillStyle(COLORS.METEOR, 0.14 + 0.26 * m.progress + 0.06 * pulse);
          this.lines.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
          this.lines.lineStyle(2, COLORS.METEOR, 0.55 + 0.35 * pulse);
          this.lines.strokeRect(p.x + 2, p.y + 2, size - 4, size - 4);
        }
      }
      const center = this.layout.center(m.cell.col, m.cell.row);
      const ring = (m.radius + 0.5) * size * (1.3 - 0.3 * m.progress);
      this.lines.lineStyle(3, COLORS.METEOR, 0.8);
      this.lines.strokeCircle(center.x, center.y, ring);
      const fall = (1 - m.progress) * size * 3;
      this.lines.fillStyle(COLORS.METEOR_IMPACT, 0.95);
      this.lines.fillCircle(center.x, center.y - fall, 10 + 8 * m.progress);
      this.lines.fillStyle(COLORS.METEOR, 0.8);
      this.lines.fillCircle(center.x, center.y - fall, 6 + 5 * m.progress);
    }
  }

  /** 운석 착탄 순간: 범위 전체가 번쩍이며 퍼지는 원이 사라진다 */
  private drawImpact(cell: { col: number; row: number }, radius: number, progress: number): void {
    const size = this.layout.cellSize;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const col = cell.col + dc;
        const row = cell.row + dr;
        if (col < 0 || col >= BOARD_COLS || row < 0 || row >= BOARD_ROWS) continue;
        const p = this.layout.topLeft(col, row);
        this.lines.fillStyle(COLORS.METEOR_IMPACT, 0.7 * (1 - progress));
        this.lines.fillRect(p.x, p.y, size, size);
      }
    }
    const center = this.layout.center(cell.col, cell.row);
    this.lines.lineStyle(6, COLORS.METEOR, 1 - progress);
    this.lines.strokeCircle(center.x, center.y, (radius + 0.5) * size * (0.5 + progress));
  }

  /** 지속 효과가 있는 궁극기(불굴의 방진·대가 지불): 아군 주위에 맥동하는 링 */
  private drawAura(time: number, aura: UltimateAuraView | null, views: ReadonlyMap<number, UnitView>): void {
    if (!aura) return;
    const color = auraColor(aura.commanderId);
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    const fade = Math.min(1, (aura.until - time) / 0.5);
    for (const v of views.values()) {
      if (v.side !== 0 || !v.alive) continue;
      const p = this.layout.center(v.pos.col, v.pos.row);
      this.lines.lineStyle(4, color, (0.55 + 0.35 * pulse) * fade);
      this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 8 + 4 * pulse);
    }
  }

  /** 보스 예고: 대상 열을 붉게 칠하고 발동까지 남은 시간을 열 위에 표시한다 (진행할수록 진해진다) */
  private drawTelegraphs(time: number, telegraphs: readonly TelegraphView[]): void {
    const first = telegraphs[0];
    this.telegraphLabel.setVisible(first !== undefined);
    if (!first) return;
    const size = this.layout.cellSize;
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);
    for (const t of telegraphs) {
      for (const cell of t.cells) {
        const p = this.layout.topLeft(cell.col, cell.row);
        this.lines.fillStyle(COLORS.TELEGRAPH, 0.16 + 0.3 * t.progress + 0.08 * pulse);
        this.lines.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
        this.lines.lineStyle(3, COLORS.TELEGRAPH, 0.6 + 0.4 * pulse);
        this.lines.strokeRect(p.x + 2, p.y + 2, size - 4, size - 4);
      }
    }
    const top = first.cells[0];
    if (top) {
      const p = this.layout.center(top.col, 0);
      this.telegraphLabel.setPosition(p.x, this.layout.originY - 14).setText(`열 강타 ${Math.max(0, first.fireAt - time).toFixed(1)}초`);
    }
  }

  /** 발동 순간의 번쩍임: 열 전체가 밝게 번쩍이며 사라진다 */
  private drawStrike(cells: readonly { col: number; row: number }[], progress: number): void {
    const size = this.layout.cellSize;
    for (const cell of cells) {
      const p = this.layout.topLeft(cell.col, cell.row);
      this.lines.fillStyle(COLORS.STRIKE, 0.75 * (1 - progress));
      this.lines.fillRect(p.x, p.y, size, size);
      this.lines.lineStyle(5, COLORS.TELEGRAPH, 1 - progress);
      this.lines.strokeRect(p.x + 2, p.y + 2, size - 4, size - 4);
    }
  }

  private drawAttack(
    e: Extract<ReplayEffect, { kind: 'attack' }>,
    age: number,
    views: ReadonlyMap<number, UnitView>,
  ): void {
    const from = views.get(e.unit);
    const to = views.get(e.target);
    if (!from || !to) return;
    const a = this.layout.center(from.pos.col, from.pos.row);
    const b = this.layout.center(to.pos.col, to.pos.row);
    const fade = 1 - age / TIMING.ATTACK_LINE;
    const color = from.side === 0 ? COLORS.ATTACK_ALLY : COLORS.ATTACK_ENEMY;
    const dx = b.y - a.y;
    const dy = a.x - b.x;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < e.shots; i++) {
      // 2발이면 평행하게 약간 벌려 그린다
      const off = e.shots === 1 ? 0 : (i - 0.5) * 8;
      const ox = (dx / len) * off;
      const oy = (dy / len) * off;
      this.lines.lineStyle(3, color, fade);
      this.lines.lineBetween(a.x + ox, a.y + oy, b.x + ox, b.y + oy);
    }
    // 피격 플래시
    this.lines.fillStyle(0xffffff, 0.6 * fade);
    this.lines.fillCircle(b.x, b.y, 14 + 10 * (1 - fade));
  }

  /** 카드 대상에 퍼지는 링: 유닛 대상은 해당 유닛, 칸 대상은 칸 중심 */
  private drawCardPulse(e: Extract<ReplayEffect, { kind: 'card' }>, progress: number, views: ReadonlyMap<number, UnitView>): void {
    const points: { x: number; y: number }[] = [];
    const target = e.target;
    if (target.kind === 'unit' || target.kind === 'units') {
      const uids = target.kind === 'unit' ? [target.uid] : target.uids;
      for (const uid of uids) {
        const v = views.get(uid);
        if (v) points.push(this.layout.center(v.pos.col, v.pos.row));
      }
    } else if (target.kind === 'cell') {
      points.push(this.layout.center(target.cell.col, target.cell.row));
    }
    const radius = LAYOUT.UNIT_RADIUS + 6 + 34 * progress;
    this.lines.lineStyle(5, COLORS.CARD_PULSE, 1 - progress);
    for (const p of points) this.lines.strokeCircle(p.x, p.y, radius);
  }

  /** 진형 교대 등 위치 이동: 출발 칸에서 도착 칸으로 이어지는 선과 양 끝 점 */
  private drawTeleportTrail(e: Extract<ReplayEffect, { kind: 'teleport' }>, progress: number): void {
    const a = this.layout.center(e.from.col, e.from.row);
    const b = this.layout.center(e.to.col, e.to.row);
    const alpha = 1 - progress;
    this.lines.lineStyle(4, COLORS.SWAP_TRAIL, alpha);
    this.lines.lineBetween(a.x, a.y, b.x, b.y);
    this.lines.fillStyle(COLORS.SWAP_TRAIL, alpha);
    this.lines.fillCircle(a.x, a.y, 8);
    this.lines.fillCircle(b.x, b.y, 8);
  }

  private showCp(e: Extract<ReplayEffect, { kind: 'cp' }>, live: Set<number>, progress: number): void {
    const sign = e.delta > 0 ? '+' : '';
    const pool = e.pool === 'prep' ? '작전 CP' : 'CP';
    const label = `${pool} ${sign}${e.delta} (${CP_REASON_LABELS[e.reason]})`;
    this.showAt(e.seq, live, STAGE.WIDTH - 24, LAYOUT.CP_TEXT_Y, label, TEXT_COLORS.CP, progress, {
      lift: 18,
      size: '17px',
      originX: 1,
    });
  }

  private showFloating(
    seq: number,
    live: Set<number>,
    unitUid: number,
    views: ReadonlyMap<number, UnitView>,
    label: string,
    color: string,
    progress: number,
    opt: { lift: number; baseY: number; jitter: number; size: string },
  ): void {
    const view = views.get(unitUid);
    if (!view) return;
    const p = this.layout.center(view.pos.col, view.pos.row);
    this.showAt(seq, live, p.x + opt.jitter, p.y + opt.baseY, label, color, progress, { lift: opt.lift, size: opt.size, originX: 0.5 });
  }

  private showAt(
    seq: number,
    live: Set<number>,
    x: number,
    y: number,
    label: string,
    color: string,
    progress: number,
    opt: { lift: number; size: string; originX: number },
  ): void {
    live.add(seq);
    let pooled = this.texts.get(seq);
    if (!pooled) {
      const text = createText(this.scene, this.metrics, 0, 0, label, {
        fontSize: opt.size,
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
        .setOrigin(opt.originX, 0.5)
        .setDepth(30);
      pooled = { text };
      this.texts.set(seq, pooled);
    }
    const eased = 1 - (1 - progress) * (1 - progress);
    pooled.text.setPosition(x, y - opt.lift * eased);
    pooled.text.setAlpha(progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4);
  }
}
