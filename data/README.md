# 데이터 파일

게임 콘텐츠 정의. 코드는 이 파일을 읽어 검증한 뒤 사용한다 (ROADMAP M0-4).
파일: `cards.json` / `units.json` / `traits.json` / `commanders.json`.

## cards.json

현재 수록: 철벽 장군 하르텐(`cmd_harten`)의 시작 덱 카드 7종. 시작 덱 구성(10장)은 [CHARACTERS.md](../CHARACTERS.md) 3-1.
코드는 `loadCards(json, traitCatalog?)`로 읽는다. 특성 카탈로그를 주면 공명이 가리키는 특성 id도 확인한다.

### 카드 필드
| 필드 | 값 |
|---|---|
| `id` | 영문 고유 키 |
| `name` | 표시 이름 |
| `owner` | 지휘관 id (고유 카드) 또는 `neutral` (공용) |
| `rarity` | `starter` / `common` / `rare` / `epic` |
| `type` | `operation`(작전, 준비 단계) / `command`(명령) / `spell`(주문) / `equipment`(장비, M3) / `curse`(저주, 사용 불가) |
| `cost` | CP 비용 |
| `target` | 대상 지정 방식 (아래) |
| `keywords` | `exhaust`(소모) / `retain`(보존) / `chain`(연쇄) / `conscript`(징집, M3). 공명은 `resonance` 필드로 |
| `limits` | 선택. `perCombat`: 전투당 사용 횟수 (같은 카드 id의 모든 장이 합산) |
| `resonance` | 선택. `{ "trait": 특성 id, "effects": [...] }` — 그 특성이 아군 진영에서 활성(단계 1 이상)이면 기본 효과 뒤에 추가 실행 |
| `chain` | `keywords`에 `chain`이 있을 때만, 그리고 반드시 있어야 함. `{ "effects": [...] }` — 이번 전투에서 앞서 카드를 한 장이라도 썼으면(준비 단계 작전 포함) 기본 효과(·공명) 뒤에 추가 실행 |
| `text` | 카드 설명문 |
| `effects` | 효과 목록 (순서대로 적용) |
| `upgrade` | 강화(+) 버전. `effects`·`text`는 통째로 대체, `cost`·`resonance`·`chain`은 있을 때만 대체(없으면 기본 카드 것을 그대로 씀) |

효과 실행 순서: `effects` → `resonance.effects`(조건 충족 시) → `chain.effects`(조건 충족 시).

### target.kind
| 값 | 의미 | 사용 시 지정값 (`PlayTarget`) |
|---|---|---|
| `none` | 대상 지정 없음 | `{ "kind": "none" }` |
| `allyUnit` / `enemyUnit` | 유닛 1명 | `{ "kind": "unit", "uid": 3 }` |
| `allyUnits` | 아군 `count`명 (중복 불가) | `{ "kind": "units", "uids": [0, 2] }` |
| `cell` / `area3x3` | 칸 / 3×3 범위(지정 칸이 중심) | `{ "kind": "cell", "cell": { "col": 5, "row": 2 } }` |

### 카드의 효과
카드 효과는 전투 효과(아래 "전투 효과 (공통)")와 **같은 형식·같은 검증기**를 쓴다. 효과 kind 전부와 모든 selector를 쓸 수 있고, 다음만 제한된다.
- **성급별 배열(`[a, b, c]`)은 거부**한다 (카드에는 성급이 없음. 숫자 하나만).
- 카드는 시전 유닛이 없으므로 `damage`(ATK 비례)와 selector `self`/`lineThroughTarget`은 거부한다. 고정 피해는 `flatDamage`, 화상은 `dps`(고정값)를 쓴다.
- selector `target`·`targetAndAdjacent`와 효과 `forceTarget`·`teleport`는 유닛을 지정하는 target.kind(`allyUnit`/`enemyUnit`/`allyUnits`)에서만, `enemiesInTargetArea`·`alliesInTargetArea`는 `cell`/`area3x3`에서만 쓸 수 있다.
- `cpOnKill`은 특성 전용이라 카드에서 거부한다.
- `allAllies` 등 진영 기준 selector는 플레이어 진영(side 0)을 기준으로 한다. 적 진영은 카드를 쓰지 않는다.

