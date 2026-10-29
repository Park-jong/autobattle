import { appSkin } from './SkinStore';

/** 표시만 줄이는 설정. 전투 시뮬레이션이나 저장본에는 관여하지 않는다. */
class MotionPreferences {
  reduced = this.read();
  private listeners = new Set<() => void>();

  setReduced(value: boolean): void {
    this.reduced = value;
    try { globalThis.localStorage?.setItem('autochess-reduced-motion', String(value)); } catch { /* 세션 안에서는 유지 */ }
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): void { this.listeners.add(fn); }

  private read(): boolean {
    try {
      const saved = globalThis.localStorage?.getItem('autochess-reduced-motion');
      if (saved === 'true' || saved === 'false') return saved === 'true';
    } catch { /* 운영체제 설정으로 진행 */ }
    return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

export const motionPreferences = new MotionPreferences();

export function installPresentation(): void {
  const sync = (): void => {
    document.body.dataset.skin = appSkin.current;
    document.body.dataset.motion = motionPreferences.reduced ? 'reduced' : 'full';
    document.title = appSkin.current === 'academy' ? '마도아카데미 · 전술 지휘관' : '전술 지휘관';
  };
  appSkin.subscribe(sync);
  motionPreferences.subscribe(sync);
  sync();
}
