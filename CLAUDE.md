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
| `npm run sim -- ... --commander cmd_harten\|cmd_isera\|cmd_nox [--plan tools/plans/harten-basic.json]` | 지휘관 패시브 적용(3명 모두), 카드 사용 계획을 넣으면 "카드 없음"과 같은 시드로 비교 출력. 계획 항목 `{ "ultimate": true }`로 궁극기도 지정 (계획 형식은 data/README.md). 시작 편성 `tools/formations/{harten,isera,nox}-start.json` |
| `npm run sim -- --a tools/formations/harten-start.json --b tools/formations/series-3.json --n 100 --seed 1 --commander cmd_harten --deck test --plan tools/plans/expanded-cards.json` | 추가 5종을 포함한 테스트 덱으로 카드 사용 전후 비교 |
| `npm run run -- --seed 1 --n 20 [--commander cmd_harten\|cmd_isera\|cmd_nox] [--path first\|random] [--plan 파일 \| --no-cards] [--deck starter\|test] [--no-relics] [--no-ultimate] [--acts 1\|2\|3] [--verbose]` | 헤드리스 자동 런: 단순 정책으로 **기본 3액트**(액트당 13층)를 끝까지 진행해 승리/사망·도달 액트·층·남은 HP·전투 시간 출력 (`tools/run.ts`). `--acts 1`이면 액트 1 보스 처치가 승리이고 출력 형식이 3액트 도입 전과 같다(회귀 비교용). 지휘관별 카드 계획(`tools/plans/*-basic.json`), 유물 획득·궁극기 사용 정책이 기본 켜짐 — `--no-relics --no-ultimate --acts 1`이면 M4와 같은 출력(회귀 비교용) |

