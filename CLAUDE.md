# 전술 지휘관 (가제)

오토체스 + 덱빌딩 카드게임을 합친 PvE 로그라이크 웹 게임 (TypeScript + Vite + Phaser 3).

## 명령어
| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (포트 **5738**, strictPort — 점유 시 실패) |
| `npm run build` | 타입체크 후 프로덕션 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run deploy` | 빌드 후 `dist/`를 `gh-pages` 브랜치로 푸시 (GitHub Pages 배포, `--nojekyll`). 원격에 올리므로 사용자 확인 후에만 실행 |
| `npm test` | Vitest 실행 (`vitest run`) |
| `npm run typecheck` | `tsc --noEmit` (src, tools 포함) |
| `npm run sim -- --a A.json --b B.json --n 1000 --seed 1` | 헤드리스 전투 시뮬: 편성 A vs B N회 승률·평균 시간 (tsx). 편성 예시는 `tools/formations/` |
| `npm run sim -- ... --commander cmd_harten [--plan tools/plans/harten-basic.json]` | 지휘관 패시브 적용, 카드 사용 계획을 넣으면 "카드 없음"과 같은 시드로 비교 출력 (계획 형식은 data/README.md) |
| `npm run sim -- --a tools/formations/harten-start.json --b tools/formations/series-3.json --n 100 --seed 1 --commander cmd_harten --deck test --plan tools/plans/expanded-cards.json` | 추가 5종을 포함한 테스트 덱으로 카드 사용 전후 비교 |
| `npm run run -- --seed 1 --n 20 [--path first\|random] [--plan 파일 \| --no-cards] [--deck starter\|test] [--verbose]` | 헤드리스 자동 런: 단순 정책으로 1액트(13층)를 끝까지 진행해 승리/사망·도달 층·남은 HP·전투 시간 출력 (`tools/run.ts`) |

## 폴더 구조
```
/data            게임 콘텐츠 JSON (카드, 유닛, 특성, 지휘관, 적 편성 encounters, 이벤트 events). 형식은 data/README.md
/src/core        Phaser 비의존 순수 로직 (RNG, 데이터 로더/검증, 이후 런·덱·전투 시뮬)
  rng.ts           시드 기반 RNG (Rng 클래스)
  data/            카드·유닛·특성·지휘관·효과 타입, 검증기(Card/Unit/Trait/Commander/EffectValidator — 카드·지휘관도 공통 효과 검증기를 씀), 로더(loadCards/loadUnits/loadTraits/loadCommanders/loadEncounters/loadEvents — 편성·이벤트는 유닛·카드 참조와 층 커버리지까지 확인)
  cards/           덱 모델(Deck: 뽑을/손패/버린/소모 더미, 직렬화), CP 규칙(CommandPoints), 강화 반영(effectiveCard), 상수(CARDS), 시작 덱(deckSetup), 덱 편집(deckEdit: 추가·제거·강화·소모), 저장 덱 검증(deckSnapshot). combat에 의존하지 않음
  economy/         Economy: 골드 계정·전투 보상·이자·중복 정산 방지, ECONOMY 상수. 전투·DOM 비의존
  management/      Management: 상점·공유 유닛 풀(보스 제외)·소유 로스터·벤치·레벨·인구·합성·판매·승급(promote)·유닛 지급(grantUnit)·직렬화, Economy와Rng 주입
  run/             런 코어 (M4-A): RunController(상태 머신)·RunState·RunSerializer, RunMap/MapGenerator, EncounterPlanner(미리보기), PlayerForces(골드·로스터·덱·장비), RunRoster(단계별 관리 창구), CardRewardGenerator·cardMarket, EventDirector, CommanderHealth, AutoRunner, constants.ts(RUN), seeds.ts
  combat/          전투 시뮬 (Phaser·DOM 비의존, 상수는 constants.ts)
    mutations.ts     정예 변이 4종(장갑·분노·전파·방해), bossPattern.ts 보스 열 강타(예고→발동), commanderHp.ts 카드 HP 비용 장부
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
  live/            LiveBattle(실시간 시뮬+재생), Gauntlet(고정 편성 5연전), ManagementRun(가변 로스터·상점·장비·제공 카드·골드 이어받기) — 모두 Phaser·DOM 비의존
  economy/         ManagementPanel: 상점·레벨·벤치·판매 UI와 캔버스↔벤치 유닛 드래그
  cards/           CardInteraction(카드 선택→대상 지정 상태 머신), playbackScale(배속×슬로모션/정지), cardAvailability(사용 불가 사유), cardPanelView(손패 패널 표시 정보 빌더), dealDeck, stagePoint(화면→게임 좌표) — 순수 TS, HandPanel(DOM)+handPanel.css
  battle/          BattleScene(씬), BoardLayout(칸<->좌표), BoardPicker(좌표→칸/유닛, 보간 위치 기준), BoardRenderer, UnitSprite, EffectsLayer, TargetingOverlay(대상 강조)
  debug/           BattleSession(편성·지휘관·덱·전투·연전·런 전투 연결을 묶는 파사드, Phaser·DOM 비의존), contracts.ts(씬용 BattleViewSource / 패널용 DebugController / 손패용 CardController 인터페이스), runLink.ts(런 전투 연결 RunBattleLink·RunBattleHost, 로스터 명령 RosterCommands), DebugPanel(DOM) + debugPanel.css
  run/             런 1액트 UI (M4-B). RunSession(파사드: RunController + BattleSession 연결 + 자동 저장, Phaser·DOM 비의존), contracts.ts(RunViewSource/RunCommands/RunSnapshot), runViews.ts(맵·미리보기·카드·보상·상점·이벤트·야영지·결과·종료 표시 정보 순수 빌더), RunSaveStore(저장 직렬화·복원 검증·같은 내용 재저장 생략) + RunStorage(주입 가능한 저장소: BrowserRunStorage=localStorage try/catch, MemoryRunStorage), RunBattleAdapter(RunController → RunBattleLink). 화면(DOM, runScreens.css): RunShell(화면 전환·알림), StartScreen, MapScreen, NodeScreens(보상·상점·이벤트·야영지), EndScreen, RunBattlePanel(전투 오른쪽 패널), cardElements(카드·덱 카드 고르기 공통), encounterPreview, hudElement. testSupport.ts는 테스트 전용
