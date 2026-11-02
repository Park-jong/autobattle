# C03 조조 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `cmd_nox`.
- 예정 채택 경로: `characters/three_kingdoms/C03/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: C03, Cao Cao (조조), clearly adult woman aged 30.
BODY LOCK: I-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 174 cm, B/W/H 108/65/96 cm and I-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 174 cm barefoot; B/W/H 108/65/96 cm and I-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Take a composed commanding stance; right hand lowers the Yitian sword beside the leg, left hand holds a closed bamboo dispatch at waist height; command token remains attached to the belt.
CORE IDENTIFIERS: Ink-purple half-up long hair, black phoenix crown, calculating half-smile, I-cup body.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "C03",
  "name_ko": "조조",
  "name_en": "Cao Cao",
  "runtime_id": "cmd_nox",
  "sex_age": "Adult human woman, 30 years old",
  "role_faction_ko": "패도의 흑봉 군주 · 위",
  "height_cm": 174,
  "measurements_B_W_H_cm": "108/65/96",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "I",
  "body_ko": "풍만한 상체와 잘록한 허리, 긴 다리, 어깨를 펴고 상대를 내려다보는 장신 곡선형",
  "skin_ko": "차가운 아이보리색의 자연스러운 성인 인간 피부.",
  "hair_ko": "먹보라색 #282237 허리 길이 생머리를 높은 반묶음으로 정리, 검은 봉황 금관",
  "eyes_ko": "석류색 #A34059, 길고 날카로운 눈매",
  "face_expression_ko": "선명한 광대와 매끈한 턱선, 곧은 콧대. 한쪽 입꼬리만 올려 상대의 반응을 살피는 여유로운 미소.",
  "outfit_ko": "검정 교차깃 비단 상의와 푸른 어깨 장갑, 윗가슴 선을 조금 드러내는 불투명 재단, 옆트임 긴 덧자락과 반바지, 금장 장화",
  "equipment_ko": "의천검과 흑봉 문양 죽간, 금빛 군령패",
  "faction_palette_motifs_ko": "먹색·코발트·은색 / 흑봉·현무",
  "identity_lock_en": "Ink-purple half-up long hair, black phoenix crown, calculating half-smile, I-cup body."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 30세 성인 여성의 얼굴·골격과 `C03`의 독립적인 외형을 유지한다.
- 키 174 cm / B·W·H 108/65/96 cm / **I컵 폭유형**가 콘셉트와 일치한다.
- 머리: 먹보라색 #282237 허리 길이 생머리를 높은 반묶음으로 정리, 검은 봉황 금관. 눈: 석류색 #A34059, 길고 날카로운 눈매.
- 의천검과 흑봉 문양 죽간, 금빛 군령패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
