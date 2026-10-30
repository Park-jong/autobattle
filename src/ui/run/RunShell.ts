import type { RunCommands, RunScreenId, RunSnapshot, RunViewSource, TestCommands } from './contracts';
import { button, el, tagged } from './dom';
import { EndScreen } from './EndScreen';
import { MapScreen } from './MapScreen';
import { ActIntroScreen, BossRelicScreen, CampScreen, EventScreen, ShopScreen } from './NodeScreens';
import { RewardModal } from './RewardModal';
import { UpgradeModal } from './UpgradeModal';
import { StartScreen } from './StartScreen';
import { TestToolsPanel } from './TestToolsPanel';
import './runScreens.css';
import { appSkin } from '../skin/SkinStore';

/** 전체 화면 오버레이로 그리는 화면 (그 외 battle은 캔버스 + 오른쪽 패널, debug는 기존 디버그 패널) */
interface OverlayScreen {
  readonly root: HTMLElement;
  render(snap: RunSnapshot): void;
}

export interface ShellHosts {
  /** 오른쪽 패널의 기존 디버그 패널 자리 */
  debugHost: HTMLElement;
  /** 오른쪽 패널 전체 (런 전투 화면에서는 숨기고 화면에 직접 배치한다) */
  panelHost?: HTMLElement;
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
  /** 카드 보상 창: 전투 화면 위(또는 빈 배경 위)에 뜨는 모달이라 전체 화면 오버레이 목록에 없다 */
  private readonly rewardModal: RewardModal;
  /** 카드 강화 결과 창 (어느 화면 위에도) */
  private readonly upgradeModal: UpgradeModal;
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
    this.rewardModal = new RewardModal(commands);
    this.upgradeModal = new UpgradeModal(commands);
    document.body.append(this.overlay, this.rewardModal.root, this.upgradeModal.root, this.toast, this.backButton, this.testTools.root);
    view.subscribe(() => this.render());
    appSkin.subscribe(() => this.render());
    this.render();
  }

  render(): void {
    const snap = this.view.snapshot();
    const screen = snap.screen;
    const overlayScreen = this.screens[screen];
    this.overlay.hidden = overlayScreen === undefined;
    this.hosts.debugHost.hidden = screen !== 'debug';
    // 화면 종류를 body에 적어 CSS가 영역(오른쪽 패널 등)을 고른다
    if (document.body.dataset.screen !== screen) {
      document.body.dataset.screen = screen;
      window.dispatchEvent(new Event('resize'));
    }
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
    this.rewardModal.render(snap);
    this.upgradeModal.render(snap);
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