## 폴더 구조
```
/data            게임 콘텐츠 JSON (카드, 유닛, 특성, 지휘관 3명, 유물 relics 20개, 적 편성 encounters, 이벤트 events). 형식은 data/README.md
/src/core        Phaser 비의존 순수 로직 (RNG, 데이터 로더/검증, 이후 런·덱·전투 시뮬)
  rng.ts           시드 기반 RNG (Rng 클래스)
  data/            카드·유닛·특성·지휘관·유물·효과 타입, 검증기(Card/Unit/Trait/Commander/Relic/EffectValidator — 카드·지휘관·유물의 전투 효과도 공통 효과 검증기를 씀), 로더(loadCards/loadUnits/loadTraits/loadCommanders/loadRelics/loadEncounters/loadEvents — 편성·이벤트는 유닛·카드 참조와 층 커버리지까지 확인)
  cards/           덱 모델(Deck: 뽑을/손패/버린/소모 더미, 직렬화), CP 규칙(CommandPoints), 강화 반영(effectiveCard), 상수(CARDS), 시작 덱(deckSetup), 덱 편집(deckEdit: 추가·제거·강화·소모), 저장 덱 검증(deckSnapshot). combat에 의존하지 않음
  economy/         Economy: 골드 계정·전투 보상·이자·중복 정산 방지, ECONOMY 상수. 전투·DOM 비의존
  management/      Management: 상점·공유 유닛 풀(보스 제외)·소유 로스터·벤치·레벨·인구·합성·판매·승급(promote)·유닛 지급(grantUnit)·직렬화, Economy와Rng 주입
  run/             플레이 테스트 도구 core: testRun.ts(TestRunTools: 테스트 런 시작 구성·런 중 명령·강제 전투 결과 `forceCombatResult`, RunController.createTest / `controller.test`)는 아래 "플레이 테스트 도구" 절. 런 코어 (M4-A, M5-A 지휘관·유물, M5-1 3액트): RunController(상태 머신, 지휘관 선택·유물 획득·액트 전환·보스 유물 선택)·RunState(액트별 맵 `maps`)·RunSerializer(저장 v3, v1·v2 읽기), RunMap/MapGenerator, EncounterPlanner(미리보기), PlayerForces(골드·로스터·덱·장비·유물 보유 `relics`), RelicInventory(보유 유물·합산 조회·무료 리롤/거울 한도)·RelicRewardGenerator(정예·상점·이벤트·보스 후보), RunRoster(단계별 관리 창구), CardRewardGenerator·cardMarket, EventDirector, CommanderHealth, AutoRunner(유물·궁극기 정책), constants.ts(RUN), seeds.ts
  combat/          전투 시뮬 (Phaser·DOM 비의존, 상수는 constants.ts)
    ultimate.ts      궁극기(UltimateSystem): 게이지·1회 제한·HP 소모·운석 연타, ULTIMATE 상수(constants.ts). relicRules.ts: 보유 유물의 전투 효과(RelicCombatRules)
    mutations.ts     정예 변이 4종(장갑·분노·전파·방해), bossPattern.ts 보스 열 강타(예고→발동)+보스 패턴 설치(`installBossPatterns`), twinRevive.ts 쌍둥이 부활, phaseSummon.ts 군주 페이즈 전환(증원·버프 해제), bossInfo.ts 패턴 설명, commanderHp.ts 카드 HP 비용 장부
    sim.ts           CombatSimulator: 0.1초 틱 루프(step/runUntil/run), 종료 판정, 이벤트 로그. setup.cards로 카드 시스템(CP·덱·지휘관 패시브) 켬
    cardPlayer.ts    카드 사용 검증·실행 (지휘관·유물의 주문 피해·HP 비용 보정 포함) (단계/CP/대상/제한/전제조건 → 공통 EffectExecutor), cardCommand.ts 명령·대상 타입
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
  battle/          BattleScene(씬), BoardLayout(칸<->좌표), BoardPicker(좌표→칸/유닛, 보간 위치 기준), BoardRenderer, UnitSprite, EffectsLayer(궁극기 배너·운석 예고/착탄·지속 효과 링 포함), TargetingOverlay(대상 강조)
  debug/           BattleSession(편성·지휘관·덱·전투·연전·런 전투 연결을 묶는 파사드, Phaser·DOM 비의존), contracts.ts(씬용 BattleViewSource / 패널용 DebugController / 손패용 CardController 인터페이스), runLink.ts(런 전투 연결 RunBattleLink·RunBattleHost, 로스터 명령 RosterCommands), DebugPanel(DOM) + debugPanel.css
  run/             런 UI (M4-B 1액트, M5-1 3액트: 액트 표시·보스 유물 선택·액트 소개 화면). RunSession(파사드: RunController + BattleSession 연결 + 자동 저장, Phaser·DOM 비의존), contracts.ts(RunViewSource/RunCommands/RunSnapshot), runViews.ts(맵·미리보기·카드·보상·상점·이벤트·야영지·결과·종료 표시 정보 순수 빌더), RunSaveStore(저장 직렬화·복원 검증·같은 내용 재저장 생략) + RunStorage(주입 가능한 저장소: BrowserRunStorage=localStorage try/catch, MemoryRunStorage), RunBattleAdapter(RunController → RunBattleLink). 화면(DOM, runScreens.css): RunShell(화면 전환·알림), StartScreen, MapScreen, NodeScreens(보상·상점·이벤트·야영지), EndScreen, RunBattlePanel(전투 오른쪽 패널), cardElements(카드·덱 카드 고르기 공통), relicElements(유물 칩·호버/포커스 설명·카드), encounterPreview, hudElement(액트·유물 줄 포함), NodeScreens의 BossRelicScreen·ActIntroScreen. 플레이 테스트 도구: testViews.ts·TestStartPanel·TestToolsPanel·testTools.css(아래 "플레이 테스트 도구" 절). testSupport.ts는 테스트 전용
/src/main.ts     진입점: 데이터 검증 -> BattleSession -> DebugPanel + RunBattlePanel(#panel 안의 두 자리) + HandPanel(#hand) + Phaser(#game, Scale.FIT) -> RunSession + RunShell(시작 화면에서 시작)
/tools           헤드리스 밸런스 시뮬레이터 (sim.ts, formations/*.json, plans/*.json 카드 사용 계획). tsconfig include에 포함되어 typecheck 대상
```
테스트는 소스 옆 `*.test.ts`에 둔다.

## 카드 시스템 요약 (core)
- 전투 입력 = 편성 2 + 시드 + (선택) `cards: { commander, deck 스냅샷, commands }`. 카드 입력이 없으면 M1과 동일한 로그. 같은 입력이면 이벤트 로그가 JSON까지 일치한다.
- 카드는 틱 사이에 `sim.playCard(instanceId, target)`로 쓰거나 `commands: [{ tick, cardInstanceId, target }]`로 예약한다. 성공한 명령은 `sim.commandLog`에 쌓이며 그대로 다시 넣으면 재현된다. 실패는 `{ ok:false, reason }`만 반환하고 상태·로그는 변하지 않는다.
- 상수: 카드/CP는 `src/core/cards/constants.ts`(CARDS), 전투는 `combat/constants.ts`(COMBAT).
- UI(M2-B): 손패(HTML)·클릭/드래그 대상 지정·슬로모션·준비 단계·5연전이 `BattleSession` 쪽에 붙어 있다. core 규칙은 건드리지 않고 `sim.playCard/startCombat/runUntil/commandLog`만 쓴다.

