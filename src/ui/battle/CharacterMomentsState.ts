import type { SessionPhase } from '../debug/contracts';
import type { ReplayEffect, UnitView } from '../replay/ReplayState';
import { unitSkinIndex } from '../skin';
import { BANTER, CHARACTER_LINES } from './characterLines';

export interface SpeechBubble {
  id: number;
  uid: number;
  text: string;
  at: number;
  duration: number;
}

export interface SkillCutIn {
  id: number;
  uid: number;
  unitId: string;
  side: 0 | 1;
  skill: string;
  text: string;
  at: number;
  duration: number;
}

interface MomentsInput {
  phase: SessionPhase;
  combatTime: number;
  delta: number;
  timeScale: number;
  views: readonly UnitView[];
  effects: readonly ReplayEffect[];
}

interface Reply { uid: number; text: string; at: number; }

/**
 * Presentation-only event scheduler. Repeated replay windows never retrigger lines.
 * Its clock pauses/slows with combat, but caps at real time so ×4 remains readable.
 */
export class CharacterMomentsState {
  now = 0;
  bubbles: SpeechBubble[] = [];
  cutIn: SkillCutIn | null = null;
  private started = false;
  private finished = false;
  private combatTime = 0;
  private lastSeq = -1;
  private nextId = 0;
  private lastSpeech = -Infinity;
  private lastCutIn = -Infinity;
  private nextBanter = 8;
  private banterRound = 0;
  private reply: Reply | null = null;
  private readonly speakerTimes = new Map<number, number>();

  clear(): void {
    this.now = 0;
    this.bubbles = [];
    this.cutIn = null;
    this.started = false;
    this.finished = false;
    this.combatTime = 0;
    this.lastSeq = -1;
    this.nextId = 0;
    this.lastSpeech = -Infinity;
    this.lastCutIn = -Infinity;
    this.nextBanter = 8;
    this.banterRound = 0;
    this.reply = null;
    this.speakerTimes.clear();
  }

  update(input: MomentsInput): void {
    if (input.phase === 'edit') { this.clear(); return; }
    if (input.combatTime < this.combatTime) this.clear();
    this.combatTime = input.combatTime;
    const alive = input.views.filter((view) => view.alive);
    const byUid = new Map(input.views.map((view) => [view.uid, view]));
    if (!this.started) {
      this.started = true;
      const [lead, partner] = this.partners(alive);
      if (lead) this.speak(lead.uid, CHARACTER_LINES[unitSkinIndex(lead.unitId)]!.opening);
      if (partner) this.reply = { uid: partner.uid, text: CHARACTER_LINES[unitSkinIndex(partner.unitId)]!.reply, at: 1.35 };
    } else {
      const rate = input.phase === 'paused' ? 0 : input.phase === 'finished' ? 1 : Math.min(1, Math.max(0, input.timeScale));
      this.now += Math.max(0, Math.min(.25, input.delta)) * rate;
    }
    this.bubbles = this.bubbles.filter((bubble) => this.now - bubble.at < bubble.duration && byUid.get(bubble.uid)?.alive);
    if (this.cutIn && this.now - this.cutIn.at >= this.cutIn.duration) this.cutIn = null;

    const fresh = input.effects.filter((effect) => effect.seq > this.lastSeq);
    for (const effect of input.effects) this.lastSeq = Math.max(this.lastSeq, effect.seq);
    // One shared cooldown prevents simultaneous casts from queuing a wall of portraits.
    const casts = fresh.filter((effect): effect is Extract<ReplayEffect, { kind: 'skill' }> => effect.kind === 'skill');
    casts.sort((a, b) => (byUid.get(a.unit)?.side ?? 1) - (byUid.get(b.unit)?.side ?? 1) || a.seq - b.seq);
    for (const cast of casts) {
      const actor = byUid.get(cast.unit);
      if (!actor?.alive) continue;
      const lines = CHARACTER_LINES[unitSkinIndex(actor.unitId)]!;
      const text = lines.skill[cast.seq % lines.skill.length]!;
      this.speak(actor.uid, text);
      if (this.now - this.lastCutIn >= 5.5 && !this.cutIn) {
        this.cutIn = { id: ++this.nextId, uid: actor.uid, unitId: actor.unitId, side: actor.side, skill: cast.skill, text, at: this.now, duration: 2.2 };
        this.lastCutIn = this.now;
      }
    }

    for (const effect of fresh) {
      if (effect.kind !== 'damage' && effect.kind !== 'death') continue;
      const actor = byUid.get(effect.unit);
      if (!actor) continue;
      if (effect.kind === 'damage' && actor.alive && actor.maxHp > 0 && actor.hp / actor.maxHp <= .3) {
        this.speak(actor.uid, CHARACTER_LINES[unitSkinIndex(actor.unitId)]!.hurt);
      } else if (effect.kind === 'death') {
        const cover = alive.find((view) => view.side === actor.side && view.uid !== actor.uid);
        if (cover) this.speak(cover.uid, '계속 움직여! 내가 엄호할게.');
      }
    }

    if (input.phase === 'finished') {
      this.reply = null;
      if (!this.finished) {
        this.finished = true;
        const survivor = alive.find((view) => view.side === 0) ?? alive[0];
        if (survivor) {
          const oneSide = alive.every((view) => view.side === survivor.side);
          this.bubbles = [];
          this.speak(survivor.uid, oneSide ? CHARACTER_LINES[unitSkinIndex(survivor.unitId)]!.win : '작전 종료. 다들 복귀해.', true);
        }
      }
      return;
    }

    if (this.reply && this.now >= this.reply.at) {
      const partner = byUid.get(this.reply.uid);
      if (!partner?.alive) this.reply = null;
      else if (this.speak(partner.uid, this.reply.text) || this.now - this.reply.at > 2) this.reply = null;
    }
    if (this.now >= this.nextBanter && !this.reply && this.now - this.lastSpeech >= 2.8) {
      const [lead, partner] = this.partners(alive);
      if (lead && partner) {
        const lines = BANTER[this.banterRound++ % BANTER.length]!;
        if (this.speak(lead.uid, lines[0])) this.reply = { uid: partner.uid, text: lines[1], at: this.now + 1.35 };
      }
      this.nextBanter = this.now + 9;
    }
  }

  private partners(alive: readonly UnitView[]): UnitView[] {
    const allies = alive.filter((view) => view.side === 0);
    const lead = allies[0];
    const partner = lead && allies.find((view) => unitSkinIndex(view.unitId) !== unitSkinIndex(lead.unitId));
    return lead ? partner ? [lead, partner] : [lead] : [];
  }

  private speak(uid: number, text: string, force = false): boolean {
    if (!force && (this.bubbles.length >= 2 || this.now - this.lastSpeech < 1.1 || this.now - (this.speakerTimes.get(uid) ?? -Infinity) < 4.5)) return false;
    this.bubbles = this.bubbles.filter((bubble) => bubble.uid !== uid);
    this.bubbles.push({ id: ++this.nextId, uid, text, at: this.now, duration: 2.7 });
    this.lastSpeech = this.now;
    this.speakerTimes.set(uid, this.now);
    return true;
  }
}