---

## 전투 효과 (공통)

카드·유닛 스킬·특성·지휘관 패시브가 같은 효과 데이터와 같은 실행기(`src/core/combat/effects.ts`)를 쓴다.
검증기도 하나(`src/core/data/effectValidator.ts`)이며, 성급 배열을 허용하지 않는 곳(카드·지휘관)은 `allowStarArrays: false`로 쓴다.

### 성급별 수치
수치 파라미터는 숫자 하나 또는 `[1성, 2성, 3성]` 길이 3 배열 (스킬·특성 전용). 특성에서는 같은 배열을 `[1단계, 2단계, 3단계]`로 읽는다.
`duration`은 초 단위 수치 또는 `"combat"`(전투 끝까지).

### selector
`target`(대상: 스킬은 targeting 결과, 카드는 지정 대상) / `self`(시전자) / `allAllies` / `alliesFrontRow` / `alliesMelee` / `lineThroughTarget`(시전자에서 대상 방향으로 보드 끝까지 뻗는 직선 위의 적 전부) / `targetAndAdjacent`(첫 대상 + 그 대상과 같은 진영에서 8방향 인접한 유닛) / `enemiesInTargetArea` / `alliesInTargetArea`(카드가 지정한 칸 또는 3×3 범위 안의 적 / 아군)

- 전열 = 중앙에 가장 가까운 열 (아군 열 3, 적 열 4). **효과를 적용하는 시점의 현재 열**로 판정한다 (특성은 전투 시작 시 1회 적용).
- 근접 = 사거리 1.
- `targetAndAdjacent`는 첫 대상이 앞선 효과로 이미 죽었어도 그 칸 기준으로 인접 유닛을 고른다.

### effect.kind
| kind | 파라미터 | 의미 |
|---|---|---|
| `shield` | `pctMaxHp`, `duration` | 최대 HP 비례 보호막 (먼저 얻은 것부터 흡수) |
| `damageTakenMult` | `mult`, `duration` | 받는 피해 배율 (0.5 = −50%, 1.15 = +15%). 곱연산 |
| `statMod` | `stat`, `pct`, `duration`, `refreshOnKill?` | 스탯 % 증감 (`stat`: `atk`/`as`/`arm`/`res`). `refreshOnKill`이 true면 지속 중 시전자가 적을 처치할 때 지속 시간 초기화 (투지) |
| `statAdd` | `stat`, `amount`, `duration` | 스탯 고정값 증감. 최종값 = (기본 + 고정값) × (1 + 합계 %) |
| `forceTarget` | `duration` | selector 유닛들이 `target`을 우선 공격 |
| `undying` | `duration` | HP가 1 밑으로 내려가지 않음 |
| `swapPositions` | – | selector 유닛 두 명의 위치 교환. 정확히 2명이어야 하고 이동 중인 유닛이 있으면 실패 |
| `damage` | `pctAtk`, `dmgType`(`physical`/`magic`), `ignoreArmorPct?` | 시전자 ATK의 `pctAtk`% 피해. `ignoreArmorPct`는 방어력 무시 % |
| `flatDamage` | `amount`, `dmgType`, `ignoreArmorPct?` | 시전자와 무관한 고정 피해 (카드·패시브에서 쓸 수 있음) |
| `stun` | `duration` | 기절: 이동 시작·공격·스킬 불가 (이미 시작한 1칸 이동은 끝낸다). 중첩 없이 더 늦게 끝나는 쪽으로 갱신 |
| `silence` | `duration` | 침묵: 스킬 시전 불가 (이동·기본 공격은 가능, 마나는 계속 참). 중첩 없이 더 늦게 끝나는 쪽으로 갱신 |
| `manaDrain` | `amount` | 대상 마나 감소 (0 미만 불가) |
| `heal` | `amount` | 즉시 회복 (최대 HP 초과 불가) |
| `healAura` | `perSecond`, `radius`, `duration` | 지속 중 1초마다 반경 `radius`칸 안의 **다른** 아군을 `perSecond`만큼 회복 |
| `burn` | `dpsPctAtk` 또는 `dps` (정확히 하나), `duration` | 화상: 1초마다 마법 피해. `dpsPctAtk`는 시전자 ATK 비례, `dps`는 고정값(시전자 없는 카드용). 재부여 시 지속 시간 갱신 + 초당 피해는 큰 값 (중첩 없음) |
| `teleport` | `destination`(`behindTarget`) | selector 유닛을 `target` 유닛의 뒤로 순간이동. 뒤 = 대상에 인접한 빈 칸 중 이동자에서 가장 먼 칸. 빈 칸이 없으면 스킬을 시전하지 않음 (마나 유지, 다음 틱 재판정) |
| `extraShots` | `count` | 다음 `count`회 기본 공격이 2발씩 (마나는 공격 1회로 계산) |
| `cpOnKill` | `amount`, `maxPerCombat` (selector는 `allAllies`만) | **특성 전용.** 전투 시작 시 트리거(`onKill`)를 등록: 이 진영 유닛이 적을 처치하면 CP를 `amount`만큼 얻음. 실제로 얻은 합계가 `maxPerCombat`에 닿으면 멈춤 (CP 상한 6에 막혀 못 얻은 양은 한도를 소모하지 않음). 플레이어(side 0) 진영이고 카드 시스템이 켜진 전투에서만 동작 |

