import Phaser from 'phaser';
import { BattleScene, type SceneLabels } from './ui/battle/BattleScene';
import { HandPanel } from './ui/cards/HandPanel';
import { BattleSession } from './ui/debug/BattleSession';
import { DebugPanel } from './ui/debug/DebugPanel';
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
  new DebugPanel(panelHost, session, data.units, data.traits, data.commanders);
  new HandPanel(handHost, session, gameHost);

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
