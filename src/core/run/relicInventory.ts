import type { RelicDef, RelicEffect } from '../data/relic';
import type { RelicCatalog } from '../data/relicLoader';
import { FieldReader } from '../data/fieldReader';
import type { ManagementPerks } from '../management';

/** 저장용 상태: 보유 유물(획득 순서)과 한도가 있는 효과의 사용량 */
export interface RelicInventoryState {
  owned: string[];
  /** 쌍둥이 거울로 합성한 횟수 (런 누적) */
  mirrorUsed: number;
  /** 이번 노드에서 쓴 무료 리롤 횟수 (노드에 들어갈 때 0으로 돌아간다) */
  freeRerollsUsed: number;
}

/**
 * 런이 보유한 유물. 효과 합산 조회(전투·경제·덱·런이 각자 필요한 수치만 읽는다)와
 * 한도가 있는 효과(무료 리롤, 쌍둥이 거울)의 사용량을 관리한다.
 * 유물이 하나도 없으면 모든 합이 0이라 기본 규칙과 같다.
 */
export class RelicInventory implements ManagementPerks {
  private ownedIds: string[] = [];
  private mirrorUsed = 0;
  private freeRerollsUsed = 0;

  constructor(private readonly catalog: RelicCatalog) {}

  get ids(): readonly string[] {
    return this.ownedIds;
  }

  get size(): number {
    return this.ownedIds.length;
  }

  has(id: string): boolean {
    return this.ownedIds.includes(id);
  }

  /** 보유 유물 정의 (획득 순서) */
  defs(): RelicDef[] {
    return this.ownedIds.map((id) => this.catalog.get(id) as RelicDef);
  }

  /** 모든 보유 유물의 효과를 펼친 목록 */
  effects(): RelicEffect[] {
    return this.defs().flatMap((def) => def.effects);
  }

  /** 유물을 추가한다. 없는 유물이거나 이미 가진 유물이면 Error (같은 유물 중복 획득 금지) */
  add(id: string): RelicDef {
    const def = this.catalog.get(id);
    if (!def) throw new Error(`알 수 없는 유물 "${id}"`);
    if (this.has(id)) throw new Error(`이미 가진 유물입니다: ${def.name}`);
    this.ownedIds.push(id);
    return def;
  }

  /**
   * 테스트 런 전용: 유물을 뺀다. 없는 유물이면 Error. 한도가 있는 효과의 사용량은 남은 한도로 줄인다.
   * 획득 때 한 번 적용된 즉시 효과(카드 강화, 쌍둥이 거울 합성)는 되돌리지 않는다.
   */
  remove(id: string): RelicDef {
    const def = this.catalog.get(id);
    if (!def || !this.has(id)) throw new Error(`가지고 있지 않은 유물입니다: ${def?.name ?? id}`);
    this.ownedIds = this.ownedIds.filter((owned) => owned !== id);
    this.mirrorUsed = Math.min(this.mirrorUsed, this.sum('mirrorMerge', (e) => e.count));
    this.freeRerollsUsed = Math.min(this.freeRerollsUsed, this.sum('freeReroll', (e) => e.count));
    return def;
  }

  /** 한 종류 효과의 한 필드를 합산한다 (예: sum('winGold', 'amount')) */
  sum<K extends RelicEffect['kind']>(kind: K, pick: (effect: Extract<RelicEffect, { kind: K }>) => number): number {
    return this.effects().reduce((total, e) => (e.kind === kind ? total + pick(e as Extract<RelicEffect, { kind: K }>) : total), 0);
  }

  // ---- 노드·런 단위 한도 (ManagementPerks) ----

  /** 새 노드에 들어갈 때: 무료 리롤 사용량 초기화 */
  beginNode(): void {
    this.freeRerollsUsed = 0;
  }

  consumeFreeReroll(): boolean {
    const allowed = this.sum('freeReroll', (e) => e.count);
    if (this.freeRerollsUsed >= allowed) return false;
    this.freeRerollsUsed += 1;
    return true;
  }

  mirrorMergeAvailable(): boolean {
    return this.mirrorUsed < this.sum('mirrorMerge', (e) => e.count);
  }

  consumeMirrorMerge(): void {
    this.mirrorUsed += 1;
  }

  // ---- 저장 ----

  serialize(): RelicInventoryState {
    return { owned: [...this.ownedIds], mirrorUsed: this.mirrorUsed, freeRerollsUsed: this.freeRerollsUsed };
  }

  /** 저장된 상태로 덮어쓴다. 잘못된 데이터는 위치가 담긴 한국어 오류 */
  load(data: unknown, path: string): void {
    const r = FieldReader.of(data, path);
    r.onlyKeys(['owned', 'mirrorUsed', 'freeRerollsUsed']);
    const seen = new Set<string>();
    const owned = r.array('owned').map((id, i) => {
      if (typeof id !== 'string' || !this.catalog.get(id)) r.fail(`owned[${i}]`, `relics.json에 없는 유물 ${JSON.stringify(id)}`);
      if (seen.has(id as string)) r.fail(`owned[${i}]`, `중복된 유물 "${id as string}"`);
      seen.add(id as string);
      return id as string;
    });
    const mirrorUsed = r.int('mirrorUsed', 0);
    const freeRerollsUsed = r.int('freeRerollsUsed', 0);
    this.ownedIds = owned;
    this.mirrorUsed = mirrorUsed;
    this.freeRerollsUsed = freeRerollsUsed;
    const mirrors = this.sum('mirrorMerge', (e) => e.count);
    if (mirrorUsed > mirrors) r.fail('mirrorUsed', `쌍둥이 거울 합성 기회(${mirrors})를 넘음`);
    const rerolls = this.sum('freeReroll', (e) => e.count);
    if (freeRerollsUsed > rerolls) r.fail('freeRerollsUsed', `무료 리롤 횟수(${rerolls})를 넘음`);
  }
}