스킬은 시전 전에 대상·사거리·순간이동 목적지를 검사하고, 하나라도 실패하면 시전하지 않는다. 카드는 사용 전에 같은 검사(`EffectExecutor.checkExecutable`)로 순간이동 목적지·위치 교환 가능 여부를 확인하고, 실패하면 카드·CP를 소모하지 않는다.

`statusApplied` 이벤트의 `value`(선택): `statMod`=pct, `statAdd`=고정값, `damageTakenMult`=mult, `burn`=초당 피해, `healAura`=초당 회복량. 수치가 없는 상태(stun, silence, undying, forceTarget, extraShots)는 `value` 키 자체가 없다.

### 피해 적용 순서
1. `damageTakenMult` 상태들의 곱 × 과열 배율을 raw 피해에 곱한다
2. 방어: × 100/(100 + ARM 또는 RES) (`ignoreArmorPct`만큼 방어력 감소)
3. 반올림, 최소 1
4. 보호막 흡수 → 남은 만큼 HP 감소
- 과열 배율 = 1 + 0.1 × (경과초 − 30), 30초 이후. 90초가 되면 무승부로 강제 종료.
- 마나: 공격 1회 +10, 피격 시 (2번까지 계산한 피해량, 보호막 흡수 전)의 1% (1회 최대 +15).

---

## units.json

유닛 8기: M1 6기 + M2 2기 (CHARACTERS.md 4·5장). 코드는 `loadUnits(json, traitCatalog)`로 읽으며, 특성 카탈로그를 주면 `origin`/`job` 참조(존재, 종류)도 검증한다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키, 표시 이름 |
| `tier` | 등급 1~5 |
| `origin` / `job` | 기원 / 직업 특성 id (`traits.json`) |
| `stats` | 1성 능력치 `hp`, `atk`, `as`(초당 공격), `rng`(칸), `arm`, `res`, `mana`(최대 마나). 2성 HP·ATK ×1.8, 3성 ×3.2 |
| `skill.name`, `skill.text` | 표시용 |
| `skill.targeting` | `self` / `currentTarget`(현재 공격 대상, 사거리 안이어야 시전) / `lowestHpEnemy`(현재 HP가 가장 낮은 적, 사거리 무관) |
| `skill.effects` | 효과 목록 (순서대로 실행, 최소 1개). 수치는 `[1성, 2성, 3성]` 배열 가능 |

M2에서 추가된 유닛
- `ember_kindler` (U06 잿불 점화사, 잿불/주술사): 점화 = 대상과 인접 적에게 `flatDamage` 마법 120/180/300 + `burn` 3초. CHARACTERS에 화상 수치가 없어 초당 피해는 시전자 ATK의 100%(`dpsPctAtk: 100`)로 정했다.
- `abyss_whisperer` (U13 심연 속삭임꾼, 심연/주술사): 속삭임 = 마법 피해 80/120/200 + 침묵 2/2.5/3초 + 마나 −30.

