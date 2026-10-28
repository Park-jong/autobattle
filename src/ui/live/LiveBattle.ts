import {
  CombatSimulator,
  COMBAT,
  type CombatResult,
  type CombatSetup,
  type PlayResult,
  type PlayTarget,
} from '../../core/combat';
import type { CardCatalog } from '../../core/data/cardLoader';
import type { TraitCatalog } from '../../core/data/traitLoader';
import type { UnitCatalog } from '../../core/data/unitLoader';
import { ReplayState } from '../replay/ReplayState';

/** 틱 경계 비교용 허용 오차(초) */
const EPS = 1e-6;

/**
 * 진행 중인 전투 하나: 시뮬(CombatSimulator)을 재생 시각에 맞춰 조금씩 돌리고, 그 로그를 ReplayState가 따라 읽는다
 * (Phaser·DOM 비의존). 전투를 미리 끝까지 계산하지 않으므로 카드를 "지금 진행된 틱"에서 쓸 수 있다.
 *
 * 시각 t(초)까지 보여주려면 틱 0..floor(t×10)을 처리해야 하므로 advance는 그만큼만 sim을 진행한다.
 * 카드는 처리 직전의 틱(sim.world.tick)에서 쓰이고 그 효과는 다음 틱 경계 시각부터 보인다 (최대 0.1초 뒤).
 * 사용한 카드는 sim.commandLog에 남으므로 같은 입력으로 미리 예약해 한 번에 돌려도 같은 로그가 나온다.
 */
export class LiveBattle {
  readonly sim: CombatSimulator;
  readonly replay: ReplayState;
  private elapsed = 0;
  private scanned = 0;
  private readonly uses = new Map<string, number>();

  /** 편성·시드로 새 시뮬을 만들어 재생한다 */
  constructor(setup: CombatSetup, units: UnitCatalog, traits: TraitCatalog, cards?: CardCatalog);
  /** 이미 만들어진 시뮬(런 코어가 발급한 전투)을 그대로 재생한다 */
  constructor(sim: CombatSimulator);
  constructor(source: CombatSetup | CombatSimulator, units?: UnitCatalog, traits?: TraitCatalog, cards?: CardCatalog) {
    this.sim = source instanceof CombatSimulator ? source : new CombatSimulator(source, units as UnitCatalog, traits as TraitCatalog, cards);
    this.replay = new ReplayState(this.sim.events);
    this.sync();
  }

  /** 재생 시각(초) */
  get time(): number {
    return this.elapsed;
  }

  /** 전투가 끝났고 재생도 끝 시각에 도달했는지 */
  get finished(): boolean {
    return this.sim.finished && this.elapsed >= this.sim.world.now - EPS;
  }

  /** 준비 단계가 끝나고 전투가 시작되었는지 */
  get combatStarted(): boolean {
    return this.sim.phase !== 'prep';
  }

  /** 이번 전투에서 성공한 카드 사용 횟수 (준비 단계 작전 카드 포함) */
  get cardsPlayed(): number {
    return this.sim.commandLog.length;
  }

  /** 준비 단계를 끝내고 전투 CP를 지급한다 (틱 0에서 명령 카드를 쓰려면 먼저 부른다) */
  startCombat(): void {
    this.sim.startCombat();
    this.sync();
  }

  /** 재생 시각을 dtSeconds(이미 시간 배율이 적용된 값)만큼 앞으로 보내고, 필요한 만큼 sim을 진행한다 */
  advance(dtSeconds: number): void {
    if (dtSeconds <= 0 || this.finished) return;
    this.elapsed += dtSeconds;
    this.sim.runUntil(Math.floor(this.elapsed * COMBAT.TICKS_PER_SECOND + EPS) + 1);
    if (this.sim.finished) this.elapsed = Math.min(this.elapsed, this.sim.world.now);
    this.replay.advanceTo(this.elapsed);
  }

  /** 지금 진행된 틱에서 카드를 쓴다. 실패하면 사유만 돌려주고 아무것도 바뀌지 않는다 */
  playCard(instanceId: number, target: PlayTarget): PlayResult {
    const result = this.sim.playCard(instanceId, target);
    if (result.ok) this.sync();
    return result;
  }

  /** 이번 전투에서 이 카드(id)를 쓴 횟수 */
  usesOf(cardId: string): number {
    const events = this.sim.events;
    for (; this.scanned < events.length; this.scanned++) {
      const e = events[this.scanned];
      if (e?.type === 'cardPlayed') this.uses.set(e.cardId, (this.uses.get(e.cardId) ?? 0) + 1);
    }
    return this.uses.get(cardId) ?? 0;
  }

  result(): CombatResult {
    return this.sim.result();
  }

  /** 시간을 흘리지 않고, 현재 시각 이하로 새로 쌓인 이벤트(카드 효과 등)를 재생 상태에 반영한다 */
  private sync(): void {
    this.replay.advanceTo(this.replay.time);
  }
}
