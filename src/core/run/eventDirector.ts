import type { EventCatalog } from '../data/eventLoader';
import type { EventChoice, EventDef, EventEffect } from '../data/event';
import { Rng } from '../rng';
import type { CardRewardGenerator } from './cardRewards';
import { deriveSeed } from './seeds';

/** 이벤트가 런 상태를 바꾸는 창구. RunController가 구현해 넘긴다 (이벤트 로직이 런 전체를 몰라도 되게) */
export interface EventHost {
  readonly gold: number;
  readonly hp: number;
  readonly maxHp: number;
  addGold(amount: number): void;
  /** 잔고가 모자라면 false이고 아무것도 바꾸지 않는다 */
  spendGold(amount: number): boolean;
  /** 양수 = 회복(최대 HP까지), 음수 = 피해(사망하지 않음, HP는 1 이상 유지) */
  changeHp(delta: number): void;
  addCard(cardId: string): void;
  /** 제거/강화할 수 있는 덱 카드의 인스턴스 ID 목록 */
  removableCards(): number[];
  upgradableCards(): number[];
  removeCard(instanceId: number): void;
  upgradeCard(instanceId: number): void;
  /** 해당 등급의 1성 유닛을 받을 수 없는 사유 (벤치 가득 참, 유닛 풀 재고 없음 등). 받을 수 있으면 null */
  unitGrantBlocker(tier: number): string | null;
  /** 해당 희귀도의 유물을 받을 수 없는 사유 (남은 유물이 없음). 받을 수 있으면 null */
  relicBlocker(rarity: 'common' | 'rare'): string | null;
  /** 해당 희귀도의 아직 없는 유물 중 무작위 1개를 받고 그 이름을 돌려준다. 받지 못하면 null이고 아무것도 바꾸지 않는다 */
  grantRandomRelic(rarity: 'common' | 'rare', rng: Rng): string | null;
  /** 해당 등급의 무작위 1성 유닛을 받는다. 받지 못하면 false이고 아무것도 바꾸지 않는다 */
  grantRandomUnit(tier: number, rng: Rng): boolean;
}

/** 선택지 뒤에 이어지는 추가 선택: 카드 고르기(획득) 또는 덱 카드 고르기(제거/강화) */
export type PendingPick =
  | { kind: 'gainCard'; options: string[] }
  | { kind: 'removeCard' | 'upgradeCard'; options: number[] };

/** 진행 중인 이벤트 한 건의 상태 (저장 대상) */
export interface EventSessionState {
  eventId: string;
  /** 고른 선택지 인덱스 (아직 안 골랐으면 null) */
  chosen: number | null;
  /** 다음에 실행할 효과 인덱스 */
  nextEffect: number;
  pending: PendingPick | null;
  /** 선택 결과 문장(데이터의 result + 실행 중 알림) */
  messages: string[];
}

export interface ChoiceView {
  text: string;
  enabled: boolean;
  /** 선택 불가 사유 (한국어) */
  reason?: string;
  /** 이 선택지가 유물을 준다 (화면 표시·자동 정책용) */
  grantsRelic?: true;
}

export type DirectorResult = { ok: true } | { ok: false; reason: string };
const OK: DirectorResult = { ok: true };
const fail = (reason: string): DirectorResult => ({ ok: false, reason });

/**
 * 이벤트 진행: 노드마다 결정적으로 이벤트를 고르고, 선택지의 가용성(골드·HP·벤치·덱 조건)을 검사하며,
 * 효과를 순서대로 실행한다. 카드/덱 카드를 직접 고르는 효과는 PendingPick으로 멈췄다가 pick()으로 이어간다.
 * 무작위는 (런 시드, 노드, 효과 순번)에서 파생한 Rng만 쓴다.
 */
export class EventDirector {
  constructor(
    private readonly events: EventCatalog,
    private readonly rewards: CardRewardGenerator,
    private readonly runSeed: number,
  ) {}

  /** 노드에 나올 이벤트: 이미 본 이벤트를 피해 결정적으로 고른다 (모두 봤으면 전체에서) */
  pickEvent(nodeId: string, seen: readonly string[]): EventDef {
    const unseen = this.events.events.filter((e) => !seen.includes(e.id));
    const pool = unseen.length > 0 ? unseen : this.events.events;
    if (pool.length === 0) throw new Error('이벤트 데이터가 없습니다');
    return new Rng(deriveSeed(this.runSeed, 'eventpick', nodeId)).pick(pool);
  }

  start(event: EventDef): EventSessionState {
    return { eventId: event.id, chosen: null, nextEffect: 0, pending: null, messages: [] };
  }

  /** 선택지별 가용성 */
  choiceViews(event: EventDef, host: EventHost): ChoiceView[] {
    return event.choices.map((choice) => {
      const reason = this.unavailableReason(choice, host);
      const relic = choice.effects.some((e) => e.kind === 'gainRelic') ? { grantsRelic: true as const } : {};
      return reason ? { text: choice.text, enabled: false, reason, ...relic } : { text: choice.text, enabled: true, ...relic };
    });
  }

