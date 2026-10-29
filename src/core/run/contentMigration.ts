import type { CardCatalog } from '../data/cardLoader';
import type { CommanderCatalog } from '../data/commanderLoader';
import { DataValidationError } from '../data/errors';
import { FieldReader } from '../data/fieldReader';
import type { RelicCatalog } from '../data/relicLoader';
import { cardPrice } from './cardMarket';

/**
 * 콘텐츠 마이그레이션: 카드·유물 데이터(소유자·id·희귀도 등)가 바뀌어도 이전에 만든 저장본을 읽을 수 있게,
 * 저장본(JSON)에 콘텐츠 버전(contentVersion)을 적어 두고 복원할 때 그 뒤에 등록된 마이그레이션을 순서대로 적용한다.
 * 저장 포맷 버전(RUN.FORMAT_VERSION)과는 별개다. 마이그레이션은 data/migrations.json에 데이터로 선언한다 (data/README.md "콘텐츠 마이그레이션").
 */

export type MigrationStep =
  /** 카드 id를 바꾼다 (덱·상점 진열·카드 보상·이벤트 선택지). unlessCommander 지휘관의 런에서는 건드리지 않는다 */
  | { op: 'replaceCard'; from: string; to: string; unlessCommander?: string }
  /**
   * 카드를 지운다 (덱·진열·보상에서 제거). replaceWith가 있으면 그 카드로 바꾸고, 없으면 refundGold×장수를 환불한다.
   * replaceWith가 없으면 이미 제시된 상점 진열 칸은 보상·상점 풀의 카드 shopFallback으로 채운다 (칸 수는 고정이라 비울 수 없다)
   */
  | { op: 'removeCard'; cardId: string; replaceWith?: string; refundGold?: number; shopFallback?: string }
  /** 더 이상 보상·상점에 나오지 않는 카드: 이미 제시된 카드 보상에서 빼고 상점 진열 칸은 shopFallback으로 바꾼다 (덱의 카드는 그대로) */
  | { op: 'withdrawCard'; cardId: string; shopFallback: string }
  /** 유물 id를 바꾼다 (보유·상점·보상) */
  | { op: 'replaceRelic'; from: string; to: string }
  /** 유물을 지운다. replaceWith가 있으면 그 유물로 바꾸고, 없으면 refundGold를 환불한다 */
  | { op: 'removeRelic'; relicId: string; replaceWith?: string; refundGold?: number };

export interface ContentMigration {
  /** 이 마이그레이션을 적용한 뒤의 콘텐츠 버전 (1부터 빠짐없이 이어진다) */
  to: number;
  /** 무엇이 왜 바뀌었는지 (이어하기 알림 머리말) */
  note: string;
  steps: MigrationStep[];
}

/** 마이그레이션 검증에 필요한 카탈로그 */
export interface MigrationRefs {
  cards: CardCatalog;
  relics: RelicCatalog;
  commanders: CommanderCatalog;
}

const OPS = ['replaceCard', 'removeCard', 'withdrawCard', 'replaceRelic', 'removeRelic'] as const;

/** 등록된 마이그레이션 목록. 저장본을 현재 콘텐츠 버전까지 올린다 */
export class ContentMigrations {
  constructor(
    private readonly list: readonly ContentMigration[],
    private readonly refs: MigrationRefs,
  ) {}

  /** 지금 콘텐츠 버전 (마이그레이션이 없으면 0) */
  get current(): number {
    return this.list[this.list.length - 1]?.to ?? 0;
  }

  /** data/migrations.json 구조를 검증해 만든다. 파일 읽기는 호출하는 쪽 책임 */
  static load(data: unknown, refs: MigrationRefs): ContentMigrations {
    const root = FieldReader.of(data, '');
    root.onlyKeys(['version', 'migrations']);
    root.int('version', 1);
    const list = root.array('migrations').map((raw, i) => ContentMigrations.parseMigration(raw, i, refs));
    list.forEach((m, i) => {
      if (m.to !== i + 1) throw new DataValidationError(`migrations[${i}].to`, `1부터 빠짐없이 이어져야 함 (기대: ${i + 1}, 실제: ${m.to})`);
    });
    return new ContentMigrations(list, refs);
  }

