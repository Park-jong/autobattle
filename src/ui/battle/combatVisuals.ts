import type { UnitDef } from '../../core/data/unit';
import type { CellPos, ReplayEffect, UnitView } from '../replay/ReplayState';
import { COMBAT_FX, TIMING } from '../theme';
import { MODERN_UNITS, type ModernWeapon } from '../skin/modernRoster';
import type { SkinId } from '../skin/skins';

export type AttackStyle = 'slash' | 'claw' | 'arrow' | 'ember' | 'orb' | 'shell' | Exclude<ModernWeapon, 'blade'>;
export interface AttackProfile { style: AttackStyle; color: number; ranged: boolean; modern?: boolean; muzzle?: readonly [number, number]; burst?: number; recoil?: number }
export type ProfileResolver = (unitId: string) => AttackProfile;

/** 유닛의 무기·학부를 시각 표현으로만 연결한다. 사거리·피해 계산에는 쓰지 않는다. */
export function attackProfile(def?: UnitDef, skin?: SkinId): AttackProfile {
  if (skin === 'modern') {
    const row = def ? MODERN_UNITS[def.id] : undefined;
    const boss: Readonly<Record<string, ModernWeapon>> = { gate_breaker: 'machinegun', twin_ser: 'drone', twin_mir: 'drone', legion_lord: 'rifle' };
    const weapon = row?.weapon ?? (def ? boss[def.id] : undefined) ?? 'rifle';
    const properties: Record<ModernWeapon, { muzzle: readonly [number, number]; burst: number; recoil: number }> = {
      pistol: { muzzle: [22, -6], burst: def?.id === 'ember_bladedancer' ? 2 : 1, recoil: 5 },
      smg: { muzzle: [30, -6], burst: 3, recoil: 4 },
      rifle: { muzzle: [34, -6], burst: 2, recoil: 6 },
      shotgun: { muzzle: [34, -2], burst: 1, recoil: 11 },
      machinegun: { muzzle: [36, -4], burst: 4, recoil: 5 },
      sniper: { muzzle: [37, -10], burst: 1, recoil: 12 },
      grenade: { muzzle: [32, -2], burst: 1, recoil: 7 },
      rocket: { muzzle: [34, -14], burst: 1, recoil: 9 },
      drone: { muzzle: [24, -18], burst: 2, recoil: 2 },
      blade: { muzzle: [0, 0], burst: 1, recoil: 12 },
    };
    return { style: weapon === 'blade' ? 'slash' : weapon, color: row ? Number.parseInt(row.color.slice(1), 16) : 0x77b6d1, ranged: weapon !== 'blade', modern: true, ...properties[weapon] };
  }
  const color = def?.origin === 'ember' ? 0xffb16c : def?.origin === 'abyss' ? 0xc6a2ff
    : def?.origin === 'forest_pact' ? 0x9cdec0 : 0xa7d5ff;
  if (def?.id === 'siege_bombardier' || def?.id === 'ember_slinger') return { style: 'shell', color, ranged: true };
  if (def?.job === 'mystic') return { style: def.origin === 'ember' ? 'ember' : 'orb', color, ranged: true };
  if (def && def.stats.rng > 1) return { style: 'arrow', color, ranged: true };
  return { style: def?.job === 'assassin' ? 'claw' : 'slash', color, ranged: false };
}

export const DEFAULT_PROFILE: AttackProfile = { style: 'slash', color: 0xa7d5ff, ranged: false };
type AttackEvent = Extract<ReplayEffect, { kind: 'attack' }>;
type DamageEvent = Extract<ReplayEffect, { kind: 'damage' }>;