## traits.json

| 필드 | 값 |
|---|---|
| `id`, `name`, `text` | 영문 키, 표시 이름, 설명 |
| `kind` | `origin`(기원) / `job`(직업) |
| `thresholds` | 단계 진입에 필요한 **서로 다른 유닛 종류 수** 3개 (오름차순). 현재 모두 `[2, 4, 6]` |
| `effects` | 선택. 전투 시작 시 단계에 도달한 진영에 적용. 수치 배열은 `[1단계, 2단계, 3단계]`. 없으면 효과 미구현 |

단계 = `thresholds` 중 종류 수 이상으로 도달한 개수 (0~3). 같은 유닛 여러 기는 1종으로 센다. 양측 진영 모두 각자 계산한다.
현재 효과가 있는 특성은 `iron_legion`(ARM +15/+35/+60), `guardian`(전열 받는 피해 −15/−30/−45%), `abyss`(`cpOnKill`: 처치 시 CP +1, 전투당 최대 2/4/6) 셋이고 나머지 6개는 id만 정의되어 있다.

전열 대상 특성(guardian)은 전투 시작 시점에 전열(아군 열 3, 적 열 4)에 있던 유닛에게 전투 내내 부여된다. 이후 위치 변화와 무관하며, 시작 시 전열 유닛이 없으면 효과 없음. (소환·부활·전투 중 위치 교환(진형 교대)이 있으므로 피해 계산 시 현재 열을 검사하는 방식으로 바꾸는 것을 검토)

## commanders.json

지휘관 정의 (DESIGN 5장, CHARACTERS 3장). 현재 철벽 장군 하르텐 `cmd_harten` 하나. 코드는 `loadCommanders(json, cardCatalog, unitCatalog)`로 읽으며 시작 덱의 카드 id·시작 유닛 id가 실제로 있는지, 덱 카드의 `owner`가 `neutral` 또는 해당 지휘관인지 확인한다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키(`cmd_*`), 표시 이름 |
| `passive` | `{ name, text, effects }`. effects는 공통 효과 형식(성급 배열 불가). 시전자·지정 대상이 없는 문맥이라 `self`/`target` 계열 selector는 쓸 수 없다 |
| `startingDeck` | `[{ cardId, count }]` 시작 덱 (하르텐 10장) |
| `startingUnits` | `[{ unitId, count }]` 시작 유닛 |
| `startCpBonus` | 전투 시작 CP 보정 (기본 2에 더함). 하르텐 0 |
| `ultimate` | 선택. `{ name, text }` 표시용. **궁극기는 M5에서 구현** — 지금은 데이터만 있고 동작하지 않는다 |

**하르텐 패시브 철의 서약**: `shield` `alliesFrontRow` 최대 HP 10%, `duration: "combat"`. 전투 시작 시 전열(아군 열 3)에 있던 유닛에게 한 번 걸리고 전투 끝까지 유지된다(피해를 흡수하면 줄어든다).

---

## 카드 사용과 CP 규칙 (core)

### 덱 (`src/core/cards/`)
- 카드 인스턴스 `{ instanceId, cardId, upgraded }`. 같은 카드 여러 장은 `instanceId`로 구분한다.
- 더미 4개: 뽑을 더미(`draw`, 0번이 맨 위) / 손패 / 버린 더미 / 소모 더미. `Deck.serialize()`로 JSON 상태(섞기 Rng 상태 포함)를 저장하고 `Deck.restore()`로 복원한다.
- 전투 준비 시 `HAND_SIZE`(5)장 뽑기. 뽑을 더미가 비면 버린 더미를 Rng로 섞어 새 뽑을 더미로 삼는다.
- **손패 상한 `HAND_LIMIT`(10)**: 이미 상한만큼 들고 있을 때 뽑게 되는 카드는 손패에 들어오지 못하고 즉시 버린 더미로 간다.
- 사용한 카드는 버린 더미로, `exhaust` 카드는 소모 더미로(이번 런에서 제거. 재섞기에도 돌아오지 않음).
- 전투 종료 시 손패는 모두 버린 더미로 가고 `retain` 카드만 손패에 남는다. 더미는 전투가 끝나도 이어진다.
- 상수는 `src/core/cards/constants.ts`의 `CARDS` 한 곳.

