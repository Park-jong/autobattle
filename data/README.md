# 데이터 파일

게임 콘텐츠 정의. 코드는 이 파일을 읽어 검증한 뒤 사용한다 (ROADMAP M0-4).
파일: `cards.json` / `units.json` / `traits.json` / `commanders.json` / `encounters.json` / `events.json`.

## cards.json

현재 수록: 카드 풀 17종(M4-A에서 심연의 계약 추가). 희귀도: 하르텐 시작 카드 7종은 `starter`, 보상·상점 풀은 `common`(마나 주입·전술 재정비·불씨 화살·행군가·제련된 칼날·적진 정찰·덩굴 속박)과 `rare`(화염 폭풍·예비대 호출·심연의 계약)이며 `epic`은 아직 없다. 철벽 장군 하르텐(`cmd_harten`)의 기본 시작 덱은 기존 7종으로 구성한 10장([CHARACTERS.md](../CHARACTERS.md) 3-1)이며, "확장 카드 테스트 덱"은 M2 추가 카드 5종과 제련된 칼날·예비대 호출을 포함한 10장이다. 테스트 덱은 경제 플레이·5연전과 헤드리스 `--deck test`에서도 사용할 수 있다.
코드는 `loadCards(json, traitCatalog?)`로 읽는다. 특성 카탈로그를 주면 공명이 가리키는 특성 id도 확인한다.

M2 추가 카드: `firestorm`(화염 폭풍, 범위 피해·잿불 공명), `mana_infusion`(마나 주입, 충전·보존), `tactical_reorganization`(전술 재정비, 드로우·연쇄 비용 0), `ember_arrow`(불씨 화살, 단일 피해·화상·소모), `marching_song`(행군가, 전체 ARM 증가). 잿불 공명은 잿불 투석수·점화사·광전사 중 서로 다른 2종으로 일반 플레이에서도 활성화할 수 있다.

M3 추가 카드: `call_reserves`(예비대 호출, 3CP·강화 2CP, 후열 빈 칸 2개에 무작위 1등급 임시 유닛 소환), `forged_blade`(제련된 칼날, 준비 CP 1, 장비 ATK +15/+25 및 공격 시 마나 +5), `enemy_scout`(적진 정찰, 작전 0CP, 무작위 적 1/2명의 최대 HP -10%), `vine_snare`(덩굴 속박, 1CP, 3×3 이동 금지 2/3초). 후열 자리가 부족하면 징집은 CP·손패·로그·RNG를 전혀 바꾸지 않고 실패한다. 임시 소환은 소유 로스터와 공유 유닛 풀에 들어가지 않으며 전투를 넘겨 이어지지 않는다.

보드 제공 카드: 군악대→행군가, 첩보원→적진 정찰, 드루이드→덩굴 속박. `syncGrantedCards`는 소유 유닛 ID(`CardInstance.grantedBy`)마다 카드 한 장을 유지하며, 벤치 이동·판매 시 모든 더미에서 제거하고 3성이면 강화한다. 원래 덱의 같은 이름 카드는 제거하지 않는다. 새 카드는 뽑을 더미 뒤에 추가한다. 시작 손패를 만들기 전에 동기화하면 그 손패에도 나올 수 있다.

장비: `FormationEntry.equipment`에 카드 ID 배열을 저장하며 강화는 `forged_blade+`처럼 `+`를 붙인다. 준비 단계 장착 시 즉시 효과를 받고 카드는 소모 더미로 간다. 다음 전투는 소유 로스터의 장비 배열을 시뮬에 전달해 효과를 다시 적용한다. 합성 시 장비는 남는 유닛으로 모으고 판매 시 사라진다. `CombatSimulator.equippedItems`는 임시 소환을 제외한 원본 유닛의 장비 복사본이다.

