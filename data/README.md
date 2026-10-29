# 데이터 파일

게임 콘텐츠 정의. 코드는 이 파일을 읽어 검증한 뒤 사용한다 (ROADMAP M0-4).
파일: `cards.json` / `units.json` / `traits.json` / `commanders.json` / `relics.json` / `encounters.json` / `events.json`.

## cards.json

현재 수록: 카드 풀 **108종** = 기존 18종(M4-A에서 심연의 계약, M5-A에서 녹스 고유 카드 피의 대가 추가) + **지휘관 전용 90종**(M5-4 2부-B, 아래 "지휘관 전용 카드"). 아래 문단의 "보상·상점 풀" 설명은 기존 18종 기준이다. 희귀도: 하르텐 시작 카드 7종과 녹스 고유 카드 피의 대가는 `starter`, 보상·상점 풀은 `common`(마나 주입·전술 재정비·행군가·제련된 칼날·적진 정찰·덩굴 속박)과 `rare`(화염 폭풍·예비대 호출·심연의 계약)이며 `epic`은 아직 없다. 철벽 장군 하르텐(`cmd_harten`)의 기본 시작 덱은 기존 7종으로 구성한 10장([CHARACTERS.md](../CHARACTERS.md) 3-1)이며, "확장 카드 테스트 덱"은 M2 추가 카드 5종과 제련된 칼날·예비대 호출을 포함한 10장이다. 테스트 덱은 경제 플레이·5연전과 헤드리스 `--deck test`에서도 사용할 수 있다.
코드는 `loadCards(json, traitCatalog?)`로 읽는다. 특성 카탈로그를 주면 공명이 가리키는 특성 id도 확인한다.

### 지휘관 전용 카드 (M5-4 2부-B, 90종)
`owner`가 지휘관 id인 카드는 그 지휘관의 보상·상점·이벤트 풀과 테스트 도구에만 나온다(다른 지휘관 카드는 풀에 0장, `isRewardCardFor`). 시작 덱·고유 시작 카드는 그대로다(하르텐 방진 유지, 이세라 불씨 화살, 녹스 피의 대가는 `starter`).

| 지휘관 | id 접두사 | 장수 | 일반 / 희귀 / 에픽 | 설계안 |
|---|---|---|---|---|
| 하르텐 `cmd_harten` | `harten_` | 30 | 16 / 10 / 4 | `cardidea/harten.md` H01~H30 |
| 이세라 `cmd_isera` | `isera_` | 30 | 14 / 12 / 4 | `cardidea/isera.md` I01~I30 (I31 제외) |
| 녹스 `cmd_nox` | `nox_` | 30 | 13 / 12 / 5 | `cardidea/nox.md` N01~N31 (N22 제외) |

- id는 `접두사_영문_스네이크`(예: `harten_iron_oath`, `isera_flame_lance`, `nox_blood_contract`). 카드 번호와 id의 대응은 `cardidea/README.md` "구현 현황 (2부-B)"의 표를 본다.
- 희귀도 표기(일/희/에)는 `common`/`rare`/`epic`. 수치는 설계안 그대로이며 밸런스 조정은 이후 단계다.
- **강화(`upgrade`)는 `keywords`·`commanderHpCost`도 대체할 수 있다**(2부-B 추가): 강화하면 소모가 사라지는 한 명도 두고 가지 않는다(`keywords: []`), HP 비용이 줄어드는 고리대금·마지막 거래·피의 맹약(`commanderHpCost`). 둘 다 `upgrade`에 있을 때만 대체하고, 강화로 `chain` 키워드를 더하거나 뺄 수 없다(검증기가 거부). 코드는 `effectiveCard(card, upgraded)`의 `keywords`·`commanderHpCost`를 쓴다.
- 합산 방식 공명/연쇄: 공명·연쇄 효과는 기본 효과 **뒤에 추가**로 실행되므로 "공명: 20%"처럼 총합이 적힌 카드는 차액을 적는다(강철의 맹세 보호막 12% + 공명 8%). 곱연산인 `damageTakenMult`는 비율로 환산한다(암살 표식 공명 +50% = ×1.3 뒤에 ×1.1538).
- 테스트: `src/core/data/commanderCards.test.ts`(장수·희귀도·id·강화·풀 격리·강화 필드 검증), `src/core/combat/commanderCards.test.ts`(90장 × 기본/강화 동작, 공명·연쇄·조건부 피해).

M2 추가 카드: `firestorm`(화염 폭풍, 범위 피해·잿불 공명), `mana_infusion`(마나 주입, 충전·보존), `tactical_reorganization`(전술 재정비, 드로우·연쇄 비용 0), `ember_arrow`(불씨 화살, 단일 피해·화상·소모), `marching_song`(행군가, 전체 ARM 증가). 잿불 공명은 잿불 투석수·점화사·광전사 중 서로 다른 2종으로 일반 플레이에서도 활성화할 수 있다.

M5-A 추가 카드: `blood_price`(피의 대가, 녹스 고유 0CP 명령, `owner: cmd_nox`, `commanderHpCost { amount: 2 }`, 아군 1명 4초간 ATK +40% / 강화 5초 +60%). **M5-4 2부-A**: 불씨 화살(`ember_arrow`)은 이세라 고유 시작 카드로 전환했다(`owner: cmd_isera`, `rarity: starter`). 어느 지휘관의 보상·상점·이벤트 풀에도 나오지 않고(시작 덱 전용), 이세라 시작 덱(×3)은 그대로다. 모든 지휘관이 같은 덱을 쓰는 **테스트 덱 프리셋은 공용 카드 10장만** 쓰므로 불씨 화살 자리를 같은 1CP 주문인 덩굴 속박(`vine_snare`)이 대신한다(`tools/plans/expanded-cards.json`도 같이 바꿈). 이미 불씨 화살을 덱에 가진 이전 저장본은 아래 "콘텐츠 마이그레이션"이 바꿔 준다.

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
| `type` | `operation`(작전, 준비 단계) / `command`(명령) / `spell`(주문) / `equipment`(장비, 준비 단계·아군 1명) / `curse`(저주, 아래 "저주 카드") |
| `cost` | CP 비용 |
| `target` | 대상 지정 방식 (아래) |
| `keywords` | `exhaust`(소모) / `retain`(보존) / `chain`(연쇄) / `conscript`(징집). 공명은 `resonance` 필드로 |
| `limits` | 선택. `perCombat`: 전투당 사용 횟수 (같은 카드 id의 모든 장이 합산) |
| `commanderHpCost` | 선택. `{ amount, waivedByTrait? }` — 사용 시 지휘관 HP를 `amount` 잃는다. 전투 시뮬은 `cards.commanderHp`(런의 현재 HP)를 받아 **사용 후 HP가 1 이상일 때만** 허용하고 `commanderHp` 이벤트(`delta`, `remaining`)를 남기며, 런이 정산한다. `waivedByTrait` 특성이 아군 진영에서 활성(단계 1 이상)이면 면제(공명 형태). `cards.commanderHp`를 안 주는 디버그 전투는 제한 없음 |
| `resonance` | 선택. `{ "trait": 특성 id, "effects": [...] }` — 그 특성이 아군 진영에서 활성(단계 1 이상)이면 기본 효과 뒤에 추가 실행 |
| `chain` | `keywords`에 `chain`이 있을 때만, 그리고 반드시 있어야 함. `{ "effects": [...], "cost"?: 정수 }` — 앞서 카드를 썼으면(준비 단계 작전 포함) 추가 효과 실행. `cost`는 CP 검사·차감·UI 표시에 먼저 적용하며, 비용만 바꾸면 `effects: []` 허용 |
| `curse` | 저주(`type: curse`) 카드만. `{ playable?, onDraw?, goldLossAtEnd? }` — 아래 "저주 카드" |
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
- `cpOnKill`·`empoweredAttack`·`onAttackBurn`(작전 카드의 "이번 전투 아군 공격 시 화상")·`lifesteal`(`duration: "combat"` 가능, 장비)은 카드에서도 쓴다. `delayedStrike`는 `area: "targetArea"`일 때만, `damageZone`·`handCostCut`·`spellDamageBoost`·`ultimateGain`·`startCp`(작전 카드만)·`commanderHeal`·`reviveOnce`(장비 카드만)는 **카드 전용**이다(스킬·특성·패시브에서는 거부).
- `startCp`는 `type: operation`, `reviveOnce`는 `type: equipment` 카드에서만, selector `randomAlly`는 저주 카드에서만 쓸 수 있다(검증기가 경로 포함 한국어 오류로 거부).
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
`target`(대상: 스킬은 targeting 결과, 카드는 지정 대상) / `self`(시전자) / `allAllies` / `alliesFrontRow` / `alliesBackRow`(아군 후열 = 중앙에서 가장 먼 열, 아군 열 0) / `randomAlly`(아군 무작위 1명, sim Rng — 저주 카드 전용) / `alliesMelee` / `lineThroughTarget`(시전자에서 대상 방향으로 보드 끝까지 뻗는 직선 위의 적 전부) / `targetAndAdjacent`(첫 대상 + 그 대상과 같은 진영에서 8방향 인접한 유닛) / `enemiesInTargetArea` / `alliesInTargetArea`(카드가 지정한 칸 또는 3×3 범위 안의 적 / 아군)

- M5-4 추가 선택자: `alliesAroundSelf`(시전자 반경 `selectorRadius`칸 안의 아군, 시전자 포함) / `enemiesAroundSelf`(같은 반경 안의 적) / `allEnemies`(상대 진영 전체) / `fanArrows`·`fanTargets`(부채꼴 5발, 아래). `selectorRadius`(정수 ≥ 1, 기본 1)는 모든 효과에 붙일 수 있는 공통 필드지만 `alliesAroundSelf`·`enemiesAroundSelf`에서만 허용된다(체비쇼프 거리). 시전자가 필요한 선택자라 카드·패시브에서는 `allEnemies` 외에는 거부한다.
- **부채꼴(`fanArrows`/`fanTargets`)**: 시전자 칸에서 대상 칸 방향을 가운데로 15도 간격의 직선 5개(`fanRays`)를 보드 끝까지 긋고, 직선마다 처음 만나는 적을 맞힌다. `fanArrows`는 화살 순서대로(같은 적이 여러 번 나올 수 있음 — 화살마다 피해), `fanTargets`는 맞은 적을 한 번씩만(약화 같은 상태 효과용). 직선이 지나는 칸은 0.5칸 간격 표본을 반올림해 정한다.
- 전열 = 중앙에 가장 가까운 열 (아군 열 3, 적 열 4). **효과를 적용하는 시점의 현재 열**로 판정한다 (특성은 전투 시작 시 1회 적용).
- 근접 = 사거리 1.
- `targetAndAdjacent`는 첫 대상이 앞선 효과로 이미 죽었어도 그 칸 기준으로 인접 유닛을 고른다.

