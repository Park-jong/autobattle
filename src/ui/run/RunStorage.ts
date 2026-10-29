/**
 * 런 저장소: 문자열 하나를 읽고 쓰고 지우는 작은 창구. 구현을 주입할 수 있어(브라우저 localStorage / 테스트용 메모리)
 * 세션과 저장 로직은 localStorage를 직접 모른다. 모든 실패는 예외 대신 값(null/사유)으로 돌려준다.
 */
export interface RunStorage {
  /** 저장된 문자열. 없거나 접근할 수 없으면 null */
  read(): string | null;
  /** 성공하면 null, 실패하면 한국어 사유 */
  write(text: string): string | null;
  remove(): void;
}

/** localStorage가 만족하는 최소 형태 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const RUN_SAVE_KEY = 'autochess-run-save';
/** 메타 진행(전공 포인트·해금) 저장 키. 런 저장과 별개라 서로 지우지 않는다 */
export const META_SAVE_KEY = 'autochess-meta-save';

/** 브라우저 localStorage 저장소. 접근 자체가 막혀 있어도(시크릿 모드, 정책 등) 게임은 계속된다 */
export class BrowserRunStorage implements RunStorage {
  constructor(
    private readonly getStorage: () => StorageLike = () => window.localStorage,
    private readonly key: string = RUN_SAVE_KEY,
  ) {}

  read(): string | null {
    try {
      return this.getStorage().getItem(this.key);
    } catch {
      return null;
    }
  }

  write(text: string): string | null {
    try {
      this.getStorage().setItem(this.key, text);
      return null;
    } catch (e) {
      return `브라우저 저장소에 저장하지 못했습니다 (${e instanceof Error ? e.message : String(e)})`;
    }
  }

  remove(): void {
    try {
      this.getStorage().removeItem(this.key);
    } catch {
      // 지울 수 없으면 그대로 둔다
    }
  }
}

/** 테스트·저장소 없는 환경용 메모리 저장소 */
export class MemoryRunStorage implements RunStorage {
  constructor(private text: string | null = null) {}

  read(): string | null {
    return this.text;
  }

  write(text: string): string | null {
    this.text = text;
    return null;
  }

  remove(): void {
    this.text = null;
  }
}
