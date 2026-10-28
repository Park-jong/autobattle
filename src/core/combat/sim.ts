import { Deck, type DeckSnapshot } from '../cards/deck';
import type { CardCatalog } from '../data/cardLoader';
import type { CommanderDef } from '../data/commander';
import type { RelicEffect } from '../data/relic';
import { resolveEffect } from '../data/effect';
import type { TraitCatalog } from '../data/traitLoader';
import type { UnitCatalog } from '../data/unitLoader';
import { Rng } from '../rng';
import type { Cell, Side } from './board';
import { ULTIMATE_COMMAND_ID, type CardCommand, type PlayResult, type PlayTarget, type RejectedCommand } from './cardCommand';
import { CardPlayer, type CombatPhase } from './cardPlayer';
import { CARDS } from '../cards/constants';
import { RelicCombatRules } from './relicRules';
import { UltimateSystem, type UltimateView } from './ultimate';
import { CombatCommandPoints } from './combatCp';
import { ColumnStrikeRunner } from './bossPattern';
import { CommanderHpLedger } from './commanderHp';
import { COMBAT } from './constants';
import { MutationSystem, type MutationId } from './mutations';
import { EffectExecutor } from './effects';
import type { CombatEvent, Winner } from './events';
import { assertFormationValid, type Formation } from './formation';
import { ManaSystem } from './manaSystem';
import { StatusRules } from './statusRules';
import { TraitEngine, type ActiveTrait } from './traits';
import { CombatUnit } from './unit';
import { UnitController } from './unitController';
import { CombatWorld } from './world';

/**
 * 카드 시스템 입력 (아군 side 0만 카드를 쓴다).
 * 이것이 있으면 CP·덱·지휘관 패시브가 켜지고, 없으면 M1과 완전히 같은 전투(cp·cardPlayed 이벤트 없음)다.
 */
export interface CombatCardSetup {
  /** 지휘관(패시브·CP 보정). null이면 지휘관 없음 */
  commander: CommanderDef | null;
  /** 전투 시작 시점의 덱 상태 (손패 포함). 시뮬이 복원해 쓰므로 원본은 바뀌지 않는다 */
  deck: DeckSnapshot;
  /** 예약된 카드 사용 명령 (기록해 둔 명령을 그대로 다시 넣으면 같은 로그가 나온다) */
  commands?: readonly CardCommand[];
  /**
   * 이 전투에서 카드 비용으로 쓸 수 있는 지휘관 HP (런의 현재 HP). 사용 후 1 이상 남아야 쓸 수 있다.
   * 생략하면 제한 없음(디버그 전투). 실제 차감은 commanderHp 이벤트를 보고 런이 한다.
   */
  commanderHp?: number;
  /** 보유 유물의 효과 (전투와 무관한 효과는 무시한다). 생략하면 유물 없음 */
  relics?: readonly RelicEffect[];
}

/**
 * 적(side 1) 진영 보정: 층별 스탯 배율과 정예 변이. 생략하면 보정 없음(기존 전투와 완전히 같다).
 * 배율은 편성 유닛의 최대 HP·ATK에만 곱해지고(소환 유닛 제외), 변이는 MutationSystem이 설치한다.
 */
export interface EnemyModifiers {
  hpMult?: number;
  atkMult?: number;
  mutations?: readonly MutationId[];
}

/** 전투 입력: 양측 편성(side 0 = 아군 열 0~3, side 1 = 적 열 4~7), 시드, (선택) 카드 시스템 */
export interface CombatSetup {
  seed: number;
  formations: readonly [Formation, Formation];
  cards?: CombatCardSetup;
  enemy?: EnemyModifiers;
}

export interface Survivor {
  uid: number;
  unitId: string;
  side: Side;
  star: number;
  hp: number;
  maxHp: number;
  cell: Cell;
  temporary?: true;
}

export interface CombatResult {
  winner: Winner;
  reason: 'annihilation' | 'timeout';
  /** 종료 시각(초) */
  endTime: number;
  survivors: Survivor[];
  events: CombatEvent[];
}

