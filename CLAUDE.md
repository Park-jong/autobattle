# 전술 지휘관 (가제)

오토체스 + 덱빌딩 카드게임을 합친 PvE 로그라이크 웹 게임 (TypeScript + Vite + Phaser 3).

## 명령어
| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (포트 **5738**, strictPort — 점유 시 실패) |
| `npm run build` | 타입체크 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm test` | Vitest 실행 (`vitest run`) |
| `npm run typecheck` | `tsc --noEmit` (src, tools 포함) |
| `npm run sim -- --a A.json --b B.json --n 1000 --seed 1` | 헤드리스 전투 시뮬: 편성 A vs B N회 승률·평균 시간 (tsx). 편성 예시는 `tools/formations/` |
| `npm run sim -- ... --commander cmd_harten [--plan tools/plans/harten-basic.json]` | 지휘관 패시브 적용, 카드 사용 계획을 넣으면 "카드 없음"과 같은 시드로 비교 출력 (계획 형식은 data/README.md) |

## 폴더 구조
```
/data            게임 콘텐츠 JSON (카드, 유닛, 특성, 지휘관). 형식은 data/README.md
/src/core        Phaser 비의존 순수 로직 (RNG, 데이터 로더/검증, 이후 런·덱·전투 시뮬)
  rng.ts           시드 기반 RNG (Rng 클래스)
  data/            카드·유닛·특성·지휘관·효과 타입, 검증기(Card/Unit/Trait/Commander/EffectValidator — 카드·지휘관도 공통 효과 검증기를 씀), 로더(loadCards/loadUnits/loadTraits/loadCommanders)
  cards/           덱 모델(Deck: 뽑을/손패/버린/소모 더미, 직렬화), CP 규칙(CommandPoints), 강화 반영(effectiveCard), 상수(CARDS). combat에 의존하지 않음
  combat/          전투 시뮬 (Phaser·DOM 비의존, 상수는 constants.ts)
    sim.ts           CombatSimulator: 0.1초 틱 루프(step/runUntil/run), 종료 판정, 이벤트 로그. setup.cards로 카드 시스템(CP·덱·지휘관 패시브) 켬
    cardPlayer.ts    카드 사용 검증·실행 (단계/CP/대상/제한/전제조건 → 공통 EffectExecutor), cardCommand.ts 명령·대상 타입
    combatCp.ts      전투 CP + cp 이벤트, 심연 특성의 CP 수급 창구. cardPlan.ts: 카드 사용 계획(헤드리스용)
    world.ts         공유 상태 + 피해/회복/사망/마나/위치 변경 기본 연산
    board.ts         8x5 보드, 칸 점유·이동 예약, 전열/후열
    pathfinding.ts   8방향 A*
    unitController.ts 유닛 행동(타겟→스킬→공격→이동), targeting.ts 타겟/스킬 대상 선택
    effects.ts       효과 실행기 (카드·스킬·특성 공용), statuses.ts 상태 집합
    triggers.ts      트리거 버스, traits.ts 특성 단계 계산·적용, manaSystem.ts, statusRules.ts
    events.ts        UI가 재생할 이벤트 타입, formation.ts 편성 타입·검증