### 카드 필드
| 필드 | 값 |
|---|---|
| `id` | 영문 고유 키 |
| `name` | 표시 이름 |
| `owner` | 지휘관 id (고유 카드) 또는 `neutral` (공용) |
| `rarity` | `starter` / `common` / `rare` / `epic` |
| `type` | `operation`(작전, 준비 단계) / `command`(명령) / `spell`(주문) / `equipment`(장비, 준비 단계·아군 1명) / `curse`(저주, 사용 불가) |
| `cost` | CP 비용 |
| `target` | 대상 지정 방식 (아래) |
| `keywords` | `exhaust`(소모) / `retain`(보존) / `chain`(연쇄) / `conscript`(징집). 공명은 `resonance` 필드로 |
| `limits` | 선택. `perCombat`: 전투당 사용 횟수 (같은 카드 id의 모든 장이 합산) |
| `commanderHpCost` | 선택. `{ amount, waivedByTrait? }` — 사용 시 지휘관 HP를 `amount` 잃는다. 전투 시뮬은 `cards.commanderHp`(런의 현재 HP)를 받아 **사용 후 HP가 1 이상일 때만** 허용하고 `commanderHp` 이벤트(`delta`, `remaining`)를 남기며, 런이 정산한다. `waivedByTrait` 특성이 아군 진영에서 활성(단계 1 이상)이면 면제(공명 형태). `cards.commanderHp`를 안 주는 디버그 전투는 제한 없음 |
| `resonance` | 선택. `{ "trait": 특성 id, "effects": [...] }` — 그 특성이 아군 진영에서 활성(단계 1 이상)이면 기본 효과 뒤에 추가 실행 |
| `chain` | `keywords`에 `chain`이 있을 때만, 그리고 반드시 있어야 함. `{ "effects": [...], "cost"?: 정수 }` — 앞서 카드를 썼으면(준비 단계 작전 포함) 추가 효과 실행. `cost`는 CP 검사·차감·UI 표시에 먼저 적용하며, 비용만 바꾸면 `effects: []` 허용 |
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
- `drawCards`는 카드 전용이며 `selector: "allAllies"`, 양의 정수 `count`를 사용한다. 대상 유닛 수와 무관하게 한 번 뽑는다. 스킬·특성·지휘관 패시브에서는 거부한다.
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
| `manaFill` | — | 대상 유닛 마나를 최대로 충전 (다음 행동에서 일반 스킬 규칙 적용) |
| `drawCards` | `count` (양의 정수), selector는 `allAllies` | 카드 전용. 그 수만큼 드로우, 손패 상한·버린 더미 재셔플 규칙 적용 |
| `cpGain` | `amount` (양의 정수), selector는 `allAllies` | 카드 전용. 전투 CP를 한 번 얻는다 (상한 6, `cp` 이벤트 reason `effect`). 심연의 계약이 사용 |
| `root` | `duration` | 이동 시작만 금지. 이미 시작한 이동은 끝내고 공격·스킬은 허용 |
| `hpCost` / `lifesteal` | `pctMaxHp` / `pct`, `duration` | 최대 HP 비율 자가 소모(HP 최소 1) / 실제 HP 피해 기준 흡혈 |
| `onAttackBurn` / `killFeast` / `marksman` | 화상 비율·지속 / 회복·ATK 비율 / 사거리·확률 | 특성 전용 트리거. `traitUnits`로 해당 기원·직업 유닛만 선택 |
| `attackMana` | `amount` | 선택한 유닛이 기본 공격하면 마나 추가. 장비에 사용 |
| `summon` / `scout` | `count`, `tier` / `count`, `pctMaxHp` | 카드 전용 징집 / 무작위 적 최대 HP 감소 |
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

