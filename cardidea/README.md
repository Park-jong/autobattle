# 카드 설계안 (M5-4 2부 후보)

M5-4 2부 카드 확장을 위한 **후보 목록**이다. 넉넉하게 설계해 두었고, 이 중에서 골라 구현한다.
아직 데이터(`data/cards.json`)에 들어간 카드가 아니며, 수치는 초안이다.

| 파일 | 내용 | 후보 수 | 희귀도 (일/희/에) | ✅ 바로 구현 / 🔧 새 효과 |
|---|---|---|---|---|
| [common.md](common.md) | 공통 카드 C01~C62 (모든 지휘관이 보상·상점에서 얻음) | 62 | 33 / 24 / 5 | 52 / 10 |
| 〃 | 유닛 제공 카드 U1~U2 (문서 정의, 확정 추천) | 2 | — | 1 / 1 |
| 〃 | 저주 K1~K5 | 5 | — | 0 / 5 |
| [harten.md](harten.md) | 하르텐 전용 H01~H30 (강철군단·수호자, 버티기·진형) | 30 | 16 / 10 / 4 | 26 / 4 |
| [isera.md](isera.md) | 이세라 전용 I01~I31 (잿불·주술사, 주문) | 31 | 15 / 12 / 4 | 21 / 10 |
| [nox.md](nox.md) | 녹스 전용 N01~N31 (심연·암살자, HP를 대가로) | 31 | 14 / 12 / 5 | 23 / 8 |

목표치(합의): 공통 35장 내외, **지휘관당 전용 카드 30장**(콤보·다양성을 위해 후보를 거의 그대로 채택) + 고유 시작 카드 1. 고르는 방법은 아래 "고르는 법" 참고.

약어·용어(ARM, RES, AS, CP 등)는 [GLOSSARY.md](GLOSSARY.md).

## 표 읽는 법

| 열 | 의미 |
|---|---|
| 선택 | 고를 카드에 `✔` 표시 (비워 두면 제외) |
| 타입 | 작전(준비 단계만) / 명령(전투 중) / 주문(전투 중, 위치·대상 지정) / 장비(준비 단계, 아군 1명에 영구 장착 후 덱에서 빠짐) / 저주(사용 불가 또는 자동 발동) |
| 비용 | CP. 전투 CP는 시작 2, 4초마다 +1, 최대 6 (전투 90초 동안 대략 20 내외를 쓴다) |
| 희귀 | 일 = 일반(common), 희 = 희귀(rare), 에 = 에픽(epic). 보상 가중치 일반 70/27/3, 정예·보스 40/50/10 |
| 대상 | 없음 / 아군1 / 적1 / 아군2 / 3×3(지정 칸 중심) / 칸 |
| 키워드 | 소모(사용하면 이번 런에서 제거) / 보존(전투가 끝나도 손패 유지) / 연쇄(이번 전투에 앞서 카드를 썼으면 추가 효과) / 징집(전투 중 임시 유닛) / 공명[특성](그 특성이 켜져 있으면 추가 효과) / HP n(지휘관 HP n을 대가로 냄) |
| 강화 | 야영지 단련·이벤트로 강화했을 때(+) 바뀌는 점 |
| 구현 | ✅ 기존 효과로 바로 구현 가능 / 🔧 새 효과·규칙이 필요 (아래 목록 번호) |

수치 기준(기존 카드): 불씨 화살 1CP 마법 80 + 화상, 화염 폭풍 3CP 3×3 마법 150, 방진 유지 1CP 전열 보호막 15%, 전쟁 북 1CP(작전) 전투 내내 ATK +10%.

## 🔧 새로 필요한 효과·규칙 (구현 비용 참고)