/**
 * 틱 기반 전투 시뮬레이터 (Phaser·DOM 비의존).
 *
 * 한 틱(0.1초)의 처리 순서
 *   0. (첫 틱) 전투 시작: 전투 CP 지급. 이 틱에 예약된 카드 명령 실행
 *   1. 과열 시작 알림, onTick 트리거
 *   2. 모든 유닛의 만료 상태 제거
 *   3. 살아 있는 유닛을 시드 Rng로 섞은 순서대로: 주기 효과(화상·오라) → 행동(이동·공격·스킬)
 *   4. 종료 판정 (한쪽 전멸 → 상대 승리, 동시 전멸 → 무승부, 90초 → 무승부)
 *   5. 아직 진행 중이면 tick += 1, 새 틱에서 CP 자연 증가 판정
 * 같은 시드·편성이면 이벤트 로그가 완전히 같다.
 *
 * 카드 시스템(setup.cards)이 있을 때의 시작 순서
 *   생성 시: 스폰 → 특성 효과 → 지휘관 패시브 → 준비 CP 지급 → 준비 단계 작전 카드(틱 0 작전 명령)
 *   첫 step(): 전투 CP 지급 → 이 틱의 예약 명령 → 위의 틱 처리
 * 카드는 항상 틱 처리 앞에서 실행되고 CP 증가는 틱이 넘어간 직후에 일어나므로,
 * 외부에서 틱 사이에 playCard를 호출하는 것과 같은 틱의 예약 명령은 CP·이벤트 순서가 똑같다.
 */
export class CombatSimulator {
  readonly world: CombatWorld;
  /** 진영별 특성 단계 계산 결과 */
  readonly activeTraits: readonly [ActiveTrait[], ActiveTrait[]];
  /** 카드 시스템이 켜졌을 때의 덱(시뮬이 복원한 사본). 전투가 끝나면 손패 정리까지 끝난 상태 */
  readonly deck: Deck | null = null;
  /** 카드 시스템이 켜졌을 때의 CP */
  readonly commandPoints: CombatCommandPoints | null = null;
  /** 실패한 예약 명령 (이벤트 로그에는 남기지 않는다) */
  readonly rejectedCommands: RejectedCommand[] = [];

  private readonly rules: StatusRules;
  private readonly controller: UnitController;
  private readonly player: CardPlayer | null = null;
  private readonly ultimateSystem: UltimateSystem | null = null;
  private readonly cardCatalog: CardCatalog | null;
  /** 아직 실행하지 않은 예약 명령 (tick 오름차순, 같은 틱은 입력 순서) */
  private readonly pending: CardCommand[] = [];
  private readonly playedCommands: CardCommand[] = [];
  private phaseValue: CombatPhase = 'prep';
  private outcome: { winner: Winner; reason: 'annihilation' | 'timeout' } | null = null;