  private static parseMigration(raw: unknown, index: number, refs: MigrationRefs): ContentMigration {
    const r = FieldReader.of(raw, `migrations[${index}]`);
    r.onlyKeys(['to', 'note', 'steps']);
    const steps = r.array('steps').map((step, i) => ContentMigrations.parseStep(step, `migrations[${index}].steps[${i}]`, refs));
    if (steps.length === 0) r.fail('steps', '단계가 최소 1개 필요함');
    return { to: r.int('to', 1), note: r.string('note'), steps };
  }

  private static parseStep(raw: unknown, path: string, refs: MigrationRefs): MigrationStep {
    const r = FieldReader.of(raw, path);
    const op = r.enum('op', OPS);
    const card = (key: string): string => {
      const id = r.string(key);
      if (!refs.cards.get(id)) r.fail(key, `cards.json에 없는 카드 "${id}" (바꿀 대상은 현재 있는 카드여야 함)`);
      return id;
    };
    const relic = (key: string): string => {
      const id = r.string(key);
      if (!refs.relics.get(id)) r.fail(key, `relics.json에 없는 유물 "${id}" (바꿀 대상은 현재 있는 유물이어야 함)`);
      return id;
    };
    const shopCard = (key: string): string => {
      const id = card(key);
      const def = refs.cards.get(id);
      if (def && !(['common', 'rare', 'epic'] as string[]).includes(def.rarity)) r.fail(key, `상점에 진열할 수 있는 희귀도(common/rare/epic)여야 함 (실제: ${def.rarity})`);
      return id;
    };
    const refund = (): number | undefined => (r.has('refundGold') ? r.int('refundGold', 1) : undefined);
    const exclusive = (replaceWith: string | undefined, refundGold: number | undefined): void => {
      if (replaceWith !== undefined && refundGold !== undefined) r.fail('refundGold', 'replaceWith와 refundGold는 함께 쓸 수 없음');
    };
    switch (op) {
      case 'replaceCard': {
        r.onlyKeys(['op', 'from', 'to', 'unlessCommander']);
        const from = r.string('from');
        const to = shopCard('to');
        if (from === to) r.fail('to', 'from과 같을 수 없음');
        const step: MigrationStep = { op, from, to };
        if (r.has('unlessCommander')) {
          const id = r.string('unlessCommander');
          if (!refs.commanders.get(id)) r.fail('unlessCommander', `commanders.json에 없는 지휘관 "${id}"`);
          step.unlessCommander = id;
        }
        return step;
      }
      case 'removeCard': {
        r.onlyKeys(['op', 'cardId', 'replaceWith', 'refundGold', 'shopFallback']);
        const cardId = r.string('cardId');
        const replaceWith = r.has('replaceWith') ? shopCard('replaceWith') : undefined;
        const refundGold = refund();
        exclusive(replaceWith, refundGold);
        if (replaceWith !== undefined && r.has('shopFallback')) r.fail('shopFallback', 'replaceWith가 있으면 필요 없음');
        if (replaceWith === undefined && !r.has('shopFallback')) r.fail('shopFallback', 'replaceWith가 없으면 필요함 (상점 진열 칸을 채울 카드)');
        const shopFallback = r.has('shopFallback') ? shopCard('shopFallback') : undefined;
        return { op, cardId, ...(replaceWith === undefined ? {} : { replaceWith }), ...(refundGold === undefined ? {} : { refundGold }), ...(shopFallback === undefined ? {} : { shopFallback }) };
      }
      case 'withdrawCard': {
        r.onlyKeys(['op', 'cardId', 'shopFallback']);
        return { op, cardId: r.string('cardId'), shopFallback: shopCard('shopFallback') };
      }
      case 'replaceRelic': {
        r.onlyKeys(['op', 'from', 'to']);
        const from = r.string('from');
        const to = relic('to');
        if (from === to) r.fail('to', 'from과 같을 수 없음');
        return { op, from, to };
      }
      case 'removeRelic': {
        r.onlyKeys(['op', 'relicId', 'replaceWith', 'refundGold']);
        const relicId = r.string('relicId');
        const replaceWith = r.has('replaceWith') ? relic('replaceWith') : undefined;
        const refundGold = refund();
        exclusive(replaceWith, refundGold);
        return { op, relicId, ...(replaceWith === undefined ? {} : { replaceWith }), ...(refundGold === undefined ? {} : { refundGold }) };
      }
    }
  }

