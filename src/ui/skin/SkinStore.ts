import type { StorageLike } from '../run/RunStorage';
import { DEFAULT_SKIN, isSkinId, type SkinId } from './skins';

/** 고른 스킨을 기억하는 localStorage 키 (보는 사람 편의용. 실패해도 게임에는 영향 없음) */
export const SKIN_PREF_KEY = 'autochess-skin';

/** 현재 스킨 + 변경 알림. 씬(Phaser)과 패널(DOM)이 같은 저장소를 구독한다 */
export class SkinStore {
  private skin: SkinId;
  private readonly listeners = new Set<(skin: SkinId) => void>();

  constructor(private readonly getStorage: () => StorageLike | undefined = () => globalThis.localStorage) {
    this.skin = this.read();
  }

  get current(): SkinId {
    return this.skin;
  }

  set(skin: SkinId): void {
    if (!isSkinId(skin) || skin === this.skin) return;
    this.skin = skin;
    try {
      this.getStorage()?.setItem(SKIN_PREF_KEY, skin);
    } catch {
      // 저장소를 쓸 수 없어도 이번 세션의 선택은 유지된다
    }
    for (const listener of this.listeners) listener(skin);
  }

  /** 변경 구독. 반환값을 부르면 해제 */
  subscribe(listener: (skin: SkinId) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private read(): SkinId {
    try {
      const value = this.getStorage()?.getItem(SKIN_PREF_KEY);
      return isSkinId(value) ? value : DEFAULT_SKIN;
    } catch {
      return DEFAULT_SKIN;
    }
  }
}

/** 앱 전체가 함께 쓰는 스킨 저장소 (화면 표시 전용 설정이라 하나만 둔다) */
export const appSkin = new SkinStore();