### CP (`CommandPoints`)
- 전투 시작 `CP_START`(2) + 지휘관 `startCpBonus`, 전투 경과 `CP_REGEN_SECONDS`(4초 = 40틱)마다 +1, 최대 `CP_MAX`(6). 전투마다 초기화. 심연 특성의 CP도 같은 상한을 받는다.
- 준비 단계에는 **작전 카드 전용 CP `PREP_CP`(2)**를 별도로 받는다. 작전 카드만 이 풀을 쓰고, 남아도 전투로 이월되지 않는다.

### 시뮬 연동 (`CombatSimulator`)
- 카드 시스템은 `CombatSetup.cards = { commander, deck, commands? }`로 켠다 (4번째 생성자 인자로 `CardCatalog`). 없으면 M1과 완전히 같은 전투다 (`cp`·`cardPlayed` 이벤트 없음).
- 시작 순서: 스폰 → 특성 효과 → **지휘관 패시브** → 준비 CP 지급 → 준비 단계 작전 카드 → (첫 `step()`/`startCombat()`) 전투 CP 지급 → 그 틱의 예약 명령 → 틱 처리.
- 진행 API: `step()`(1틱) / `runUntil(tick)` / `run()`(끝까지, 기존과 동일) / `events`(진행 중 로그) / `phase`(`prep`/`combat`/`ended`) / `startCombat()`.
- **카드 명령** `CardCommand = { tick, cardInstanceId, target: PlayTarget }`. 그 틱의 모든 유닛 행동보다 먼저 실행된다. `tick: 0`의 작전 카드는 준비 단계에 쓴 것으로 취급한다. 두 가지 방법으로 낸다.
  - 예약: `setup.cards.commands`에 목록으로. 실패한 명령은 `sim.rejectedCommands`에 모인다.
  - 직접: 틱 사이에 `sim.playCard(instanceId, target)`. 성공한 명령은 `sim.commandLog`에 쌓이며, 이 로그를 그대로 `commands`에 넣으면 같은 이벤트 로그가 재현된다.
- 사용 검증 순서와 실패 사유(한국어, `{ ok: false, reason }`): 손패에 없음 → 종류/단계(작전은 준비 단계만, 명령·주문은 전투 중만, 장비·저주 사용 불가) → `perCombat` 초과 → CP 부족 → 대상 적법성(종류 일치, 존재, 생존, 진영, `allyUnits` 수·중복, 칸이 보드 안) → 효과 전제조건(순간이동 목적지, 위치 교환 대상 2명·이동 중 아님).
- **실패하면 CP·카드·이벤트 로그가 전혀 바뀌지 않는다** (별도 실패 이벤트 없음. 사유는 반환값으로만).
- 성공 시: CP 차감(`cp` 이벤트, 비용 0이면 생략) → 덱 이동 → `cardPlayed` 이벤트 → `onCardPlay` 트리거 → 효과 실행. 강화 카드는 `upgrade`의 효과·비용을 쓴다.
- 이벤트: `cp { pool: 'prep'|'combat', delta, cp, reason: 'start'|'regen'|'card'|'abyss' }`, `cardPlayed { cardId, instanceId, upgraded, target, cp, pool }`.

### 카드 사용 계획 (헤드리스 시뮬용)
`tools/plans/*.json`: 배열. 항목 `{ "tick": 50, "card": "focus_fire", "target": { "rule": "lowestHpEnemy" }, "until": 200 }`.
`tick`부터 `until`(생략 시 전투 끝까지)까지 매 틱 시도, 손패에 없으면 즉시 실패. `target.rule`은 `none`(기본) / `lowestHpEnemy` / `highestHpEnemy` / `lowestHpAlly` / `highestHpAlly` — 규칙이 가리키는 진영 유닛을 정렬해 카드가 필요한 수만큼 앞에서 고른다(칸 카드는 첫 유닛의 칸). 작전 카드는 `tick`과 무관하게 준비 단계에 한 번 시도한다. `npm run sim -- ... --commander cmd_harten --plan tools/plans/harten-basic.json`.