  /** 선택지를 고르고 효과를 실행한다. 추가 선택이 필요하면 state.pending이 채워진다 */
  choose(state: EventSessionState, event: EventDef, index: number, host: EventHost, nodeId: string): DirectorResult {
    if (state.chosen !== null) return fail('이미 선택지를 골랐습니다');
    const choice = event.choices[index];
    if (!choice) return fail('올바른 선택지를 고르세요');
    const reason = this.unavailableReason(choice, host);
    if (reason) return fail(reason);
    const messageCount = state.messages.length;
    state.chosen = index;
    state.messages.push(choice.result);
    const result = this.advance(state, choice, host, nodeId);
    if (!result.ok && state.nextEffect === 1) {
      // 첫 효과에서 실패했으면 아무것도 적용되지 않았으므로 선택하지 않은 상태로 되돌린다
      state.chosen = null;
      state.nextEffect = 0;
      state.pending = null;
      state.messages.length = messageCount;
    }
    return result;
  }

  /** 추가 선택(카드 고르기)을 처리하고 남은 효과를 이어서 실행한다 */
  pick(state: EventSessionState, event: EventDef, optionIndex: number, host: EventHost, nodeId: string): DirectorResult {
    const pending = state.pending;
    if (!pending || state.chosen === null) return fail('지금 고를 카드가 없습니다');
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= pending.options.length) return fail('올바른 항목을 고르세요');
    if (pending.kind === 'gainCard') host.addCard(pending.options[optionIndex] as string);
    else if (pending.kind === 'removeCard') host.removeCard(pending.options[optionIndex] as number);
    else host.upgradeCard(pending.options[optionIndex] as number);
    state.pending = null;
    return this.advance(state, event.choices[state.chosen] as EventChoice, host, nodeId);
  }

  /** 모든 효과가 끝났는가 (선택했고 대기 중인 추가 선택도 없음) */
  isFinished(state: EventSessionState, event: EventDef): boolean {
    return state.chosen !== null && state.pending === null && state.nextEffect >= (event.choices[state.chosen]?.effects.length ?? 0);
  }

  // ---- 내부 ----

  private advance(state: EventSessionState, choice: EventChoice, host: EventHost, nodeId: string): DirectorResult {
    while (state.pending === null && state.nextEffect < choice.effects.length) {
      const index = state.nextEffect++;
      const result = this.apply(choice.effects[index] as EventEffect, state, host, new Rng(deriveSeed(this.runSeed, 'event', nodeId, index)));
      if (!result.ok) return result;
    }
    return OK;
  }

  private apply(effect: EventEffect, state: EventSessionState, host: EventHost, rng: Rng): DirectorResult {
    switch (effect.kind) {
      case 'gold':
        if (effect.amount > 0) host.addGold(effect.amount);
        else if (!host.spendGold(-effect.amount)) return fail('골드가 부족합니다');
        return OK;
      case 'commanderHp':
        host.changeHp(effect.amount);
        return OK;
      case 'gainCard':
        if (effect.mode === 'fixed') host.addCard(effect.cardId);
        else if (effect.mode === 'random') host.addCard(this.rewards.pickRandom(effect.rarity, rng));
        else state.pending = { kind: 'gainCard', options: this.rewards.pickDistinct(effect.rarity, effect.count, rng) };
        return OK;
      case 'removeCard':
      case 'upgradeCard': {
        const ids = effect.kind === 'removeCard' ? host.removableCards() : host.upgradableCards();
        if (ids.length === 0) return OK; // 가용성 검사를 통과한 뒤 앞선 효과로 없어진 경우만 해당: 건너뜀
        if (effect.mode === 'choose') state.pending = { kind: effect.kind, options: ids };
        else if (effect.kind === 'removeCard') host.removeCard(rng.pick(ids));
        else host.upgradeCard(rng.pick(ids));
        return OK;
      }
      case 'gainUnit': {
        // 가용성 검사 이후에도 받지 못하면 실패로 알린다 (골드만 빠지고 유닛이 없는 상태를 남기지 않는다)
        const blocker = host.unitGrantBlocker(effect.tier);
        if (blocker) return fail(blocker);
        if (!host.grantRandomUnit(effect.tier, rng)) return fail('유닛을 받을 수 없습니다');
        return OK;
      }
      case 'gainRelic':
      {
        const name = host.grantRandomRelic(effect.rarity, rng);
        if (name === null) return fail('받을 수 있는 유물이 없습니다');
        state.messages.push(`유물 획득: ${name}`);
        return OK;
      }
    }
  }

  /** 선택 불가 사유 (가능하면 null). 효과를 순서대로 가정해 골드·HP를 따라가며 확인한다 */
  private unavailableReason(choice: EventChoice, host: EventHost): string | null {
    let gold = host.gold;
    let hp = host.hp;
    for (const effect of choice.effects) {
      switch (effect.kind) {
        case 'gold':
          gold += effect.amount;
          if (gold < 0) return `골드가 부족합니다 (${-effect.amount}G 필요)`;
          break;
        case 'commanderHp':
          hp = Math.min(host.maxHp, hp + effect.amount);
          if (hp < 1) return '지휘관 HP가 부족합니다 (이벤트로는 쓰러지지 않습니다)';
          break;
        case 'gainUnit':
          {
            const blocker = host.unitGrantBlocker(effect.tier);
            if (blocker) return blocker;
          }
          break;
        case 'gainRelic':
          {
            const blocker = host.relicBlocker(effect.rarity);
            if (blocker) return blocker;
          }
          break;
        case 'removeCard':
          if (host.removableCards().length === 0) return '제거할 수 있는 카드가 없습니다';
          break;
        case 'upgradeCard':
          if (host.upgradableCards().length === 0) return '강화할 수 있는 카드가 없습니다';
          break;
        case 'gainCard':
          break;
      }
    }
    return null;
  }
}
