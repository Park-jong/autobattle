import { describe, expect, it } from 'vitest';
import { MetaStore } from './MetaStore';
import { BrowserRunStorage, META_SAVE_KEY, MemoryRunStorage, RUN_SAVE_KEY, type StorageLike } from './RunStorage';
import { gameData } from './testSupport';

describe('MetaStore', () => {
  it('저장이 없으면 기본 상태(전공 0, 하르텐만 열림)로 시작한다', () => {
    const store = new MetaStore(new MemoryRunStorage(), gameData.meta);
    expect(store.status().kind).toBe('ok');
    expect(store.progress!.points).toBe(0);
    expect(store.progress!.isUnlocked('cmd_harten')).toBe(true);
    expect(store.progress!.isUnlocked('cmd_isera')).toBe(false);
  });

  it('저장 후 새 저장소가 같은 상태를 복원한다', () => {
    const storage = new MemoryRunStorage();
    const first = new MetaStore(storage, gameData.meta);
    expect(first.save()).toBeNull();
    const second = new MetaStore(storage, gameData.meta);
    expect(JSON.stringify(second.progress!.serialize())).toBe(JSON.stringify(first.progress!.serialize()));
  });

  it('손상된 JSON·형식 불일치·미래 버전은 한국어 오류로 broken이고 덮어쓰지 않는다', () => {
    for (const text of ['{깨진', JSON.stringify({ format: 'other' }), JSON.stringify({ format: 'autochess-meta', version: 99 })]) {
      const storage = new MemoryRunStorage(text);
      const store = new MetaStore(storage, gameData.meta);
      const status = store.status();
      expect(status.kind).toBe('broken');
      if (status.kind === 'broken') expect(status.message).toContain('전공 기록을 불러올 수 없습니다');
      expect(store.progress).toBeNull();
      expect(store.save()).not.toBeNull();
      expect(storage.read()).toBe(text);
    }
  });

  it('reset은 저장을 지우고 기본 상태로 되돌린다', () => {
    const storage = new MemoryRunStorage('{깨진');
    const store = new MetaStore(storage, gameData.meta);
    store.reset();
    expect(store.status().kind).toBe('ok');
    expect(storage.read()).toBeNull();
  });

  it('브라우저 저장소 쓰기 실패는 사유 문자열로 돌려준다 (예외 없음)', () => {
    const failing: StorageLike = { getItem: () => null, setItem: () => { throw new Error('가득 참'); }, removeItem: () => undefined };
    const store = new MetaStore(new BrowserRunStorage(() => failing, META_SAVE_KEY), gameData.meta);
    expect(store.save()).toContain('가득 참');
  });

  it('메타 키와 런 저장 키는 다르다', () => {
    expect(META_SAVE_KEY).not.toBe(RUN_SAVE_KEY);
  });
});