| 번호 | 내용 | 쓰는 카드 예 | 구현 (2부-A) |
|---|---|---|---|
| N1 | `manaGain`: 아군 마나를 정해진 양만큼 회복 (지금은 `manaFill` 가득만 있음) | 정비 시간, 주술 회로 | ✅ `manaGain` |
| N2 | 진영 행 선택자: `alliesBackRow`(아군 후열), `enemiesFrontRow`/`enemiesBackRow` | 매복, 함정 설치, 견고한 진형 | ✅ `alliesBackRow` (적 행 선택자는 ✔ 카드가 쓰지 않아 제외) |
| N3 | 카드에서 특성 유닛만 고르기: `traitUnits`를 카드에도 허용 | 비전 연결, 화로의 불씨 | — 미구현 (✔ 카드 없음) |
| N4 | 카드용 치명타 버프 (`critical`을 시간제 상태로) | 급소 노리기 | — 미구현 (✔ 카드 없음) |
| N5 | 카드용 손패 비용 감소 (`handCostReduction` 1회성) | 주문 증폭, 주술 회로 | ✅ `handCostCut` |
| N6 | 조건부 피해: 대상이 화상 중 / HP 일정 비율 이하이면 추가 피해 | 연소 폭발, 처형 | ✅ `flatDamage` 조건부 필드 |
| N7 | 특정 유닛 징집 (`summon`에 `unitId` 지정) | 훈련된 방패병, 잿불 정령, 그림자 분신 | ✅ `summon.unitId` 등 |
| N8 | 궁극기 게이지 획득 (`ultimateGain`) | 군단장의 호령, 대분화 예열, 대가 선불 | ✅ `ultimateGain` |
| N9 | 카드용 지연 타격 (`delayedStrike`를 카드 대상 3×3으로) | 운석 낙하 (예언된 재앙도 이것이 필요) | ✅ `delayedStrike` `targetArea` |
| N10 | 지속 범위 피해 장판 (지정 3×3에 n초 동안 1초마다 피해) | 화염 지대 | ✅ `damageZone` |
| N11 | 전투 동안 주문 피해 % 증가 (지휘관 패시브와 같은 보정을 카드로) | 열 증폭 | ✅ `spellDamageBoost` |
| N12 | 부활 1회 (장비) | 불사조의 깃털 | ✅ `reviveOnce` |
| N13 | 이번 전투 처치 시 CP 획득 (`cpOnKill`을 카드로) / 처치 시 추가 효과 | 영혼 수확, 무혼의 그림자 | ✅ 카드 `cpOnKill`·`flatDamage.killCp` |
| N14 | 준비 단계 작전으로 "이번 전투 시작 CP +n" | 화로의 불씨, 피의 맹약 | ✅ `startCp` |
| N15 | 지휘관 HP 회복 카드 (`commanderHeal`) | 빚 청산 | ✅ `commanderHeal` |
| N16 | 카드용 강화 공격 (`empoweredAttack`를 카드에서) | 은밀한 처리 | ✅ 카드 `empoweredAttack` |
| N17 | 저주 동작: 손패에 있으면 / 뽑으면 자동 발동, 사용해서 제거 | 저주 전부 | ✅ 저주 `curse` 필드 |
| N18 | 장비의 주변 아군 오라 (장착 유닛 반경 1 아군 버프) | 전설의 군기 | — 미구현 (선택 카드 없음) |
| N19 | 사거리 증감 스탯 (`range`) | 고지 확보 | — 미구현 (선택 카드 없음) |

## 고르는 법
1. 각 파일의 "선택" 열에 `✔`를 표시하거나, 원하는 번호를 목록으로 알려준다 (예: `C01, C05, C13 …`).
2. 목표: 공통 약 35장(보상 풀 일반:희귀:에픽 ≈ 11:7:3 + 저주 3 + 유닛 제공 2 확정), 지휘관마다 전용 30장(현재 후보: 하르텐 30, 이세라 31, 녹스 31).
3. 🔧 카드를 고르면 해당 효과를 구현 범위에 넣는다. 🔧가 적을수록 구현이 빠르다.
4. 수치는 고른 뒤 구현할 때 다듬어도 된다 (설명만 바꾸고 싶으면 그 칸을 고쳐 주면 된다).

## 선택 결과 (1차)

### 지휘관 전용 — 각 30장
- 하르텐 H01~H30 전부, 이세라 I01~I30(I31 정화의 불꽃 제외), 녹스 N01~N31 중 N22 미지불 이자 제외 — 겹치는 역할을 뺐다.
- 고유 시작 카드: 하르텐 방진 유지, 이세라 불씨 화살(공용에서 전환), 녹스 피의 대가.