### effect.kind
| kind | 파라미터 | 의미 |
|---|---|---|
| `shield` | `pctMaxHp`, `duration` | 최대 HP 비례 보호막 (먼저 얻은 것부터 흡수) |
| `damageTakenMult` | `mult`, `duration`, `dmgType?` | 받는 피해 배율 (0.5 = −50%, 1.15 = +15%). 곱연산. `dmgType`(`physical`/`magic`)을 주면 그 종류의 피해에만 적용(칼날무희의 물리 피해 감소). `statusApplied` 이름은 같은 `damageTakenMult`, value = mult |
| `statMod` | `stat`, `pct`, `duration`, `refreshOnKill?`, `maxStacks?` | 스탯 % 증감 (`stat`: `atk`/`as`/`arm`/`res`). `refreshOnKill`이 true면 지속 중 시전자가 적을 처치할 때 지속 시간 초기화 (투지). `maxStacks`가 있으면 같은 시전자 종류(`def.id`, 특성은 `trait`)가 건 같은 스탯 효과를 대상마다 그 수까지만 쌓는다(넘치면 새로 걸리지 않음, 담금질) |
| `statAdd` | `stat`, `amount`, `duration` | 스탯 고정값 증감. 최종값 = (기본 + 고정값) × (1 + 합계 %) |
| `forceTarget` | `duration` | selector 유닛들이 `target`을 우선 공격 |
| `undying` | `duration` | HP가 1 밑으로 내려가지 않음 |
| `swapPositions` | – | selector 유닛 두 명의 위치 교환. 정확히 2명이어야 하고 이동 중인 유닛이 있으면 실패 |
| `damage` | `pctAtk`, `dmgType`(`physical`/`magic`), `ignoreArmorPct?`, `maxHpOnKill?`, `manaOnKill?` | 시전자 ATK의 `pctAtk`% 피해. `ignoreArmorPct`는 방어력 무시 %. `maxHpOnKill`은 처치 시 시전자 최대 HP(포식), `manaOnKill`은 처치 1명당 시전자 마나 회복(무명의 일섬). 치명 판정을 받는다(아래 암살자) |
| `flatDamage` | `amount`, `dmgType`, `ignoreArmorPct?`, 카드 전용: `bonusIfBurning?`, `hpBelowPct?`+`belowMult?`, `killCp?` | 시전자와 무관한 고정 피해 (카드·패시브에서 쓸 수 있음). **조건부 추가 피해(카드)**: `bonusIfBurning` = 대상이 화상 중이면 피해에 이 수치를 더한다(연소 폭발), `hpBelowPct`+`belowMult` = 대상 HP가 최대 HP의 `hpBelowPct`% 이하이면 피해 × `belowMult`(처형). 둘 다 맞으면 (`amount`+`bonusIfBurning`) × `belowMult`. 조건이 맞은 피해의 `damage` 이벤트에는 `bonus: true`가 붙는다(UI가 주황 큰 글씨 "★"). `killCp` = 이 카드 피해로 대상을 처치하면 전투 CP를 그만큼 얻는다(`cp` reason `effect`, 카드 전용). 주문 카드의 피해 보정(%)은 `amount`와 `bonusIfBurning` 모두에 곱해진다 |
| `stun` | `duration` | 기절: 이동 시작·공격·스킬 불가 (이미 시작한 1칸 이동은 끝낸다). 중첩 없이 더 늦게 끝나는 쪽으로 갱신 |
| `silence` | `duration` | 침묵: 스킬 시전 불가 (이동·기본 공격은 가능, 마나는 계속 참). 중첩 없이 더 늦게 끝나는 쪽으로 갱신 |
| `manaDrain` | `amount` | 대상 마나 감소 (0 미만 불가) |
| `manaFill` | — | 대상 유닛 마나를 최대로 충전 (다음 행동에서 일반 스킬 규칙 적용) |
| `drawCards` | `count` (양의 정수), selector는 `allAllies` | 카드 전용. 그 수만큼 드로우, 손패 상한·버린 더미 재셔플 규칙 적용 |
| `cpGain` | `amount` (양의 정수), selector는 `allAllies` | 카드 전용. 전투 CP를 한 번 얻는다 (상한 6, `cp` 이벤트 reason `effect`). 심연의 계약이 사용 |
| `root` | `duration` | 이동 시작만 금지. 이미 시작한 이동은 끝내고 공격·스킬은 허용 |
| `hpCost` / `lifesteal` | `pctMaxHp` / `pct`, `duration`(`"combat"` 가능) | 최대 HP 비율 자가 소모(HP 최소 1) / 실제 HP 피해 기준 흡혈 |
| `onAttackBurn` / `killFeast` / `marksman` | 화상 비율·지속 / 회복·ATK 비율 / 사거리·확률 | 특성 전용 트리거. `traitUnits`로 해당 기원·직업 유닛만 선택 |
| `attackMana` | `amount` | 선택한 유닛이 기본 공격하면 마나 추가. 장비에 사용 |
| `summon` / `scout` | `count`, `tier` 또는 `unitId`(+`star?`,`placement?`,`manaFull?`) / `count`, `pctMaxHp` | 카드 전용 징집 / 무작위 적 최대 HP 감소. **summon**: `tier`(그 등급의 무작위 유닛, sim Rng) 또는 `unitId`(그 유닛 — 둘 중 정확히 하나, 보스 전용 유닛 불가, Rng 미사용). `unitId`와 함께만 `star`(1~3, 기본 1), `placement`(`allyBack` 기본 = 아군 후열 / `allyFront` = 아군 전열 / `enemyBack` = 적 후열 — 후열이 차면 한 열씩 앞으로, 한 열 안에서는 가운데 행부터), `manaFull`(마나 가득으로 등장)을 쓸 수 있다. 빈 칸이 `count`보다 적으면 카드는 CP·손패 변화 없이 실패한다. 소환된 유닛은 아군 소속의 임시 유닛이다 |
| `taunt` | `radius`, `duration` | 도발: 실행 시점에 selector 유닛 반경 `radius`칸(체비쇼프) 안의 적이 `duration`초 동안 그 유닛을 우선 공격(`forceTarget`과 같은 장치, 상태 이름 `taunted`). 적마다 반경 안의 도발자 중 가장 가까운 쪽(동률은 uid 작은 쪽). 위치는 실행 시점에 한 번만 판정한다. 궁극기 불굴의 방진이 사용 |
| `heal` | `amount` | 즉시 회복 (최대 HP 초과 불가) |
| `healAura` | `perSecond`, `radius`, `duration` | 지속 중 1초마다 반경 `radius`칸 안의 **다른** 아군을 `perSecond`만큼 회복 |
| `burn` | `dpsPctAtk` 또는 `dps` (정확히 하나), `duration` | 화상: 1초마다 마법 피해. `dpsPctAtk`는 시전자 ATK 비례, `dps`는 고정값(시전자 없는 카드용). 재부여 시 지속 시간 갱신 + 초당 피해는 큰 값 (중첩 없음) |
| `teleport` | `destination` | selector 유닛을 순간이동(`teleport` 이벤트). `behindTarget`: `target` 유닛에 인접한 빈 칸 중 이동자에서 **가장 먼** 칸. `besideTarget`: 같은 후보 중 **가장 가까운** 칸(도약, 동률은 대상과 같은 행 → (열, 행) 오름차순). `enemyBackRow`: 상대 진영 후열의 빈 칸(아래 "도약 칸 규칙"). `lineEnd`: 대상 방향 직선(`rayCells`) 위의 가장 먼 빈 칸, 빈 칸이 없으면 제자리(질주 — 시전을 막지 않음). 갈 칸이 없으면(`lineEnd` 제외) 스킬을 시전하지 않음 (마나 유지, 다음 틱 재판정) |
| `extraShots` | `count` | 다음 `count`회 기본 공격이 2발씩 (마나는 공격 1회로 계산) |
| `cpOnKill` | `amount`, `maxPerCombat` (selector는 `allAllies`만) | **특성·카드.** 전투 시작 시 트리거(`onKill`)를 등록: 이 진영 유닛이 적을 처치하면 CP를 `amount`만큼 얻음. 실제로 얻은 합계가 `maxPerCombat`에 닿으면 멈춤 (CP 상한 6에 막혀 못 얻은 양은 한도를 소모하지 않음). 플레이어(side 0) 진영이고 카드 시스템이 켜진 전투에서만 동작. 특성이 등록하면 `cp` reason `abyss`, 카드가 등록하면(영혼 수확: 카드를 쓴 뒤부터 이번 전투) reason `effect`. 처치자가 없는 피해(장판·지연 타격)는 세지 않는다 |
| `flatShield` | `amount`, `duration` | (M5-4) 고정 수치 보호막. `shield`(최대 HP 비례)와 달리 수치가 그대로 보호막이 된다 |
| `cleanse` | – | (M5-4) 해로운 상태 제거: 기절·침묵·속박·화상·도발당함(강제 타겟)·받는 피해 증가(mult > 1)·스탯 감소. 제거한 상태마다 `statusRemoved`(도발당함은 `taunted`) |
| `damageAura` | `amount`, `dmgType`, `radius`, `intervalSeconds`, `count` | (M5-4, 스킬 전용) 시전자 주변 `radius`칸 적에게 `intervalSeconds`마다 고정 피해, 총 `count`회(첫 피해는 한 간격 뒤). `statusApplied` 이름 `damageAura`(지속 = 간격×횟수, value = 1회 피해). 시전자가 죽으면 멈춘다 |
| `empoweredAttack` | `pctAtk`, `dmgType`, `manaPctOnKill?` | (M5-4, 스킬·카드 — 카드는 selector `target` 등으로 지정 아군에게) 다음 기본 공격의 **첫 발**이 ATK의 `pctAtk`% 피해(연발의 둘째 발은 평소). 그 발로 대상을 처치하면 최대 마나의 `manaPctOnKill`% 회복. `statusApplied`/`statusRemoved` 이름 `empoweredAttack` |
| `reflect` | `pct`, `duration` | (M5-4) 지속 중 받은 피해(방어·배율 적용 후, 보호막 흡수 전)의 `pct`%를 공격자에게 방어 무시로 되돌린다. 반사 피해는 다시 반사되지 않는다. 이름 `reflect`, value = pct |
| `regen` | `pctMaxHp`, `duration` | (M5-4) 지속 중 1초마다 최대 HP의 `pctMaxHp`% 회복. 이름 `regen`, value = pctMaxHp |
| `delayedStrike` | `delay`, `area`(`densestEnemies3x3`/`allEnemies`), `effects`(중첩 효과, 지연 타격 중첩 금지) | (M5-4, 스킬 + 카드 `targetArea`) 스킬: selector `self`. 시전 시점에 범위를 정해 `telegraph`(`pattern: "skill"`, 예고 id는 1000부터)로 알리고 `delay`초 뒤 `strike` 이벤트 다음에 중첩 효과를 **시전자 기준**으로 실행한다. 범위는 시전 때 고정 — 그동안 적이 움직이면 빗나간다. `densestEnemies3x3`: 보드의 모든 칸을 중심 후보로 3×3 안 적 수를 세어 가장 많은 쪽(동률은 시전자에 가까운 쪽 → (열, 행) 오름차순), 중첩 효과는 `enemiesInTargetArea`를 쓴다. `allEnemies`: 적 진영 전체 20칸, 중첩 효과는 `allEnemies` 선택자를 쓴다. 시전자가 그 전에 죽으면 `strike`(`cancelled: true`)만 남고 피해는 없다. **카드용(`area: "targetArea"`, selector `allAllies`)**: 카드가 지정한 3×3(또는 한 칸) 범위를 `delay`초 뒤 친다 — `telegraph`(`source: -1`, `pattern: "card"`, `label` = 카드 이름) → `strike`(`source: -1`) → 중첩 효과(`enemiesInTargetArea`)를 카드 진영 기준으로 실행. 시전자가 없어 취소되지 않고 Rng를 쓰지 않는다. 주문 카드의 피해 보정은 중첩 효과에도 적용(사용 시점에 계산) |
| `skillCpGain` | `amount`, `maxPerCombat` | (M5-4, 스킬 전용) 스킬로 전투 CP를 얻는다(`cp` 이벤트 reason `effect`). 아군(side 0) 시전자이고 카드 시스템이 있을 때만, **시전 유닛마다** 전투당 `maxPerCombat`번(CP 상한에 막혀 못 얻은 시전은 세지 않음) |
| `stackingStatMod` | `stat`, `pct`, `intervalSeconds`, `maxStacks` | **특성 전용(M5-4).** `intervalSeconds`마다(전투 시각 틱 기준, 0초 제외) selector에 해당하는 **그 시점의 살아 있는** 유닛에게 전투 끝까지 가는 스탯 증가를 한 겹씩 쌓는다. 겹 수 상한 `maxStacks`. 쌓일 때마다 `statusApplied`(`statMod:<stat>`, value = pct, duration `combat`) |
| `startMana` | `amount` | **특성 전용(M5-4).** 전투 시작 시 selector 유닛의 마나 + amount (`mana` 이벤트). 0이면 아무 일 없음 |
| `handCostReduction` | `amount`, `maxPerCombat` | **특성 전용(M5-4).** selector 유닛이 스킬을 쓸 때마다 손패 카드의 비용을 줄인다(아래 "주술사"). `maxPerCombat` 0 = 무제한. 아군 진영·카드 시스템이 있을 때만 등록 |
| `backRowLeap` | – | **특성 전용(M5-4).** 전투 시작(`startCombat`) 때 selector 유닛이 상대 후열로 도약(아래 "도약 칸 규칙") |
| `critical` | `chance`(0~1), `damagePct` | **특성 전용(M5-4).** selector 유닛에게 치명타 확률과 치명 피해(%)를 준다(아래 "치명 판정") |
| `manaGain` | `amount` | (M5-4 2부-A) selector 유닛의 마나를 `amount`만큼 회복(최대 마나까지, `mana` 이벤트) |
| `handCostCut` | `amount`(정수 ≥ 1), selector `allAllies` | **카드 전용.** 손패에서 현재 비용이 1 이상인 카드 중 sim Rng로 무작위 1장의 이번 전투 비용을 `amount` 줄인다(최소 0). 주술사 특성과 같은 비용 조정(`sim.cardSurcharge`)·`cardCost` 이벤트(`source` 없음, `delta` 음수). 후보가 없으면 아무 일도 없고 Rng도 쓰지 않는다. 카드의 다른 효과가 먼저 뽑은 카드도 후보다(효과는 목록 순서대로) |
| `spellDamageBoost` | `pct`(≥ 1), selector `allAllies` | **카드 전용.** 이번 전투 동안 주문(`spell`) 카드의 피해(고정 피해·조건부 추가 피해·화상 초당 피해·장판·지연 타격)를 `pct`%p 더 키운다. **합산 방식**: 지휘관 패시브(`spellDamagePct`) + 유물 + 이 카드의 합을 한 번에 곱한다(이세라 25% + 열 증폭 20% = ×1.45). 효과를 낸 카드 자신과 이미 쓴 주문은 영향받지 않는다 |
| `ultimateGain` | `amount`(정수 ≥ 1), selector `allAllies` | **카드 전용.** 궁극기 게이지를 올린다(최대 100). 유물 충전 배율은 적용하지 않고 적힌 수치 그대로다. 이미 쓴 궁극기는 게이지가 올라도 다시 쓸 수 없다. 궁극기가 없는 지휘관이면 아무 일 없음. 게이지 변화는 이벤트가 아니라 `sim.ultimate`로 조회 |
| `damageZone` | `amount`, `dmgType`, `duration`, `intervalSeconds`, selector `enemiesInTargetArea` | **카드 전용(범위 지정 카드).** 지정한 칸 범위에 `duration`초 동안 `intervalSeconds`마다 고정 피해(첫 피해는 한 간격 뒤). 장판은 **칸 기준**이라 지금 그 칸에 있는 적이 맞는다(시전 때의 유닛이 아님). `zoneStart`(`id`, `cells`, `endAt`, `intervalSeconds`) → 피해 순간마다 `zonePulse`(`id`) + damage 이벤트(`source: null`). 시전자가 없어 처치자도 없다. Rng 미사용 |
| `reviveOnce` | `hpPct`(1~100) | **장비 카드 전용.** 대상 유닛이 쓰러질 상황이 되면 **전투당 1회** 쓰러지지 않고 그 자리에서 최대 HP의 `hpPct`%(최소 1)로 되살아난다(상태·위치·이동은 그대로, 사망·`onDeath` 트리거 없음). 장비는 `FormationEntry.equipment`로 전투마다 다시 적용되므로 전투 간에 유지된다. 이벤트: `statusApplied`/`statusRemoved` 이름 `reviveOnce`(value = hpPct), 쓰러질 때 `damage`(hp 0) 직후 `revive`(`inPlace: true`) |
| `startCp` | `amount`(정수 ≥ 1), selector `allAllies` | **작전 카드 전용.** 이번 전투의 시작 CP를 `amount` 늘린다(전투 시작 때 `min(6, 2 + 지휘관 + 유물 + 이 값)`). 준비 단계의 `cp` 이벤트는 없고 전투 시작의 `cp`(reason `start`)에 반영된다. 같은 카드에 `drawCards`를 함께 써도 된다(준비 단계 드로우) |
| `commanderHeal` | `amount`(정수 ≥ 1), selector `allAllies` | **카드 전용.** 지휘관 HP 회복을 예약한다 — **전투에서 이겼을 때만 확정**한다(사용 즉시가 아님, 전투 안의 사용 가능 HP는 늘지 않음). `commanderHeal` 이벤트(`amount`, `cardId`, `instanceId`)를 남기고 `sim.commanderHealPending`에 쌓이며, 런이 `completeBattle`에서 카드 비용을 차감한 뒤 승리하면 최대 HP까지 회복하고(초과분 버림) `settlement.cardHealed`로 알린다. 패배·무승부면 버려진다 |

스킬은 시전 전에 대상·사거리·순간이동 목적지를 검사하고, 하나라도 실패하면 시전하지 않는다. 카드는 사용 전에 같은 검사(`EffectExecutor.checkExecutable`)로 순간이동 목적지·위치 교환 가능 여부를 확인하고, 실패하면 카드·CP를 소모하지 않는다.

`statusApplied` 이벤트의 `value`(선택): `statMod`=pct, `statAdd`=고정값, `damageTakenMult`=mult, `burn`=초당 피해, `healAura`=초당 회복량. 수치가 없는 상태(stun, silence, undying, forceTarget, extraShots)는 `value` 키 자체가 없다.