  constructor(setup: CombatSetup, units: UnitCatalog, traits: TraitCatalog, cardCatalog?: CardCatalog) {
    this.world = new CombatWorld(new Rng(setup.seed));
    const world = this.world;
    const cardSetup = setup.cards;
    if (cardSetup && !cardCatalog) throw new Error('setup.cards를 쓰려면 카드 카탈로그가 필요함');
    this.cardCatalog = cardCatalog ?? null;
    const relics = new RelicCombatRules(cardSetup?.relics ?? []);
    if (cardSetup) this.commandPoints = new CombatCommandPoints(world, (cardSetup.commander?.startCpBonus ?? 0) + relics.startCp);
    if (cardSetup && cardCatalog) {
      const deckOptions = relics.handLimitBonus > 0 ? { handLimit: CARDS.HAND_LIMIT + relics.handLimitBonus } : {};
      this.deck = Deck.restore(cardSetup.deck, cardCatalog, new Rng(0), deckOptions);
    }
    const executor = new EffectExecutor(world, this.commandPoints, this.deck, units);
    const enemyScale = { hp: setup.enemy?.hpMult ?? 1, atk: setup.enemy?.atkMult ?? 1 };
    new ManaSystem(world);
    this.rules = new StatusRules(world);
    this.controller = new UnitController(world, executor);

    const defsBySide: [CombatUnit['def'][], CombatUnit['def'][]] = [[], []];
    for (const side of [0, 1] as const) {
      const formation = setup.formations[side];
      assertFormationValid(side, formation, units);
      for (const entry of formation) {
        const def = units.get(entry.unitId);
        if (!def) throw new Error(`알 수 없는 유닛 "${entry.unitId}"`); // assertFormationValid가 이미 확인
        const unit = new CombatUnit(world.units.length, side, def, entry.star, entry.cell, world.clock, side === 1 ? enemyScale : undefined);
        world.addUnit(unit);
        defsBySide[side].push(def);
        world.emit({
          type: 'spawn',
          unit: unit.uid,
          unitId: def.id,
          side,
          star: unit.star,
          cell: unit.cell,
          hp: unit.hp,
          maxHp: unit.maxHp,
          mana: unit.mana,
          maxMana: unit.maxMana,
        });
        for (const equipmentId of entry.equipment ?? []) {
          const upgraded = equipmentId.endsWith('+');
          const id = upgraded ? equipmentId.slice(0, -1) : equipmentId;
          const equipment = cardCatalog?.get(id);
          if (!equipment || equipment.type !== 'equipment') throw new Error(`알 수 없는 장비 ${equipmentId}`);
          const effects = upgraded ? equipment.upgrade?.effects : equipment.effects;
          if (!effects) throw new Error(`강화 장비 정의가 없습니다: ${equipmentId}`);
          unit.equipment.push(equipmentId);
          executor.execute(effects.map((e) => resolveEffect(e, 0)), { side, caster: null, targets: [unit] });
        }
      }
    }

    for (const unit of world.units) {
      if (unit.def.pattern) new ColumnStrikeRunner(world, executor, unit, unit.def.pattern).install();
    }

    const engine = new TraitEngine(traits);
    this.activeTraits = [engine.apply(0, defsBySide[0], executor, relics.traitBonusMinUnits), engine.apply(1, defsBySide[1], executor)];

    if (cardSetup && cardCatalog && this.commandPoints && this.deck) {
      const ledger = new CommanderHpLedger(cardSetup.commanderHp);
      const passiveSpell = cardSetup.commander?.passive.spellDamagePct ?? 0;
      const modifiers = { spellDamagePct: passiveSpell + relics.spellDamagePct, hpCostReduction: relics.hpCostReduction };
      this.player = new CardPlayer(world, executor, this.commandPoints, this.deck, cardCatalog, this.activeTraits[0], ledger, modifiers);
      // 지휘관 패시브: 특성 효과 바로 다음, 같은 시점(틱 0 이전)에 아군 기준으로 한 번 적용
      if (cardSetup.commander) {
        const passive = cardSetup.commander.passive.effects.map((e) => resolveEffect(e, 0));
        executor.execute(passive, { side: 0, caster: null, targets: [] });
        const ultimate = cardSetup.commander.ultimate;
        if (ultimate) {
          this.ultimateSystem = new UltimateSystem(world, executor, ultimate, cardSetup.commander.id, ledger, this.commandPoints, relics.ultimateChargeMult);
          this.ultimateSystem.install();
        }
      }
      relics.install(world, executor, this.commandPoints);
      this.commandPoints.startPrep();
      this.scheduleCommands(cardSetup.commands ?? []);
    }
    const mutations = setup.enemy?.mutations ?? [];
    if (mutations.length > 0) {
      const disrupt = this.player && this.deck ? { deck: this.deck, player: this.player } : null;
      new MutationSystem(world, executor, mutations, setup.seed, disrupt).install();
    }
    this.checkEnd();
  }

  /** 궁극기 상태 (지휘관에게 궁극기가 없거나 카드 시스템이 꺼져 있으면 null) */
  get ultimate(): UltimateView | null {
    return this.ultimateSystem?.view(this.phaseValue) ?? null;
  }