### 공통 — 35장 (보상 풀 30 + 유닛 제공 2 + 저주 3)

| 구분 | 카드 |
|---|---|
| 특성 공명 9 (특성마다 1장) | 강철군단 C42 강철 대열 · 잿불 C44 불씨 퍼뜨리기 · 심연 C47 공허 장막 · 숲의 맹약 C49 뿌리 감옥 · 수호자 C50 방패 맹세 · 검투사 C52 투기장의 함성 · 사수 C54 일제 사격 · 주술사 C56 주문 증폭 · 암살자 C58 그림자 걸음 |
| 범용 전투 13 | C01 방패 벽 · C02 응급 처치 · C03 재집결 · C05 저지선 · C08 약점 지목 · C09 갑옷 파쇄 · C10 섬광탄 · C11 침묵의 종 · C13 화염구 · C15 번개 사슬 · C16 대지 붕괴 · C18 전장의 함성 · C20 약화 저주 |
| 덱·CP 운영 4 | C22 보급 · C23 전령 · C26 총동원 · C27 연환계 |
| 작전 2 | C30 전장 정비 · C31 사기 진작 |
| 장비 2 | C36 강철 흉갑 · C39 흡혈 단검 |
| 유닛 제공 2 | U1 균열 개방(공허 대사제) · U2 예언된 재앙(화산 예언자) |
| 저주 3 | K1 공포 · K2 부상 · K4 부패한 보급 |

- **보상 풀 30장 희귀도**: 일반 19 / 희귀 8 / 에픽 3. 기존 보상 풀 7장(일반 4 / 희귀 3)과 합치면 공통 보상 풀은 37장.
- **특성 균형**: 새 공명 카드는 9개 특성에 1장씩. 기존 카드에 이미 공명이 있는 잿불(화염 폭풍)·심연(심연의 계약, 균열 개방)은 공격형 대신 방어·확산형(불씨 퍼뜨리기, 공허 장막)을 골라 역할이 겹치지 않게 했다.
- **타입**: 명령 17 · 주문 9 · 작전 2 · 장비 2 (보상 풀 30 기준).
- **🔧 포함**: C56 주문 증폭(N5), U2 예언된 재앙(N9), 저주 3장(N17). N5·N9는 이세라 카드에도 필요해 함께 구현된다.
- 공통 카드 전체(기존 포함): 시작용 6 + 기존 보상 7 + 기존 유닛 제공 3 + 새 35 = **51장**. 지휘관 카드 93장(전용 90 + 고유 시작 3)과 합쳐 **약 144장**.

## 구현 현황 (2부-A)
✔ 카드가 필요로 하는 🔧 효과·규칙(N1·N2·N5~N17, I15의 작전 `onAttackBurn`, 장비 `lifesteal` 전투 내내)은 구현 완료. N3·N4·N18·N19는 선택된 카드가 쓰지 않아 구현하지 않았다. 지휘관 전용 보상 풀 규칙과 불씨 화살의 이세라 고유 시작 카드 전환도 완료. 지휘관 전용 90장은 2부-B에서, 공통 35장은 2부-C에서 넣었다(아래). 데이터화할 때 주의: N04 암살 표식 공명(+50%)은 `damageTakenMult`가 곱연산이라 공명 효과의 배율을 1.5 ÷ 1.3 ≈ 1.154로 적어야 하고, C54 일제 사격의 공명(6회)은 `extraShots`가 누적이라 기본 4회 + 공명 +2회로 적는다.

## 구현 현황 (2부-B): 지휘관 전용 카드 90장
`data/cards.json`에 ✔ 카드 90장을 넣었다(카드 풀 18 → 108종). **새 전투 효과는 만들지 않았고** 2부-A 효과만 썼다. 강화에서 "소모 없음"(H09)과 "HP 비용 감소"(N02·N08·N31)를 표현하려고 카드 강화 필드 `upgrade.keywords`·`upgrade.commanderHpCost`만 추가했다(data/README.md "지휘관 전용 카드"). 고유 시작 카드·시작 덱은 그대로다.