### 이벤트·트리거 추가분 (M5-4 2부-A: 카드 확장)
- `damage.bonus`(조건부 추가 피해가 붙었을 때만 `true`), `revive.inPlace`(장비 부활), `telegraph.source: -1`·`pattern: "card"`(카드 지연 타격), 새 이벤트 `zoneStart`/`zonePulse`(장판), `curseTriggered`(저주 뽑을 때 효과 발동), `cursePenalty`(전투 종료 시 손패에 남은 저주의 골드 손실), `commanderHeal`(지휘관 HP 회복 예약). 새 효과를 쓰지 않는 전투의 로그에는 이 이벤트·필드가 전혀 생기지 않는다(기존 카드만 쓰는 전투는 HEAD와 로그가 같다).
- UI(`ReplayState`/`EffectsLayer`): `damage.bonus` 연출 필드(주황 "★"), `zones()`(깔린 장판, 다음 피해까지 `pulseProgress`)·`zonePulse` 번쩍임, `phoenix`(장비 부활 링 + "부활!"), `curse`(☠ 배너), `commanderHeal`("지휘관 HP +n (승리 시 확정)"), 카드 지연 타격은 보스 예고(`telegraphs()`)와 같은 붉은 칸 + 카드 이름 + 남은 시간.

### 저주 카드 (`type: curse`)
손패 자리를 차지하는 패널티 카드. 보상·상점·이벤트 풀(`isRewardCard`/`isRewardCardFor`)에는 나오지 않는다. 동작은 `curse` 필드로 정한다(생략하면 "사용 불가, 다른 효과 없음"). `target`은 `none`, `effects`는 비어 있어도 된다.
- **사용 불가(공포)**: `curse` 생략 또는 `playable` 없음 → `sim.playCard`가 "저주 카드는 사용할 수 없습니다"로 거부(상태·로그 불변). 손패 UI는 흐리게 + 사유 + `사용 불가` 태그.
- **뽑을 때 효과(부상)**: `curse.onDraw` = 효과 목록(selector `randomAlly` = 아군 무작위 1명, sim Rng). **전투 중에 이 카드를 뽑으면** 즉시 발동하고(`curseTriggered` 이벤트 + 효과 이벤트, 뽑기 때마다), **준비 단계에서 뽑았거나 시작 손패에 있던 카드는 전투가 시작될 때** 손패 순서대로 한 번 발동한다(`Deck.onDraw` 관찰자 → `CardPlayer.triggerCurse`). 손패 상한 때문에 바로 버려진 카드도 뽑은 것으로 친다.
- **전투 종료 골드 손실(부패한 보급)**: `curse.goldLossAtEnd` = 전투가 끝날 때(승·패·무 무관) 손패에 있으면 장당 그 골드를 잃는다. 종료 직전에 `cursePenalty` 이벤트를 손패 순서대로 남기고, 런이 `completeBattle`에서 보상 정산 뒤 **잔고 한도까지** 차감한다(`settlement.curseGoldLost`, 결과 화면에 "저주 카드 -nG").
- **써서 없애기**: `curse.playable: true`(반드시 `exhaust` 키워드가 있어야 함) → 전투 중 `cost` CP를 내고 쓰면 소모 더미로 가서 이번 런에서 사라진다(효과가 없어도 됨). 준비 단계에는 쓸 수 없다.
- 덱에서 빼는 방법은 기존 카드 제거(상점·이벤트)와 같다. 저주를 덱에 넣는 이벤트·위협 레벨은 이후 단계(2부-B·C)에서 데이터로 추가한다.

### 이벤트·트리거 추가분 (M5-4)
- `damage.crit`(치명타일 때만 `true`), `strike.cancelled`(시전자가 죽어 취소된 지연 타격), `cardCost.delta`/`source`(주술사 특성), `telegraph.pattern: "skill"`(스킬 예고, id ≥ 1000). 새 상태 이름: `damageAura`·`empoweredAttack`·`reflect`·`regen`·`taunted`(기존). 암살자 도약은 기존 `teleport` 이벤트를 쓴다. 새 트리거 `onCombatStart`(`startCombat()`에서 한 번, 핸들러가 없으면 로그에 영향 없음).
- UI(`ReplayState`): `crit` 연출 필드, `cardCost` 연출(발동 유닛 위 "카드 비용 -1"), 같은 상태가 여러 겹이면 `ActiveStatus.stacks`(숲의 맹약 AS 중첩 → 배지에 겹 수), 취소된 `strike`는 예고만 지운다.

### 피해 적용 순서
0. (치명 판정) `canCrit` 피해(기본 공격·`damage` 효과)이고 공격자의 치명 확률이 0보다 크면 sim Rng로 한 번 굴려 성공하면 raw에 치명 피해(%)를 곱하고 `damage` 이벤트에 `crit: true`를 남긴다. 확률이 0인 유닛은 Rng를 쓰지 않아 치명 특성이 없는 전투의 로그는 그대로다. 대상이 이미 죽었으면 굴리지 않는다
1. `damageTakenMult` 상태들의 곱(`dmgType`이 있는 배율은 같은 종류 피해에만) × 과열 배율을 raw 피해에 곱한다
2. 방어: × 100/(100 + ARM 또는 RES) (`ignoreArmorPct`만큼 방어력 감소)
3. 반올림, 최소 1
4. 보호막 흡수 → 남은 만큼 HP 감소
- 과열 배율 = 1 + 0.1 × (경과초 − 30), 30초 이후. 90초가 되면 무승부로 강제 종료.
- 마나: 공격 1회 +10, 피격 시 (2번까지 계산한 피해량, 보호막 흡수 전)의 1% (1회 최대 +15).
- 반사(`reflect`) 피해는 4번 이후 공격자에게 방어 무시(100%)로 한 번 더 `dealDamage`를 호출한다(`noReflect`).

---

## units.json

유닛 34기: **상점 유닛 30종**(1등급 8·2등급 8·3등급 6·4등급 5·5등급 3, CHARACTERS.md 4·5장 — M5-4에서 16종이 늘었다) + 보스 전용 4기 `gate_breaker`(성문 파괴자, 5등급)·`twin_ser`/`twin_mir`(쌍둥이 주술사 세르·미르, 4등급)·`legion_lord`(군단의 군주 바르칸, 5등급), 모두 `boss: true`. 코드는 `loadUnits(json, traitCatalog)`로 읽으며, 특성 카탈로그를 주면 `origin`/`job` 참조(존재, 종류)도 검증한다. `grantedCard`는 보드 제공 카드 ID이며 `assertUnitCardReferences`가 카드 참조를 검증한다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키, 표시 이름 |
| `tier` | 등급 1~5 |
| `origin` / `job` | 기원 / 직업 특성 id (`traits.json`) |
| `stats` | 1성 능력치 `hp`, `atk`, `as`(초당 공격), `rng`(칸), `arm`, `res`, `mana`(최대 마나). 2성 HP·ATK ×1.8, 3성 ×3.2 |
| `skill.name`, `skill.text` | 표시용 |
| `skill.targeting` | `self` / `currentTarget`(현재 공격 대상, 사거리 안이어야 시전) / `lowestHpEnemy`(현재 HP가 가장 낮은 적, 사거리 무관) / `randomEnemies`(`targetCount`명, sim Rng) / M5-4: `highestHpEnemy`(현재 HP가 가장 많은 적) / `farthestEnemy`(시전자에서 가장 먼 적, 동률은 uid 작은 쪽) / `lowestHpRatioAllies`(HP 비율이 가장 낮은 아군 `targetCount`명, 시전자 포함, 동률은 uid 작은 쪽). 사거리를 보지 않는 종류는 대상이 있으면 마나가 차자마자 시전한다 |
| `skill.effects` | 효과 목록 (순서대로 실행, 최소 1개). 수치는 `[1성, 2성, 3성]` 배열 가능 |
| `boss` | 선택. `true`면 보스 전용 — 상점 유닛 풀·징집 후보·이벤트 유닛 지급에서 제외 |
| `pattern` | 선택(보스). 종류(`kind`)마다 필드가 다르다 — `columnStrike`: `{ intervalSeconds, telegraphSeconds(< 간격), damage, dmgType }` 주기 열 강타 / `twinRevive`: `{ partner(짝 유닛 id), windowSeconds, reviveHpPct(1~100) }` 쌍둥이 부활(짝끼리 서로를 가리켜야 함) / `phaseSummon`: `{ phases: [{ hpPct(내림차순, 1~99), summon: [{ unitId, star, col(4~7), row }] }] }` HP 임계치마다 증원 + 버프 해제(증원은 비보스 유닛만). 참조(짝·증원 유닛)는 `loadUnits`가 확인한다. 동작은 아래 "런 코어"의 보스 절 |

**M5-4에서 추가된 유닛 16종** (능력치는 CHARACTERS.md 4장 표 그대로, 스킬 수치는 5장 `1성 / 2성 / 3성` 그대로. `units.test`가 4장 표를 읽어 30행을 대조한다). 문서에 정해져 있지 않아 구현에서 정한 값은 *기울임*으로 표시한다.
| id | 스킬 | 구현 |
|---|---|---|
| `bear_warrior` 곰 전사 | 곰의 포효 | `taunt` self 반경 1·2초 + `flatShield` self 200/300/500 *(전투 끝까지)* |
| `shadow_panther` 그림자표범 | 덮치기 | targeting `farthestEnemy`: `teleport besideTarget` → `damage` 180/220/280% → `stun` 1초 |
| `battle_chaplain` 전투 사제 | 축복의 기도 | `lowestHpRatioAllies`(`targetCount` 2/2/3): `heal` 200/300/500 + `cleanse` |
| `ember_smith` 잿불 대장장이 | 담금질 | `statMod atk` `alliesAroundSelf`(반경 1) +15/20/30% 전투 끝까지 `maxStacks 2` + `flatShield` self 250/400/700 *(전투 끝까지)* |
| `ember_bladedancer` 잿불 칼날무희 | 불꽃 칼춤 | `damageAura` 마법 50/75/120 반경 1, 0.4초 간격 5회 *(첫 피해는 시전 0.4초 뒤)* + `damageTakenMult` 0.5 `dmgType physical` 2초 |
| `rift_stalker` 균열 추적자 | 균열 도약 | `teleport enemyBackRow` + `empoweredAttack` 300/350/450% 물리, 처치 시 마나 50% |
| `void_sniper` 공허 저격수 | 공허탄 | `highestHpEnemy`: `damage` 350/400/500% `ignoreArmorPct 100` *(사거리 무관)* |
| `wind_hunter` 바람 사냥꾼 | 폭풍 화살 | `damage fanArrows` 70/90/120% + `statMod as` −20% 3초 `fanTargets` |
| `legion_centurion` 군단 백인대장 | 백인대 명령 | `statMod atk` `alliesAroundSelf` `selectorRadius 2` +20/25/35% 5초 *(자신 포함)* + `taunt` self *반경 2*·2초 |
| `siege_bombardier` 공성 포병 | 포격 | `delayedStrike` 2초 `densestEnemies3x3`: `damage enemiesInTargetArea` 250/300/400% 물리 |
| `magma_champion` 용암 챔피언 | 용암 강타 | `currentTarget`: `enemiesAroundSelf`에 `flatDamage` 마법 200/300/550 + `stun` 1초 + `burn` *(초당 ATK 100%, 3초 — 점화사와 같은 초안)* |
| `abyss_sentinel` 심연 감시자 | 심연의 시선 | `taunt` self 반경 2·3초 + `damageTakenMult` 0.6 3초 + `reflect` 20% 3초 |
| `void_hierophant` 공허 대사제 | 공허 개방 | `flatDamage targetAndAdjacent`(대상 중심 3×3) 마법 150/230/400 + `skillCpGain` +1 *(이 유닛 기준 전투당 2회 — 공허 대사제가 여러 기면 각각 셈)* |
| `volcano_oracle` 화산 예언자 | 대분화의 예언 | `delayedStrike` 4초 `allEnemies`: `flatDamage allEnemies` 마법 300/450/1200 + `burn` *(초당 ATK 100%, 3초)* |
| `muhon` 무혼 | 무명의 일섬 | `damage lineThroughTarget` 300/350/600% + `manaOnKill 30` → `teleport lineEnd`(직선 끝 빈 칸으로 질주) |
| `elder_treeking` 태고의 수목왕 | 태고의 숨결 | `shield allAllies` 최대 HP 20/30/60% *(전투 끝까지)* + `regen` 2%/초 5초 + `taunt` self *반경 2*·3초 |

- 문서에 없는 값: ① 스킬 보호막의 지속 시간(곰·대장장이·수목왕은 *전투 끝까지*, 피해로만 소진), ② "자신 도발"의 범위(*반경 2칸*, 곰은 문서의 "주변 1칸"), ③ 화상 초당 피해(*시전자 ATK의 100%*), ④ 부채꼴의 각도(*15도 간격 5발*)와 지연 타격의 범위가 시전 때 고정된다는 점, ⑤ `empoweredAttack`이 첫 발만 강화한다는 점. 모두 `data/units.json`의 숫자 하나로 조정할 수 있다.
- **덱 추가 카드**(공허 대사제 → 균열 개방, 화산 예언자 → 예언된 재앙)는 카드 확장(M5-4 2부)에서 `grantedCard`로 연결한다. 지금은 `grantedCard` 없이 스킬만 동작한다.
- 상점 풀: 등급별 유닛 수는 8/8/6/5/3, 원본 재고는 18/16/14/10/8(`MANAGEMENT.POOL_COPIES`), 레벨별 등급 확률은 DESIGN 3-3 표(`LEVEL_ODDS`) 그대로다. 보스 전용 유닛은 풀에서 빠진다. 데이터에 없는 등급·품절 등급은 재정규화하는 규칙도 그대로다.

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
9개 특성 모두 실제 효과가 있다(M5-4에서 `forest_pact`·`mystic`·`assassin` 추가): `iron_legion`(ARM), `ember`(기본 공격 화상), `abyss`(처치 CP), `forest_pact`(보호막·AS 중첩), `guardian`(전열 피해 감소), `gladiator`(처치 회복·ATK 누적), `marksman`(사거리·확률 연사), `mystic`(손패 비용 감소·시작 마나), `assassin`(후열 도약·치명타). 같은 종류 유닛을 여러 기 놓아도 활성화 종류 수는 1이며, 임시 소환은 시작 시 계산된 단계에 추가되지 않는다. 적(side 1) 진영도 같은 규칙으로 각자 단계를 계산해 적용한다(단, 카드·CP가 필요한 효과는 아군만).

