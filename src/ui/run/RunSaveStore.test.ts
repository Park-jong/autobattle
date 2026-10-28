import { describe, expect, it } from 'vitest';
import { newRun, runDeps, driveTo, finishBattle } from '../../core/run/testSupport';
import { RunSaveStore } from './RunSaveStore';
import { BrowserRunStorage, MemoryRunStorage, type RunStorage, type StorageLike } from './RunStorage';

/** 쓰기 횟수를 세는 메모리 저장소 */
class CountingStorage extends MemoryRunStorage {
  writes = 0;
  override write(text: string): string | null {
    this.writes++;
    return super.write(text);
  }
}

describe('RunSaveStore', () => {
  it('저장 → 상태 확인 → 복원 왕복이 같은 런을 돌려준다', () => {
    const storage = new MemoryRunStorage();
    const store = new RunSaveStore(storage, runDeps);
    expect(store.status()).toEqual({ kind: 'none' });
    expect(store.load()).toBeNull();

    const run = newRun(31);
    run.chooseNode(run.availableNodes()[0]!.id);
    finishBattle(run, 'win');
    run.skipReward();
    expect(store.save(run)).toBeNull();

    const status = store.status();
    expect(status.kind).toBe('ok');
    if (status.kind === 'ok') {
      expect(status.summary).toMatchObject({ seed: 31, floor: 1, hp: run.hp, gold: run.gold });
    }
    const loaded = store.load();
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(JSON.stringify(loaded.controller.serialize())).toBe(JSON.stringify(run.serialize()));
  });

  it('같은 내용이면 다시 쓰지 않고, 바뀌면 쓴다', () => {
    const storage = new CountingStorage();
    const store = new RunSaveStore(storage, runDeps);
    const run = newRun(32);
    store.save(run);
    store.save(run);
    expect(storage.writes).toBe(1);
    run.chooseNode(run.availableNodes()[0]!.id);
    store.save(run);
    expect(storage.writes).toBe(2);
  });

  it('전투 중에도 저장하면 전투 준비 단계로 저장된다', () => {
    const storage = new MemoryRunStorage();
    const store = new RunSaveStore(storage, runDeps);
    const run = newRun(33);
    run.chooseNode(run.availableNodes()[0]!.id);
    run.beginBattle();
    expect(run.phase).toBe('battle');
    store.save(run);
    expect((JSON.parse(storage.read()!) as { phase: string }).phase).toBe('battlePrep');
  });

  it('끝난 런은 저장을 지운다 (이어하기 대상 제외)', () => {
    const storage = new MemoryRunStorage();
    const store = new RunSaveStore(storage, runDeps);
    const run = newRun(34);
    store.save(run);
    expect(storage.read()).not.toBeNull();
    driveTo(run, 'boss');
    finishBattle(run, 'win');
    expect(run.phase).toBe('ended');
    expect(store.save(run)).toBeNull();
    expect(storage.read()).toBeNull();
    expect(store.status()).toEqual({ kind: 'none' });
  });

  it('JSON이 아니거나 형식·버전·필드가 틀린 저장본은 한국어 오류로 거부한다', () => {
    const good = JSON.stringify(newRun(35).serialize());
    const cases: [string, RegExp][] = [
      ['not json', /올바른 JSON이 아닙니다/],
      ['[]', /저장 데이터를 불러올 수 없습니다/],
      [JSON.stringify({ ...JSON.parse(good), format: 'other' }), /format/],
      [JSON.stringify({ ...JSON.parse(good), version: 2 }), /version/],
      [JSON.stringify({ ...JSON.parse(good), health: { hp: 999, maxHp: 80 } }), /저장 데이터를 불러올 수 없습니다/],
    ];
    for (const [text, pattern] of cases) {
      const store = new RunSaveStore(new MemoryRunStorage(text), runDeps);
      const status = store.status();
      expect(status.kind, text.slice(0, 30)).toBe('broken');
      if (status.kind === 'broken') expect(status.message).toMatch(pattern);
      const loaded = store.load();
      expect(loaded && !loaded.ok).toBe(true);
    }
  });

  it('clear는 저장본을 지우고 같은 내용을 다시 저장할 수 있게 한다', () => {
    const storage = new CountingStorage();
    const store = new RunSaveStore(storage, runDeps);
    const run = newRun(36);
    store.save(run);
    store.clear();
    expect(storage.read()).toBeNull();
    store.save(run);
    expect(storage.writes).toBe(2);
  });

  it('쓰기 실패는 사유를 돌려주고 다음에 다시 시도한다', () => {
    let fail = true;
    const inner = new MemoryRunStorage();
    const storage: RunStorage = {
      read: () => inner.read(),
      write: (text) => (fail ? '용량 초과' : inner.write(text)),
      remove: () => inner.remove(),
    };
    const store = new RunSaveStore(storage, runDeps);
    const run = newRun(37);
    expect(store.save(run)).toBe('용량 초과');
    fail = false;
    expect(store.save(run)).toBeNull();
    expect(inner.read()).not.toBeNull();
  });
});

describe('BrowserRunStorage', () => {
  const memory = (): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };

  it('localStorage 형태의 객체에 지정한 키로 읽고 쓰고 지운다', () => {
    const backend = memory();
    const storage = new BrowserRunStorage(() => backend, 'k');
    expect(storage.read()).toBeNull();
    expect(storage.write('abc')).toBeNull();
    expect(backend.data.get('k')).toBe('abc');
    expect(storage.read()).toBe('abc');
    storage.remove();
    expect(storage.read()).toBeNull();
  });

  it('저장소 접근이 예외를 던져도 게임이 멈추지 않는다', () => {
    const denied = (): StorageLike => { throw new Error('SecurityError'); };
    const storage = new BrowserRunStorage(denied);
    expect(storage.read()).toBeNull();
    expect(storage.write('x')).toContain('저장하지 못했습니다');
    expect(() => storage.remove()).not.toThrow();
    const full: StorageLike = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    expect(new BrowserRunStorage(() => full).write('x')).toContain('QuotaExceededError');
  });
});