/src/main.ts     진입점: 데이터 검증 -> BattleSession -> DebugPanel + RunBattlePanel(#panel 안의 두 자리) + HandPanel(#hand) + Phaser(#game, Scale.FIT) -> RunSession + RunShell(시작 화면에서 시작)
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
- 지휘관이 있으면 편성 단계가 곧 준비 단계: 손패 5장이 뽑혀 있고 작전 카드를 준비 CP로 쓴다(준비 단계 sim이 살아 있음). 편성·시드·지휘관을 바꾸면 준비 단계를 다시 만든다(쓴 작전 카드는 되돌려짐). 지휘관 없음이면 카드 UI는 숨겨지고 M1 동작. 디버그 화면은 기본 지휘관 하르텐(`gameData.ts`의 `DEFAULT_COMMANDER_ID`, 데이터에 없으면 없음)이 선택되어 있고 시작 편성은 자동 배치하지 않는다. `BattleSession`은 `extras.defaultCommanderId`를 줘야 기본 선택이 켜진다(없으면 지휘관 없음).
- 5연전(`Gauntlet`): 아군 편성 고정, 적은 `tools/formations/series-1~5.json`, 판별 시드 파생, 덱은 판 사이에 이어짐, "카드 사용 금지" 옵션으로 같은 시드·편성 비교.
- 카드 풀은 17종(M4-A에서 심연의 계약 추가; 희귀도는 시작 카드 `starter`, 보상 풀 `common`/`rare`). 패널의 덱 선택에서 지휘관 기본 덱/확장 카드 테스트 덱(각 10장)을 선택한다. 테스트 덱에는 제련된 칼날·예비대 호출이 포함된다. `DeckPreset`은 단일 전투·5연전·경제 플레이·헤드리스에 공통 적용된다. `manaFill`은 공통 효과, `drawCards`·`cpGain`은 카드 전용 효과다. `chain.cost`는 연쇄 활성 시 CP 검사 전 실제 비용에 반영하고 UI도 같은 `effectiveCard`를 사용한다.
- **런 UI (M4-B)**: 앱은 시작 화면에서 열린다 — "새 런"(시드 자동 제안·입력 가능, 6자리), "이어하기"(localStorage 저장이 온전할 때만 활성, 손상·버전 불일치면 한국어 오류 + "저장 삭제"), 테스트 모드 "경제 플레이"/"편성 디버그"(기존 화면, 왼쪽 위 "시작 화면" 버튼으로 복귀). `RunSession`이 `RunController`와 `BattleSession`을 묶고 화면(`RunShell`)은 `RunViewSource`/`RunCommands`로만 본다. 화면: 시작·맵(SVG 간선 + 노드 버튼, 호버/클릭으로 `previewNode` 미리보기, 더블클릭·"이 노드로 이동")·보상·상점(카드 구매/제거)·이벤트·야영지·종료는 전체 화면 HTML 오버레이, 전투(battlePrep/battle/결과)는 캔버스 + 손패 + 오른쪽 `RunBattlePanel`.
- **런 전투 연결**: 전투 준비에 들어가면 `RunSession`이 `BattleSession.attachRun(RunBattleAdapter)`를 건다. 세션은 `RunBattleLink`(로스터 `RunRoster`·`createSimulator`·`beginBattle`·`abandonBattle`·`completeBattle`)만 알고 기존 `ManagementPanel`·`HandPanel`·`BattleScene`을 그대로 쓴다. 로스터·편성이 바뀌면 `createSimulator`를 다시 불러 준비 시뮬을 갱신(정산은 마지막 발급분만). 전투가 끝나면 세션이 `completeBattle`로 정산하고 결과를 보여주며(`resultPending`), "계속"을 눌러야 보상·맵·보스 재도전 준비(연결 다시 걸기)·종료 화면으로 넘어간다. "준비로 돌아가기"는 `abandonBattle`(정산 없음).
- **자동 저장**: 노드 입장·보상·상점/이벤트/야영지 처리·전투 준비 중 로스터 변경·전투 정산 직후마다 `controller.serialize()`를 저장한다(전투 중이면 battlePrep으로). 런이 끝나면 저장을 지운다(종료 화면만 보여주고 이어하기 대상에서 제외). 저장 실패는 알림만 띄우고 게임은 계속된다. 새 런 시드는 core가 32비트 정수(`seed | 0`)로 다루므로 범위를 `-2^31~2^31-1`로 제한한다.
- **보스 연출**: `ReplayState`가 `telegraph`/`strike`를 재생 시각 기준으로 다룬다(`telegraphs()` = 예고~발동 전, `strike`는 `recentEffects`). `EffectsLayer`가 예고 열을 붉게 칠하고 남은 시간을 표시, 발동 순간 번쩍인다. `BattleViewSource.telegraphs()`로 씬에 전달.
- 레이아웃: 왼쪽 열 `#stage`(`#game` 캔버스 + 아래 `#hand` 손패 바, 지휘관이 없으면 숨김) + `#panel`(340px 사이드). 폭 800px 이하면 위아래로 쌓는다.

## 골드 경제 (M3-1)
- `src/core/economy`: 시작 10G, 일반/정예/보스 승리 5/8/15G, 패배·무승부 3G. 이자는 **정산 전 잔고** 10G당 1G, 최대 3G. 모든 금액은 0 이상의 안전한 정수다.
- `Economy.settleBattle(id, kind, outcome)`는 동일 ID에 한 번만 지급하고 최초 영수증을 다시 반환한다. `spend`는 잔고 부족 시 false이며 상태를 바꾸지 않는다.
- `BattleSession`의 단일 전투는 결과 후 `nextBattle()`로 새 전투 ID를 발급해 골드를 이어간다. `reset()`은 같은 전투를 재시도하므로 보상을 재지급하지 않는다. `resetEconomy()`는 편집 가능한 준비 단계에서만 10G로 초기화한다.
- `Gauntlet`은 독립 골드 계정으로 시작하며 마지막 판까지 정산한다. 종료/중단 시 단일 계정은 그대로 복원된다. `GauntletStage.kind` 생략 시 일반 전투. 같은 전투 로그를 중복 정산하면 판과 골드가 증가하지 않는다.
- 디버그 패널에 골드·다음 이자·최근 지급 내역과 전투 종류 선택을 표시한다. 상점 구매는 경제 플레이에서 제공하며 카드 획득 보상은 M4 범위다.

## 경제 플레이 (M3)
- 시작 화면의 "경제 플레이(5연전)"가 `startManagementRun()`을 호출해 지휘관의 실제 시작2기·10G·레벨3으로 연다. 경제 플레이 종료 시 기존 편성 디버그로 복귀한다. 테스트 시작 버튼은 장비·징집을 포함한 10장 덱을 사용한다.
- `ManagementRun`은 `Management`와 `Economy`를 소유하며 5연전 사이에 소유 로스터·덱·장비·골드를 유지한다. 다음 전투 때 무료 상점 갱신(잠금이면 1회 유지 후 해제), 마지막 두 판은 정예/보스 보상 등급이다. 전투 진행 중 관리 명령은 거부한다.
- 제공 카드는 `syncGrantedCards`에 보드 소유 유닛 ID를 공급한다. 기본 덱의 동명 카드와 구분해 벤치·판매·3성 합성을 동기화한다. 영구 장비는 아군 원본 formation 인덱스(시뮬 UID)와 소유 ID를 대응해 `setEquipment`로 저장하며 징집 UID는 읽지 않는다.
- 장비 준비 카드 사용 시 원본 준비 덱에서도 해당 인스턴스만 소모 처리해 재배치/리셋으로 복제되지 않게 한다. 상점 리롤·잠금·XP처럼 편성이 바뀌지 않는 관리 동작은 준비 단계 작전 효과를 되돌리지 않는다.
- 유닛14종(+보스 전용 성문 파괴자), 특성 효과6종(강철군단·잿불·심연·수호자·검투사·사수). 숲·주술사·암살자 정의는 유지하며 고유 특성 효과는 후속 범위다. 맵·지휘관 HP·카드 보상·런 저장의 core는 M4-A(아래 "런 코어"), 화면은 M4-B다.

## 런 코어 (M4-A, UI는 M4-B)
`src/core/run`의 `RunController`가 1액트(13층) 한 판을 진행한다. Phaser·DOM 비의존이며 맵·노드·종료 화면 UI와 저장/이어하기(M4-B, `src/ui/run`)는 이 API만 보고 만들었다. UI용 읽기 전용 접근자 `RunRoster.formation()`만 core에 추가했다. 전체 규칙·수치는 [data/README.md](data/README.md)의 "런 코어" 절.
- **상태 머신**: `map`(노드 선택) → `battlePrep`(전투 준비: 유닛 상점·배치·준비 카드) → `battle`(전투 중, 로스터 명령 거부) → `reward`(카드 3장 중 1장/건너뛰기) | `map` | `battlePrep`(보스 재도전) | `ended`(승리/사망). 상점·이벤트·야영지 노드는 `shop`/`event`/`camp` 단계. `chooseNode` → 노드 처리 → `toMap` 반복.
- **맵**: `MapGenerator.generate(seed)` → `RunMap` (13층, 층당 2~4노드, 보스 1, 1층 전투·12층 야영지 고정, 정예 4층+, 상점/야영지 연속 금지, 교차 없는 간선, 목표 비율 개수 할당). 맵·적 편성·보상·상점 진열·이벤트는 `deriveSeed(런 시드, 용도, 노드)`로 파생한 무상태 Rng, 상점 유닛 Rng와 덱 섞기 Rng만 저장한다.
- **전투 입력**: `controller.createSimulator()`가 편성·준비 손패·지휘관 HP·적 보정(`CombatSetup.enemy`)을 넣은 `CombatSimulator`를 만들고, 끝난 시뮬을 `completeBattle(sim)`에 넘기면 골드(일반/정예/보스) → 카드로 잃은 HP(`commanderHp` 이벤트) → 패배 피해 → 덱·장비 이어받기 → 다음 단계 순으로 정산한다 (한 번만). 전투 자체는 런 상태를 바꾸지 않아 결정론이 유지된다.
- **적 편성**: `data/encounters.json` + 층 보정 `1 + 0.04 × (층−1)`(HP·ATK), 정예 변이 4종(`combat/mutations.ts`), 보스 성문 파괴자(`combat/bossPattern.ts`, 열 강타 예고 `telegraph` → 발동 `strike`). `controller.previewNode(id)`가 실제 전투와 같은 `EncounterPlan`(보정 후 스탯·변이)을 돌려준다.
- **지휘관 HP**: 시작 80(`commanders.json maxHp`), 패배·무승부 피해 `ceil((2 + 생존 적 등급 합 + floor(층/3)) × 종류 배율)`(정예 ×1.5, 보스 ×2). 심연의 계약(0CP, HP 3→CP +2, 심연 공명이면 HP 면제)은 카드 필드 `commanderHpCost` + 효과 `cpGain`.
- **로스터·덱 이어받기**: `PlayerForces`(Economy + Management + 판 사이 덱/장비)를 경제 플레이(`ManagementRun`)와 런이 함께 쓴다. `RunController.roster`는 단계별로 허용하는 `Management` 창구.
- **시드**: `RunController.create`가 시작에서 `normalizeRunSeed`(안전한 정수만 허용, `| 0`으로 부호 있는 32비트 정규화)를 한 번 적용하고 이후 모든 파생·저장에 같은 값을 쓴다. 복원은 32비트 범위 밖 시드를 거부한다.
- **저장**: `controller.serialize()` → `RunSave`(format `autochess-run`, version 1), `RunController.restore(deps, json)`. 노드 입장 직후·맵 선택 단계 등 모든 비전투 시점에서 가능하며 전투 중이면 `battlePrep`으로 저장한다(전투 중간 저장 없음). 잘못된 데이터는 경로가 담긴 한국어 오류. 복원 시 필드 간 일관성(위치·간선, 단계↔노드 종류, HP, 전투 시도 수↔기록, 상점 가격·칸 수, 이벤트 기록)도 검증한다.
- **정산 바인딩**: `completeBattle`은 `createSimulator`가 현재 노드·시도에 발급한 시뮬만 한 번 정산한다 (다른 노드·이전 시도·다른 컨트롤러·복원 이전 시뮬, 재제출은 거부).
- **헤드리스**: `AutoRunner`(core) + `tools/run.ts`. 테스트 도우미는 `run/testSupport.ts`(`driveTo`, `finishBattle`, `forceResult`).

## 컨벤션
- TypeScript strict, ES 모듈. 주석과 사용자 노출 문자열은 한국어.
- 객체 지향: 책임 단위 클래스 분리, 의존성은 생성자로 주입. 과도한 추상화는 피한다.
- `src/core`는 Phaser에 의존하지 않는다. 시뮬은 상태 변화 이벤트만 내보내고 UI가 재생한다 (DESIGN 10장).
- 결정론: `src/core`에서 `Math.random` 금지. 난수는 항상 `Rng`를 주입받아 쓴다.
- 콘텐츠는 `/data` JSON. 코드로 읽을 때 반드시 검증(`loadCards` 등)을 거친다. 파일 읽기와 검증은 분리 (검증은 객체를 받음).
- 검증기는 외부 라이브러리 없이 직접 작성 (번들 크기·의존성 최소화, 한국어 오류 메시지에 위치 경로를 넣기 쉬움).

## 배포
- 주소: https://park-jong.github.io/autobattle/ (원격 `Park-jong/autobattle`). `npm run deploy`가 `predeploy`(빌드) 후 `gh-pages -d dist --nojekyll`로 `gh-pages` 브랜치에 올린다.
- 첫 배포 후 GitHub 저장소 Settings → Pages에서 Source를 `gh-pages` 브랜치 / root로 지정해야 한다.
- Vite `base`는 `./`(상대 경로): 저장소 이름이 바뀌어도 하위 경로에서 동작하고 dev 서버(`/`)에도 영향이 없다. 데이터 JSON은 import로 번들되어 별도 fetch 파일이 없다.

## 문서
- [DESIGN.md](DESIGN.md) 게임 설계, 10장 구현 구조
- [ROADMAP.md](ROADMAP.md) 마일스톤과 체크리스트
- [CHARACTERS.md](CHARACTERS.md) 세계관, 지휘관, 유닛 설정
- [data/README.md](data/README.md) 데이터 파일 형식

## 진행 방식
`/dev-cycle`