유닛 15기: 1등급 8종 + 2등급 6종 (CHARACTERS.md 4·5장) + 보스 전용 `gate_breaker`(성문 파괴자, 5등급, `boss: true`). 코드는 `loadUnits(json, traitCatalog)`로 읽으며, 특성 카탈로그를 주면 `origin`/`job` 참조(존재, 종류)도 검증한다. `grantedCard`는 보드 제공 카드 ID이며 `assertUnitCardReferences`가 카드 참조를 검증한다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키, 표시 이름 |
| `tier` | 등급 1~5 |
| `origin` / `job` | 기원 / 직업 특성 id (`traits.json`) |
| `stats` | 1성 능력치 `hp`, `atk`, `as`(초당 공격), `rng`(칸), `arm`, `res`, `mana`(최대 마나). 2성 HP·ATK ×1.8, 3성 ×3.2 |
| `skill.name`, `skill.text` | 표시용 |
| `skill.targeting` | `self` / `currentTarget`(현재 공격 대상, 사거리 안이어야 시전) / `lowestHpEnemy`(현재 HP가 가장 낮은 적, 사거리 무관) |
| `skill.effects` | 효과 목록 (순서대로 실행, 최소 1개). 수치는 `[1성, 2성, 3성]` 배열 가능 |
| `boss` | 선택. `true`면 보스 전용 — 상점 유닛 풀·징집 후보·이벤트 유닛 지급에서 제외 |
| `pattern` | 선택(보스). `{ kind: "columnStrike", intervalSeconds, telegraphSeconds(< 간격), damage, dmgType }` — 주기 열 강타. 동작은 아래 "런 코어"의 보스 절 |

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
현재 실제 효과가 있는 특성은 `iron_legion`(ARM), `ember`(기본 공격 화상), `abyss`(처치 CP), `guardian`(전열 피해 감소), `gladiator`(처치 회복·ATK 누적), `marksman`(사거리·확률 연사) 여섯이다. `forest_pact`·`mystic`·`assassin`의 고유 특성 효과는 후속 범위로 표시되어 있다. 같은 종류 유닛을 여러 기 놓아도 활성화 종류 수는 1이며, 임시 소환은 시작 시 계산된 단계에 추가되지 않는다.

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
| `maxHp` | 선택. 런 시작·최대 지휘관 HP (생략하면 80). 하르텐 80 |
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
- 드로우 카드는 효과 해결 중 손패에서 빠지지만 버린 더미에는 아직 들어가지 않는다. 뽑기가 끝난 뒤 버려져 자기 자신을 즉시 다시 뽑지 않으며, 빈 손패 자리도 정확히 계산한다.
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
- 사용 검증 순서와 실패 사유(한국어, `{ ok: false, reason }`): 손패에 없음 → 종류/단계(작전·장비는 준비 단계만, 명령·주문은 전투 중만, 저주 사용 불가) → `perCombat` 초과 → CP 부족 → 대상 적법성(종류 일치, 존재, 생존, 진영, `allyUnits` 수·중복, 칸이 보드 안) → 효과 전제조건(순간이동 목적지, 위치 교환 대상 2명·이동 중 아님, 징집 후열 빈 칸).
- **실패하면 CP·카드·이벤트 로그가 전혀 바뀌지 않는다** (별도 실패 이벤트 없음. 사유는 반환값으로만).
- 성공 시: CP 차감(`cp` 이벤트, 비용 0이면 생략) → 손패에서 분리 → `cardPlayed` 이벤트 → `onCardPlay` 트리거 → 효과 실행 → 버린/소모 더미로 이동. 강화 카드는 `upgrade`의 효과·비용을 쓴다.
- 공격 카드로 한쪽이 전멸하면 즉시 종료·손패 정리를 하고 이후 카드를 거부한다. 예약 명령 재생에서도 종료 이후 유닛 행동은 실행하지 않는다.
- 이벤트: `cp { pool: 'prep'|'combat', delta, cp, reason: 'start'|'regen'|'card'|'abyss' }`, `cardPlayed { cardId, instanceId, upgraded, target, cp, pool }`.

### 카드 사용 계획 (헤드리스 시뮬용)
`tools/plans/*.json`: 배열. 항목 `{ "tick": 50, "card": "focus_fire", "target": { "rule": "lowestHpEnemy" }, "until": 200 }`.
`tick`부터 `until`(생략 시 전투 끝까지)까지 매 틱 시도, 손패에 없으면 즉시 실패. `target.rule`은 `none`(기본) / `lowestHpEnemy` / `highestHpEnemy` / `lowestHpAlly` / `highestHpAlly` — 규칙이 가리키는 진영 유닛을 정렬해 카드가 필요한 수만큼 앞에서 고른다(칸 카드는 첫 유닛의 칸). 작전 카드는 `tick`과 무관하게 준비 단계에 한 번 시도한다. `npm run sim -- ... --commander cmd_harten --plan tools/plans/harten-basic.json`.

---

## encounters.json

적 편성 데이터 (DESIGN 7-1). 직접 설계한 편성을 층 범위로 고른다. 코드는 `loadEncounters(json, unitCatalog, coverage?)`로 읽는다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키, 표시 이름 |
| `kind` | `normal`(전투 노드) / `elite`(정예) / `boss` |
| `minFloor`, `maxFloor` | 이 편성이 나올 수 있는 층 (포함, 1~13) |
| `text` | 미리보기 한 줄 설명 |
| `units` | `[{ unitId, star(1~3), col(4~7), row(0~4) }]` 적 진영 배치. 칸 중복 불가, 최소 1기 |

현재 수록: 일반 10개(1~11층을 겹쳐서 덮음), 정예 4개(4~11층), 보스 1개(`boss_gate_breaker`, 13층: 성문 파괴자 + 호위 2기). `loadRunDeps`는 일반 1~11층, 정예 4~11층, 보스 13층에 후보가 있는지 검사한다(없으면 어느 층인지 알리는 오류). 같은 노드는 (런 시드, 노드 id)로 편성을 고르므로 미리보기와 실제 전투가 항상 같다.