  /**
   * 지금 이 틱(world.tick)에 궁극기를 쓴다. 틱과 틱 사이에 호출한다. 전투 중(startCombat 이후)에 게이지가 가득 찼고
   * 전투당 1회를 쓰지 않았으며 지휘관 HP가 모자라지 않을 때만 성공한다.
   * 성공하면 commandLog에 ULTIMATE_COMMAND_ID 명령으로 남고, 실패하면 사유만 반환하며 상태·로그가 그대로다.
   */
  useUltimate(): PlayResult {
    if (!this.ultimateSystem) return { ok: false, reason: '사용할 수 있는 궁극기가 없습니다' };
    const result = this.ultimateSystem.use(this.phaseValue);
    if (result.ok) {
      this.playedCommands.push({ tick: this.world.tick, cardInstanceId: ULTIMATE_COMMAND_ID, target: { kind: 'none' } });
      this.checkEnd();
    }
    return result;
  }

  /** 방해 변이로 이 카드에 붙은 추가 비용 (이번 전투 한정). 카드 시스템이 없으면 0 */
  cardSurcharge(instanceId: number): number {
    return this.player?.surchargeOf(instanceId) ?? 0;
  }

  /** 이 전투에서 카드로 잃은 지휘관 HP 합계 (런 정산용; commanderHp 이벤트 합과 같다) */
  get commanderHpSpent(): number {
    return this.player?.hpSpent ?? 0;
  }

  get finished(): boolean {
    return this.outcome !== null;
  }

  /** 준비(전투 시작 전) / 전투 / 종료 */
  get phase(): CombatPhase {
    return this.phaseValue;
  }

  /** 지금까지의 이벤트 로그 (진행 중에도 조회 가능, 읽기 전용으로 쓸 것) */
  get events(): readonly CombatEvent[] {
    return this.world.events;
  }

  /** 지금까지 성공한 카드 사용 명령의 기록. 그대로 setup.cards.commands에 넣으면 같은 전투가 재현된다 */
  get commandLog(): readonly CardCommand[] {
    return this.playedCommands;
  }

  /** 소환 유닛은 제외한 원본 유닛의 장비. 강화 카드는 ID 뒤에 +를 붙여 저장한다. */
  get equippedItems(): ReadonlyMap<number, readonly string[]> {
    return new Map(this.world.units.filter((u) => !u.temporary).map((u) => [u.uid, [...u.equipment]]));
  }

  /**
   * 전투 시작: 준비 단계를 끝내고 전투 CP를 지급한다 (남은 준비 CP는 소멸). 이미 시작했으면 아무것도 안 함.
   * step()이 첫 호출 때 자동으로 부르며, 틱 0에 직접 카드를 쓰려는 UI는 먼저 부른다.
   */
  startCombat(): void {
    if (this.phaseValue !== 'prep' || this.outcome) return;
    this.phaseValue = 'combat';
    this.commandPoints?.startCombat();
  }

  /**
   * 지금 이 틱(world.tick)에 카드를 사용한다. 틱과 틱 사이에 호출한다.
   * 성공하면 commandLog에 남고, 실패하면 사유만 반환하며 CP·카드·이벤트 로그 모두 그대로다.
   * 작전 카드는 준비 단계(전투 시작 전)에만, 명령·주문 카드는 startCombat() 이후에만 쓸 수 있다.
   */
  playCard(cardInstanceId: number, target: PlayTarget): PlayResult {
    if (!this.player) return { ok: false, reason: '카드 시스템이 없는 전투입니다' };
    const result = this.player.play(this.phaseValue, cardInstanceId, target);
    if (result.ok) {
      this.playedCommands.push({ tick: this.world.tick, cardInstanceId, target: structuredClone(target) });
      this.checkEnd();
    }
    return result;
  }

  /** 틱 번호가 tick이 될 때까지(그 틱은 처리 전) 진행한다. 먼저 끝나면 거기서 멈춘다 */
  runUntil(tick: number): void {
    while (!this.outcome && this.world.tick < tick) this.step();
  }