### 숲의 맹약 · 주술사 · 암살자 (M5-4)
| 특성 | 효과 | 구현 |
|---|---|---|
| 숲의 맹약 (기원 2/4/6) | 전투 시작 시 **아군 전체** 최대 HP 10/20/35% 보호막(전투 끝까지), 3초마다 **아군 전체** AS +5/8/12% (최대 10중첩) | 효과 `shield allAllies` + `stackingStatMod`. 첫 중첩은 3.0초, 10번째는 30초. 그 시점에 살아 있는 아군에게만 쌓고(전투 중 소환·부활한 아군도 이후 중첩부터 받음) 상한에 닿으면 멈춘다. 상태 이름 `statMod:as`(value = 중첩당 pct) — UI 배지에 겹 수가 숫자로 붙는다 |
| 주술사 (직업 2/4/6) | 주술사가 **스킬을 쓸 때마다** 손패 무작위 1장의 비용 −1 (전투당 2/5/무제한회), **4기(2단계)부터** 주술사 시작 마나 +20 | 효과 `handCostReduction`(`maxPerCombat` [2, 5, 0], 0 = 무제한) + `startMana`(amount [0, 20, 20]) |
| 암살자 (직업 2/4/6) | 전투 시작 시 적 후열로 도약, 치명타 확률 15/35/50% (치명 피해 150%) | 효과 `backRowLeap` + `critical`(chance [0.15, 0.35, 0.5], damagePct 150) |

**"4단계부터 주술사 시작 마나 +20"**: 특성 단계는 최대 3이라 "4단계"를 *주술사 4종 이상(= 2단계, 임계값 4)*으로 읽었다. 1단계(2종)는 시작 마나 증가가 없다.

**주술사 비용 감소**
- 발동: 아군(side 0) 진영의 주술사 특성 유닛(특성 계산 대상 유닛)이 스킬을 쓸 때(`onSkillCast` 트리거). 카드 시스템이 없는 전투(`setup.cards` 없음)와 적 진영 주술사는 아무것도 하지 않고 Rng도 쓰지 않는다. 지휘관이 없어도 `setup.cards`가 있으면 동작한다.
- 대상: 손패 카드 중 **현재 비용(연쇄·강화·방해 변이 반영, 최소 0)이 1 이상인 카드**만 후보로 두고 sim Rng(`world.rng`)로 한 장을 고른다. 후보가 없으면 횟수를 쓰지 않는다. 즉 이미 0CP인 카드를 골라 낭비하지 않는다.
- 비용 규칙: 카드 인스턴스마다 비용 조정값(방해 변이 +1, 주술사 −1, 합산)을 두고 **실제 비용 = max(0, 기본 비용(`effectiveCard`: 연쇄·강화) + 조정값)**. `CardPlayer.currentCost`·`play()`·`sim.cardSurcharge(instanceId)`(음수 가능)가 같은 값을 쓰고, UI(`CardPanelViewBuilder`·`explainUnplayable`)도 같은 식으로 표시·사용 가능 여부를 정한다. 비용이 0이 된 카드는 CP 없이 쓸 수 있고 `cp` 이벤트가 나오지 않는다.
- 이벤트: `cardCost { instanceId, cardId, surcharge(누적 조정값), delta(−1), source(발동 유닛 uid) }`. 방해 변이의 `cardCost`에는 `delta`·`source`가 없다.

**도약 칸 규칙 (암살자 특성·균열 도약 `enemyBackRow`)**
- 시점: 암살자 특성은 **`startCombat()`**(전투 시작, 준비 단계가 끝나는 순간 — 첫 `step()` 또는 UI의 전투 시작)에 `onCombatStart` 트리거로 발동한다. 준비 단계에는 제자리에 있고, 첫 카드 명령·첫 틱 처리보다 먼저 일어난다. 이벤트는 `teleport`(t = 0).
- 순서: 특성을 켠 진영의 암살자 유닛을 uid 오름차순으로, 아군 진영(side 0) 특성이 적 진영보다 먼저 처리한다. 앞선 도약이 칸을 차지하므로 뒤의 유닛은 남은 빈 칸에서 고른다.
- 칸 선택: 상대 진영의 **가장 먼 열**(후열: 적 열 7 / 아군 열 0)에서 빈 칸 중 **자기 행과 가장 가까운 행**, 같으면 **위쪽(작은) 행**. 그 열이 가득 차면 **한 열씩 앞으로**(열 6, 5, 4 / 1, 2, 3) 같은 규칙으로 찾는다. 상대 진영 20칸이 모두 차 있으면 **제자리**에 머문다(균열 도약 스킬은 이 경우에도 갈 칸이 없으면 시전하지 않는다). 점유·이동 예약 중인 칸은 빈 칸이 아니다.
- Rng를 쓰지 않는다.

**치명 판정**
- 대상: 치명 확률이 있는 유닛(암살자 특성 단계 1 이상)의 **기본 공격(발마다)과 스킬의 ATK 비례 피해(`damage` 효과, 화살마다)**. `flatDamage`·화상·오라·반사 같은 고정 피해는 치명이 없다. 마법/물리 구분 없이 `damage` 효과면 판정한다.
- 시점: `CombatWorld.dealDamage` 안에서 **대상이 살아 있을 때** 피해 계산 직전에 sim Rng로 한 번 굴리고, 성공하면 raw 피해에 치명 피해(150%)를 곱한 뒤 방어·배율을 적용한다. 확률이 0인 유닛은 Rng를 쓰지 않는다. 치명 피해 `damage` 이벤트에는 `crit: true`가 붙는다(치명이 아니면 키 없음).
- 확률은 단계값을 유닛에 더해 1로 제한한다. 암살자가 아닌 유닛은 0이다.

전열 대상 특성(guardian)은 전투 시작 시점에 전열(아군 열 3, 적 열 4)에 있던 유닛에게 전투 내내 부여된다. 이후 위치 변화와 무관하며, 시작 시 전열 유닛이 없으면 효과 없음. (소환·부활·전투 중 위치 교환(진형 교대)이 있으므로 피해 계산 시 현재 열을 검사하는 방식으로 바꾸는 것을 검토)

## commanders.json

지휘관 정의 (DESIGN 5장, CHARACTERS 3장). 현재 철벽 장군 하르텐 `cmd_harten`, 불꽃 마도사 이세라 `cmd_isera`, 그림자 계약자 녹스 `cmd_nox` 3명(M5-A). 코드는 `loadCommanders(json, cardCatalog, unitCatalog)`로 읽으며 시작 덱의 카드 id·시작 유닛 id가 실제로 있는지, 덱 카드의 `owner`가 `neutral` 또는 해당 지휘관인지 확인한다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키(`cmd_*`), 표시 이름 |
| `passive` | `{ name, text, effects, spellDamagePct?, goldPerLeftoverCp? }`. effects는 공통 효과 형식(성급 배열 불가, 비어 있어도 됨). 시전자·지정 대상이 없는 문맥이라 `self`/`target` 계열 selector는 쓸 수 없다. `spellDamagePct`: 주문 카드의 고정 피해·화상 피해 +N%. `goldPerLeftoverCp`: 전투 승리 시 남은 전투 CP 1당 받는 골드(런 정산) |
| `startingDeck` | `[{ cardId, count }]` 시작 덱 (3명 모두 10장) |
| `startingUnits` | `[{ unitId, count }]` 시작 유닛 |
| `startCpBonus` | 전투 시작 CP 보정 (기본 2에 더함). 하르텐 0, 이세라 1, 녹스 0 |
| `maxHp` | 선택. 런 시작·최대 지휘관 HP (생략하면 80). 하르텐 80, 이세라 70, 녹스 65 (이세라·녹스는 CHARACTERS에 수치가 없어 잡은 초안) |
| `ultimate` | 선택. 궁극기 (아래) |
| `unlock` | 선택. 해금 조건 설명 문자열. **해금은 M5-5(메타 진행) 범위라 지금은 데이터로만 두고 모든 지휘관을 선택할 수 있다** (이세라 "런 1회 완료", 녹스 "액트 2 보스 처치") |

| 지휘관 | 패시브 | 시작 유닛 | 시작 덱 (10) | 궁극기 |
|---|---|---|---|---|
| 하르텐 | 철의 서약: 전투 시작 시 전열 아군 최대 HP 10% 보호막(전투 끝까지) | 방패병 ×2 | 방진 유지 ×2, 전열 사수 ×2, 전쟁 북 ×2, 진형 교대, 집중 포화, 최후의 저항, 돌격 신호 | 불굴의 방진 |
| 이세라 | 화로의 불씨: 주문 카드 피해 +25%(`spellDamagePct`), 전투 시작 CP +1(`startCpBonus`) | 잿불 점화사, 숲 궁수 | 불씨 화살 ×3, 마나 주입 ×2, 전술 재정비 ×2, 화염 폭풍, 전쟁 북, 집중 포화 | 대분화 |
| 녹스 | 미지불 잔액: 전투 승리 시 남은 CP 1당 1G(`goldPerLeftoverCp`) | 그림자 단검 ×2 | 피의 대가 ×2, 심연의 계약 ×2, 집중 포화 ×2, 돌격 신호, 예비대 호출, 전술 재정비, 최후의 저항 | 대가 지불 |

**검증**: 패시브는 `effects`가 비어 있으면 `spellDamagePct`·`goldPerLeftoverCp` 또는 지휘관 `startCpBonus`가 있어야 하고, 궁극기는 `effects`·`barrage`·`cpRegenBoostSeconds` 중 하나가 있어야 한다(궁극기는 id가 아니라 이 데이터가 곧 정의). 저장 복원은 최대 HP(지휘관 + 유물)와 다른 지휘관의 고유 카드(덱·보상·상점, 덱 프리셋 test 포함)를 거부한다. 시작 덱 프리셋에서 카드를 제거한 적이 없으면(상점 제거 0회·제거 선택지 이벤트를 본 적 없음) 시작 덱 카드 장수 미만인 덱도 거부해, 고유 카드가 없는 이세라와 다른 지휘관 사이의 교차 조작도 걸러낸다. 카드를 한 번이라도 제거했다면 이 장수 검사는 건너뛰므로, 그 경우 이세라 교차 조작은 최대 HP 일치로만 검사된다.

**하르텐 패시브 철의 서약**: `shield` `alliesFrontRow` 최대 HP 10%, `duration: "combat"`. 전투 시작 시 전열(아군 열 3)에 있던 유닛에게 한 번 걸리고 전투 끝까지 유지된다(피해를 흡수하면 줄어든다).
**이세라 주문 보정**: `type: spell` 카드의 `flatDamage` 양과 `burn` 초당 피해(`dps`)에 (1 + 보정%)를 곱해 반올림한다. 패시브 25%와 유물 잿불 부적 20%는 합산(45%)한다. **녹스 패시브**: 정산할 때 `sim.commandPoints.combat`(전투 종료 시 남은 CP) × 1G를 승리일 때만 `Economy.gain`으로 더한다 (`BattleSettlement.passiveGold`, 영수증과 별도).

### 궁극기 (`ultimate`, `combat/ultimate.ts`)
| 필드 | 값 |
|---|---|
| `name`, `text` | 표시용 |
| `hpCostPct` | 선택. 사용 시 지휘관 현재 HP(전투 시작 HP에서 이 전투에서 이미 쓴 몫을 뺀 장부의 남은 HP)의 N%를 올림해 소모. 사용 후 HP가 1 이상이어야 한다. 런이 아닌 디버그 전투(HP를 안 주는 전투)는 소모 0 |
| `effects` | 선택. 사용 즉시 아군(side 0) 기준으로 실행하는 공통 효과 (성급 배열 불가, 대상 없는 문맥) |
| `cpRegenBoostSeconds` | 선택. 이 시간(초) 동안 CP 자연 증가가 2배 (4초 → 2초마다 +1, 상한 6 유지) |
| `barrage` | 선택. 운석 연타 `{ count, intervalSeconds, radius, effects }`. 사용 시 sim Rng로 적이 가장 많이 겹치는 칸(반경 `radius` 안의 적 수) 상위 6곳 중에서 지점을 고르고(이미 고른 지점과 2칸 이상 떨어진 후보를 우선), `intervalSeconds` 간격으로 낙하. `effects`는 착탄 지점 기준(`enemiesInTargetArea`)으로 실행 |

- **게이지**: 전투마다 0에서 시작, 최대 100(`ULTIMATE.GAUGE_MAX`). 카드 사용 +15(`CARD_CHARGE`, 준비 단계 작전 카드 포함), 아군 유닛 사망 +25(`ALLY_DEATH_CHARGE`, 소환 유닛 제외). 유물 전쟁의 기록부는 충전량 ×1.5. 가득 차면 전투당 1회 사용한다(사용 후에는 충전하지 않음). 수치는 `src/core/combat/constants.ts`의 `ULTIMATE`에 모여 있는 초안이다.
- **사용**: 틱 사이에 `sim.useUltimate()` → `{ ok: true, ... } | { ok: false, reason }`. 전투 중(`startCombat` 이후)·게이지 가득·미사용·HP 충분 조건을 검사하고, 실패하면 상태·로그가 그대로다. `sim.ultimate`는 UI용 `UltimateView`(이름·설명·게이지·사용 여부·지금 쓰면 잃을 HP·사용 가능 여부와 사유).
- **명령 로그**: 성공한 사용은 `sim.commandLog`에 `{ tick, cardInstanceId: -1(ULTIMATE_COMMAND_ID), target: { kind: 'none' } }`로 카드와 같은 순서로 쌓이고, `setup.cards.commands`에 그대로 넣으면 같은 로그가 재현된다(게이지를 채운 카드 사용도 같은 로그에 있으므로 결정론이 유지된다). 예약된 궁극기가 실패하면 `rejectedCommands`에 사유가 남는다.
- **이벤트**: `ultimateUsed { commanderId, name, durationSeconds }`(지속 효과가 있으면 그 길이, 운석처럼 없으면 0), 운석마다 `ultimateTelegraph { id, cell, radius, fireAt }`(사용 시점에 예고) → `ultimateImpact { id, cell, radius }`(착탄, 피해는 이어지는 `damage`), HP 소모는 `commanderHp { cardId: "ultimate:<지휘관 id>", instanceId: -1 }`로 카드 HP 비용과 같은 장부·같은 정산 경로(`CombatSimulator.commanderHpSpent`, 런의 `cardHpLost`)를 쓴다. **게이지 변화는 이벤트로 남기지 않는다**(궁극기를 쓰지 않으면 이벤트 로그가 궁극기 도입 전과 완전히 같다). UI는 `sim.ultimate`로 읽는다.
- **카드 사용 계획**(`tools/plans/*.json`): `{ "tick": 0, "ultimate": true, "until": 300 }` 항목은 카드 대신 궁극기를 쓴다 (`until`까지 게이지가 찰 때까지 매 틱 시도).