| 지휘관 | 장수 | 일반 / 희귀 / 에픽 |
|---|---|---|
| 하르텐 | 30 | 16 / 10 / 4 |
| 이세라 | 30 | 14 / 12 / 4 |
| 녹스 | 30 | 13 / 12 / 5 |

### 번호 ↔ id
- **하르텐**: H01 굳건한 방패 `harten_sturdy_shield` · H02 방진 전진 `harten_phalanx_advance` · H03 철의 규율 `harten_iron_discipline` · H04 버텨라 `harten_hold_firm` · H05 반격 태세 `harten_counter_stance` · H06 전열 교대 `harten_front_rotation` · H07 방패 가격 `harten_shield_bash` · H08 강철의 맹세 `harten_iron_oath` · H09 한 명도 두고 가지 않는다 `harten_leave_no_one` · H10 수호자의 결의 `harten_guardian_resolve` · H11 견고한 진형 `harten_solid_formation` · H12 방벽 건설 `harten_build_barrier` · H13 재정비 나팔 `harten_rally_horn` · H14 강철 폭풍 `harten_steel_storm` · H15 불굴의 진군 `harten_unyielding_march` · H16 철의 장막 `harten_iron_curtain` · H17 진형 고수 `harten_hold_formation` · H18 엄호 `harten_cover` · H19 군단장의 호령 `harten_legion_command` · H20 방진 결속 `harten_phalanx_bond` · H21 훈련된 방패병 `harten_trained_shieldbearer` · H22 단련된 갑주 `harten_tempered_armor` · H23 대장의 방패 `harten_captains_shield` · H24 무쇠 의지 `harten_iron_will` · H25 맞불 `harten_counterfire` · H26 최후의 방어선 `harten_last_line` · H27 원진 `harten_circle_formation` · H28 교대 근무 `harten_shift_change` · H29 철벽 전진 `harten_iron_advance` · H30 불굴의 기억 `harten_unyielding_memory`
- **이세라**: I01 화염 창 `isera_flame_lance` · I02 불꽃 파도 `isera_flame_wave` · I03 점화 `isera_ignite` · I04 열기 축적 `isera_heat_buildup` · I05 화로 예열 `isera_furnace_preheat` · I06 용암 분출 `isera_lava_eruption` · I07 연소 폭발 `isera_combustion` · I08 마나 범람 `isera_mana_flood` · I09 주문 연쇄 `isera_spell_chain` · I10 불티 폭우 `isera_ember_rain` · I11 화염 갑옷 `isera_flame_armor` · I12 열풍 `isera_hot_wind` · I13 불의 서약 `isera_oath_of_fire` · I14 잿불 각인 `isera_ember_mark` · I15 대화로의 축복 `isera_hearth_blessing` · I16 정신 집중 `isera_focus` · I17 주술 회로 `isera_spell_circuit` · I18 화산탄 `isera_volcanic_bomb` · I19 불꽃 올가미 `isera_flame_snare` · I20 스승의 가르침 `isera_masters_lesson` · I21 운석 낙하 `isera_meteor_fall` · I22 잿불 정령 `isera_ember_spirit` · I23 작은 불씨 `isera_small_spark` · I24 열 증폭 `isera_heat_amplifier` · I25 불사조의 깃털 `isera_phoenix_feather` · I26 화염 지대 `isera_flame_field` · I27 대분화 예열 `isera_eruption_warmup` · I28 점화 연쇄 `isera_ignition_chain` · I29 불꽃 방패 `isera_flame_shield` · I30 재의 비 `isera_ash_rain`
- **녹스**: N01 피의 계약서 `nox_blood_contract` · N02 고리대금 `nox_usury` · N03 그림자 일격 `nox_shadow_strike` · N04 암살 표식 `nox_assassin_mark` · N05 심연 도약 `nox_abyss_leap` · N06 생명 착취 `nox_life_drain` · N07 피의 축제 `nox_blood_feast` · N08 마지막 거래 `nox_final_deal` · N09 빚 독촉 `nox_debt_collection` · N10 독 묻은 칼날 `nox_poisoned_blade` · N11 처형 `nox_execution` · N12 그림자 장막 `nox_shadow_veil` · N13 공포의 속삭임 `nox_whisper_of_dread` · N14 계약 갱신 `nox_contract_renewal` · N15 심연 응시 `nox_abyss_gaze` · N16 피의 갑옷 `nox_blood_armor` · N17 그림자 분신 `nox_shadow_clone` · N18 은밀한 처리 `nox_silent_finish` · N19 대가의 연쇄 `nox_chain_of_debt` · N20 망각의 손길 `nox_oblivion_touch` · N21 피로 맺은 동맹 `nox_blood_alliance` · N23 사냥 개시 `nox_hunt_begins` · N24 심연 균열 `nox_abyss_rift` · N25 영혼 수확 `nox_soul_harvest` · N26 피의 장막 `nox_blood_veil` · N27 대가 선불 `nox_prepaid_price` · N28 죽음의 춤 `nox_dance_of_death` · N29 빚 청산 `nox_debt_settlement` · N30 무혼의 그림자 `nox_shadow_of_nothing` · N31 피의 맹약 `nox_blood_pact`

