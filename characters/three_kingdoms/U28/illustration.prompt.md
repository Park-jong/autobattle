# U28 주유 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `volcano_oracle`.
- 예정 채택 경로: `characters/three_kingdoms/U28/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U28, Zhou Yu (주유), clearly adult woman aged 29.
BODY LOCK: H-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 173 cm, B/W/H 107/64/94 cm and H-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 173 cm barefoot; B/W/H 107/64/94 cm and H-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Right hand opens the red-feather strategy fan at waist height, left hand rests lightly near the folded robe; musical charm stays attached to the belt.
CORE IDENTIFIERS: Long crimson half-up waves, small gold musical-note hairpin, red fan and elegant general's outfit.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U28",
  "name_ko": "주유",
  "name_en": "Zhou Yu",
  "runtime_id": "volcano_oracle",
  "sex_age": "Adult human woman, 29 years old",
  "role_faction_ko": "적벽의 홍련군사 · 오",
  "height_cm": 173,
  "measurements_B_W_H_cm": "107/64/94",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "H",
  "body_ko": "풍만한 가슴과 곧은 어깨, 긴 손가락의 우아한 지휘형",
  "skin_ko": "따뜻한 밝은 아이보리색의 자연스러운 성인 인간 피부.",
  "hair_ko": "진홍색 #9F3E46 긴 웨이브를 반묶음, 금색 음표 모양 비녀",
  "eyes_ko": "호박금색 #D5A850, 차분하고 자신감 있는 눈매",
  "face_expression_ko": "정교한 타원형 얼굴과 얇게 정돈한 눈썹. 여유롭게 웃다가도 작전이 시작되면 시선이 또렷해진다.",
  "outfit_ko": "아이보리 어깨 트임 짧은 군사 포와 불투명 주홍 교차깃 상의, 넓은 소매천, 덧치마와 반바지",
  "equipment_ko": "홍련 깃털 부채와 작은 현악기 장식",
  "faction_palette_motifs_ko": "아이보리·주홍·금색 / 호랑이·물결",
  "identity_lock_en": "Long crimson half-up waves, small gold musical-note hairpin, red fan and elegant general's outfit."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 29세 성인 여성의 얼굴·골격과 `U28`의 독립적인 외형을 유지한다.
- 키 173 cm / B·W·H 107/64/94 cm / **H컵 폭유형**가 콘셉트와 일치한다.
- 머리: 진홍색 #9F3E46 긴 웨이브를 반묶음, 금색 음표 모양 비녀. 눈: 호박금색 #D5A850, 차분하고 자신감 있는 눈매.
- 홍련 깃털 부채와 작은 현악기 장식의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