export interface AttackVisual {
  event: AttackEvent;
  profile: AttackProfile;
  from: CellPos;
  to: CellPos;
  age: number;
  impactAt: number;
  duration: number;
}
export interface HitVisual { event: DamageEvent; pos: CellPos; age: number }
export interface DamageLabel {
  seq: number; unit: number; amount: number; absorbed: number; dmgType: DamageEvent['dmgType'];
  crit: boolean; bonus: boolean; age: number; lane: number;
}
export interface UnitPose {
  x: number; y: number; rotation: number; scaleX: number; scaleY: number;
  flash: boolean; hurt: boolean;
  facing?: number;
}
export interface CombatVisualFrame {
  attacks: AttackVisual[];
  hits: HitVisual[];
  poses: Map<number, UnitPose>;
  damageAges: Map<number, number>;
  reduced: boolean;
}

/** 발사부터 착탄까지의 표시 시간. 코어의 명중·HP 계산에는 관여하지 않는다. */
export function impactTime(profile: AttackProfile, from: CellPos, to: CellPos): number {
  if (profile.modern && profile.ranged) {
    const distance = Math.hypot(to.col - from.col, to.row - from.row);
    const flight = profile.style === 'grenade' ? 0.25 + Math.min(0.18, distance * 0.025)
      : profile.style === 'rocket' ? 0.16 + Math.min(0.16, distance * 0.02) : 0.035 + Math.min(0.055, distance * 0.006);
    return COMBAT_FX.WINDUP + ((profile.burst ?? 1) - 1) * COMBAT_FX.BURST_INTERVAL + flight;
  }
  return profile.ranged ? COMBAT_FX.WINDUP + Math.min(COMBAT_FX.PROJECTILE_MAX, COMBAT_FX.PROJECTILE_BASE + Math.hypot(to.col - from.col, to.row - from.row) * COMBAT_FX.PROJECTILE_PER_CELL) : COMBAT_FX.MELEE_IMPACT;
}

function attackKey(source: number, target: number, t: number): string { return `${source}:${target}:${t}`; }

/** 같은 재생 시각은 같은 모습이 된다. 정지·배속·재시작에도 벽시계나 난수를 쓰지 않는다. */
export function buildCombatVisualFrame(
  time: number, effects: readonly ReplayEffect[], views: ReadonlyMap<number, UnitView>,
  resolve: ProfileResolver = () => DEFAULT_PROFILE, reduced = false,
): CombatVisualFrame {
  const frame: CombatVisualFrame = { attacks: [], hits: [], poses: new Map(), damageAges: new Map(), reduced };
  const impacts = new Map<string, number>();
  for (const view of views.values()) {
    const moving = view.moveProgress > 0 && view.moveProgress < 1;
    const bob = moving ? Math.sin(view.moveProgress * Math.PI * 4) * 2 : Math.sin(time * 2.8 + view.uid) * 0.65;
    const death = view.alive || view.deadAt === null ? 0 : Math.min(1, (time - view.deadAt) / 0.6);
    frame.poses.set(view.uid, { x: 0, y: reduced ? 0 : bob + death * 13,
      rotation: reduced ? 0 : death * (view.side === 0 ? -0.3 : 0.3),
      scaleX: 1, scaleY: reduced ? 1 : 1 - death * 0.14, flash: false, hurt: false });
  }
  for (const event of effects) {
    if (event.kind !== 'attack') continue;
    const attacker = views.get(event.unit), target = views.get(event.target);
    if (!attacker || !target) continue;
    const profile = resolve(attacker.unitId);
    const from = event.from ?? attacker.pos, to = event.to ?? target.pos;
    const impactAt = impactTime(profile, from, to), age = time - event.t;
    impacts.set(attackKey(event.unit, event.target, event.t), impactAt);
    const duration = impactAt + COMBAT_FX.ATTACK_FADE;
    const pose = frame.poses.get(event.unit);
    if (pose && profile.modern) pose.facing = to.col < from.col ? -1 : 1;
    if (age < 0 || age > duration) continue;
    frame.attacks.push({ event, profile, from, to, age, impactAt, duration });
    if (!pose || !attacker.alive || reduced) continue;
    const dx = to.col - from.col, dy = to.row - from.row, length = Math.hypot(dx, dy) || 1;
    let pulse = Math.sin(Math.PI * Math.min(1, age / duration));
    if (profile.modern && profile.ranged) {
      pulse = 0;
      for (let i = 0; i < (profile.burst ?? 1); i++) {
        const since = age - COMBAT_FX.WINDUP - i * COMBAT_FX.BURST_INTERVAL;
        if (since >= 0) pulse = Math.max(pulse, Math.exp(-since * 30));
      }
    }
    const offset = profile.ranged ? -(profile.recoil ?? 5) : 15;
    pose.x += dx / length * offset * pulse;
    pose.y += dy / length * offset * pulse;
    pose.rotation += (attacker.side === 0 ? 1 : -1) * (profile.ranged ? -0.045 : 0.13) * pulse;
    pose.scaleX = 1 + pulse * 0.04;
    pose.scaleY = 1 - pulse * 0.035;
  }
  for (const event of effects) {
    if (event.kind !== 'damage') continue;
    const delay = event.source == null ? 0 : impacts.get(attackKey(event.source, event.unit, event.t)) ?? 0;
    const age = time - event.t - delay;
    frame.damageAges.set(event.seq, age);
    const target = views.get(event.unit);
    if (!target || age < 0 || age > COMBAT_FX.HIT) continue;
    frame.hits.push({ event, pos: event.origin ?? target.pos, age });
    const pose = frame.poses.get(event.unit);
    if (!pose || reduced) continue;
    pose.flash = age < COMBAT_FX.WINDUP;
    pose.hurt = age < 0.16;
    const source = event.source == null ? undefined : views.get(event.source);
    const dx = target.pos.col - (source?.pos.col ?? target.pos.col - (target.side === 0 ? -1 : 1));
    const dy = target.pos.row - (source?.pos.row ?? target.pos.row);
    const length = Math.hypot(dx, dy) || 1;
    const recoil = Math.sin(age / COMBAT_FX.HIT * Math.PI) * (event.crit ? 7 : 3.5);
    pose.x += dx / length * recoil;
    pose.y += dy / length * recoil;
  }
  for (const pose of frame.poses.values()) {
    pose.x = Math.max(-20, Math.min(20, pose.x));
    pose.y = Math.max(-20, Math.min(20, pose.y));
    pose.rotation = Math.max(-0.35, Math.min(0.35, pose.rotation));
  }
  return frame;
}