## 지휘관·궁극기·유물 요약 (M5-A)
- **지휘관 3명** (`data/commanders.json`): 하르텐(HP 80, 보호막 패시브, 방패병 ×2, 불굴의 방진) / 이세라(HP 70, 주문 피해 +25%·시작 CP +1, 잿불 점화사+숲 궁수, 대분화) / 녹스(HP 65, 승리 시 남은 CP 1당 1G, 그림자 단검 ×2, 대가 지불, 고유 카드 피의 대가). 시작 덱은 모두 10장. 해금(`unlock`)은 M5-5 범위라 데이터에만 있고 지금은 모두 선택 가능. 패시브 보정은 `passive.spellDamagePct`/`goldPerLeftoverCp`, 효과 없는 패시브는 `effects: []`.
- **궁극기** (`combat/ultimate.ts`): 게이지 0→100(카드 사용 +15, 아군 사망 +25, 전투당 1회). `sim.useUltimate()`는 카드와 같은 명령 로그(`cardInstanceId: -1`)·예약(`setup.cards.commands`)에 들어가 재현되고, 실패는 `{ok:false, reason}`·상태 불변. `sim.ultimate`(UltimateView)로 UI가 읽으며 **게이지 변화는 이벤트가 아니라 상태 조회**(쓰지 않으면 로그가 도입 전과 동일). 이벤트는 `ultimateUsed`·`ultimateTelegraph`·`ultimateImpact`(+HP 소모는 `commanderHp`, 카드 HP 비용과 같은 장부·정산). 새 효과 `taunt`(도발). 카드 사용 계획에서 `{ "ultimate": true }`로 지정.
- **유물** (`data/relics.json` 20개: 일반 9/희귀 8/보스 3): 전투(`RelicCombatRules`가 `CombatSetup.cards.relics`를 읽음)·경제(`Economy.setModifiers`, `Management` perks)·덱(`PlayerForces`)·런(`RunController`) 훅에 효과 종류별로 연결. 획득: 정예 승리 보상(`claimRelic`)·상점(`buyShopRelic`)·이벤트 `gainRelic`, 보스 유물은 액트 1·2 보스 처치 후 후보 3개 중 1개 선택(`claimBossRelic`/`skipBossRelic`, M5-1)하고 마지막 액트 보스 후에는 후보(`bossRelicOffer`)만 종료 화면에 표시. 중복 획득 금지, 모든 무작위는 `deriveSeed` 파생 Rng. 저장은 `relics`(보유·거울/무료 리롤 사용량)를 담고(v2부터) v1은 유물 없음으로 읽는다.

