import Phaser from 'phaser';
import { createText, type HiDpiMetrics } from '../hidpi';
import type { MeteorView, ReplayEffect, ReviveWatchView, TelegraphView, UltimateAuraView, UnitView, ZoneView } from '../replay/ReplayState';
import { BOARD_COLS, BOARD_ROWS } from '../../core/combat/board';
import { COLORS, COMBAT_FX, LAYOUT, MOTION, STAGE, TEXT_COLORS, TIMING } from '../theme';
import type { BoardLayout } from './BoardLayout';
import { buildCombatVisualFrame, damageLabels, projectilePoint, type AttackVisual, type CombatVisualFrame, type HitVisual } from './combatVisuals';
import { commanderProfile, commanderTextureKey, isIllustratedSkin, unitSkillName } from '../skin/skins';
import { MODERN_COMMANDERS } from '../skin/modernRoster';
import { appSkin } from '../skin/SkinStore';

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

/** 보스 연출 입력: 부활 대기 중인 쌍둥이 (남은 시간 표시) + 카드로 깔린 지속 피해 장판 */
export interface BossVisuals {
  revives: readonly ReviveWatchView[];
  zones?: readonly ZoneView[];
}

const NO_BOSS: BossVisuals = { revives: [] };

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
  private readonly phaseBanner: Phaser.GameObjects.Text;
  private cutin: Phaser.GameObjects.Image | null = null;
  /** 부활 대기 쌍둥이마다 하나씩: 죽은 쪽 위의 남은 시간, 짝 위의 "처치" 표시 */
  private readonly reviveLabels = new Map<string, Phaser.GameObjects.Text>();

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
    this.phaseBanner = createText(scene, metrics, STAGE.WIDTH / 2, 152, '', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: TEXT_COLORS.PHASE,
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
    boss: BossVisuals = NO_BOSS,
    combat?: CombatVisualFrame,
  ): void {
    this.lines.clear();
    const visual = combat ?? buildCombatVisualFrame(time, effects, views);
    this.cutin?.setVisible(false);
    let ultimateText: { text: string; alpha: number } | null = null;
    let phaseText: { text: string; alpha: number } | null = null;
    const live = new Set<number>();
    let bannerAlpha = 0;
    let cardBannerText: { text: string; alpha: number } | null = null;
    let curseText: { text: string; alpha: number } | null = null;

    for (const e of effects) {
      const age = time - e.t;
      switch (e.kind) {
        case 'attack':
          break;
        case 'damage': {
          break;
        }
        case 'cardCost':
          // 주술사 특성이 손패 비용을 깎으면 발동한 유닛 위에 "비용 -1"
          if (e.unit !== null && e.delta !== 0 && age <= TIMING.CARD_COST_TEXT) {
            this.showFloating(e.seq, live, e.unit, views, `카드 비용 ${e.delta}`, TEXT_COLORS.COST_DOWN, age / TIMING.CARD_COST_TEXT, {
              lift: MOTION.SKILL_RISE_PX, baseY: MOTION.CARD_COST_BASE_Y, jitter: 0, size: '16px',
            });
          }
          break;
        case 'heal':
          if (age > TIMING.HEAL_TEXT) break;
          if (age < 0.5) this.drawCast(e.unit, views, age / 0.5, 0x95e0b9, visual.reduced);
          this.showFloating(e.seq, live, e.unit, views, `+${e.amount}`, TEXT_COLORS.HEAL, age / TIMING.HEAL_TEXT, {
            lift: MOTION.DAMAGE_RISE_PX,
            baseY: -62,
            jitter: ((e.seq % 5) - 2) * 9,
            size: '22px',
          });
          break;
        case 'skill':
          if (age > TIMING.SKILL_TEXT) break;
          if (age < 0.6) this.drawCast(e.unit, views, age / 0.6, 0xe4c991, visual.reduced);
          this.showFloating(e.seq, live, e.unit, views, unitSkillName(appSkin.current, views.get(e.unit)?.unitId ?? '', e.skill), TEXT_COLORS.SKILL, age / TIMING.SKILL_TEXT, {
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
          if (age < 1.25 && !visual.reduced) this.drawCommanderCutin(e.commanderId, age / 1.25);
          if (age <= TIMING.ULTIMATE_BANNER) {
            const name = appSkin.current === 'modern' ? MODERN_COMMANDERS[e.commanderId]?.skillName ?? e.name : e.name;
            ultimateText = { text: `✦ ${name} ✦`, alpha: 1 - Math.max(0, age / TIMING.ULTIMATE_BANNER - 0.6) / 0.4 };
          }
          break;
        case 'impact':
          if (age <= TIMING.IMPACT_FLASH) this.drawImpact(e.cell, e.radius, age / TIMING.IMPACT_FLASH);
          break;
        case 'revive':
          if (age <= TIMING.REVIVE_FLASH) this.drawReviveFlash(e.unit, views, age / TIMING.REVIVE_FLASH);
          break;
        case 'reviveCancel':
          if (age <= TIMING.REVIVE_CANCEL_TEXT) {
            this.showFloating(e.seq, live, e.unit, views, '처치 확정!', TEXT_COLORS.HEAL, age / TIMING.REVIVE_CANCEL_TEXT, {
              lift: MOTION.DAMAGE_RISE_PX, baseY: -30, jitter: 0, size: '22px',
            });
          }
          break;
        case 'phase':
          if (age <= TIMING.PHASE_BANNER) {
            const extra = [e.summoned > 0 ? `증원 ${e.summoned}기` : '', e.dispelled > 0 ? `아군 버프 해제 (${e.dispelled}기)` : '아군 버프 해제'].filter(Boolean).join(' · ');
            phaseText = { text: `⚔ ${e.phase}페이즈 — ${extra}`, alpha: 1 - Math.max(0, age / TIMING.PHASE_BANNER - 0.7) / 0.3 };
          }
          break;
        case 'dispel':
          if (age <= TIMING.DISPEL_FLASH) this.drawDispel(e.unit, views, age / TIMING.DISPEL_FLASH);
          break;
        case 'phoenix':
          if (age <= TIMING.PHOENIX_FLASH) this.drawPhoenix(e.unit, views, age / TIMING.PHOENIX_FLASH);
          if (age <= TIMING.REVIVE_CANCEL_TEXT) {
            this.showFloating(e.seq, live, e.unit, views, '부활!', TEXT_COLORS.HEAL, age / TIMING.REVIVE_CANCEL_TEXT, {
              lift: MOTION.DAMAGE_RISE_PX, baseY: -30, jitter: 0, size: '22px',
            });
          }
          break;
        case 'zonePulse':
          if (age <= TIMING.ZONE_FLASH) this.drawZoneFlash(e.cells, age / TIMING.ZONE_FLASH);
          break;
        case 'curse':
          if (age <= TIMING.CURSE_BANNER) {
            curseText = { text: `☠ ${this.cardName(e.cardId, false)} 발동`, alpha: 1 - Math.max(0, age / TIMING.CURSE_BANNER - 0.6) / 0.4 };
          }
          break;
        case 'commanderHeal':
          // 지휘관 HP 회복은 전투에서 이겨야 확정된다: 화면 위쪽에 "예약" 글자
          if (age <= TIMING.COMMANDER_HEAL_TEXT) {
            curseText ??= { text: `지휘관 HP +${e.amount} (승리 시 확정)`, alpha: 1 - Math.max(0, age / TIMING.COMMANDER_HEAL_TEXT - 0.6) / 0.4 };
          }
          break;
        case 'telegraph':
        case 'death':
          break;
      }
    }
    this.drawTelegraphs(time, telegraphs);
    this.drawMeteors(time, ultimate.meteors);
    this.drawAura(time, ultimate.aura, views);
    this.drawRevives(time, boss.revives, views);
    this.drawZones(time, boss.zones ?? []);
    for (const attack of visual.attacks) this.drawAttack(attack, visual.reduced);
    for (const hit of visual.hits) this.drawHit(hit, visual.reduced);
    for (const label of damageLabels(time, effects, visual)) {
      const guard = label.amount === 0 && label.absorbed > 0;
      const text = guard ? '방어' : `-${label.amount}${label.crit ? '!' : label.bonus ? '★' : ''}`;
      const color = guard ? '#a7dbef' : label.crit ? TEXT_COLORS.CRIT : label.bonus ? TEXT_COLORS.BONUS
        : label.dmgType === 'physical' ? TEXT_COLORS.PHYSICAL : TEXT_COLORS.MAGIC;
      this.showFloating(label.seq, live, label.unit, views, text, color, label.age / TIMING.DAMAGE_TEXT, {
        lift: MOTION.DAMAGE_RISE_PX, baseY: -54 - label.lane * 14, jitter: (label.lane - 1) * 17,
        size: label.crit ? '28px' : label.bonus ? '25px' : guard ? '17px' : '22px',
      });
    }
    if (phaseText && curseText) phaseText = { text: `${phaseText.text}  ${curseText.text}`, alpha: Math.max(phaseText.alpha, curseText.alpha) };
    else if (curseText) phaseText = curseText;
    if (phaseText) this.phaseBanner.setText(phaseText.text).setAlpha(phaseText.alpha).setVisible(true);
    else this.phaseBanner.setVisible(false);
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
    this.phaseBanner.setVisible(false);
    for (const label of this.reviveLabels.values()) label.destroy();
    this.reviveLabels.clear();
    this.telegraphLabel.setVisible(false);
    this.cutin?.setVisible(false);
  }

  /**
   * 쌍둥이 부활 대기: 죽은 쪽에는 줄어드는 링과 부활까지 남은 시간, 짝에는 "N초 안에 처치!" 표시와 붉은 조준 링을 그린다.
   * 부활 대기가 끝나면(부활·처치 확정) 글자는 사라진다.
   */
  private drawRevives(time: number, watches: readonly ReviveWatchView[], views: ReadonlyMap<number, UnitView>): void {
    const shown = new Set<string>();
    const pulse = 0.5 + 0.5 * Math.sin(time * 10);
    for (const w of watches) {
      const dead = views.get(w.unit);
      const partner = views.get(w.partner);
      if (dead) {
        const p = this.layout.center(dead.pos.col, dead.pos.row);
        this.lines.lineStyle(4, COLORS.REVIVE, 0.9);
        this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS * (1.6 - 0.6 * w.progress));
        this.lines.lineStyle(2, COLORS.REVIVE, 0.5 + 0.3 * pulse);
        this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 6);
        this.reviveLabel(`dead:${w.unit}`, shown, p.x, p.y - 56, `부활까지 ${w.remaining.toFixed(1)}초`, TEXT_COLORS.REVIVE);
      }
      if (partner && partner.alive) {
        const p = this.layout.center(partner.pos.col, partner.pos.row);
        this.lines.lineStyle(4, COLORS.TELEGRAPH, 0.6 + 0.4 * pulse);
        this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 12 + 3 * pulse);
        this.reviveLabel(`partner:${w.unit}`, shown, p.x, p.y - 70, `${w.remaining.toFixed(1)}초 안에 처치!`, TEXT_COLORS.OVERHEAT);
      }
    }
    for (const [key, label] of this.reviveLabels) {
      if (shown.has(key)) continue;
      label.destroy();
      this.reviveLabels.delete(key);
    }
  }

  private reviveLabel(key: string, shown: Set<string>, x: number, y: number, text: string, color: string): void {
    shown.add(key);
    let label = this.reviveLabels.get(key);
    if (!label) {
      label = createText(this.scene, this.metrics, 0, 0, text, {
        fontSize: '18px',
        fontStyle: 'bold',
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
        .setOrigin(0.5)
        .setDepth(26);
      this.reviveLabels.set(key, label);
    }
    label.setText(text).setColor(color).setPosition(x, y);
  }

  /** 부활 순간: 되살아난 자리에서 퍼지는 보라색 링과 번쩍임 */
  private drawReviveFlash(uid: number, views: ReadonlyMap<number, UnitView>, progress: number): void {
    const v = views.get(uid);
    if (!v) return;
    const p = this.layout.center(v.pos.col, v.pos.row);
    this.lines.fillStyle(COLORS.REVIVE_FLASH, 0.55 * (1 - progress));
    this.lines.fillCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 6);
    this.lines.lineStyle(6, COLORS.REVIVE, 1 - progress);
    this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 10 + 46 * progress);
  }

  /** 지속 피해 장판: 칸을 주황으로 칠하고, 다음 피해까지 차오르는 테두리를 그린다 */
  private drawZones(time: number, zones: readonly ZoneView[]): void {
    const size = this.layout.cellSize;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    for (const z of zones) {
      for (const cell of z.cells) {
        const p = this.layout.topLeft(cell.col, cell.row);
        this.lines.fillStyle(COLORS.ZONE, 0.14 + 0.1 * z.pulseProgress + 0.04 * pulse);
        this.lines.fillRect(p.x + 3, p.y + 3, size - 6, size - 6);
        this.lines.lineStyle(2, COLORS.ZONE, 0.45 + 0.4 * z.pulseProgress);
        this.lines.strokeRect(p.x + 3, p.y + 3, size - 6, size - 6);
      }
    }
  }

  /** 장판이 피해를 주는 순간: 장판 칸이 밝게 번쩍인다 */
  private drawZoneFlash(cells: readonly { col: number; row: number }[], progress: number): void {
    const size = this.layout.cellSize;
    for (const cell of cells) {
      const p = this.layout.topLeft(cell.col, cell.row);
      this.lines.fillStyle(COLORS.ZONE_FLASH, 0.6 * (1 - progress));
      this.lines.fillRect(p.x + 2, p.y + 2, size - 4, size - 4);
    }
  }

  /** 장비 부활: 유닛 위에서 퍼지는 주황 링 */
  private drawPhoenix(uid: number, views: ReadonlyMap<number, UnitView>, progress: number): void {
    const v = views.get(uid);
    if (!v) return;
    const p = this.layout.center(v.pos.col, v.pos.row);
    this.lines.fillStyle(COLORS.PHOENIX, 0.45 * (1 - progress));
    this.lines.fillCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 6);
    this.lines.lineStyle(6, COLORS.PHOENIX, 1 - progress);
    this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 8 + 40 * progress);
  }

  /** 버프 해제: 아군 위에서 바깥으로 흩어지는 하늘색 링 */
  private drawDispel(uid: number, views: ReadonlyMap<number, UnitView>, progress: number): void {
    const v = views.get(uid);
    if (!v) return;
    const p = this.layout.center(v.pos.col, v.pos.row);
    this.lines.lineStyle(5, COLORS.DISPEL, 1 - progress);
    this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 4 + 36 * progress);
    this.lines.lineStyle(2, COLORS.DISPEL, 0.8 * (1 - progress));
    this.lines.strokeCircle(p.x, p.y, LAYOUT.UNIT_RADIUS + 18 + 20 * progress);
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
      if (appSkin.current === 'modern') {
        const g = this.lines, fall = (1 - m.progress) * size * 3;
        g.lineStyle(2, COLORS.METEOR, 0.8);
        const left = Math.max(this.layout.originX, center.x - ring), top = Math.max(this.layout.originY, center.y - ring);
        const right = Math.min(this.layout.originX + this.layout.width, center.x + ring), bottom = Math.min(this.layout.originY + this.layout.height, center.y + ring);
        g.strokeRoundedRect(left, top, right - left, bottom - top, 5);
        g.lineBetween(center.x - 10, center.y, center.x + 10, center.y);
        g.lineBetween(center.x, center.y - 10, center.x, center.y + 10);
        g.lineStyle(4, 0xa5b7c4, 0.4);
        g.lineBetween(center.x, center.y - fall - 35, center.x, center.y - fall);
        g.fillStyle(0xe0e8ee, 1); g.fillRect(center.x - 4, center.y - fall - 14, 8, 18);
        g.fillStyle(0xf2b87a, 1); g.fillTriangle(center.x - 5, center.y - fall + 4, center.x + 5, center.y - fall + 4, center.x, center.y - fall + 12);
        continue;
      }
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
      const radius = LAYOUT.UNIT_RADIUS + 8 + 4 * pulse;
      if (appSkin.current === 'modern') this.lines.strokeRoundedRect(p.x - radius, p.y - radius, radius * 2, radius * 2, 8);
      else this.lines.strokeCircle(p.x, p.y, radius);
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
      this.telegraphLabel.setPosition(p.x, this.layout.originY - 14).setText(`${first.label ?? '열 강타'} ${Math.max(0, first.fireAt - time).toFixed(1)}초`);
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

  /** 발사체는 실제로 이동하고 근접 공격은 대상 앞에 짧은 호를 남긴다. */
  private drawAttack(attack: AttackVisual, reduced: boolean): void {
    if (attack.profile.modern && attack.profile.ranged) return this.drawModernAttack(attack, reduced);
    const { profile, age, impactAt, event } = attack;
    const a = this.layout.center(attack.from.col, attack.from.row);
    const b = this.layout.center(attack.to.col, attack.to.row);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const g = this.lines;
    if (!profile.ranged) {
      if (age < COMBAT_FX.WINDUP) return;
      const p = Math.min(1, (age - COMBAT_FX.WINDUP) / (attack.duration - COMBAT_FX.WINDUP));
      const fade = 1 - p;
      const passes = profile.style === 'claw' ? 3 : 1;
      for (let i = 0; i < passes; i++) {
        const r = 18 + i * 8 + p * 12;
        g.lineStyle(reduced ? 2 : 5 - i, profile.color, fade * 0.9);
        g.beginPath();
        g.arc(b.x - Math.cos(angle) * 10, b.y - Math.sin(angle) * 10, r, angle - 1.25 + p * 0.8, angle + 0.5 + p * 0.8);
        g.strokePath();
        if (!reduced) {
          g.lineStyle(1.5, 0xfff3df, fade);
          g.beginPath();
          g.arc(b.x - Math.cos(angle) * 10, b.y - Math.sin(angle) * 10, r - 3, angle - 1.1 + p * 0.8, angle + 0.45 + p * 0.8);
          g.strokePath();
        }
      }
      return;
    }
    const progress = (age - COMBAT_FX.WINDUP) / (impactAt - COMBAT_FX.WINDUP);
    if (progress < 0) {
      if (!reduced) {
        g.lineStyle(2, profile.color, 0.6);
        g.strokeCircle(a.x, a.y, 7 + age * 160);
      }
      return;
    }
    if (progress > 1) {
      const fade = Math.max(0, 1 - (age - impactAt) / COMBAT_FX.ATTACK_FADE);
      g.lineStyle(2, profile.color, fade * 0.7);
      g.strokeCircle(b.x, b.y, 8 + (1 - fade) * (profile.style === 'shell' ? 34 : 20));
      return;
    }
    const shots = Math.max(1, Math.min(3, event.shots));
    for (let i = 0; i < shots; i++) {
      const spread = (i - (shots - 1) / 2) * 10;
      const ox = -Math.sin(angle) * spread, oy = Math.cos(angle) * spread;
      const cell = projectilePoint(attack, progress);
      const head = this.layout.center(cell.col, cell.row);
      const x = head.x + ox, y = head.y + oy;
      const trails = reduced ? 2 : 6;
      for (let j = trails; j >= 1; j--) {
        const tail = projectilePoint(attack, Math.max(0, progress - j * 0.045));
        const next = projectilePoint(attack, Math.max(0, progress - (j - 1) * 0.045));
        const t = this.layout.center(tail.col, tail.row), n = this.layout.center(next.col, next.row);
        g.lineStyle(profile.style === 'arrow' ? 2 : 2 + (trails - j) * 0.8, profile.color, 0.1 + (1 - j / (trails + 1)) * 0.6);
        g.lineBetween(t.x + ox, t.y + oy, n.x + ox, n.y + oy);
      }
      if (profile.style === 'arrow') {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        g.lineStyle(2, 0xf7f1d9, 1);
        g.lineBetween(x - dx * 17, y - dy * 17, x, y);
        g.fillStyle(profile.color, 1);
        g.fillTriangle(x + dx * 7, y + dy * 7, x - dx * 3 - dy * 4, y - dy * 3 + dx * 4, x - dx * 3 + dy * 4, y - dy * 3 - dx * 4);
      } else {
        const r = profile.style === 'shell' ? 7 : 5;
        if (!reduced) { g.fillStyle(profile.color, 0.15); g.fillCircle(x, y, r * 2.6); }
        g.fillStyle(profile.color, 0.95); g.fillCircle(x, y, r);
        g.fillStyle(0xfff4db, 1); g.fillCircle(x - 1, y - 1, r * 0.42);
        if (profile.style === 'orb' && !reduced) {
          g.lineStyle(1, profile.color, 0.8);
          g.strokeCircle(x, y, r + 5);
        }
        if (profile.style === 'ember' && !reduced) {
          g.fillStyle(0xffe7ad, 0.7);
          g.fillCircle(x + Math.sin(age * 80 + i) * 9, y + Math.cos(age * 60 + i) * 9, 2);
        }
      }
    }
  }

  /** 현대전 사격: 총구 섬광·점사·탄피·산탄·유탄·로켓을 같은 공격 이벤트에 맞춘다. */
  private drawModernAttack(attack: AttackVisual, reduced: boolean): void {
    const { profile, age, impactAt } = attack;
    const start = this.layout.center(attack.from.col, attack.from.row), end = this.layout.center(attack.to.col, attack.to.row);
    const facing = end.x < start.x ? -1 : 1;
    const muzzle = profile.muzzle ?? [28, -5];
    const a = { x: start.x + muzzle[0] * facing, y: start.y + muzzle[1] };
    const angle = Math.atan2(end.y - a.y, end.x - a.x), dx = Math.cos(angle), dy = Math.sin(angle);
    const g = this.lines, color = profile.color;
    const burst = profile.burst ?? 1;
    const flight = impactAt - COMBAT_FX.WINDUP - (burst - 1) * COMBAT_FX.BURST_INTERVAL;
    if (profile.style === 'grenade' || profile.style === 'rocket') {
      const p = (age - COMBAT_FX.WINDUP) / flight;
      if (p < 0) return;
      if (p > 1) {
        const fade = Math.max(0, 1 - (age - impactAt) / COMBAT_FX.ATTACK_FADE);
        g.lineStyle(reduced ? 2 : 4, 0xefb170, fade);
        g.strokeCircle(end.x, end.y, 10 + (1 - fade) * 32);
        if (!reduced) for (let i = 0; i < 4; i++) {
          const t = i * Math.PI / 2 + attack.event.seq;
          g.fillStyle(0x677b89, 0.16 * fade);
          g.fillCircle(end.x + Math.cos(t) * 18 * (1 - fade), end.y + Math.sin(t) * 18 * (1 - fade), 8 + (1 - fade) * 9);
        }
        return;
      }
      const adjusted = { ...attack, from: { col: attack.from.col + muzzle[0] * facing / this.layout.cellSize, row: attack.from.row + muzzle[1] / this.layout.cellSize } };
      const head = projectilePoint(adjusted, p), at = this.layout.center(head.col, head.row);
      for (let i = 1; i <= (reduced ? 2 : 6); i++) {
        const tail = projectilePoint(adjusted, Math.max(0, p - i * 0.04)), t = this.layout.center(tail.col, tail.row);
        g.fillStyle(profile.style === 'rocket' ? 0xa9bac7 : 0xd6aa7b, (1 - i / 7) * 0.35);
        g.fillCircle(t.x, t.y, profile.style === 'rocket' ? 2 + i * 0.4 : 2);
      }
      g.fillStyle(profile.style === 'rocket' ? 0xf3d8a0 : color, 1);
      if (profile.style === 'rocket') {
        g.fillTriangle(at.x + dx * 9, at.y + dy * 9, at.x - dx * 6 - dy * 4, at.y - dy * 6 + dx * 4, at.x - dx * 6 + dy * 4, at.y - dy * 6 - dx * 4);
      } else {
        g.fillCircle(at.x, at.y, 5);
        g.lineStyle(2, 0xffdf98, 1); g.strokeCircle(at.x, at.y, 6);
      }
      return;
    }
    for (let i = 0; i < burst; i++) {
      const shotAge = age - COMBAT_FX.WINDUP - i * COMBAT_FX.BURST_INTERVAL;
      if (shotAge < 0) continue;
      const flash = Math.max(0, 1 - shotAge / COMBAT_FX.MUZZLE_FLASH);
      if (flash > 0) {
        const r = (profile.style === 'shotgun' || profile.style === 'sniper' ? 13 : 8) * flash;
        if (!reduced) { g.fillStyle(0xffd38a, flash * 0.2); g.fillCircle(a.x, a.y, r * 1.7); }
        g.fillStyle(profile.style === 'drone' ? 0xa4e3ff : 0xfff1ca, flash * (reduced ? 0.5 : 1));
        g.fillTriangle(a.x + dx * r, a.y + dy * r, a.x - dy * r * 0.4, a.y + dx * r * 0.4, a.x + dy * r * 0.4, a.y - dx * r * 0.4);
        if (!reduced) g.fillTriangle(a.x - dx * 3, a.y - dy * 3, a.x - dy * r * 0.7, a.y + dx * r * 0.7, a.x + dy * r * 0.7, a.y - dx * r * 0.7);
      }
      const p = shotAge / flight;
      if (p >= 0 && p <= 1.15) {
        const pellets = profile.style === 'shotgun' ? reduced ? 3 : 5 : 1;
        for (let pellet = 0; pellet < pellets; pellet++) {
          const spread = (pellet - (pellets - 1) / 2) * 0.055;
          const length = Math.hypot(end.x - a.x, end.y - a.y);
          const ex = a.x + Math.cos(angle + spread) * length, ey = a.y + Math.sin(angle + spread) * length;
          const head = Math.min(1, p), tail = Math.max(0, head - (profile.style === 'sniper' ? 1 : 0.4));
          const hx = a.x + (ex - a.x) * head, hy = a.y + (ey - a.y) * head;
          const tx = a.x + (ex - a.x) * tail, ty = a.y + (ey - a.y) * tail;
          if (!reduced && profile.style === 'sniper') { g.lineStyle(5, color, 0.16); g.lineBetween(tx, ty, hx, hy); }
          g.lineStyle(profile.style === 'sniper' ? 2.5 : 1.7, profile.style === 'drone' ? color : 0xffd69b, p > 1 ? 0.35 : 0.95);
          g.lineBetween(tx, ty, hx, hy);
          g.fillStyle(0xfff8de, 0.9); g.fillCircle(hx, hy, profile.style === 'sniper' ? 2.5 : 1.6);
        }
      }
      if (!reduced && profile.style !== 'drone' && shotAge < 0.22) {
        const t = shotAge / 0.22;
        g.fillStyle(0xd7ad69, (1 - t) * 0.9);
        g.fillRect(a.x - dx * 15 - facing * t * 10, a.y - 3 - Math.sin(t * Math.PI) * 12 + t * 7, 3, 1.8);
      }
    }
  }

  /** 피격 순간의 별 모양 섬광, 방패 문장, 바깥으로 튀는 파편. */
  private drawHit(hit: HitVisual, reduced: boolean): void {
    const { event, age, pos } = hit;
    const p = age / COMBAT_FX.HIT, fade = 1 - p;
    const c = this.layout.center(pos.col, pos.row), g = this.lines;
    const guard = event.absorbed >= event.amount && event.absorbed > 0;
    const color = guard ? 0xa6e4ff : event.crit ? 0xffdf92 : event.dmgType === 'magic' ? 0xc9a7ff : 0xffe3c2;
    if (event.absorbed > 0) {
      const r = 22 + p * 14;
      const points = Array.from({ length: 7 }, (_, i) => ({ x: c.x + Math.cos(i * Math.PI / 3) * r, y: c.y + Math.sin(i * Math.PI / 3) * r }));
      g.lineStyle(2.5, 0xa6e4ff, fade); g.strokePoints(points, false);
    }
    if (!reduced) {
      g.fillStyle(color, 0.22 * fade); g.fillCircle(c.x, c.y, 12 + p * 19);
      const count = event.crit ? 8 : 5;
      for (let i = 0; i < count; i++) {
        const angle = i * Math.PI * 2 / count + event.seq * 0.7;
        const inner = 4 + p * 15, outer = inner + (event.crit ? 18 : 10) * fade;
        g.lineStyle(i % 2 ? 1.5 : 2.5, color, fade);
        g.lineBetween(c.x + Math.cos(angle) * inner, c.y + Math.sin(angle) * inner, c.x + Math.cos(angle) * outer, c.y + Math.sin(angle) * outer);
      }
    }
    g.lineStyle(2, color, fade * 0.9); g.strokeCircle(c.x, c.y, 5 + p * 24);
    if (age < 0.08) {
      const r = (event.crit ? 15 : 9) * fade;
      g.fillStyle(0xfff9ed, fade);
      g.fillTriangle(c.x, c.y - r, c.x - 3, c.y, c.x + 3, c.y);
      g.fillTriangle(c.x, c.y + r, c.x - 3, c.y, c.x + 3, c.y);
    }
  }

  private drawCast(uid: number, views: ReadonlyMap<number, UnitView>, progress: number, color: number, reduced: boolean): void {
    const view = views.get(uid);
    if (!view) return;
    const p = this.layout.center(view.pos.col, view.pos.row), g = this.lines;
    const radius = 22 + progress * 25;
    if (appSkin.current === 'modern') {
      g.lineStyle(2, color, (1 - progress) * 0.8);
      g.strokeRoundedRect(p.x - radius, p.y + 18 - radius * 0.2, radius * 2, radius * 0.4, 4);
      if (!reduced) {
        g.lineBetween(p.x - radius, p.y + 18, p.x + radius, p.y + 18);
        g.fillStyle(color, (1 - progress) * 0.7); g.fillRect(p.x - 2, p.y - 15 - progress * 12, 4, 12);
      }
      return;
    }
    g.lineStyle(2, color, (1 - progress) * 0.8);
    g.strokeEllipse(p.x, p.y + 21, radius * 2, radius * 0.65);
    if (reduced) return;
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 + progress * 2;
      g.fillStyle(color, 1 - progress);
      g.fillCircle(p.x + Math.cos(angle) * radius, p.y + Math.sin(angle) * radius * 0.35 - progress * 24, 2.5);
    }
  }

  private drawCommanderCutin(commanderId: string, progress: number): void {
    const key = commanderTextureKey(commanderId, appSkin.current);
    if (!isIllustratedSkin(appSkin.current) || !this.scene.textures.exists(key)) return;
    if (!this.cutin) this.cutin = this.scene.add.image(0, 0, key).setDepth(38);
    const fade = progress < 0.7 ? 1 : (1 - progress) / 0.3;
    const entrance = Math.min(1, progress / 0.16);
    this.cutin.setTexture(key).setDisplaySize(190, 190).setPosition(300 - 35 * (1 - entrance), 365).setAlpha(fade).setVisible(true);
    const profile = commanderProfile(appSkin.current, commanderId);
    this.lines.lineStyle(2, profile ? Number.parseInt(profile.color.slice(1), 16) : auraColor(commanderId), fade * 0.6);
    this.lines.strokeCircle(300, 365, 100);
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
    pooled.text.setText(label).setColor(color);
    pooled.text.setPosition(x, y - opt.lift * eased);
    pooled.text.setAlpha(progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4);
  }
}
