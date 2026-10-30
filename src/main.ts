import Phaser from 'phaser';
import { BattleScene, type SceneLabels } from './ui/battle/BattleScene';
import { HandPanel } from './ui/cards/HandPanel';
import { BattleSession } from './ui/debug/BattleSession';
import { DebugPanel } from './ui/debug/DebugPanel';
import { BattleScreen } from './ui/run/battle/BattleScreen';
import { MetaStore } from './ui/run/MetaStore';
import { RunSaveStore } from './ui/run/RunSaveStore';
import { RunSession } from './ui/run/RunSession';
import { RunShell } from './ui/run/RunShell';
import { BrowserRunStorage, META_SAVE_KEY } from './ui/run/RunStorage';
import { loadGameData, unitAbbreviation } from './ui/gameData';
import { needsBattleRenderer, renderProfile } from './ui/rendering';
import { SkinPicker } from './ui/skin/SkinPicker';
import { COLORS } from './ui/theme';
import { installPresentation } from './ui/skin/presentation';
import './ui/skin/academy.css';
import './ui/skin/modern.css';
import './ui/run/battle/mobileBattle.css';
import './ui/run/battle/battlePolish.css';
import { attackProfile } from './ui/battle/combatVisuals';
import { installActionFeedback } from './ui/feedback/ActionFeedback';
import { unitSkinName } from './ui/skin/skins';

/** 데이터 검증 오류를 화면에 보여준다 (게임은 시작하지 않음). */
function showFatalError(host: HTMLElement, message: string): void {
  const box = document.createElement('div');
  box.className = 'dbg-fatal';
  box.textContent = `데이터 오류\n${message}`;
  host.replaceChildren(box);
}

/** 새 런 시드 제안 (사람이 입력·기록하기 쉬운 6자리). core가 아니므로 crypto를 쓴다 */
function randomSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return 100000 + ((buffer[0] ?? 0) % 900000);
}

/** 런 식별자 (메타 정산 중복 방지용). core가 아니므로 crypto/시간 기반 */
function newRunId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  return `${Date.now().toString(36)}-${buffer[0]!.toString(36)}${buffer[1]!.toString(36)}`;
}

function bootstrap(): void {
  installPresentation();
  const gameHost = document.getElementById('game');
  const panelHost = document.getElementById('panel');
  const handHost = document.getElementById('hand');
  const arenaHost = document.getElementById('arena');
  const topHost = document.getElementById('battle-top');
  const benchHost = document.getElementById('battle-bench');
  const trayHost = document.getElementById('tray');
  if (!gameHost || !panelHost || !handHost || !arenaHost || !topHost || !benchHost || !trayHost) {
    throw new Error('#game, #hand, #panel, #arena, #battle-top, #battle-bench, #tray 요소가 없음');
  }

  let data;
  try {
    data = loadGameData();
  } catch (e) {
    showFatalError(gameHost, e instanceof Error ? e.message : String(e));
    return;
  }

  const session = new BattleSession(data.units, data.traits, data.defaultFormations, {
    cards: data.cards,
    commanders: data.commanders,
    defaultCommanderId: data.defaultCommanderId,
    startFormations: data.startFormations,
    seriesStages: data.seriesStages,
  });
  // 오른쪽 패널: 디버그 화면에서만 보인다 (런 전투 화면은 BattleScreen이 화면에 직접 배치)
  const debugHost = document.createElement('div');
  debugHost.id = 'debug-host';
  // 패널 맨 위: 화면 스킨 선택 (디버그·전투 패널 어느 쪽이든 보인다)
  const skinRow = document.createElement('div');
  skinRow.className = 'skin-panel-row';
  skinRow.append(new SkinPicker().root);
  panelHost.replaceChildren(skinRow, debugHost);
  new DebugPanel(debugHost, session, data.units, data.traits, data.commanders, gameHost, data.cards);
  new HandPanel(handHost, session, gameHost);
  installActionFeedback(session, gameHost);

  // 런 UI: 시작 화면에서 시작해 맵·노드 화면(전체 화면 오버레이)과 전투(캔버스 + 패널)를 오간다
  const runSession = new RunSession({
    deps: data.run,
    store: new RunSaveStore(new BrowserRunStorage(), data.run),
    meta: new MetaStore(new BrowserRunStorage(undefined, META_SAVE_KEY), data.meta),
    newRunId,
    battle: session,
    legacy: {
      openManagement: () => session.startManagementRun(),
      openDebug: () => undefined,
      close: () => session.endSeries(),
    },
    suggestSeed: randomSeed,
    commanderId: data.defaultCommanderId ?? data.commanders.commanders[0]?.id ?? '',
  });
  new BattleScreen(
    { top: topHost, arena: arenaHost, canvasHost: gameHost, bench: benchHost, tray: trayHost, hand: handHost },
    runSession, runSession, session, session, session,
    { units: data.units, cards: data.cards, traits: data.traits },
  );
  new RunShell(runSession, runSession, { debugHost, panelHost });

  // 개발 서버 전용: 브라우저 자동화(Playwright)가 세션을 들여다볼 수 있게 한다. 프로덕션 빌드에서는 제거된다.
  if (import.meta.env.DEV) (window as unknown as { __tactics: unknown }).__tactics = { battle: session, run: runSession };

  // Keep the start/menu screens free of GPU allocations. Create the game on first battle/debug entry.
  const labels: SceneLabels = {
    unitName: (unitId, skin = 'default') => unitSkinName(skin, unitId, data.units.get(unitId)?.name ?? unitId),
    unitAbbreviation: (unitId, skin = 'default') => unitAbbreviation(unitSkinName(skin, unitId, data.units.get(unitId)?.name ?? unitId)),
    cardName: (cardId, upgraded) => `${data.cards.get(cardId)?.name ?? cardId}${upgraded ? '+' : ''}`,
    attackProfile: (unitId, skin) => attackProfile(data.units.get(unitId), skin),
    unitIsBoss: (unitId) => !!data.units.get(unitId)?.boss,
    unitTier: (unitId) => data.units.get(unitId)?.tier ?? 1,
  };
  let game: Phaser.Game | undefined;
  let rendererActive = false;
  new ResizeObserver(() => {
    // refresh() reuses cached parent dimensions; measure after tray/zoom layout changes.
    game?.scale.getParentBounds();
    game?.scale.refresh();
  }).observe(gameHost);
  const syncRenderer = (): void => {
    const active = needsBattleRenderer(runSession.screen);
    if (active === rendererActive) return;
    rendererActive = active;
    if (!game) {
      if (!active) return;
      const profile = renderProfile({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      });
      game = new Phaser.Game({
        type: profile.renderer === 'canvas' ? Phaser.CANVAS : Phaser.AUTO,
        parent: gameHost,
        width: profile.metrics.canvasWidth,
        height: profile.metrics.canvasHeight,
        backgroundColor: COLORS.BACKGROUND,
        fps: { target: profile.fps, limit: profile.fps },
        // CSS disables touch panning on the normal board and enables it for board zoom.
        // Phaser's touch capture would otherwise cancel native scrolling even in zoom mode.
        input: { touch: { capture: false } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [new BattleScene(session, profile.metrics, labels)],
      });
    } else if (active) game.loop.wake();
    else game.loop.sleep();
  };
  runSession.subscribe(syncRenderer);
  syncRenderer();
}

bootstrap();