## UI 구조
- 전투는 `LiveBattle`이 재생 시각에 맞춰 core sim을 `runUntil`로 조금씩 진행하고, 늘어나는 이벤트 로그를 `ReplayState`가 시간순으로 소비해 그린다 (미리 끝까지 계산하지 않는다). 카드는 "지금 진행된 틱"에서 `sim.playCard`로 쓰며, 그 효과는 다음 틱 경계(최대 0.1초 뒤)부터 보인다. `sim.commandLog`를 `setup.cards.commands`로 다시 넣으면 같은 로그가 나온다.
- 씬(Phaser)·패널(DOM)·손패(DOM)는 서로 모르고 `BattleSession`을 인터페이스(`BattleViewSource`/`DebugController`/`CardController`)로만 본다. 새 UI는 같은 방식으로 세션을 구독한다.
- 글자 많은 UI는 HTML/CSS 레이어, 보드·유닛은 Phaser. Phaser 텍스트는 `createText`(hidpi.ts)로 만들어 해상도를 맞춘다.
- 카드 입력: 손패 카드를 **클릭하면 선택**(이후 보드에서 대상 클릭), **눌러서 8px 이상 움직이면 드래그**(캔버스에 놓으면 사용). 취소는 우클릭/ESC. 둘 다 `CardInteraction` 상태 머신을 거치며, 포인터는 게임 좌표(1280x720)로 환산해 세션에 전달한다(씬은 `camera.getWorldPoint`, 손패는 캔버스 사각형 비율 `clientToStage`). 칸/유닛 판정은 `BoardPicker`가 보간 위치 기준으로 한다. 유효 대상 강조는 `TargetingView`로 씬에 전달(`TargetingOverlay`).
- 카드를 집은 동안 시간 배율 = 배속 × `CARD_UI.SLOWMO_FACTOR`(0.25), 옵션 "카드 선택 중 일시정지"면 0 (`playbackScale`).
- **궁극기 UI**: 손패 바(`HandPanel`)의 궁극기 칸에 이름·게이지·사용 버튼(`data-testid=use-ultimate`, 단축키 U)·사유/HP 비용을 표시하고, `CardController.useUltimate()` → `BattleSession`이 `sim.useUltimate()`를 부른다(실패 사유는 토스트, 5연전 "카드 사용 금지"면 막힘). 연출: `ReplayState.meteors()/ultimateAura()`와 `ultimate`·`impact` 연출 이벤트 → `BattleViewSource.meteors()/ultimateAura()` → `EffectsLayer`(이름 배너, 주황 3×3 낙하 예고·착탄 번쩍임, 지속 효과 링). 편성 디버그·5연전·경제 플레이도 지휘관 3명을 고를 수 있고 `tools/formations/*-start.json`으로 시작 편성을 불러온다.
- 개발 서버(`import.meta.env.DEV`)에서만 `window.__tactics = { battle, run }`을 노출한다 (브라우저 자동화용, 프로덕션 빌드에서는 제거).
- 지휘관이 있으면 편성 단계가 곧 준비 단계: 손패 5장이 뽑혀 있고 작전 카드를 준비 CP로 쓴다(준비 단계 sim이 살아 있음). 편성·시드·지휘관을 바꾸면 준비 단계를 다시 만든다(쓴 작전 카드는 되돌려짐). 지휘관 없음이면 카드 UI는 숨겨지고 M1 동작. 디버그 화면은 기본 지휘관 하르텐(`gameData.ts`의 `DEFAULT_COMMANDER_ID`, 데이터에 없으면 없음)이 선택되어 있고 시작 편성은 자동 배치하지 않는다. `BattleSession`은 `extras.defaultCommanderId`를 줘야 기본 선택이 켜진다(없으면 지휘관 없음).
- 5연전(`Gauntlet`): 아군 편성 고정, 적은 `tools/formations/series-1~5.json`, 판별 시드 파생, 덱은 판 사이에 이어짐, "카드 사용 금지" 옵션으로 같은 시드·편성 비교.
- 카드 풀은 18종(M4-A에서 심연의 계약, M5-A에서 녹스 고유 카드 피의 대가 추가; 희귀도는 시작 카드 `starter`, 보상 풀 `common`/`rare`). 패널의 덱 선택에서 지휘관 기본 덱/확장 카드 테스트 덱(각 10장)을 선택한다. 테스트 덱에는 제련된 칼날·예비대 호출이 포함된다. `DeckPreset`은 단일 전투·5연전·경제 플레이·헤드리스에 공통 적용된다. `manaFill`은 공통 효과, `drawCards`·`cpGain`은 카드 전용 효과다. `chain.cost`는 연쇄 활성 시 CP 검사 전 실제 비용에 반영하고 UI도 같은 `effectiveCard`를 사용한다.
- **런 UI (M4-B, M5-A 지휘관·유물)**: 앱은 시작 화면에서 열린다 — 지휘관 3명 카드(이름·HP·패시브·궁극기·시작 유닛·덱 요약)에서 고른 뒤 "새 런"(시드 자동 제안·입력 가능, 6자리; `newRun(seed, commanderId)`), "이어하기"(localStorage 저장이 온전할 때만 활성, 손상·버전 불일치면 한국어 오류 + "저장 삭제"), 테스트 모드 "경제 플레이"/"편성 디버그"(기존 화면, 왼쪽 위 "시작 화면" 버튼으로 복귀). `RunSession`이 `RunController`와 `BattleSession`을 묶고 화면(`RunShell`)은 `RunViewSource`/`RunCommands`로만 본다. 화면: 시작·맵(SVG 간선 + 노드 버튼, 호버/클릭으로 `previewNode` 미리보기, 더블클릭·"이 노드로 이동")·보상(정예는 유물 카드 + 카드 3장)·상점(카드·유물 구매, 카드 제거)·이벤트·야영지·종료(보유 유물, 보스 유물 후보)는 전체 화면 HTML 오버레이(상단 HUD에 보유 유물 칩: 호버/포커스로 설명), 전투(battlePrep/battle/결과)는 캔버스 + 손패 + 오른쪽 `RunBattlePanel`.
- **런 전투 연결**: 전투 준비에 들어가면 `RunSession`이 `BattleSession.attachRun(RunBattleAdapter)`를 건다. 세션은 `RunBattleLink`(로스터 `RunRoster`·`createSimulator`·`beginBattle`·`abandonBattle`·`completeBattle`)만 알고 기존 `ManagementPanel`·`HandPanel`·`BattleScene`을 그대로 쓴다. 로스터·편성이 바뀌면 `createSimulator`를 다시 불러 준비 시뮬을 갱신(정산은 마지막 발급분만). 전투가 끝나면 세션이 `completeBattle`로 정산하고 결과를 보여주며(`resultPending`), "계속"을 눌러야 보상·맵·보스 재도전 준비(연결 다시 걸기)·종료 화면으로 넘어간다. "준비로 돌아가기"는 `abandonBattle`(정산 없음).
- **자동 저장**(저장 형식 v3 — 지휘관·유물·액트별 맵 포함, v1·v2 저장본은 액트 1로 읽음): 노드 입장·보상·상점/이벤트/야영지 처리·전투 준비 중 로스터 변경·전투 정산 직후마다 `controller.serialize()`를 저장한다(전투 중이면 battlePrep으로). 런이 끝나면 저장을 지운다(종료 화면만 보여주고 이어하기 대상에서 제외). 저장 실패는 알림만 띄우고 게임은 계속된다. 새 런 시드는 core가 32비트 정수(`seed | 0`)로 다루므로 범위를 `-2^31~2^31-1`로 제한한다.
- **보스 연출**: `ReplayState`가 `telegraph`/`strike`를 재생 시각 기준으로 다룬다(`telegraphs()` = 예고~발동 전, `strike`는 `recentEffects`). `EffectsLayer`가 예고 열을 붉게 칠하고 남은 시간을 표시, 발동 순간 번쩍인다. `BattleViewSource.telegraphs()`로 씬에 전달. M5-1: 쌍둥이 부활 대기는 `reviveWatches()`(죽은 쪽 링 + "부활까지 N초", 짝에 "N초 안에 처치!" 표시), 부활·처치 확정·군주 페이즈 배너·버프 해제 링은 `revive`/`reviveCancel`/`phase`/`dispel` 연출 이벤트.
- **액트 UI (M5-1)**: HUD·맵에 "액트 N — 이름", 보스 유물 선택 화면(`bossRelic`)·액트 소개 화면(`actIntro`: 지역·보스 패턴·회복 결과)은 전체 화면 오버레이, 전투 미리보기에 보스 패턴 설명, 종료 화면에 도달 액트·층. `RunCommands`에 `claimBossRelic`·`skipBossRelic`·`continueAct`.
- 레이아웃: 왼쪽 열 `#stage`(`#game` 캔버스 + 아래 `#hand` 손패 바, 지휘관이 없으면 숨김) + `#panel`(340px 사이드). 폭 800px 이하면 위아래로 쌓는다.