### 데이터화하며 정한 해석 (설계안에 없던 값·애매한 표현)
**공통 규칙**
- 표에 지속 시간이 없으면 같은 카드의 다른 효과와 맞춘다(예: H14 보호막 5초, H29 보호막 3초, I11 보호막 4초, I29 보호막 3초, H10 공명 도발 3초).
- "카드 1장/2장" = 드로우(`drawCards`), "CP +n" = `cpGain`, "전열/후열" = `alliesFrontRow`/`alliesBackRow`(아군 전열 열 3, 후열 열 0), "근접" = `alliesMelee`.
- 공명·연쇄에 "공명: 20%"처럼 총합이 적힌 카드는 효과가 **누적**되므로 차액을 적었다: H08 강철의 맹세 12% + 공명 8%(강화 12% + 13% = 25%), H20 방진 결속 15% + 연쇄 10%(강화 20% + 10% = 30%). 화상 `onAttackBurn`(I15)은 큰 쪽으로 갱신되므로 공명이 총합(20%/30%)을 그대로 적는다.
- N04 암살 표식은 곱연산이라 공명 배율을 비로 환산했다: 기본 ×1.3 뒤에 ×1.1538(≈1.5/1.3), 강화 ×1.4 뒤에 ×1.1786(≈1.65/1.4).
- 강화 열에 바뀌는 수치만 적힌 카드는 나머지(지속 시간·다른 효과 수치)를 기본과 같게 둔다. 강화 공명·연쇄 수치가 따로 있는 카드만 `upgrade.resonance`/`upgrade.chain`을 적고, 없으면 기본 것을 그대로 쓴다.
- 장비 카드(H22·H23·I25·N10)의 효과는 forged_blade처럼 `duration: "combat"`로 적고, 준비 CP는 카드 비용이다. 설명 문장은 기존 장비 카드 문체를 따른다.
- 피해 카드의 "방어 30% 무시" = `ignoreArmorPct`(마법 피해에도 같은 필드).