**층 보정**: 모든 적 유닛의 HP·ATK × `1 + 0.04 × (층 − 1)` (`RUN.FLOOR_SCALE_PER_FLOOR`). 시뮬에는 `CombatSetup.enemy = { hpMult, atkMult, mutations }`로 넣는다 (편성 유닛에만 적용, 소환 유닛 제외, 생략하면 보정 없음).

## events.json

런 이벤트 (DESIGN 6장, 액트 1 회색 관문). 코드는 `loadEvents(json, cardCatalog, unitCatalog)`로 읽는다.

| 필드 | 값 |
|---|---|
| `id`, `title`, `text` | 영문 키, 제목, 상황 설명 |
| `choices` | 선택지 2~3개: `{ text, result, effects }`. `result`는 선택 뒤 보여줄 문장, `effects`는 순서대로 실행(비어 있으면 아무 일 없음) |

**선택지 효과 최소 집합** (모르는 필드는 거부)
| kind | 파라미터 | 의미 |
|---|---|---|
| `gold` | `amount`(0 아닌 정수) | 골드 증감. 음수면 지불 — 골드가 모자라면 그 선택지는 선택 불가 |
| `commanderHp` | `amount` | 지휘관 HP 증감. 회복은 최대치까지. 피해는 이벤트로는 사망하지 않으며, 피해 후 HP가 1 미만이 되는 선택지는 선택 불가 |
| `gainCard` | `mode: "random"` + `rarity` / `mode: "choose"` + `rarity` + `count`(≥2) / `mode: "fixed"` + `cardId` | 카드 획득: 희귀도(`common`/`rare`/`epic`, 보상 풀 기준)에서 무작위 1장 / 후보 count장 중 1장 선택 / 지정 카드 |
| `removeCard` | `mode: "random"\|"choose"` | 덱 카드 제거(유닛 제공 카드 제외). 제거할 카드가 없으면 선택 불가 |
| `upgradeCard` | `mode: "random"\|"choose"` | 덱 카드 강화(이미 강화·강화 버전 없음·유닛 제공 카드 제외). 가능한 카드가 없으면 선택 불가 |
| `gainUnit` | `tier` | 무작위 `tier`등급 1성 유닛 1기를 벤치로 받는다(유닛 풀에서 원본 1개). 벤치가 가득 차면 선택 불가 |

`choose` 모드는 선택 직후 `pending`(후보 목록)이 생기고 `pickEventOption(index)`로 고르면 남은 효과가 이어서 실행된다. 이벤트는 노드마다 결정적으로 고르며 이미 본 이벤트를 먼저 피한다. 현재 5개: 버려진 군수 창고 / 부상당한 정찰병 / 관문 대장장이 / 균열 제단 / 탈영병 야영지.

---

## 런 코어 (M4-A)

`src/core/run`. 수치는 `RUN`(`run/constants.ts`)에 모여 있다. UI(M4-B)는 `RunController`만 보고 만든다.

### 맵 (`MapGenerator`, `RunMap`)
- 13층. 층 1~12는 노드 2~4개, 13층은 보스 1개. 인접한 두 층은 교차하지 않는 간선으로 잇고 노드마다 다음 층 노드 1~2개와 연결한다. 모든 노드는 시작에서 도달 가능하고 보스까지 경로가 있다.
- 고정: 1층 전투만, 12층 야영지 전부, 13층 보스. 정예는 4층 이상. 간선으로 이어진 두 노드가 모두 상점/야영지인 경우(상점·야영지 연속) 금지.
- 종류 비율은 보스 제외 전체 노드의 목표 비율(전투 45 / 정예 10 / 상점 12 / 이벤트 20 / 야영지 13)에 맞춘 "개수 할당"이라 시드마다 거의 같다 (300시드 측정: 전투 45.9 / 정예 10.0 / 상점 10.7 / 이벤트 20.3 / 야영지 13.1, 맵당 평균 37노드). 규칙 때문에 할당이 막히면 규칙을 지키는 다른 종류로 대체한다(주로 상점이 목표보다 약간 적음).
- 같은 시드는 같은 맵 (맵 전용 Rng). 노드 id는 `층-인덱스`(예: `3-1`), `x`(0~1)는 표시용 가로 위치.