  /**
   * 저장본(JSON)을 현재 콘텐츠 버전으로 올린다. 원본은 바꾸지 않는다. contentVersion이 없으면 0이다.
   * 현재보다 높은 버전(더 새 게임에서 만든 저장본)은 한국어 오류로 거부한다.
   * 돌려주는 notices는 실제로 바뀐 것이 있을 때만 있는 알림 문장들이다.
   */
  migrate(save: unknown): { data: unknown; notices: string[] } {
    if (typeof save !== 'object' || save === null || Array.isArray(save)) return { data: save, notices: [] };
    const root = FieldReader.of(save, 'run');
    let version = 0;
    if (root.has('contentVersion')) version = root.int('contentVersion', 0);
    if (version > this.current) {
      root.fail('contentVersion', `이 저장본은 더 새로운 콘텐츠 버전(${version})으로 만들어져 현재 게임(${this.current})에서 읽을 수 없음`);
    }
    if (version === this.current) return { data: save, notices: [] };
    const data = structuredClone(save) as Record<string, unknown>;
    const notices: string[] = [];
    for (const migration of this.list.filter((m) => m.to > version)) {
      const lines = migration.steps.flatMap((step) => this.apply(step, data));
      if (lines.length > 0) notices.push(`${migration.note} — ${lines.join(', ')}`);
    }
    data.contentVersion = this.current;
    return { data, notices };
  }

  // ---- 단계 적용 (JSON 위에서 직접) ----

  private apply(step: MigrationStep, data: Record<string, unknown>): string[] {
    switch (step.op) {
      case 'replaceCard':
        if (step.unlessCommander !== undefined && data.commanderId === step.unlessCommander) return [];
        return this.changeCard(data, step.from, step.to, undefined, undefined);
      case 'removeCard':
        return this.changeCard(data, step.cardId, step.replaceWith, step.refundGold, step.shopFallback);
      case 'withdrawCard':
        return this.changeCard(data, step.cardId, undefined, undefined, step.shopFallback, false);
      case 'replaceRelic':
        return this.changeRelic(data, step.from, step.to, undefined);
      case 'removeRelic':
        return this.changeRelic(data, step.relicId, step.replaceWith, step.refundGold);
    }
  }

  private cardName(id: string, fallback = id): string {
    return this.refs.cards.get(id)?.name ?? fallback;
  }

  private relicName(id: string): string {
    return this.refs.relics.get(id)?.name ?? id;
  }