## 플레이 테스트 도구 (배포판에서 밸런스 확인용)
- **목적**: 사용자가 GitHub Pages 배포판에서 직접 플레이하며 액트 2·3·지휘관별 밸런스를 확인한다. 프로덕션 빌드에서도 동작하며 dev 전용 `window.__tactics`와 별개. 일반 런과 명확히 구분(HUD 보라색 "테스트 런" 배지)되고 일반 런의 규칙·저장 검증은 불변이다.
- **사용법**: 시작 화면 아래의 접이식 "테스트 시작" 패널에서 지휘관·시드·덱·시작 액트(1~3)·시작 위치(액트 처음/보스 직전)·골드·HP·레벨·유물(체크)·카드(장수·강화)·유닛(성급·위치)을 정하고 "테스트 런 시작"(저장본이 있으면 덮어쓰기 확인). 런 중에는 오른쪽 아래 "테스트 도구" 버튼 또는 **T**(또는 `) 키로 패널을 열어 골드·HP·레벨·유물·카드·유닛을 바꾸고, 보스 직전 야영지/보스 전투 준비/다음 액트(보스 유물 선택 또는 액트 소개)로 이동하고, 전투를 강제 승리·패배로 끝낸다(일반 정산 경로). 값·유물·카드·유닛 편집은 맵·전투 준비·야영지에서만, 강제 결과는 전투 준비·전투 중에만 활성(사유가 패널에 표시됨).
- **core**: `RunController.createTest(deps, setup)`로 만들고 `controller.test`(`TestRunTools`)가 명령을 받는다. 일반 런이면 모든 명령이 `{ ok:false, reason }`. 상태의 `test` 표시는 저장 v3의 **선택 필드**(`test: { startAct, startPosition }`, 없으면 일반 런)이며 일반 런 저장본·검증은 그대로다. 이전 액트·건너뛴 구간은 맵 경로를 실제로 지나온 것으로 기록(visited·승리 history·seenEvents)해서 구조 검증을 그대로 통과한다. 테스트 런에서만 완화되는 검증은 최대 HP 기본값 일치와 시작 덱 장수 보존 두 가지. 상세는 data/README.md "플레이 테스트 런".
- **UI**: `ui/run/testViews.ts`(선택지 카탈로그·도구 상태 순수 빌더), `TestStartPanel`(시작 화면, DOM을 한 번만 만들어 입력 유지), `TestToolsPanel`(런 중 패널, `RunShell`이 body에 붙임, `testTools.css`), 계약은 `contracts.ts`의 `TestCommands`/`TestToolCommand`(RunCommands와 별도). `RunSession`이 `startTestRun`·`testCommand`를 구현하고, 강제 결과는 `RunBattleHost.forceRunResult` → `BattleSession`이 재생 중인 시뮬에 `forceCombatResult`를 적용해 일반 종료·정산을 탄다. 전투 준비 중 편집은 준비 시뮬을 다시 만든다.

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

## 런 코어 (M4-A, UI는 M4-B, 3액트는 M5-1)
`src/core/run`의 `RunController`가 **3액트**(액트당 13층) 한 판을 진행한다 (`RunOptions.acts`로 1~3 지정, 1이면 액트 1 보스 처치가 승리). Phaser·DOM 비의존이며 맵·노드·종료 화면 UI와 저장/이어하기(M4-B, `src/ui/run`)는 이 API만 보고 만들었다. UI용 읽기 전용 접근자 `RunRoster.formation()`만 core에 추가했다. 전체 규칙·수치는 [data/README.md](data/README.md)의 "런 코어" 절.
- **상태 머신**: `map`(노드 선택) → `battlePrep`(전투 준비: 유닛 상점·배치·준비 카드) → `battle`(전투 중, 로스터 명령 거부) → `reward`(카드 3장 중 1장/건너뛰기) | `map` | `battlePrep`(보스 재도전) | `bossRelic`(액트 보스 처치: 보스 유물 3개 중 1개/건너뛰기) → `actIntro`(다음 액트 소개·HP 회복 결과, `continueAct()`) → `map` | `ended`(마지막 액트 보스 처치 승리 / 사망). 상점·이벤트·야영지 노드는 `shop`/`event`/`camp` 단계. `chooseNode` → 노드 처리 → `toMap` 반복.
- **액트 (M5-1)**: 액트마다 `MapGenerator.generate(seed, act)`로 13층 맵을 따로 만든다. 액트 1은 기존과 비트 단위로 같고(시드 파생·노드 id `층-인덱스`), 액트 2부터 시드에 액트 번호를 더하고 노드 id에 `a2-` 접두사가 붙는다. 층 보정·패배 피해 층 항·`encounters.json` 층 범위는 **전체 층 = (액트−1)×13 + 층**을 쓴다(액트 2 보스 ×2.00, 액트 3 보스 ×2.52). 액트 보스 처치 후 지휘관 HP를 최대 HP 50%(올림) 회복(초안)하고 골드·로스터·덱·장비·유물은 유지한다. 보스 3종: 성문 파괴자(열 강타)·쌍둥이 주술사 세르·미르(한쪽이 죽으면 3초 뒤 HP 50%로 부활, 둘 다 3초 안에 처치해야 함, `twinRevive`)·군단의 군주 바르칸(HP 66%·33%에서 증원 소환 + 아군 보호막·시간제 버프 해제, `phaseSummon`). 보스 패턴은 `units.json pattern`(데이터)에서 `installBossPatterns`가 설치하고 `previewNode(id)`의 `bossPatterns`가 설명을 준다. 상세 수치·규칙은 data/README.md "액트 구조"·보스 절.
- **맵**: `MapGenerator.generate(seed, act)` → `RunMap` (13층, 층당 2~4노드, 보스 1, 1층 전투·12층 야영지 고정, 정예 4층+, 상점/야영지 연속 금지, 교차 없는 간선, 목표 비율 개수 할당). 맵·적 편성·보상·상점 진열·이벤트는 `deriveSeed(런 시드, 용도, 노드)`로 파생한 무상태 Rng, 상점 유닛 Rng와 덱 섞기 Rng만 저장한다.
- **전투 입력**: `controller.createSimulator()`가 편성·준비 손패·지휘관 HP·적 보정(`CombatSetup.enemy`)을 넣은 `CombatSimulator`를 만들고, 끝난 시뮬을 `completeBattle(sim)`에 넘기면 골드(일반/정예/보스) → 카드로 잃은 HP(`commanderHp` 이벤트) → 패배 피해 → 덱·장비 이어받기 → 다음 단계 순으로 정산한다 (한 번만). 전투 자체는 런 상태를 바꾸지 않아 결정론이 유지된다.
- **적 편성**: `data/encounters.json`(액트 1·2·3 일반·정예·보스, 층 범위는 전체 층) + 층 보정 `1 + 0.04 × (전체 층−1)`(HP·ATK), 정예 변이 4종(`combat/mutations.ts`), 보스 성문 파괴자(`combat/bossPattern.ts`, 열 강타 예고 `telegraph` → 발동 `strike`). `controller.previewNode(id)`가 실제 전투와 같은 `EncounterPlan`(보정 후 스탯·변이)을 돌려준다.
- **지휘관 HP**: 시작 80(`commanders.json maxHp`), 패배·무승부 피해 `ceil((2 + 생존 적 등급 합 + floor(층/3)) × 종류 배율)`(정예 ×1.5, 보스 ×2). 심연의 계약(0CP, HP 3→CP +2, 심연 공명이면 HP 면제)은 카드 필드 `commanderHpCost` + 효과 `cpGain`.
- **로스터·덱 이어받기**: `PlayerForces`(Economy + Management + 판 사이 덱/장비)를 경제 플레이(`ManagementRun`)와 런이 함께 쓴다. `RunController.roster`는 단계별로 허용하는 `Management` 창구.
- **시드**: `RunController.create`가 시작에서 `normalizeRunSeed`(안전한 정수만 허용, `| 0`으로 부호 있는 32비트 정규화)를 한 번 적용하고 이후 모든 파생·저장에 같은 값을 쓴다. 복원은 32비트 범위 밖 시드를 거부한다.
- **저장**: `controller.serialize()` → `RunSave`(format `autochess-run`, version 3 — 액트별 맵 `maps`·`totalActs`; 1~3을 읽고 v1·v2는 3액트 런의 액트 1로 읽음, 이미 승리로 끝난 저장만 1액트), `RunController.restore(deps, json)`. 노드 입장 직후·맵 선택 단계 등 모든 비전투 시점에서 가능하며 전투 중이면 `battlePrep`으로 저장한다(전투 중간 저장 없음). 잘못된 데이터는 경로가 담긴 한국어 오류. 복원 시 필드 간 일관성(위치·간선·액트 전환, 단계↔노드 종류, 보스 유물·액트 소개 세션, HP, 전투 시도 수↔기록, 상점 가격·칸 수, 이벤트 기록)도 검증한다.
- **정산 바인딩**: `completeBattle`은 `createSimulator`가 현재 노드·시도에 발급한 시뮬만 한 번 정산한다 (다른 노드·이전 시도·다른 컨트롤러·복원 이전 시뮬, 재제출은 거부).
- **헤드리스**: `AutoRunner`(core, 보스 유물은 유물 정책이 켜져 있으면 첫 후보 선택·꺼져 있으면 건너뜀, 액트 소개는 계속) + `tools/run.ts`(기본 3액트). 테스트 도우미는 `run/testSupport.ts`(`driveTo`, `finishBattle`, `forceResult`).

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