**카드별**
- H02 방진 전진: 받는 피해 −20%는 `damageTakenMult` 0.8, 강화는 ATK만 +30%.
- H06 전열 교대: "전투당 2회" = `limits.perCombat: 2`, 보호막은 두 아군 모두(대상 지정 `allyUnits` 2).
- H09 한 명도 두고 가지 않는다: `undying` 3초 + `heal` 200. 강화는 소모 키워드 제거(`upgrade.keywords: []`).
- H10 수호자의 결의 / H29 철벽 전진: 도발은 `taunt`(selector 전열, 반경 2칸 / 1칸), 시전자 위치 기준 한 번만 판정. 지속 3초.
- H11 견고한 진형: 후열이 비어 있으면 ATK +10%는 아무에게도 적용되지 않는다. 강화 −20% / +15%.
- H17 진형 고수: 보존 키워드.
- H18 엄호: 도발(반경 2칸, 4초) + 반사 20%를 지정 아군 1명에게.
- H19 군단장의 호령 / H30 불굴의 기억: `ultimateGain` 25 / 40(전투당 1회, 보존). 카드 사용 자체의 게이지 충전(+15)이 따로 붙는다.
- H21 훈련된 방패병: 방패병(`iron_shieldbearer`) 1기를 `allyFront`(전열 빈 칸)에 징집, 강화 2성.
- H25 맞불: `forceTarget` 4초(표에 시간 없음)와 같은 4초 받는 피해 +20%.
- H26 최후의 방어선: 강화는 비용 4 → 3(소모 유지).
- H27 원진: 강화 "+20"은 ARM +20과 공명 RES +20으로 읽었다.
- I05 화로 예열: `startCp` + 준비 단계 드로우 1장. 강화는 CP +2만 바뀐다.
- I10 불티 폭우: 대상 없음 주문, `allEnemies` 선택자.
- I14 잿불 각인: `damageTakenMult` 마법 피해 한정(`dmgType: magic`) 1.3 / 1.45, 6초.
- I17 주술 회로: 강화는 마나 +50 → `manaFill`(마나 가득), 공명 유지.
- I21 운석 낙하: 지연 타격 지연 2초, 지정 3×3, 범위·피해는 시전 때 고정.
- I22 잿불 정령: 잿불 점화사(`ember_kindler`) 1기를 후열에 마나 가득으로 징집, 강화 2성.
- I26 화염 지대: 5초간 1초마다. 강화 55.
- I28 점화 연쇄: "대상과 인접한 적"을 `targetAndAdjacent`(대상 포함)로 읽었다. 연쇄 화상도 같은 범위.
- I30 재의 비: ATK −20%(`statMod`) 4초 + 화상 15(4초).
- N01·N02 등 HP 비용 카드: `commanderHpCost.amount`, 강화로 줄어드는 카드는 `upgrade.commanderHpCost`(N02 4→3, N08 8→6, N31 4→3).
- N05 심연 도약: `teleport` `enemyBackRow`(지정 아군을 적 후열 빈 칸으로), ATK +20% 3초.
- N08 마지막 거래: "CP를 최대(6)까지"는 `cpGain` 6(상한 6에서 멈춤).
- N09 빚 독촉: 작전 카드의 HP 비용도 준비 단계에서 정산된다. 강화는 2명.
- N11 처형: `hpBelowPct` 30 + `belowMult` 2(조건 충족 시 `damage.bonus`).
- N15 심연 응시: 침묵 4초(강화 6초) + 마나 −50, 심연 공명 CP +1.
- N17 그림자 분신: 그림자 단검(`shade_dagger`) 2기를 `enemyBack`에 징집, 강화 2성.
- N18 은밀한 처리: 지정 아군의 다음 기본 공격 `empoweredAttack` 200% / 280% 물리.
- N20 망각의 손길: `allEnemies`에 `manaDrain` 40 / 60 + `silence` 2초.
- N23 사냥 개시: `forceTarget` 3초(표에 맞춤), 받는 피해 +25% 3초.
- N24 심연 균열: RES −30은 `statAdd` res −30 4초.
- N25 영혼 수확: `cpOnKill` 1 / 최대 3(강화 5), 카드를 쓴 뒤부터 이번 전투.
- N27 대가 선불: "전투당 1회"를 `limits.perCombat: 1`로 적었다.
- N29 빚 청산: `commanderHeal` 5 / 8(승리 시 확정), 소모.
- N30 무혼의 그림자: `ignoreArmorPct` 50 + `killCp` 2.
- N31 피의 맹약: 작전 카드 `startCp` 2, HP 비용 4(강화 3).

## 구현 현황 (2부-C): 공통 카드 35장
`data/cards.json`에 ✔ 공통 카드 35장을 넣었다(카드 풀 108 → 143종). **새 전투 효과는 만들지 않았다**(2부-A·B 효과만 사용). 유닛 제공 카드 전용 플래그 `grantOnly`(카드 필드, 보상 풀 제외)만 추가했다.

| 구분 | 장수 | 일반 / 희귀 / 에픽 |
|---|---|---|
| 보상 카드 (`owner: neutral`) | 30 | 19 / 8 / 3 |
| 유닛 제공 (`grantOnly`) | 2 | 균열 개방 common · 예언된 재앙 rare |
| 저주 | 3 | — |