  /** 1틱 진행. 이미 끝났으면 아무것도 하지 않는다. */
  step(): void {
    if (this.outcome) return;
    const world = this.world;
    this.startCombat();
    this.runScheduledCommands();
    if (this.outcome) return;
    if (this.ultimateSystem?.advance()) {
      this.checkEnd();
      if (this.outcome) return;
    }

    if (world.tick === COMBAT.OVERHEAT_START_SECONDS * COMBAT.TICKS_PER_SECOND) world.emit({ type: 'overheat' });
    world.bus.emit('onTick', { tick: world.tick, time: world.now });
    this.rules.expireAll();

    for (const unit of world.rng.shuffle(world.aliveUnits())) {
      if (!unit.alive) continue;
      this.rules.processPeriodic(unit);
      this.controller.act(unit);
    }

    this.checkEnd();
    if (!this.outcome) {
      world.tick += 1;
      this.commandPoints?.regen(world.tick);
    }
  }

  /** 끝날 때까지 진행하고 결과를 반환 */
  run(): CombatResult {
    while (!this.outcome) this.step();
    return this.result();
  }

  result(): CombatResult {
    if (!this.outcome) throw new Error('전투가 아직 끝나지 않음');
    const survivors = this.world.aliveUnits().map((u) => ({
      uid: u.uid,
      unitId: u.def.id,
      side: u.side,
      star: u.star,
      hp: u.hp,
      maxHp: u.maxHp,
      cell: u.cell,
      ...(u.temporary ? { temporary: true as const } : {}),
    }));
    return { ...this.outcome, endTime: this.world.now, survivors, events: this.world.events };
  }

  private checkEnd(): void {
    const world = this.world;
    const alive0 = world.alliesOf(0).length;
    const alive1 = world.alliesOf(1).length;
    let outcome: { winner: Winner; reason: 'annihilation' | 'timeout' } | null = null;

    if (alive0 === 0 || alive1 === 0) {
      const winner: Winner = alive0 === 0 && alive1 === 0 ? 'draw' : alive0 === 0 ? 1 : 0;
      outcome = { winner, reason: 'annihilation' };
    } else if (world.now >= COMBAT.HARD_LIMIT_SECONDS - COMBAT.EPS) {
      outcome = { winner: 'draw', reason: 'timeout' };
    }
    if (!outcome) return;
    this.outcome = outcome;
    this.phaseValue = 'ended';
    this.deck?.endCombat();
    world.emit({ type: 'end', winner: outcome.winner, reason: outcome.reason });
  }

  // ---- 예약 카드 명령 ----

  /**
   * 예약 명령을 등록한다. 틱 0의 작전 카드는 준비 단계에서 입력 순서대로 바로 실행하고,
   * 나머지는 해당 틱이 되면 실행한다 (같은 틱은 입력 순서).
   */
  private scheduleCommands(commands: readonly CardCommand[]): void {
    commands.forEach((c, i) => {
      if (!Number.isInteger(c.tick) || c.tick < 0) {
        throw new Error(`카드 명령[${i}]: 틱은 0 이상의 정수여야 함 (실제: ${c.tick})`);
      }
    });
    const ordered = commands
      .map((command, index) => ({ command, index }))
      .sort((a, b) => a.command.tick - b.command.tick || a.index - b.index)
      .map((e) => e.command);
    for (const command of ordered) {
      if (command.tick === 0 && this.isOperationInHand(command.cardInstanceId)) this.runCommand(command);
      else this.pending.push(command);
    }
  }

  private isOperationInHand(instanceId: number): boolean {
    const instance = this.deck?.findInHand(instanceId);
    const type = instance ? this.cardCatalog?.get(instance.cardId)?.type : undefined;
    return type === 'operation' || type === 'equipment';
  }

  private runScheduledCommands(): void {
    while (this.pending.length > 0 && (this.pending[0] as CardCommand).tick <= this.world.tick) {
      this.runCommand(this.pending.shift() as CardCommand);
    }
  }

  private runCommand(command: CardCommand): void {
    const result = command.cardInstanceId === ULTIMATE_COMMAND_ID ? this.useUltimate() : this.playCard(command.cardInstanceId, command.target);
    if (!result.ok) this.rejectedCommands.push({ command, reason: result.reason });
  }
}