/src/ui          Phaser 씬·렌더링 + HTML 패널(디버그 패널·손패)
  theme.ts         렌더링·카드 UI 상수(해상도·배치·색·타이밍·상태 배지·슬로모션 배율 CARD_UI)를 한 곳에
  hidpi.ts         HiDPI 처리: 캔버스 = 1280x720 x DPR, 카메라 줌 = DPR, 텍스트 setResolution
  gameData.ts      data/*.json 검증 로드 + 기본 편성(tools/formations/a,b.json), 지휘관 시작 편성, 5연전 적 편성(series-1~5.json)
  replay/          ReplayState: 이벤트 로그(진행 중이라 늘어나도 됨) + 시각 t -> 유닛 표시 상태·연출 이벤트 (Phaser·DOM 비의존)
  live/            LiveBattle(sim을 재생 시각에 맞춰 runUntil로 점진 진행 + ReplayState + 카드 사용), Gauntlet(5연전 진행기: 판별 시드 파생·덱 이어받기·기록) — 모두 Phaser·DOM 비의존
  cards/           CardInteraction(카드 선택→대상 지정 상태 머신), playbackScale(배속×슬로모션/정지), cardAvailability(사용 불가 사유), cardPanelView(손패 패널 표시 정보 빌더), dealDeck, stagePoint(화면→게임 좌표) — 순수 TS, HandPanel(DOM)+handPanel.css
  battle/          BattleScene(씬), BoardLayout(칸<->좌표), BoardPicker(좌표→칸/유닛, 보간 위치 기준), BoardRenderer, UnitSprite, EffectsLayer, TargetingOverlay(대상 강조)
  debug/           BattleSession(편성·지휘관·덱·전투·연전을 묶는 파사드, Phaser·DOM 비의존), contracts.ts(씬용 BattleViewSource / 패널용 DebugController / 손패용 CardController 인터페이스), DebugPanel(DOM) + debugPanel.css
/src/main.ts     진입점: 데이터 검증 -> BattleSession -> DebugPanel(#panel) + HandPanel(#hand) + Phaser(#game, Scale.FIT)
/tools           헤드리스 밸런스 시뮬레이터 (sim.ts, formations/*.json, plans/*.json 카드 사용 계획). tsconfig include에 포함되어 typecheck 대상
```
테스트는 소스 옆 `*.test.ts`에 둔다.

## 카드 시스템 요약 (core)
- 전투 입력 = 편성 2 + 시드 + (선택) `cards: { commander, deck 스냅샷, commands }`. 카드 입력이 없으면 M1과 동일한 로그. 같은 입력이면 이벤트 로그가 JSON까지 일치한다.
- 카드는 틱 사이에 `sim.playCard(instanceId, target)`로 쓰거나 `commands: [{ tick, cardInstanceId, target }]`로 예약한다. 성공한 명령은 `sim.commandLog`에 쌓이며 그대로 다시 넣으면 재현된다. 실패는 `{ ok:false, reason }`만 반환하고 상태·로그는 변하지 않는다.
- 상수: 카드/CP는 `src/core/cards/constants.ts`(CARDS), 전투는 `combat/constants.ts`(COMBAT).
- UI(M2-B): 손패(HTML)·클릭/드래그 대상 지정·슬로모션·준비 단계·5연전이 `BattleSession` 쪽에 붙어 있다. core 규칙은 건드리지 않고 `sim.playCard/startCombat/runUntil/commandLog`만 쓴다.

## UI 구조
- 전투는 `LiveBattle`이 재생 시각에 맞춰 core sim을 `runUntil`로 조금씩 진행하고, 늘어나는 이벤트 로그를 `ReplayState`가 시간순으로 소비해 그린다 (미리 끝까지 계산하지 않는다). 카드는 "지금 진행된 틱"에서 `sim.playCard`로 쓰며, 그 효과는 다음 틱 경계(최대 0.1초 뒤)부터 보인다. `sim.commandLog`를 `setup.cards.commands`로 다시 넣으면 같은 로그가 나온다.
- 씬(Phaser)·패널(DOM)·손패(DOM)는 서로 모르고 `BattleSession`을 인터페이스(`BattleViewSource`/`DebugController`/`CardController`)로만 본다. 새 UI는 같은 방식으로 세션을 구독한다.
- 글자 많은 UI는 HTML/CSS 레이어, 보드·유닛은 Phaser. Phaser 텍스트는 `createText`(hidpi.ts)로 만들어 해상도를 맞춘다.
- 카드 입력: 손패 카드를 **클릭하면 선택**(이후 보드에서 대상 클릭), **눌러서 8px 이상 움직이면 드래그**(캔버스에 놓으면 사용). 취소는 우클릭/ESC. 둘 다 `CardInteraction` 상태 머신을 거치며, 포인터는 게임 좌표(1280x720)로 환산해 세션에 전달한다(씬은 `camera.getWorldPoint`, 손패는 캔버스 사각형 비율 `clientToStage`). 칸/유닛 판정은 `BoardPicker`가 보간 위치 기준으로 한다. 유효 대상 강조는 `TargetingView`로 씬에 전달(`TargetingOverlay`).
- 카드를 집은 동안 시간 배율 = 배속 × `CARD_UI.SLOWMO_FACTOR`(0.25), 옵션 "카드 선택 중 일시정지"면 0 (`playbackScale`).
- 지휘관이 있으면 편성 단계가 곧 준비 단계: 손패 5장이 뽑혀 있고 작전 카드를 준비 CP로 쓴다(준비 단계 sim이 살아 있음). 편성·시드·지휘관을 바꾸면 준비 단계를 다시 만든다(쓴 작전 카드는 되돌려짐). 지휘관 없음이면 카드 UI는 숨겨지고 M1 동작. 처음 열면 기본 지휘관 하르텐(`gameData.ts`의 `DEFAULT_COMMANDER_ID`, 데이터에 없으면 없음)이 선택되어 있고 시작 편성은 자동 배치하지 않는다. `BattleSession`은 `extras.defaultCommanderId`를 줘야 기본 선택이 켜진다(없으면 지휘관 없음).
- 5연전(`Gauntlet`): 아군 편성 고정, 적은 `tools/formations/series-1~5.json`, 판별 시드 파생, 덱은 판 사이에 이어짐, "카드 사용 금지" 옵션으로 같은 시드·편성 비교.
- 레이아웃: 왼쪽 열 `#stage`(`#game` 캔버스 + 아래 `#hand` 손패 바, 지휘관이 없으면 숨김) + `#panel`(340px 사이드). 폭 800px 이하면 위아래로 쌓는다.

## 컨벤션
- TypeScript strict, ES 모듈. 주석과 사용자 노출 문자열은 한국어.
- 객체 지향: 책임 단위 클래스 분리, 의존성은 생성자로 주입. 과도한 추상화는 피한다.
- `src/core`는 Phaser에 의존하지 않는다. 시뮬은 상태 변화 이벤트만 내보내고 UI가 재생한다 (DESIGN 10장).
- 결정론: `src/core`에서 `Math.random` 금지. 난수는 항상 `Rng`를 주입받아 쓴다.
- 콘텐츠는 `/data` JSON. 코드로 읽을 때 반드시 검증(`loadCards` 등)을 거친다. 파일 읽기와 검증은 분리 (검증은 객체를 받음).
- 검증기는 외부 라이브러리 없이 직접 작성 (번들 크기·의존성 최소화, 한국어 오류 메시지에 위치 경로를 넣기 쉬움).

## 문서
- [DESIGN.md](DESIGN.md) 게임 설계, 10장 구현 구조
- [ROADMAP.md](ROADMAP.md) 마일스톤과 체크리스트
- [CHARACTERS.md](CHARACTERS.md) 세계관, 지휘관, 유닛 설정
- [data/README.md](data/README.md) 데이터 파일 형식

## 진행 방식
`/dev-cycle`