공용 보상 풀은 새 30장 + 기존 6장(마나 주입·전술 재정비·제련된 칼날 / 화염 폭풍·예비대 호출·심연의 계약) = **36장**(일반 22 / 희귀 11 / 에픽 3). 기존 유닛 제공 3종(행군가·적진 정찰·덩굴 속박)은 2026-10-29 사용자 결정으로 `grantOnly`가 되어 풀에서 빠졌다(0.11.2, 이전에는 39장). 지휘관 풀은 여기에 전용 30장을 더해 66장.

### 번호 ↔ id
- **범용 전투**: C01 방패 벽 `shield_wall` · C02 응급 처치 `first_aid` · C03 재집결 `regroup` · C05 저지선 `blockade_line` · C08 약점 지목 `mark_weakness` · C09 갑옷 파쇄 `armor_shatter` · C10 섬광탄 `flashbang` · C11 침묵의 종 `silence_bell` · C13 화염구 `fireball` · C15 번개 사슬 `chain_lightning` · C16 대지 붕괴 `earth_collapse` · C18 전장의 함성 `battle_cry` · C20 약화 저주 `weakening_curse`
- **덱·CP**: C22 보급 `supplies` · C23 전령 `messenger` · C26 총동원 `full_mobilization` · C27 연환계 `chain_stratagem`
- **작전**: C30 전장 정비 `field_prep` · C31 사기 진작 `morale_boost`
- **장비**: C36 강철 흉갑 `steel_cuirass` · C39 흡혈 단검 `vampiric_dagger`
- **특성 공명**: C42 강철 대열 `iron_ranks` · C44 불씨 퍼뜨리기 `ember_spread` · C47 공허 장막 `void_veil` · C49 뿌리 감옥 `root_prison` · C50 방패 맹세 `shield_oath` · C52 투기장의 함성 `arena_roar` · C54 일제 사격 `volley` · C56 주문 증폭 `spell_amplify` · C58 그림자 걸음 `shadow_step`
- **유닛 제공**: U1 균열 개방 `rift_opening`(공허 대사제) · U2 예언된 재앙 `prophesied_calamity`(화산 예언자)
- **저주**: K1 공포 `dread` · K2 부상 `wound` · K4 부패한 보급 `rotten_supplies`

### 저주 획득 경로 (이벤트)
선택지 3개이던 이벤트 3곳에 4번째 선택지를 붙였다 (새 이벤트 효과 없음, `gainCard fixed`; 선택지 상한 4 유지).
- 버려진 군수 창고 `abandoned_depot`: 봉인된 지하 금고를 억지로 연다 — +25G, 저주 공포
- 부상당한 정찰병 `wounded_scout`: 정찰병이 품은 금지된 전술서를 받는다 — 희귀 카드 1장(무작위), 저주 부상
- 탈영병 야영지 `deserter_camp`: 탈영병의 장부를 인수한다 — 3등급 유닛 1기, 저주 부패한 보급

### 데이터화하며 정한 해석 (설계안에 없던 값·애매한 표현)
**공통 규칙**
- 2부-B와 같다: 지속 시간이 표에 없으면 같은 카드의 다른 효과와 맞추고, 공명·연쇄에 총합이 적힌 카드는 차액(누적), 강화 열에 바뀌는 수치만 적힌 카드는 나머지를 기본과 같게 둔다. 강화에서 공명 수치가 따로 없으면 기본 공명을 그대로 쓴다(`upgrade.resonance` 생략).
- "카드 n장" = `drawCards`, "CP +n" = `cpGain`, "전열" = `alliesFrontRow`, 장비·작전 효과는 `duration: "combat"`(기존 장비와 같은 문체의 설명).