| 궁극기 | 효과 |
|---|---|
| 불굴의 방진 (하르텐) | 4초간 아군 전체 받는 피해 ×0.6(−40%) + 전열 아군은 반경 2칸의 적을 4초간 도발(`taunt`) |
| 대분화 (이세라) | 무작위 적 밀집 지점 3곳에 1초 간격(1·2·3초 뒤)으로 운석. 각 3×3 범위에 마법 고정 피해 250 + 화상(초당 30, 3초) |
| 대가 지불 (녹스) | 지휘관 현재 HP의 10%(올림) 소모, 5초간 아군 전체 생명력 흡수 25% + CP 획득 속도 2배 |

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
- 시작 순서: 스폰 → 특성 효과 → **지휘관 패시브** → 준비 CP 지급 → 준비 단계 작전 카드 → (첫 `step()`/`startCombat()`) 전투 CP 지급 → **`onCombatStart` 트리거(암살자 후열 도약)** → 그 틱의 예약 명령 → 틱 처리.
- 진행 API: `step()`(1틱) / `runUntil(tick)` / `run()`(끝까지, 기존과 동일) / `events`(진행 중 로그) / `phase`(`prep`/`combat`/`ended`) / `startCombat()`.
- **카드 명령** `CardCommand = { tick, cardInstanceId, target: PlayTarget }`. 그 틱의 모든 유닛 행동보다 먼저 실행된다. `tick: 0`의 작전 카드는 준비 단계에 쓴 것으로 취급한다. 두 가지 방법으로 낸다.
  - 예약: `setup.cards.commands`에 목록으로. 실패한 명령은 `sim.rejectedCommands`에 모인다.
  - 직접: 틱 사이에 `sim.playCard(instanceId, target)`. 성공한 명령은 `sim.commandLog`에 쌓이며, 이 로그를 그대로 `commands`에 넣으면 같은 이벤트 로그가 재현된다.
- 사용 검증 순서와 실패 사유(한국어, `{ ok: false, reason }`): 손패에 없음 → 종류/단계(작전·장비는 준비 단계만, 명령·주문은 전투 중만, 저주 사용 불가) → `perCombat` 초과 → CP 부족 → 대상 적법성(종류 일치, 존재, 생존, 진영, `allyUnits` 수·중복, 칸이 보드 안) → 효과 전제조건(순간이동 목적지, 위치 교환 대상 2명·이동 중 아님, 징집 후열 빈 칸).
- **실패하면 CP·카드·이벤트 로그가 전혀 바뀌지 않는다** (별도 실패 이벤트 없음. 사유는 반환값으로만).
- 성공 시: CP 차감(`cp` 이벤트, 비용 0이면 생략) → 손패에서 분리 → `cardPlayed` 이벤트 → `onCardPlay` 트리거 → 효과 실행 → 버린/소모 더미로 이동. 강화 카드는 `upgrade`의 효과·비용을 쓴다.
- 공격 카드로 한쪽이 전멸하면 즉시 종료·손패 정리를 하고 이후 카드를 거부한다. 예약 명령 재생에서도 종료 이후 유닛 행동은 실행하지 않는다.
- 이벤트: `cp { pool: 'prep'|'combat', delta, cp, reason: 'start'|'regen'|'card'|'abyss' }`, `cardPlayed { cardId, instanceId, upgraded, target, cp, pool }`.

궁극기도 같은 명령 체계를 쓴다 (위 "궁극기" 절): `sim.useUltimate()`, 로그의 `cardInstanceId: -1`.

### 카드 사용 계획 (헤드리스 시뮬용)
`tools/plans/*.json`: 배열. 항목 `{ "tick": 50, "card": "focus_fire", "target": { "rule": "lowestHpEnemy" }, "until": 200 }`.
`tick`부터 `until`(생략 시 전투 끝까지)까지 매 틱 시도, 손패에 없으면 즉시 실패(`"optional": true`면 "손패에 있으면 쓴다": 없어도 실패가 아니라 끝까지 기다리다 건너뜀(`skipped`)으로 센다). `target.rule`은 `none`(기본) / `lowestHpEnemy` / `highestHpEnemy` / `lowestHpAlly` / `highestHpAlly` — 규칙이 가리키는 진영 유닛을 정렬해 카드가 필요한 수만큼 앞에서 고른다(칸 카드는 첫 유닛의 칸). 작전 카드는 `tick`과 무관하게 준비 단계에 한 번 시도한다. `npm run sim -- ... --commander cmd_harten --plan tools/plans/harten-basic.json`.

---

## relics.json

유물 (DESIGN 8-1, M5-3). 코드는 `loadRelics(json)`로 읽는다(`RelicCatalog.get/ofRarity`). 검증기(`RelicValidator`)는 경로가 담긴 한국어 오류를 낸다(중복 id, 알 수 없는 희귀도·효과·필드, 1 미만·소수 수치, 100을 넘는 할인율, `combatStart` 효과의 공통 효과 검증).

| 필드 | 값 |
|---|---|
| `id`, `name`, `text` | 영문 키, 표시 이름, 설명 |
| `rarity` | `common`(일반) / `rare`(희귀) / `boss`(보스) |
| `unlock` | 선택. 해금 조건 설명. **해금은 M5-5(메타 진행) 범위라 지금은 데이터로만 두고 모든 유물이 획득 후보다** |
| `effects` | 효과 목록(최소 1개). 아래 종류 |

**효과 종류** (수치는 모두 1 이상의 정수; 읽는 곳이 효과를 합산한다. `RelicInventory.sum`)
| 범주 | kind | 파라미터 | 읽는 곳 · 의미 |
|---|---|---|---|
| 전투 | `startCp` | `amount` | `CombatSimulator`: 전투 시작 CP +amount |
| 전투 | `combatStart` | `effects` | 전투 시작 시 아군 기준 공통 효과 한 번(지휘관 패시브와 같은 문맥·검증, 보호막 등) |
| 전투 | `allyDeathCp` | `amount`, `maxPerCombat` | 아군(소환 제외) 사망 시 CP +amount (전투당 실제 획득 합계 상한) |
| 전투 | `killMana` | `amount` | 아군이 적을 처치하면 그 유닛 마나 +amount (`onKill` 트리거) |
| 전투 | `traitTierBonus` | `minUnits` | 같은 특성 아군 유닛(같은 유닛 중복 포함)이 minUnits기 이상이면 그 특성 단계 +1 (최대 3). `TraitEngine.compute(defs, bonusMinUnits)` |
| 전투 | `ultimateCharge` | `pct` | 궁극기 게이지 충전량 +pct% |
| 전투 | `hpCostReduction` | `amount` | 지휘관 HP를 잃는 카드의 소모량 −amount (최소 0) |
| 전투 | `spellDamage` | `pct` | 주문 카드 피해 +pct% (지휘관 패시브와 합산) |
| 덱 | `handLimit` | `amount` | 손패 상한 +amount (`Deck` 옵션) |
| 덱 | `openingDraw` | `amount` | 전투 준비 때 카드 amount장 더 뽑기 (`PlayerForces.deckForBattle`) |
| 덱 | `upgradeOnAcquire` | `count` | 획득 즉시 덱의 강화 가능한 카드 count장을 무작위 강화 |
| 덱 | `rewardChoices` | `amount` | 전투 카드 보상 선택지 +amount장 |
| 경제 | `freeReroll` | `count` | 노드마다 처음 count번의 상점 리롤 무료 (`Management` perks, 노드 입장 시 초기화) |
| 경제 | `mirrorMerge` | `count` | 런당 count번 같은 유닛 1성 2기를 2성으로 합성. 2성은 원본 3개 몫이므로 모자란 1개를 유닛 풀에서 가져온다(풀에 없으면 합치지 않음). 구매·지급 직후 또는 획득 즉시 자동으로 적용 |
| 경제 | `interestMax` | `amount` | 이자 상한 +amount G (`Economy.setModifiers`) |
| 경제 | `winGold` | `amount` | 전투 승리 골드 +amount (영수증 `bonus`) |
| 경제 | `cardDiscount` | `pct` | 상점 카드·카드 제거 가격 −pct% (올림, 진열가는 기준가로 저장하고 보기·구매 때 적용) |
| 런 | `campHeal` | `pct` | 야영지 휴식 회복량 +pct%p (최대 HP 기준, 30% → 50%) |
| 런 | `winHeal` | `amount` | 전투 승리 시 지휘관 HP +amount |
| 런 | `maxHp` | `amount` | 획득 즉시 지휘관 최대 HP +amount (같은 양 회복) |

**유물 20개** (획득 경로: 정예 승리 보상 / 상점 / 이벤트 선택지 → 일반·희귀 유물, 보스 처치 → 보스 유물)
| id | 이름 | 희귀도 | 효과 | 해금 조건(데이터만) |
|---|---|---|---|---|
| `old_baton` | 낡은 지휘봉 | 일반 | 전투 시작 CP +1 | – |
| `merchants_scale` | 상인의 저울 | 일반 | 노드마다 첫 상점 리롤 무료 | – |
| `bulwark_crest` | 철벽의 인장 | 일반 | 전투 시작 시 전열 아군 최대 HP 8% 보호막 (하르텐 성향) | – |
| `ember_charm` | 잿불 부적 | 일반 | 주문 카드 피해 +20% (이세라 성향) | – |
| `blood_ledger` | 피의 장부 | 일반 | HP를 잃는 카드의 소모량 −1 (녹스 성향) | – |
| `trophy_chain` | 전리품 사슬 | 일반 | 아군이 적을 처치하면 그 유닛 마나 +15 | – |
| `loot_sack` | 전리품 자루 | 일반 | 전투 승리 골드 +2 | – |
| `field_tent` | 야전 천막 | 일반 | 야영지 휴식 회복량 +20%p | – |
| `veteran_manual` | 숙련자의 교본 | 일반 | 획득 즉시 덱 카드 2장 무작위 강화 | – |
| `blood_oath` | 피의 맹세 | 희귀 | 아군 유닛이 쓰러지면 CP +1 (전투당 최대 3) | 정예 5회 처치 |
| `fifth_banner` | 다섯 번째 깃발 | 희귀 | 같은 특성 아군 5기 이상이면 그 특성 단계 +1 | 런 1회 완료 |
| `twin_mirror` | 쌍둥이 거울 | 희귀 | 런당 1회, 같은 유닛 2기로 2성 합성 | 유닛 3성 달성 |
| `heralds_bag` | 전령의 가방 | 희귀 | 손패 상한 +1, 전투 준비 때 1장 더 뽑기 | 런 1회 완료 |
| `tacticians_journal` | 전술가의 일지 | 희귀 | 카드 보상 선택지 +1장 | 덱 20장 이상으로 런 완료 |
| `war_record` | 전쟁의 기록부 | 희귀 | 궁극기 게이지 충전량 +50% | 궁극기 10회 사용 |
| `fat_purse` | 두둑한 전대 | 희귀 | 이자 상한 +2G | 골드 50G 이상 보유한 채 보스 도달 |
| `wholesale_voucher` | 도매 증서 | 희귀 | 상점 카드·카드 제거 가격 −25% | 상점 5회 방문 |
| `rift_heart` | 균열의 심장 | 보스 | 전투 시작 CP +2 | 액트 1 보스 처치 |
| `legion_seal` | 군단장의 인장 | 보스 | 전투 시작 시 아군 전체 최대 HP 15% 보호막 | 액트 1 보스 처치 |
| `iron_heart` | 강철 심장 | 보스 | 획득 즉시 최대 HP +20(회복), 전투 승리 시 HP +2 | 액트 1 보스 처치 |

**획득 경로** (`RelicRewardGenerator`, 모든 무작위는 `deriveSeed(런 시드, 용도, 노드…)` 파생 Rng, 같은 유물 중복 획득 금지 — 후보에서 이미 가진 유물을 뺀다)
- **정예 승리**: 카드 보상과 함께 유물 1개를 제시(`RewardSession.relic`, 일반 65 / 희귀 35, 그 희귀도가 바닥나면 다른 희귀도, 둘 다 없으면 없음). `claimRelic()`으로 받으며, UI는 카드를 고르거나 건너뛸 때 남은 유물도 자동으로 받는다. 일반 전투·패배에는 없다.
- **상점**: 진열 2칸(일반 60 / 희귀 40), 가격 일반 18G / 희귀 30G(`RUN.RELIC`). 할인은 유물 도매 증서만 카드·제거에 적용되고 유물에는 적용되지 않는다. `buyShopRelic(slot)`.
- **이벤트**: `gainRelic` 효과 (위 events.json).
- **보스 처치 (M5-1)**: 마지막이 아닌 액트의 보스를 쓰러뜨리면 보스 유물 후보 최대 3개(이미 가진 유물 제외, 런 시드·액트에서 결정적)가 `bossRelic` 단계에 제시되고 `claimBossRelic(index)`로 하나를 받거나 `skipBossRelic()`으로 건너뛴다. 받은 유물은 일반 유물과 같은 `acquireRelic` 경로로 즉시 효과(강철 심장의 최대 HP)와 전투·경제 효과를 갖는다. 마지막 액트(3) 보스 처치로 런이 끝나면 받을 수는 없고 `bossRelicOffer()`로 종료 화면에 남은 후보만 보여 준다. 보스 유물이 3개뿐이라 액트 1·2에서 받으면 액트 3 종료 화면의 후보는 1개가 남는다.

**저장**: 보유 유물은 `RunSave.relics`(`{ owned, mirrorUsed, freeRerollsUsed }`)에 저장한다(런 코어 절의 저장 v2·v3).

---

## encounters.json

적 편성 데이터 (DESIGN 7-1). 직접 설계한 편성을 층 범위로 고른다. 코드는 `loadEncounters(json, unitCatalog, coverage?)`로 읽는다.

| 필드 | 값 |
|---|---|
| `id`, `name` | 영문 키, 표시 이름 |
| `kind` | `normal`(전투 노드) / `elite`(정예) / `boss` |
| `minFloor`, `maxFloor` | 이 편성이 나올 수 있는 **전체 층** (포함). 전체 층 = (액트 − 1) × 13 + 액트 안 층이라 액트 1은 1~13, 액트 2는 14~26, 액트 3은 27~39 |
| `text` | 미리보기 한 줄 설명 |
| `units` | `[{ unitId, star(1~3), col(4~7), row(0~4) }]` 적 진영 배치. 칸 중복 불가, 최소 1기 |

