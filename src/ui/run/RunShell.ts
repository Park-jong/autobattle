import type { RunCommands, RunScreenId, RunSnapshot, RunViewSource, TestCommands } from './contracts';
import { button, el, tagged } from './dom';
import { EndScreen } from './EndScreen';
import { MapScreen } from './MapScreen';
import { ActIntroScreen, BossRelicScreen, CampScreen, EventScreen, RewardScreen, ShopScreen } from './NodeScreens';
import { StartScreen } from './StartScreen';
import { TestToolsPanel } from './TestToolsPanel';
import './runScreens.css';

/** 전체 화면 오버레이로 그리는 화면 (그 외 battle은 캔버스 + 오른쪽 패널, debug는 기존 디버그 패널) */
interface OverlayScreen {
  readonly root: HTMLElement;
  render(snap: RunSnapshot): void;
}

export interface ShellHosts {
  /** 오른쪽 패널의 기존 디버그 패널 자리 */
  debugHost: HTMLElement;
  /** 오른쪽 패널의 런 전투 패널 자리 */
  battleHost: HTMLElement;
}

const TOAST_MILLIS = 6000;

/**
 * 런 화면 전환기(DOM): 스냅샷의 screen에 맞춰 전체 화면 오버레이 화면 / 전투 패널 / 디버그 패널 중 하나를 보여준다.
 * 화면은 RunViewSource를 구독해 다시 그리고, 명령은 RunCommands로만 내린다.
 */
export class RunShell {
  private readonly overlay = tagged(el('div', 'run-overlay'), 'run-overlay');
  private readonly toast = tagged(el('div', 'run-toast'), 'run-toast');
  private readonly backButton: HTMLButtonElement;
  /** 테스트 런 중에만 보이는 테스트 도구 (모든 런 화면 위에 떠 있다) */
  private readonly testTools: TestToolsPanel;
  private readonly screens: Partial<Record<RunScreenId, OverlayScreen>>;
  private mounted: RunScreenId | null = null;
  private shownNotice = 0;
  private toastTimer: number | undefined;

  constructor(
    private readonly view: RunViewSource,
    commands: RunCommands & TestCommands,
    private readonly hosts: ShellHosts,
  ) {
    this.screens = {
      start: new StartScreen(commands, commands),
      map: new MapScreen(view, commands),
      reward: new RewardScreen(commands),
      bossRelic: new BossRelicScreen(commands),
      actIntro: new ActIntroScreen(commands),
      shop: new ShopScreen(commands),
      event: new EventScreen(commands),
      camp: new CampScreen(commands),
      ended: new EndScreen(commands),
    };
    this.backButton = tagged(button('← 시작 화면', () => commands.toStart(), 'dbg-btn run-back-button'), 'back-to-start');
    this.toast.hidden = true;
    this.testTools = new TestToolsPanel(view, commands);
    document.body.append(this.overlay, this.toast, this.backButton, this.testTools.root);
    view.subscribe(() => this.render());
    this.render();
  }

  render(): void {
    const snap = this.view.snapshot();
    const screen = snap.screen;
    const overlayScreen = this.screens[screen];
    this.overlay.hidden = overlayScreen === undefined;
    this.hosts.debugHost.hidden = screen !== 'debug';
    this.hosts.battleHost.hidden = screen !== 'battle';
    this.backButton.hidden = screen !== 'debug';
    if (overlayScreen) {
      if (this.mounted !== screen) {
        this.overlay.replaceChildren(overlayScreen.root);
        this.mounted = screen;
        this.overlay.scrollTop = 0;
      }
      overlayScreen.render(snap);
    } else {
      this.mounted = null;
    }
    this.renderToast(snap);
  }

  private renderToast(snap: RunSnapshot): void {
    const notice = snap.notice;
    if (!notice) {
      this.toast.hidden = true;
      return;
    }
    if (notice.id === this.shownNotice) return;
    this.shownNotice = notice.id;
    this.toast.textContent = notice.message;
    this.toast.className = `run-toast ${notice.kind}`;
    this.toast.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.hidden = true; }, TOAST_MILLIS);
  }
}