/** 투사체 경로. 포탄은 포물선, 화살과 마력탄은 직선이며 끝점은 항상 착탄 위치다. */
export function projectilePoint(attack: AttackVisual, progress: number): CellPos {
  const p = Math.max(0, Math.min(1, progress));
  return { col: attack.from.col + (attack.to.col - attack.from.col) * p,
    row: attack.from.row + (attack.to.row - attack.from.row) * p - ((attack.profile.style === 'shell' || attack.profile.style === 'grenade') && p > 0 && p < 1 ? Math.sin(p * Math.PI) * 0.8 : 0) };
}

/** 짧은 시간에 같은 대상에 들어온 같은 종류의 피해를 묶어 숫자 겹침을 줄인다. */
export function damageLabels(time: number, effects: readonly ReplayEffect[], frame: CombatVisualFrame): DamageLabel[] {
  const groups = new Map<string, DamageLabel>();
  for (const event of effects) {
    if (event.kind !== 'damage') continue;
    const age = frame.damageAges.get(event.seq) ?? time - event.t;
    if (age < 0 || age > TIMING.DAMAGE_TEXT) continue;
    const bucket = Math.floor((time - age + 1e-7) / COMBAT_FX.DAMAGE_BUCKET);
    const key = `${event.unit}:${event.dmgType}:${!!event.crit}:${!!event.bonus}:${bucket}`;
    const group = groups.get(key);
    if (group) {
      group.amount += Math.max(0, event.amount - event.absorbed);
      group.absorbed += event.absorbed;
    } else {
      groups.set(key, { seq: event.seq, unit: event.unit, amount: Math.max(0, event.amount - event.absorbed),
        absorbed: event.absorbed, dmgType: event.dmgType, crit: !!event.crit, bonus: !!event.bonus,
        age, lane: bucket % 3 });
    }
  }
  return [...groups.values()];
}