현재 수록 (M5-1): 액트 1 = 일반 10개(전체 1~11층을 겹쳐서 덮음)·정예 4개(4~11층)·보스 `boss_gate_breaker`(13층: 성문 파괴자 + 호위 2기). **액트 2 잿불 고원**(전체 14~26층) = 일반 8개(잿불·주술사 계열 중심, 2성 위주)·정예 3개(`elite_ember_pyre`·`elite_ash_wardens`·`elite_cinder_blades`, 17~24층)·보스 `boss_twin_sorcerers`(26층: 세르·미르 + 잿불 광전사 2기 + 방패병). **액트 3 몰락한 수도**(전체 27~39층) = 일반 8개(강철군단·심연 계열, 2~3성)·정예 3개(`elite_legion_wall`·`elite_abyss_court`·`elite_oathbreakers`, 30~37층)·보스 `boss_legion_lord`(39층: 바르칸 + 방패병 2기 + 석궁병 2기). **M5-4 재구성**: 액트 2·3의 일반 8·정예 3 편성(id·이름·층 범위는 그대로)에 신규 유닛을 넣었다. 액트 2는 잿불·주술사 중심(잿불 대장장이·칼날무희·용암 챔피언·전투 사제·공허 대사제·화산 예언자, 숲 편성 `highland_hunters` 하나는 변화를 주려고 숲 계열), 액트 3은 강철군단·심연 중심(백인대장·공성 포병·감시자·공허 대사제·균열 추적자·공허 저격수·무혼). 각 편성의 전력 지표(성급 배율 × √(ATK·AS·HP·(1+(ARM+RES)/200)) 합)는 이전 편성의 ±15% 안이다(정밀 밸런스가 아님; `encountersM54.test.ts`가 극단값을 막는다). 액트 1 편성과 보스 편성(보스 유닛·호위)은 바뀌지 않았다. 새 특성이 적에게도 켜지므로 같은 편성이 이전보다 강하거나 약하게 느껴질 수 있다(예: `rift_stalkers`의 암살자 3종은 시작 때 아군 후열로 도약한다). `loadRunDeps`는 **액트마다** 일반 1~11층, 정예 4~11층, 보스 13층(전체 층으로는 위 범위)에 후보가 있는지 검사한다 (없으면 "전체 26층(액트 2 13층)에 쓸 boss 편성이 없음"처럼 전체 층과 액트 안 층을 함께 알리는 오류, `EncounterCoverage.floorsPerAct`). 같은 노드는 (런 시드, 노드 id)로 편성을 고르므로 미리보기와 실제 전투가 항상 같다.

**층 보정**: 모든 적 유닛의 HP·ATK × `1 + 0.04 × (전체 층 − 1)` (`RUN.FLOOR_SCALE_PER_FLOOR`). 액트 1은 전체 층 = 층이라 기존과 같고, 액트 2 1층은 ×1.52, 액트 2 보스(26층) ×2.00, 액트 3 1층 ×2.04, 액트 3 보스(39층) ×2.52. 시뮬에는 `CombatSetup.enemy = { hpMult, atkMult, mutations }`로 넣는다 (편성 유닛에만 적용, 소환 유닛 제외, 생략하면 보정 없음).

## events.json

런 이벤트 (DESIGN 6장, 액트 1 회색 관문). 코드는 `loadEvents(json, cardCatalog, unitCatalog)`로 읽는다.

| 필드 | 값 |
|---|---|
| `id`, `title`, `text` | 영문 키, 제목, 상황 설명 |
| `choices` | 선택지 2~4개: `{ text, result, effects }`. `result`는 선택 뒤 보여줄 문장, `effects`는 순서대로 실행(비어 있으면 아무 일 없음) |

**선택지 효과 최소 집합** (모르는 필드는 거부)
| kind | 파라미터 | 의미 |
|---|---|---|
| `gold` | `amount`(0 아닌 정수) | 골드 증감. 음수면 지불 — 골드가 모자라면 그 선택지는 선택 불가 |
| `commanderHp` | `amount` | 지휘관 HP 증감. 회복은 최대치까지. 피해는 이벤트로는 사망하지 않으며, 피해 후 HP가 1 미만이 되는 선택지는 선택 불가 |
| `gainCard` | `mode: "random"` + `rarity` / `mode: "choose"` + `rarity` + `count`(≥2) / `mode: "fixed"` + `cardId` | 카드 획득: 희귀도(`common`/`rare`/`epic`, 보상 풀 기준)에서 무작위 1장 / 후보 count장 중 1장 선택 / 지정 카드 |
| `removeCard` | `mode: "random"\|"choose"` | 덱 카드 제거(유닛 제공 카드 제외). 제거할 카드가 없으면 선택 불가 |
| `upgradeCard` | `mode: "random"\|"choose"` | 덱 카드 강화(이미 강화·강화 버전 없음·유닛 제공 카드 제외). 가능한 카드가 없으면 선택 불가 |
| `gainUnit` | `tier` | 무작위 `tier`등급 1성 유닛 1기를 벤치로 받는다(유닛 풀에서 원본 1개). 벤치가 가득 차면 선택 불가 |
| `gainRelic` | `rarity`(`common`/`rare`) | 유물 획득: 아직 없는 해당 희귀도(보스 제외) 유물 중 (런 시드·노드·효과 순번에서 파생한 Rng로) 무작위 1개. 남은 유물이 없으면 선택 불가. 결과 문장 뒤에 `유물 획득: <이름>`이 덧붙는다 |

`choose` 모드는 선택 직후 `pending`(후보 목록)이 생기고 `pickEventOption(index)`로 고르면 남은 효과가 이어서 실행된다. 이벤트는 노드마다 결정적으로 고르며 이미 본 이벤트를 먼저 피한다. 현재 5개: 버려진 군수 창고 / 부상당한 정찰병 / 관문 대장장이 / 균열 제단 / 탈영병 야영지. M5-A에서 관문 대장장이("낡은 휘장": 지휘관 HP −6, 일반 유물)와 균열 제단("빛나는 파편": 지휘관 HP −12, 희귀 유물)에 **4번째 선택지**를 덧붙였다(기존 선택지는 그대로라 "선택 가능한 첫 선택지" 정책의 결과가 바뀌지 않는다).

---

## 런 코어 (M4-A, M5-1 3액트)

`src/core/run`. 수치는 `RUN`(`run/constants.ts`)에 모여 있다. UI(M4-B)는 `RunController`만 보고 만든다.

### 지휘관·유물 연동 (M5-A)
- `RunController.create(deps, { seed, commanderId?, deckPreset? })`: `commanderId`를 생략하면 하르텐(`RUN.DEFAULT_COMMANDER_ID`). 시작 덱·시작 유닛·지휘관 최대 HP는 지휘관 데이터에서, 패시브·궁극기는 `createSimulator`가 `CombatSetup.cards.commander`로, 보유 유물 효과는 `CombatSetup.cards.relics`로 전투에 넘긴다. `RunDeps`에 `relics: RelicCatalog`가 늘었다(`loadRunDeps`의 `RawRunData.relics`).
- 정산(`completeBattle`) 순서: 골드(유물 승리 골드·이자 상한 반영) → 카드·궁극기로 잃은 HP → 패배 피해 → (승리) 지휘관 패시브 골드(녹스) → 유물 승리 회복 → 덱·장비 이어받기 → 다음 단계. 정예 승리는 보상 단계에 유물을 함께 제시한다.
- 유물의 즉시 효과(최대 HP, 카드 강화, 쌍둥이 거울 합성, 경제 보정)는 `RunController`가 획득 때 적용하고, 나머지는 읽는 쪽(`CombatSimulator`·`PlayerForces`·`Economy`·`Management`)이 보유 유물에서 합산한다.

### 액트 구조 (M5-1)
- **3액트**(`RUN.ACTS.COUNT`): 액트마다 13층 맵을 따로 만든다. 액트 1 = 회색 관문(성문 파괴자), 액트 2 = 잿불 고원(쌍둥이 주술사 세르·미르), 액트 3 = 몰락한 수도 아스트라(군단의 군주 바르칸). 이름·지역은 `RUN.ACTS.INFO`(CHARACTERS 1장). `RunOptions.acts`(1~3, 기본 3)로 줄일 수 있고 1이면 액트 1 보스 처치가 곧 승리다(헤드리스 회귀 비교용 `--acts 1`).
- **시드 파생**: 액트 1은 기존과 **비트 단위로 같다**(`deriveSeed(seed,'map')`, 노드 id `층-인덱스`, 노드 파생 시드 그대로). 액트 2부터는 맵 시드에 액트 번호를 더하고(`deriveSeed(seed,'map',act)`), 노드 id에 `a{액트}-` 접두사가 붙어(`a2-3-1`) 전투·편성·보상·상점·이벤트 파생이 자동으로 액트마다 달라진다. 보스 유물 후보 Rng는 액트 1 `deriveSeed(seed,'bossrelic')`, 액트 2부터 `(…,'bossrelic',act)`.
- **전체 층**: `globalFloor(act, floor) = (act − 1) × 13 + floor`. **층 보정** `1 + 0.04 × (전체 층 − 1)`, **패배 피해의 층 항** `floor(전체 층 / 3)`, **적 편성 층 범위**(`encounters.json minFloor/maxFloor`)가 모두 전체 층을 쓴다. `MapNode.floor`와 history의 `floor`는 액트 안 층(1~13, 맵 표시용)이다. `EncounterPlan`에 `act`·`globalFloor`·`bossPatterns`가 있다.
- **액트 사이 처리 (초안, 설계 문서에 규정 없음)**: 액트 보스 처치 → (마지막 액트가 아니면) **보스 유물 선택**(`bossRelic` 단계) → 새 액트 맵을 만들고 지휘관 HP를 **최대 HP의 50%(올림)** 회복(`RUN.ACTS.TRANSITION_HEAL_PCT`, 최대치까지) → **액트 소개**(`actIntro` 단계: 지역·보스 패턴·회복 결과) → `continueAct()` → 새 액트의 맵 단계. 골드·로스터(벤치·레벨 포함)·덱·장비·유물·`removals`·`seenEvents`는 그대로 이어진다. 보스 승리에는 카드 보상이 없다(보스 유물이 보상).
- **보스 유물 선택**: 보스 유물(`rarity: boss`, 현재 3개) 중 아직 없는 것에서 최대 3개를 제시(`RUN.RELIC.BOSS_CHOICES`, 런 시드에서 결정적)하고 `claimBossRelic(index)`로 하나를 받거나 `skipBossRelic()`으로 건너뛸 수 있다(받는 유물의 즉시 효과는 `acquireRelic` 그대로). 후보가 하나도 없으면(보스 유물을 모두 가졌다면) 선택 없이 바로 액트 소개로 넘어간다. 마지막 액트의 보스를 쓰러뜨리면 런이 끝나므로 종료 화면에 남은 후보를 보여 주기만 한다(`bossRelicOffer()`).
- **단계**: `map → battlePrep → battle → reward | map | battlePrep(보스 재도전) | bossRelic → actIntro → map | ended`. `bossRelic`/`actIntro`의 현재 노드는 방금 쓰러뜨린 보스다. 보스 패배 시 재도전·패배 피해(보스 ×2)는 액트와 무관하게 같은 규칙이다.

### 맵 (`MapGenerator`, `RunMap`)
- 13층. 층 1~12는 노드 2~4개, 13층은 보스 1개. 인접한 두 층은 교차하지 않는 간선으로 잇고 노드마다 다음 층 노드 1~2개와 연결한다. 모든 노드는 시작에서 도달 가능하고 보스까지 경로가 있다.
- 고정: 1층 전투만, 12층 야영지 전부, 13층 보스. 정예는 4층 이상. 간선으로 이어진 두 노드가 모두 상점/야영지인 경우(상점·야영지 연속) 금지.
- 종류 비율은 보스 제외 전체 노드의 목표 비율(전투 45 / 정예 10 / 상점 12 / 이벤트 20 / 야영지 13)에 맞춘 "개수 할당"이라 시드마다 거의 같다 (300시드 측정: 전투 45.9 / 정예 10.0 / 상점 10.7 / 이벤트 20.3 / 야영지 13.1, 맵당 평균 37노드). 규칙 때문에 할당이 막히면 규칙을 지키는 다른 종류로 대체한다(주로 상점이 목표보다 약간 적음).
- 같은 (시드, 액트)는 같은 맵 (맵 전용 Rng). 노드 id는 액트 1 `층-인덱스`(예: `3-1`), 액트 2부터 `a{액트}-층-인덱스`(예: `a2-3-1`), `x`(0~1)는 표시용 가로 위치. 액트마다 같은 구조 규칙(13층, 1층 전투, 12층 야영지, 13층 보스)을 쓴다.

### 단계(`RunPhase`)와 노드 처리
`map → battlePrep → battle → reward | map | battlePrep(보스 재도전) | ended`, `map → shop | event | camp → map`.
- 전투/정예/보스: 입장 시 유닛 상점 무료 갱신(잠금이면 1회 유지). 준비 단계에서 상점·배치·준비 카드 → `createSimulator()` → `beginBattle()` → 시뮬 실행 → `completeBattle(sim)`. 골드는 기존 `Economy`(일반/정예/보스 승리 5/8/15G, 패배·무승부 3G, 이자)로 전투 ID `노드#시도`당 한 번 정산. `completeBattle`은 `createSimulator`가 현재 노드·시도에 발급한 시뮬만 받는다 (발급 기록 없음·다른 노드/시도·이미 정산한 시뮬은 상태 변화 없이 거부).
- 보스에서 지고 살아 있으면 같은 보스 노드에서 다시 도전(전투 시드·정산 ID가 달라짐). 일반·정예 패배는 보상 없이 다음 선택으로 넘어간다.
- 승리 보상(보스 제외): 카드 3장 중 1장 선택/건너뛰기. 마지막 액트의 보스 처치 = 런 승리(`ended`, outcome `victory`), 그 외 액트 보스 처치 = 위 "액트 구조", 지휘관 HP 0 = 사망(`dead`).

### 지휘관 HP와 패배 피해
- 시작·최대 HP 80 (`commanders.json maxHp`, 생략 시 `RUN.START_HP`).
- 패배 피해 = `ceil((2 + 생존 적 유닛 등급 합 + floor(전체 층 / 3)) × 배율)`: 일반 ×1, 정예 ×1.5, 보스 ×2 (소수는 올림). 생존 적은 소환 유닛 제외, 보스는 등급 5. **무승부(시간 초과·동시 전멸)는 패배로 취급**해 같은 피해와 3G를 받는다.
- 카드로 잃은 HP(`commanderHp` 이벤트)는 승패와 무관하게 먼저 차감한다. 전투 시뮬은 시작 HP(`cards.commanderHp`)만 알고 "사용 후 HP ≥ 1"일 때만 HP 비용 카드를 허용한다. 이벤트 피해는 HP 1 밑으로 내리지 않는다.
- 심연의 계약: 0CP 명령, `commanderHpCost { amount: 3, waivedByTrait: "abyss" }` + 효과 `cpGain 2`(강화 3), 전투당 2회. 심연 특성이 활성(단계 1+)이면 HP 비용이 면제된다.