### 단계(`RunPhase`)와 노드 처리
`map → battlePrep → battle → reward | map | battlePrep(보스 재도전) | ended`, `map → shop | event | camp → map`.
- 전투/정예/보스: 입장 시 유닛 상점 무료 갱신(잠금이면 1회 유지). 준비 단계에서 상점·배치·준비 카드 → `createSimulator()` → `beginBattle()` → 시뮬 실행 → `completeBattle(sim)`. 골드는 기존 `Economy`(일반/정예/보스 승리 5/8/15G, 패배·무승부 3G, 이자)로 전투 ID `노드#시도`당 한 번 정산. `completeBattle`은 `createSimulator`가 현재 노드·시도에 발급한 시뮬만 받는다 (발급 기록 없음·다른 노드/시도·이미 정산한 시뮬은 상태 변화 없이 거부).
- 보스에서 지고 살아 있으면 같은 보스 노드에서 다시 도전(전투 시드·정산 ID가 달라짐). 일반·정예 패배는 보상 없이 다음 선택으로 넘어간다.
- 승리 보상(보스 제외): 카드 3장 중 1장 선택/건너뛰기. 보스 처치 = 런 승리(`ended`, outcome `victory`), 지휘관 HP 0 = 사망(`dead`).

### 지휘관 HP와 패배 피해
- 시작·최대 HP 80 (`commanders.json maxHp`, 생략 시 `RUN.START_HP`).
- 패배 피해 = `ceil((2 + 생존 적 유닛 등급 합 + floor(층 / 3)) × 배율)`: 일반 ×1, 정예 ×1.5, 보스 ×2 (소수는 올림). 생존 적은 소환 유닛 제외, 보스는 등급 5. **무승부(시간 초과·동시 전멸)는 패배로 취급**해 같은 피해와 3G를 받는다.
- 카드로 잃은 HP(`commanderHp` 이벤트)는 승패와 무관하게 먼저 차감한다. 전투 시뮬은 시작 HP(`cards.commanderHp`)만 알고 "사용 후 HP ≥ 1"일 때만 HP 비용 카드를 허용한다. 이벤트 피해는 HP 1 밑으로 내리지 않는다.
- 심연의 계약: 0CP 명령, `commanderHpCost { amount: 3, waivedByTrait: "abyss" }` + 효과 `cpGain 2`(강화 3), 전투당 2회. 심연 특성이 활성(단계 1+)이면 HP 비용이 면제된다.

### 정예 변이 4종 (`combat/mutations.ts`, 정예 노드마다 결정적으로 1개, 50% 확률로 2개)
| 변이 | 효과 | 구현 |
|---|---|---|
| 장갑 `armored` | 적 전원 ARM +50 (전투 내내) | 공통 효과 `statAdd` |
| 분노 `rage` | 적이 HP 50% 이하가 되면 AS ×2 (유닛마다 1회) | `onDamageTaken` 트리거 + `statMod` |
| 전파 `contagion` | 적이 죽으면 반경 1칸(체비쇼프)의 살아 있는 적이 대상 최대 HP의 20% 회복 | `onDeath` 트리거 + `heal` 이벤트 |
| 방해 `disrupt` | 3초마다 플레이어 손패 무작위 1장의 비용 +1 (이번 전투, 누적) | `onTick` 트리거, `cardCost` 이벤트 (선택은 시드에서 파생한 별도 Rng) |
설치는 `mutation` 이벤트로 남는다. 방해로 오른 비용은 `sim.cardSurcharge(instanceId)`로 조회하고 카드 사용 검사에 반영된다.

### 보스: 성문 파괴자 (`units.json gate_breaker`, `boss: true`)
- HP 2600 / ATK 70 / AS 0.5 / ARM 40 / RES 20 (층 13 보정 ×1.48 적용 시 HP 3848). 호위: 투기장 신병, 잿불 점화사. 상점 풀·징집 후보에서 제외.
- 패턴 `columnStrike`: 10초마다(첫 발동 10초) 발동 2초 전에 `telegraph` 이벤트(`id`, `source`, `cells` 한 열 5칸, `fireAt`)를 내고, 발동 시 `strike` 이벤트 뒤에 그 열에 서 있는 아군 전원에게 420 물리 고정 피해(`flatDamage`, 받는 피해 배율·보호막·ARM 적용). 대상 열 = 아군이 가장 많이 선 열(동수면 보스에 가까운 쪽). 예고 중 진형 교대로 빠지거나 피해 감소 카드(전열 사수 등)로 대응할 수 있다. 보스가 죽으면 예약된 발동은 취소된다.