**카드별**
- C03 재집결: 회복 `heal` 80(강화 120) + `cleanse`(해로운 상태 제거), 둘 다 아군 전체.
- C05 저지선: 전열 `damageTakenMult` 0.7(강화 0.55) 3초.
- C08 약점 지목: 대상 지정이 적이어도 타입은 명령(표대로), `damageTakenMult` 1.25(강화 1.35) 5초.
- C09 갑옷 파쇄: `statAdd` arm −40(강화 −60) 6초. 방어력은 0 밑으로 내려가지 않는다.
- C15 번개 사슬: "대상과 인접한 적"을 `targetAndAdjacent`(대상 포함)로 읽었다(I28과 같음). 마법 피해 120(강화 170).
- C16 대지 붕괴: 물리 피해 260 + `ignoreArmorPct` 50, 1초 기절. 강화는 피해 340만 바뀐다.
- C18 전장의 함성: ATK +25%·AS +25% 5초, 강화는 지속 7초.
- C20 약화 저주: `statMod` atk −20%(강화 −30%) 4초, 3×3 범위의 적.
- C22 보급: 비용 0, 소모. C23 전령: `cpGain` 1 + 드로우 1, 연쇄 `chain: { cost: 0 }`(비용만 바뀌고 추가 효과 없음). 강화는 드로우 2.
- C26 총동원: 소모, CP +3·드로우 2. 강화는 `upgrade.cost` 1.
- C27 연환계: 드로우 1, 연쇄 `cpGain` 2. 강화는 드로우 2.
- C30 전장 정비: 작전, `shield` 10%(강화 15%) 전투 끝까지. C31 사기 진작: 작전, AS +10%·ATK +5% 전투 끝까지(강화 AS +15%).
- C36 강철 흉갑·C39 흡혈 단검: 장비, `statAdd` arm +30(+45) / `lifesteal` 15%(20%) `duration: "combat"`.
- C42 강철 대열: 기본 ARM +15(강화 +25) 5초. 공명은 **ARM +20을 추가**(합계 +35/+45)하고 전열 보호막 10%(5초, 표에 시간 없어 5초)를 준다.
- C44 불씨 퍼뜨리기: 화상은 큰 쪽으로 갱신되므로 공명이 총합(40, 강화 55)을 그대로 적는다(I15와 같은 원칙).
- C47 공허 장막: 받는 피해 −60%(0.4) 3초, 강화 4초. 공명 생명력 흡수 30%는 4초(표대로).
- C49 뿌리 감옥: `root` 3초(강화 4초), 공명 아군 전체 AS +15% 4초.
- C50 방패 맹세: `taunt` 반경 2칸 3초(강화 4초) + 받는 피해 −30%는 3초 고정, 공명 보호막 최대 HP 20%는 3초(표에 시간 없음).
- C52 투기장의 함성: `statMod` atk +30%(강화 +45%) 5초 `refreshOnKill`. 공명 생명력 흡수 20%는 5초(표에 시간 없음).
- C54 일제 사격: `extraShots`가 누적이라 기본 4회 + 공명 2회(합 6), 강화는 6회 + 공명 2회(합 8).
- C56 주문 증폭: 드로우 1(강화 2), 공명 `handCostCut` 1(손패 비용 ≥ 1인 무작위 1장).
- C58 그림자 걸음: `teleport enemyBackRow`, 공명 ATK +30%(강화 +45%) 3초. 갈 후열 칸이 없으면 카드는 CP·손패 변화 없이 실패한다.
- U1 균열 개방: `statAdd` res −30(강화 −45) 4초, 공명 `cpGain` 1(비용 2를 내고 1을 돌려받음).
- U2 예언된 재앙: 카드 지연 타격 3초 뒤 마법 피해 400(강화 550), 보존.
- K1 공포: `curse` 필드 없음(사용 불가), 비용 0. K2 부상: `curse.onDraw` `statMod` atk −10% `randomAlly` 전투 끝까지(전투 시작 때 손패에 있어도 시작할 때 발동). K4 부패한 보급: 처음 설계안의 "사용 불가"와 "1CP를 내고 사용하면 소모"가 부딪혀 후자(`playable: true` + `exhaust`, 비용 1)를 택하고 `goldLossAtEnd` 3을 더했다. 2026-10-29 사용자 결정으로 설계안(common.md K4)도 "1CP를 내고 써서 없앤다"로 고쳐 일치시켰다.
