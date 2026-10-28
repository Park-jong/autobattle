import Phaser from 'phaser';
import { BattleScene, type SceneLabels } from './ui/battle/BattleScene';
import { HandPanel } from './ui/cards/HandPanel';
import { BattleSession } from './ui/debug/BattleSession';
import { DebugPanel } from './ui/debug/DebugPanel';
import { RunBattlePanel } from './ui/run/RunBattlePanel';
import { RunSaveStore } from './ui/run/RunSaveStore';
import { RunSession } from './ui/run/RunSession';
import { RunShell } from './ui/run/RunShell';
import { BrowserRunStorage } from './ui/run/RunStorage';
import { loadGameData } from './ui/gameData';
import { computeHiDpi } from './ui/hidpi';
import { COLORS } from './ui/theme';

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

function bootstrap(): void {
  const gameHost = document.getElementById('game');
  const panelHost = document.getElementById('panel');
  const handHost = document.getElementById('hand');
  if (!gameHost || !panelHost || !handHost) throw new Error('#game, #hand, #panel 요소가 없음');

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
  // 오른쪽 패널: 기존 디버그 패널 / 런 전투 패널 중 하나만 보인다 (RunShell이 전환)
  const debugHost = document.createElement('div');
  debugHost.id = 'debug-host';
  const battleHost = document.createElement('div');
  battleHost.id = 'run-battle-host';
  panelHost.replaceChildren(debugHost, battleHost);
  new DebugPanel(debugHost, session, data.units, data.traits, data.commanders, gameHost, data.cards);
  new HandPanel(handHost, session, gameHost);

  // 런 UI: 시작 화면에서 시작해 맵·노드 화면(전체 화면 오버레이)과 전투(캔버스 + 패널)를 오간다
  const runSession = new RunSession({
    deps: data.run,
    store: new RunSaveStore(new BrowserRunStorage(), data.run),
    battle: session,
    legacy: {
      openManagement: () => session.startManagementRun(),
      openDebug: () => undefined,
      close: () => session.endSeries(),
    },
    suggestSeed: randomSeed,
    commanderId: data.defaultCommanderId ?? data.commanders.commanders[0]?.id ?? '',
  });
  new RunBattlePanel(battleHost, runSession, runSession, session, data.units, data.cards, gameHost);
  new RunShell(runSession, runSession, { debugHost, battleHost });

  // HiDPI: 캔버스 = 1280x720 x DPR, 카메라 줌 = DPR (hidpi.ts). Scale.FIT로 화면에 맞춘다.
  const metrics = computeHiDpi();
  const labels: SceneLabels = {
    unitAbbreviation: (unitId) => (data.units.get(unitId)?.name ?? unitId).replace(/\s+/g, '').slice(0, 2),
    cardName: (cardId, upgraded) => `${data.cards.get(cardId)?.name ?? cardId}${upgraded ? '+' : ''}`,
  };
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: gameHost,
    width: metrics.canvasWidth,
    height: metrics.canvasHeight,
    backgroundColor: COLORS.BACKGROUND,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [new BattleScene(session, metrics, labels)],
  });
}

bootstrap();