### 정예 변이 4종 (`combat/mutations.ts`, 정예 노드마다 결정적으로 1개, 50% 확률로 2개)
| 변이 | 효과 | 구현 |
|---|---|---|
| 장갑 `armored` | 적 전원 ARM +50 (전투 내내) | 공통 효과 `statAdd` |
| 분노 `rage` | 적이 HP 50% 이하가 되면 AS ×2 (유닛마다 1회) | `onDamageTaken` 트리거 + `statMod` |
| 전파 `contagion` | 적이 죽으면 반경 1칸(체비쇼프)의 살아 있는 적이 대상 최대 HP의 20% 회복 | `onDeath` 트리거 + `heal` 이벤트 |
| 방해 `disrupt` | 3초마다 플레이어 손패 무작위 1장의 비용 +1 (이번 전투, 누적) | `onTick` 트리거, `cardCost` 이벤트 (선택은 시드에서 파생한 별도 Rng) |
설치는 `mutation` 이벤트로 남는다. 방해로 오른 비용(그리고 주술사 특성으로 내린 비용)은 `sim.cardSurcharge(instanceId)`(비용 조정값, 음수 가능)로 조회하고 카드 사용 검사·손패 표시에 반영된다. 실제 비용 = `max(0, 기본 비용 + 조정값)`.

### 보스: 성문 파괴자 (`units.json gate_breaker`, `boss: true`)
- HP 2600 / ATK 70 / AS 0.5 / ARM 40 / RES 20 (층 13 보정 ×1.48 적용 시 HP 3848). 호위: 투기장 신병, 잿불 점화사. 상점 풀·징집 후보에서 제외.
- 패턴 `columnStrike`: 10초마다(첫 발동 10초) 발동 2초 전에 `telegraph` 이벤트(`id`, `source`, `cells` 한 열 5칸, `fireAt`)를 내고, 발동 시 `strike` 이벤트 뒤에 그 열에 서 있는 아군 전원에게 420 물리 고정 피해(`flatDamage`, 받는 피해 배율·보호막·ARM 적용). 대상 열 = 아군이 가장 많이 선 열(동수면 보스에 가까운 쪽). 예고 중 진형 교대로 빠지거나 피해 감소 카드(전열 사수 등)로 대응할 수 있다. 보스가 죽으면 예약된 발동은 취소된다.

### 보스: 쌍둥이 주술사 세르·미르 (`twin_ser`·`twin_mir`, 액트 2, `pattern.kind: twinRevive`, `combat/twinRevive.ts`)
- 보스 전용 4등급 2기: 세르(HP 1200 / ATK 60 / 사거리 3 / 잿불·주술사, 스킬 불꽃 낙인 = 대상과 인접 적에게 마법 300 + 화상 3초), 미르(HP 1200 / ATK 50 / 사거리 3, 스킬 재의 장막 = 적 전체 최대 HP 8% 보호막 6초). 편성 `boss_twin_sorcerers`(26층, 층 보정 ×2.00이면 각 HP 2400): 두 쌍둥이 + 잿불 광전사 2기(2성) + 방패병(2성). 상점 풀·징집 후보·이벤트 유닛에서 제외.
- 규칙 (수치는 초안, `units.json pattern`): 한쪽이 죽으면 **그 틱부터 3초(30틱) 뒤**에 짝이 아직 살아 있을 때 **최대 HP의 50%**로 원래 칸(차 있으면 가까운 빈 칸)에 부활한다. 부활 틱의 시작(`onTick`)에 판정하므로 그 틱에 쓰는 카드는 부활보다 먼저 처리된다. 짝도 제한 시간 안에 죽으면 부활은 취소되고 둘 다 처치된 것이다 (같은 틱 동시 처치 포함). 부활한 유닛은 모든 상태가 초기화되고 마나 0이며, 다시 죽으면 같은 규칙이 되풀이된다. 짝이 편성에 없으면 평범한 유닛이다. 전멸 판정은 시뮬의 기본 규칙(살아 있는 유닛 수)이다.
- 이벤트: `reviveTelegraph`(`unit`=죽은 쪽, `partner`, `fireAt`=부활 시각) → `revive`(`unit`, `hp`, `maxHp`, `cell`) 또는 `reviveCancel`(`unit`). 대응: 집중 포화로 한쪽에 화력을 모아 쓰러뜨린 뒤 짝도 이어서, 또는 범위 주문(3×3)으로 함께 처치.

### 보스: 군단의 군주 바르칸 (`legion_lord`, 액트 3, `pattern.kind: phaseSummon`, `combat/phaseSummon.ts`)
- 보스 전용 5등급 1기: HP 3000 / ATK 85 / AS 0.55 / ARM 45 / RES 30 / 심연·검투사, 스킬 군주의 칼날 = ATK 300% 물리(ARM 30% 무시). 편성 `boss_legion_lord`(39층, ×2.52이면 HP 7560): 바르칸 + 방패병 2기 + 석궁병 2기(모두 2성).
- 규칙 (수치는 초안): **3페이즈**. HP가 최대 HP의 **66%** 이하가 되면 2페이즈, **33%** 이하가 되면 3페이즈. 피해를 받은 즉시가 아니라 **다음 틱 시작**에 전환한다(한 번에 두 임계치를 넘으면 같은 틱에 순서대로 처리, 보스가 죽었으면 전환 없음). 전환 때: ① `bossPhase` 이벤트(`phase`, `hpPct`, `summoned`=증원 uid, `dispelled`=해제된 아군 수) ② **증원 소환**(데이터 `phases[].summon`: 2페이즈 석궁병 2성 ×2, 3페이즈 심연 포식자 2성 ×2 + 전쟁 군악대 1성; 적 층 보정 배율 적용, `temporary`라 패배 피해 집계에서 제외, 지정 칸이 차 있으면 가까운 빈 칸) ③ **상대(플레이어) 진영 버프 해제**(`dispel` 이벤트, `StatusSet.dispelBuffs`).
- **버프 해제 대상**: 보호막 전부, 카드·스킬이 건 **시간제**(만료 시각이 유한한) 이로운 상태 — 스탯 증가(pct/flat > 0), 받는 피해 감소(mult < 1), 흡혈, 불사, 회복 오라, 연발 충전. **해제하지 않는 것**: 기절·침묵·속박·화상·도발 같은 불리한 상태, 스탯 감소, 받는 피해 증가, 전투 내내 지속되는(만료 시각 Infinity) 특성·장비·유물·패시브 효과(그래서 군단장의 인장 같은 전투 시작 보호막은 보호막이라 지워지지만 특성 ARM·장비는 남는다). 대응: 연쇄·징집(증원에 맞서는 병력)·궁극기(페이즈 전환 뒤 판세 역전).
- **궁극기 지속 효과와의 관계**: 하르텐 불굴의 방진의 받는 피해 -40%(시간제 `damageTakenMult`)와 녹스 대가 지불의 생명력 흡수(시간제 `lifesteal`)는 해제된다. 방진의 도발(`taunt`)은 적 유닛에 거는 상태(`taunted`)라 아군 버프 해제의 대상이 아니고, 대가 지불의 CP 획득 가속은 유닛 상태가 아니라 전투 CP(`combatCp`)의 타이머라 해제되지 않는다. 이세라 대분화는 지속 버프가 없다.
- 미리보기: `EncounterPlan.bossPatterns`(`describeBossPattern`)가 패턴별 이름·설명 줄을 데이터에서 만들어 맵 미리보기·전투 준비·액트 소개에 보여 준다(쌍둥이는 한 쌍에 하나).

### 카드 보상·상점·야영지
- **보상 풀 (M5-4 2부-A: 지휘관별)**: "공용(`neutral`) 보상 카드 + 현재 지휘관의 고유(`owner` = 지휘관 id) 카드" 중 `common`/`rare`/`epic`만(저주·`starter` 제외, `isRewardCardFor`). 카드 보상·상점 카드 진열(`generateCardStock`)·이벤트 카드 지급(`pickRandom`/`pickDistinct`)·테스트 도구 카드 목록이 같은 규칙이다(테스트 도구는 시작·저주 카드도 넣어 볼 수 있도록 "공용 + 자기 고유 카드 전부"를 보여 준다). 다른 지휘관의 고유 카드는 나오지 않는다. 현재 데이터의 고유 카드는 모두 `starter`라 풀은 공용 common 6 / rare 3(불씨 화살이 빠짐)이고, 고유 보상 카드는 2부-B에서 데이터로 들어온다. 희귀도 가중치(일반 70/27/3, 정예·보스 40/50/10), 한 제시 안에서 중복 없음, 보스는 첫 장을 희귀 이상에서 보장. 카드 추가는 뽑을 더미에 넣고 덱 Rng로 섞는다.
- **카드 보상 장수**: 기본 3장(`RUN.REWARD.CHOICES`) + 유물 전술가의 일지 등 `rewardChoices`. 정예 승리는 카드 보상과 함께 유물 1개도 제시한다(위 relics.json 획득 경로).
- **상점 노드**: 카드 3종(일반 보상 가중치, 희귀도별 가격 common 8 / rare 15 / epic 25G), 카드 제거 75G(상점에서 제거할 때마다 +25G, 런 누적), **유물 2종 진열**(가격 일반 18G / 희귀 30G, 위 relics.json). 유닛 상점은 입장 시 무료 갱신 후 기존 Management 그대로(리롤·잠금·구매·경험치). 유물 도매 증서가 있으면 카드·제거 가격이 −25%(올림)로 보인다. 이벤트·야영지의 제거/강화는 이 횟수에 포함하지 않는다.
- **야영지(택1)**: 휴식 = 최대 HP의 30%(올림, 유물 야전 천막 +20%p) 회복 / 단련 = 덱 카드 1장 강화(유닛 제공 카드·이미 강화된 카드 제외) / 승급 = 유닛 1기 +1성. 승급 비용 = 4 + (풀에서 추가로 가져오는 원본 수 × 유닛 등급): 1→2성은 원본 +2개(2성 = 3개), 2→3성은 +6개(3성 = 9개)를 유닛 풀에서 가져와 일반 합성과 같은 재고를 쓰므로 판매 시 돌려주는 개수(1/3/9)와 어긋나지 않는다. 재고나 골드가 모자라면 불가, 승급 뒤 같은 성급 3기가 되면 자동 합성한다.

### 저장 (`RunSave`)
- `{ format: "autochess-run", version: 3, seed, commanderId, deckPreset, totalActs, maps, position, health, forces{economy, management, managementRng, carryDeck}, relics{owned, mirrorUsed, freeRerollsUsed}, removals, seenEvents, phase, session, outcome, history, test?, contentVersion? }` (`contentVersion`은 아래 "콘텐츠 마이그레이션", `test`는 플레이 테스트 런에만 있는 선택 필드, 아래 "플레이 테스트 런"). **v3(M5-1)**: 단일 `map` 대신 액트 1부터 지금 액트까지의 맵 배열 `maps`와 전체 액트 수 `totalActs`를 저장한다 (지난 액트의 맵도 기록 검증용으로 남는다). `position.visited`·`history`는 모든 액트를 이어서 담고(노드 id가 액트마다 달라 겹치지 않음), 단계 `bossRelic`(세션 `{ kind: 'bossRelic', offer }`)·`actIntro`(세션 `{ kind: 'actIntro', hpBefore, healed }`)가 늘었다. **v2(M5-A)**: 지휘관 id(`commanderId`, 이미 v1에도 있었음)와 유물 상태 `relics`가 저장 형식의 일부가 되었다. 세션은 보상 `relic`(정예 보상 유물 id 또는 null)·상점 `relics`(유물 진열 `{ relicId, price, sold }`)가 늘었고, 경제 영수증에는 선택 필드 `bonus`가 생겼다.
- **v1·v2 마이그레이션**: 버전 1~3을 읽는다. v1·v2(1액트 시절) 저장본은 단일 `map`을 액트 1의 맵으로 읽고 `totalActs`는 3으로 둔다(이어 하면 액트 1 보스 처치 뒤 액트 2로 넘어간다). 이미 승리로 끝난 v1·v2 저장본만 `totalActs` 1로 읽어 승리가 유효하다. v1·v2에 v3 필드가 섞여 있거나 v3에 `map`이 있으면 거부한다. 다시 저장하면 v3가 된다.
- **M5-4 유닛 풀 호환**: 유닛 14종 → 30종 전에 만든 v3 저장본(`forces.management.pool`)에는 신규 16종 재고가 없다. 복원할 때 `MANAGEMENT.POOL_ADDED_IN_M54`에 있는 유닛의 재고가 빠져 있으면 등급별 기본 재고(18/16/14/10/8)로 채운다(그 저장본은 신규 유닛을 소유·진열한 적이 없다). 이 목록 밖 유닛의 재고가 빠졌거나 모르는 유닛이 있으면 여전히 손상된 저장으로 거부한다. 저장 `version`은 3 그대로다(읽기 호환만 추가, `runSaveV3M53.fixture.json`이 4b33a11에서 만든 일반·테스트 런 저장본으로 검증한다). 저장된 전투 준비·노드는 같은 편성 id의 새 구성 유닛으로 치러진다.
- **v1 마이그레이션(유물)**: v1 저장본은 `relics`가 없으면(있으면 오류) 유물 없음·무료 리롤·거울 사용량 0으로, 보상 `relic`·상점 `relics`가 없으면 null·빈 목록으로 읽고 지휘관은 저장된 `commanderId`(v1 시절엔 항상 하르텐)를 그대로 쓴다. 다시 저장하면 v3가 된다(`runSaveV1.fixture.json`이 M4 시절 실제 저장본으로 이를 검증한다). v4 이상은 거부한다.
- 노드 단위 체크포인트: 맵 선택 단계, 노드 입장 직후, 상점/이벤트(카드 선택 대기 포함)/야영지/보상 화면 모두 저장할 수 있다. 전투 중간 저장은 없다 — `battle` 단계는 `battlePrep`으로 저장되어 복원하면 같은 준비 손패·같은 전투 시드로 전투 준비 단계에 돌아온다. 복원 후 같은 선택은 같은 결과를 낸다(골드 영수증·상점 Rng·덱 Rng 상태까지 저장).
- 복원은 모든 필드를 검증하고 `run.forces.carryDeck.draw[0].cardId` 같은 경로가 담긴 한국어 오류를 던진다 (모르는 필드·버전 불일치·단계/세션 불일치 포함). 필드 간 일관성도 검사한다: `currentNodeId`=입장 기록 마지막, 액트 1의 1층 시작·같은 액트 안에서는 간선 연속·액트가 바뀔 때는 이전 액트 보스 다음 액트 1층(13 × 액트 개 이하), 맵 수 ≤ `totalActs`·액트마다 맞는 노드 id 접두사, 다음 액트 맵이 있으면 지난 액트 보스를 방문했고 마지막 기록이 승리, 승리는 마지막 액트의 보스 노드에서만, `bossRelic`(후보 1~3개·모두 보스 유물·중복/보유 없음·마지막 액트 아님)·`actIntro`(회복 전 HP + 회복량 = 현재 HP, 회복량 ≤ 50% 올림) 단계의 노드·세션 형태, 단계↔현재 노드 종류(보상 종류 포함), 종료 전 HP 0 금지, 전투 `tries`=그 노드의 history 수, 상점 3칸·희귀도 가격, 상점 유물 칸(2칸 이하·중복 없음·가격·구매 여부=보유 여부), 유물 보상은 정예 보상에만, 지휘관 최대 HP=지휘관 기본값+보유 유물의 최대 HP 증가 합, 이벤트 id=`seenEvents` 마지막(이벤트 노드 수만큼 기록), history 노드는 입장 기록에 포함.
- UI 저장(M4-B, `src/ui/run`): 브라우저는 `localStorage`의 `autochess-run-save` 키 하나에 `RunSave` JSON을 쓴다. 단계가 바뀔 때·전투 준비 중 로스터가 바뀔 때·전투 정산 직후마다 저장하고, 런이 끝나면(`ended`) 지운다. 새 런 시드는 core가 `seed | 0`으로 정규화하므로 UI는 32비트 정수 범위만 받는다. 저장소는 `RunStorage` 인터페이스로 주입한다(접근 실패는 알림만).