  /** from 카드를 to로 바꾼다 (to가 없으면 지우고 refundGold×장수를 환불) */
  private changeCard(data: Record<string, unknown>, from: string, to: string | undefined, refundGold: number | undefined, shopFallback: string | undefined, inDeck = true): string[] {
    const target = to === undefined ? undefined : this.refs.cards.get(to);
    const shopCard = target ?? (shopFallback === undefined ? undefined : this.refs.cards.get(shopFallback));
    let count = 0;
    const deck = inDeck ? pathOf(data, ['forces', 'carryDeck']) : undefined;
    if (deck) {
      for (const pile of ['draw', 'hand', 'discard', 'exhaust']) {
        const cards = deck[pile];
        if (!Array.isArray(cards)) continue;
        deck[pile] = cards.flatMap((card: Record<string, unknown>) => {
          if (card.cardId !== from) return [card];
          count += 1;
          if (target === undefined) return [];
          // 강화 버전이 없는 카드로 바뀌면 강화 표시를 뗀다
          return [{ ...card, cardId: target.id, upgraded: card.upgraded === true && target.upgrade !== undefined }];
        });
      }
    }
    let listed = 0;
    const session = data.session as Record<string, unknown> | null | undefined;
    if (session && typeof session === 'object') {
      if (session.kind === 'reward' && Array.isArray(session.offer)) {
        listed += (session.offer as string[]).filter((id) => id === from).length;
        session.offer = replaceInList(session.offer as string[], from, to);
      }
      if (session.kind === 'shop' && Array.isArray(session.cards)) {
        for (const slot of session.cards as Record<string, unknown>[]) {
          if (slot.cardId !== from) continue;
          listed += 1;
          if (shopCard) {
            slot.cardId = shopCard.id;
            if (shopCard.rarity === 'common' || shopCard.rarity === 'rare' || shopCard.rarity === 'epic') slot.price = cardPrice(shopCard.rarity);
          }
        }
      }
      const pending = pathOf(session, ['state', 'pending']);
      if (pending?.kind === 'gainCard' && Array.isArray(pending.options)) {
        listed += (pending.options as string[]).filter((id) => id === from).length;
        pending.options = replaceInList(pending.options as string[], from, to);
      }
    }
    const name = this.cardName(from, from);
    const lines: string[] = [];
    if (count > 0) {
      if (target) lines.push(`카드 '${name}' ${count}장을 '${target.name}'(으)로 교체`);
      else lines.push(refundGold ? `카드 '${name}' ${count}장 제거 (${this.refund(data, refundGold * count)}G 환불)` : `카드 '${name}' ${count}장 제거`);
    }
    if (listed > 0 && (count === 0 || !inDeck)) {
      lines.push(shopCard && inDeck ? `제시된 보상·진열의 카드 '${name}'을(를) '${shopCard.name}'(으)로 교체` : `제시된 보상·진열에서 카드 '${name}' 제외`);
    }
    return lines;
  }

  /** from 유물을 to로 바꾼다 (to가 없으면 지우고 refundGold를 환불). 이미 to를 가졌으면 from만 지운다 */
  private changeRelic(data: Record<string, unknown>, from: string, to: string | undefined, refundGold: number | undefined): string[] {
    let changed = false;
    const inventory = data.relics as Record<string, unknown> | undefined;
    if (inventory && Array.isArray(inventory.owned) && inventory.owned.includes(from)) {
      const owned = inventory.owned as string[];
      inventory.owned = owned.flatMap((id) => (id !== from ? [id] : to !== undefined && !owned.includes(to) ? [to] : []));
      changed = true;
    }
    const session = data.session as Record<string, unknown> | null | undefined;
    if (session && typeof session === 'object') {
      if (session.kind === 'shop' && Array.isArray(session.relics)) {
        for (const slot of session.relics as Record<string, unknown>[]) {
          if (slot.relicId !== from) continue;
          if (to === undefined) slot.sold = true;
          else slot.relicId = to;
        }
      }
      if (session.kind === 'reward' && session.relic === from) session.relic = to ?? null;
      if (session.kind === 'bossRelic' && Array.isArray(session.offer)) session.offer = replaceInList(session.offer as string[], from, to);
    }
    if (!changed) return [];
    if (to) return [`유물 '${this.relicName(from)}'을(를) '${this.relicName(to)}'(으)로 교체`];
    return [refundGold ? `유물 '${this.relicName(from)}' 제거 (${this.refund(data, refundGold)}G 환불)` : `유물 '${this.relicName(from)}' 제거`];
  }

  private refund(data: Record<string, unknown>, gold: number): number {
    const economy = pathOf(data, ['forces', 'economy']);
    if (economy && typeof economy.balance === 'number') economy.balance += gold;
    return gold;
  }
}

/** 목록에서 from을 to로 바꾼다 (to가 없거나 이미 목록에 있으면 from만 뺀다) */
function replaceInList(list: string[], from: string, to: string | undefined): string[] {
  return list.flatMap((id) => (id !== from ? [id] : to !== undefined && !list.includes(to) ? [to] : []));
}

function pathOf(root: Record<string, unknown>, keys: string[]): Record<string, unknown> | undefined {
  let node: unknown = root;
  for (const key of keys) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === 'object' && node !== null && !Array.isArray(node) ? (node as Record<string, unknown>) : undefined;
}