### 카드 보상·상점·야영지
- **보상 풀**: 공용(`neutral`)·비저주·`starter`가 아닌 카드(현재 common 7 / rare 3). 지휘관 고유 카드는 시작 덱 전용. 희귀도 가중치(일반 70/27/3, 정예·보스 40/50/10), 한 제시 안에서 중복 없음, 보스는 첫 장을 희귀 이상에서 보장. 카드 추가는 뽑을 더미에 넣고 덱 Rng로 섞는다.
- **상점 노드**: 카드 3종(일반 보상 가중치, 희귀도별 가격 common 8 / rare 15 / epic 25G), 카드 제거 75G(상점에서 제거할 때마다 +25G, 런 누적), 유닛 상점은 입장 시 무료 갱신 후 기존 Management 그대로(리롤·잠금·구매·경험치). 이벤트·야영지의 제거/강화는 이 횟수에 포함하지 않는다.
- **야영지(택1)**: 휴식 = 최대 HP의 30%(올림) 회복 / 단련 = 덱 카드 1장 강화(유닛 제공 카드·이미 강화된 카드 제외) / 승급 = 유닛 1기 +1성. 승급 비용 = 4 + (풀에서 추가로 가져오는 원본 수 × 유닛 등급): 1→2성은 원본 +2개(2성 = 3개), 2→3성은 +6개(3성 = 9개)를 유닛 풀에서 가져와 일반 합성과 같은 재고를 쓰므로 판매 시 돌려주는 개수(1/3/9)와 어긋나지 않는다. 재고나 골드가 모자라면 불가, 승급 뒤 같은 성급 3기가 되면 자동 합성한다.

### 저장 (`RunSave`)
- `{ format: "autochess-run", version: 1, seed, commanderId, deckPreset, map, position, health, forces{economy, management, managementRng, carryDeck}, removals, seenEvents, phase, session, outcome, history }`.
- 노드 단위 체크포인트: 맵 선택 단계, 노드 입장 직후, 상점/이벤트(카드 선택 대기 포함)/야영지/보상 화면 모두 저장할 수 있다. 전투 중간 저장은 없다 — `battle` 단계는 `battlePrep`으로 저장되어 복원하면 같은 준비 손패·같은 전투 시드로 전투 준비 단계에 돌아온다. 복원 후 같은 선택은 같은 결과를 낸다(골드 영수증·상점 Rng·덱 Rng 상태까지 저장).
- 복원은 모든 필드를 검증하고 `run.forces.carryDeck.draw[0].cardId` 같은 경로가 담긴 한국어 오류를 던진다 (모르는 필드·버전 불일치·단계/세션 불일치 포함). 필드 간 일관성도 검사한다: `currentNodeId`=입장 기록 마지막, 1층 시작·간선 연속·13개 이하, 단계↔현재 노드 종류(보상 종류 포함), 종료 전 HP 0 금지, 전투 `tries`=그 노드의 history 수, 상점 3칸·희귀도 가격, 이벤트 id=`seenEvents` 마지막(이벤트 노드 수만큼 기록), history 노드는 입장 기록에 포함.
- UI 저장(M4-B, `src/ui/run`): 브라우저는 `localStorage`의 `autochess-run-save` 키 하나에 `RunSave` JSON을 쓴다. 단계가 바뀔 때·전투 준비 중 로스터가 바뀔 때·전투 정산 직후마다 저장하고, 런이 끝나면(`ended`) 지운다. 새 런 시드는 core가 `seed | 0`으로 정규화하므로 UI는 32비트 정수 범위만 받는다. 저장소는 `RunStorage` 인터페이스로 주입한다(접근 실패는 알림만).

### 헤드리스 자동 런
`npm run run -- --seed 1 --n 20 [--path first|random] [--plan 파일|--no-cards] [--deck starter|test] [--verbose]` (`tools/run.ts`, 로직은 `AutoRunner`). 정책: 보드를 채우고 가장 싼 유닛 구매(인구가 차고 골드 ≥ 8이면 경험치), 카드 보상 첫 장, 이벤트는 선택 가능한 첫 선택지, 야영지는 HP 50% 미만이면 휴식 아니면 강화, 전투는 `tools/plans/harten-basic.json` 카드 계획. i번째 런의 시드는 `seed + i`.