### 콘텐츠 마이그레이션 (`data/migrations.json`, `src/core/run/contentMigration.ts`)
카드·유물 데이터가 바뀌어도(소유자 변경, id 변경·삭제, 희귀도 변경 등) 이전에 만든 저장본이 깨지지 않게 하는 장치. 저장 포맷 `version`과 별개로 저장본에 **콘텐츠 버전 `contentVersion`**(저장 시점의 `migrations.json` 마지막 `to`, 없으면 0)을 적는다. `RunController.restore`는 파싱 전에 `ContentMigrations.migrate`로 저장본(JSON)을 현재 콘텐츠 버전까지 올리고, 실제로 바뀐 것이 있으면 한국어 알림 문장을 `controller.contentNotices`로 돌려준다(`RunSession.continueRun`이 "게임 데이터가 업데이트되어 저장본을 맞췄습니다. …" 정보 알림으로 한 번 보여 줌). 다시 저장하면 `contentVersion`이 현재 값이 되어 알림은 반복되지 않는다. **현재보다 높은 `contentVersion`**(더 새 게임이 만든 저장본)은 `run.contentVersion: …더 새로운 콘텐츠 버전…` 오류로 거부한다.
- 형식: `{ "version": 1, "migrations": [ { "to": 1, "note": 알림 머리말, "steps": [ … ] } ] }` — `to`는 1부터 빠짐없이 이어져야 하고(순서대로 적용, 체인 가능), 각 단계의 카드·유물·지휘관 id는 로드할 때 검증한다(경로 포함 한국어 오류). 대상(`to`·`replaceWith`·`shopFallback`)은 **현재 데이터에 있는** 카드·유물이어야 하고, 상점에 진열될 수 있는 카드는 `common`/`rare`/`epic`이어야 한다(진열 가격 규칙 때문).
- 단계(`op`): `replaceCard {from, to, unlessCommander?}`(덱 모든 더미·상점 진열·카드 보상·이벤트 선택지에서 id 교체, 강화 버전이 없는 카드로 바뀌면 강화 표시를 뗌, 진열 가격은 새 카드 희귀도로, `unlessCommander` 런은 건드리지 않음 — "다른 지휘관 소유가 된 카드를 대체 카드로") / `removeCard {cardId, replaceWith? | refundGold?, shopFallback?}`(덱에서 제거해 `replaceWith`로 바꾸거나 장당 `refundGold` 환불, 진열 칸은 `shopFallback`으로 채움) / `withdrawCard {cardId, shopFallback}`(덱은 두고 이미 제시된 보상·진열에서만 뺌 — 더 이상 풀에 나오지 않게 된 카드) / `replaceRelic {from, to}` / `removeRelic {relicId, replaceWith? | refundGold?}`(보유·상점·보상·보스 후보). 새 종류의 변경은 `ContentMigrations.apply`에 `op`를 하나 추가한다.
- **첫 사례(콘텐츠 버전 1)**: 불씨 화살이 이세라 고유 시작 카드가 되었으므로 이세라가 아닌 지휘관의 덱·보상·진열에 있던 불씨 화살은 덩굴 속박으로 바꾸고(`replaceCard … unlessCommander: cmd_isera`), 이세라 런에 제시되어 있던 보상·진열 목록에서는 뺀다(`withdrawCard`).
- **콘텐츠를 바꿀 때의 절차**: (1) `cards.json`/`relics.json`을 고친다. (2) 기존 저장본이 깨질 수 있는 변경(카드 id 변경·삭제, `owner` 변경, 상점에 나오던 카드의 희귀도를 `starter`로 바꾸기 등)이면 `data/migrations.json`의 `migrations`에 `to`를 하나 올린 항목과 단계를 추가한다. (3) `npm test`로 데이터 검증과 저장 호환 테스트(`contentMigration.test.ts`)를 돌린다. 저장본의 호환이 필요 없는 변경(수치만 바꿈)은 추가하지 않는다. 유닛 id 변경은 아직 단계가 없다 — 필요해지면 `op`를 추가한다(기존 `MANAGEMENT.POOL_ADDED_IN_M54` 임시 처리는 그대로 두었다).

### 플레이 테스트 런 (`src/core/run/testRun.ts`)
배포판에서 밸런스(특히 액트 2·3, 지휘관별)를 직접 플레이하며 확인하려는 도구. 일반 런과 같은 `RunController`·저장 형식·정산 경로를 쓰되 **`test` 표시가 있는 런에서만** 테스트 명령을 받는다. 헤드리스 도구(`tools/`)에는 노출하지 않는다.
- **생성**: `RunController.createTest(deps, setup)` — 일반 `create`로 새 런을 만든 뒤 설정을 적용하고 `test: { startAct, startPosition }`을 붙인다. `TestRunSetup`: `seed`, `commanderId`, `deckPreset`, `startAct`(1~3, 기본 1), `startPosition`(`actStart` 액트 처음 = 1층 노드 선택 / `bossGate` 보스 직전 = 12층 야영지를 지난 맵 단계라 보스만 고를 수 있음), `gold`(0~99999), `hp`·`maxHp`(1~9999, HP는 유물의 최대 HP 보정 뒤에 덮어씀), `level`(3~9), `relics`(id, 중복 불가), `cards`(`{ cardId, count?, upgraded? }`, 공용 카드와 선택한 지휘관 고유 카드만), `units`(`{ unitId, star?, place? }`, 보스 전용 제외, 보드는 인구 한도 이내). 적용 순서는 레벨 → 이전 액트·시작 위치 → 유닛 → 유물 → 카드 → 골드 → HP. 설정이 틀리면 만들기 전에 한국어 `Error`.
- **이전 액트·건너뛴 구간의 상태 구성**: 맵 위의 경로(간선을 따라 1층부터 보스까지)를 **실제로 지나온 것으로 기록**한다 — 입장 기록 `visited`/`currentNodeId`, 전투·정예·보스 노드는 승리 기록 1건(`history`, `endTime` 0·`cardsUsed` 0), 이벤트 노드는 실제 진행과 같은 규칙으로 고른 이벤트 id(`seenEvents`). 액트 N 시작이면 액트 1~N-1을 이렇게 지나고 다음 액트 맵(`generate(seed, act)`)을 붙이며, 위치는 지난 액트의 보스(액트 처음) 또는 12층 야영지(보스 직전)다. 상점·야영지 노드의 효과(승급·강화 등)와 지나간 전투의 골드·카드 보상은 일어나지 않은 것으로 본다. 그래서 일반 런의 **구조 검증(맵·노드·단계·기록 관계)이 그대로 통과**하고 테스트 런에서 따로 완화하지 않는다.
- **런 중 명령** (`controller.test`, `TestRunTools`; 일반 런이면 상태를 바꾸지 않고 `{ ok:false, reason }`): `setGold`/`addGold`, `setHp(hp, maxHp?)`, `setLevel`(보드 인원이 넘으면 거부), `addRelic`/`removeRelic`(최대 HP 유물은 최대 HP도 되돌림, 카드 강화·거울 합성 같은 획득 즉시 효과는 되돌리지 않음), `addCard(cardId, upgraded, count)`/`removeCard`(유닛 제공 카드 제외, 상점 제거 횟수·가격에 영향 없음), `grantUnit(unitId, star, place)`(풀 재고는 성급 몫을 가져가되 모자라면 0까지만), `jumpToBoss(viaCamp)`(보스 직전 야영지 입장 또는 바로 보스 전투 준비, 중간 노드는 위 규칙으로 기록), `skipToNextAct(withBossRelic)`(보스를 쓰러뜨린 것으로 기록하고 보스 유물 선택 또는 액트 소개로, 지휘관 HP 회복은 실제와 같음, 마지막 액트는 거부), `forceBattleResult('win'|'loss')`(`createSimulator`→`beginBattle`→유닛 전멸→`completeBattle`이라 골드·카드 HP·패배 피해·보상·보스 유물·종료가 실제와 같음). `availability()`가 묶음별(`edit`/`move`/`battle`/`nextAct`) 사용 불가 사유를 돌려준다.
- **허용 단계**: 값·유물·카드·유닛 편집은 `map`·`battlePrep`·`camp`에서만(보상·상점 진열·이벤트·액트 전환 세션이 편집과 모순되지 않게). 이동은 `map`·`battlePrep`·`shop`·`event`·`camp`에서만 — 전투 준비 중이던 일반·정예 노드는 이긴 것으로 기록하고 떠난다(보스 전투 준비에서는 이동 대신 다음 액트/강제 결과). 강제 결과는 `battlePrep`·`battle`.
- **저장**: v3의 **선택 필드** `test: { startAct, startPosition }` — 필드가 없으면 일반 런이라 기존 v1~v3 저장본과 테스트 표시 없는 저장은 그대로다(version은 올리지 않음, v1·v2에 `test`가 있으면 거부). 복원은 `startAct`가 전체 액트 수·지금 액트 이하이고 `startPosition`이 올바른지 확인한다.
- **검증 규칙**: 테스트 런이 일반 런과 다르게 허용하는 것은 정확히 둘이다 — ① 지휘관 최대 HP가 `기본값 + 보유 유물 보정`과 같지 않아도 됨(1 이상 정수는 `CommanderHealth`가 확인), ② 시작 덱 카드 장수 보존 검사를 건너뜀(카드를 자유롭게 빼고 넣을 수 있음). 골드·유물·유닛은 원래 일반 검증에서도 임의 값이 허용되는 필드(영수증·풀 재고와의 교차 검사가 없음)다. 다른 지휘관 고유 카드 금지, 맵·위치·간선·단계↔노드·세션·history·이벤트 기록 일관성은 그대로 검사한다.
- **한계·판단**: 일반 런 저장본에 `test` 표시만 붙이면 위 두 완화가 적용된다 — 표시를 붙인 시점에서 그 저장은 "테스트 런"이므로 허용한다(일반 런의 무결성 보증은 표시 없는 저장에만 적용). 테스트 런의 결과(승리·클리어)는 일반 기록·메타 진행(M5-5)과 분리되어야 한다(아직 메타 진행 없음). 건너뛴 구간의 이벤트 효과·상점은 적용되지 않고 `endTime` 0 기록이 종료 화면의 통계에 섞인다.
- **UI**: 시작 화면의 접이식 "테스트 시작" 패널(`TestStartPanel`: 지휘관·시드·덱·시작 액트/위치·골드·HP·레벨 입력, 유물 체크리스트, 카드별 장수·강화, 유닛별 성급·위치)과 런 중 "테스트 도구" 패널(`TestToolsPanel`, 오른쪽 아래 버튼 또는 단축키 T/`, Esc로 닫기). HUD에 보라색 "테스트 런" 배지가 붙고 이어하기 요약에 `[테스트 런]`이 표시된다. 화면 쪽 강제 결과는 재생 중인 전투 시뮬에 같은 `forceCombatResult`를 적용해 일반 종료·정산 경로를 탄다. 프로덕션 빌드에서도 동작한다(dev 전용 `window.__tactics`와 무관).

### 헤드리스 자동 런
`npm run run -- --seed 1 --n 20 [--commander cmd_harten|cmd_isera|cmd_nox] [--path first|random] [--plan 파일|--no-cards] [--deck starter|test] [--no-relics] [--no-ultimate] [--acts 1|2|3] [--verbose]` (`tools/run.ts`, 로직은 `AutoRunner`). **기본은 3액트**를 끝까지 진행하고 출력에 도달 액트가 나온다(첫 줄 끝에 `, 액트 3`, `액트별 도달: 액트1 N / 액트2 N / 액트3 N / 클리어 N`, `평균 도달 액트 …, 평균 도달 층(전체 기준) …`, 사망 위치 `2액트 13층 N`). `--acts 1`이면 액트 1 보스 처치가 승리이고 **출력 형식이 3액트 도입 전(0.5.1)과 완전히 같다**(`--no-relics --no-ultimate`와 지휘관 3명 기본 출력, `--path random`·`--no-cards`·`--deck test` 변형 모두 같은 출력임을 확인했다). 보스 유물 정책: 유물 정책이 켜져 있으면 첫 후보를 받고 꺼져 있으면 건너뛰며, 액트 소개는 바로 계속한다. 정책: 보드를 채우고 가장 싼 유닛 구매(인구가 차고 골드 ≥ 8이면 경험치), 카드 보상 첫 장, 이벤트는 선택 가능한 첫 선택지, 야영지는 HP 50% 미만이면 휴식 아니면 강화, 전투는 지휘관별 카드 계획(`tools/plans/harten|isera|nox-basic.json`). **유물 정책**(기본 켜짐, `--no-relics`로 끔): 정예 보상 유물을 받고, 상점에서 살 수 있는 가장 싼 유물부터 사며(유닛 구매보다 먼저), 유물을 주는 이벤트 선택지를 우선 고른다. **궁극기 정책**(기본 켜짐, `--no-ultimate`로 끔): 카드 계획에 `ultimate: true` 항목을 더해 게이지가 차면 바로 쓴다. 두 정책을 모두 끄면 M4와 같은 결과를 낸다(`AutoRunner` 옵션은 기본 꺼짐, CLI 플래그가 켠다). i번째 런의 시드는 `seed + i`.
