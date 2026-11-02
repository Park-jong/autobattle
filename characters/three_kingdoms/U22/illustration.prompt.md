# U22 동백 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `wind_hunter`.
- 예정 채택 경로: `characters/three_kingdoms/U22/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U22, Dong Bai (동백), clearly adult woman aged 22.
BODY LOCK: A-cup small-bust adult. Keep the chest genuinely small and nearly flat, never padded into a C/D silhouette. Preserve the specific adult shoulders, muscles, hips and height in the brief; a small bust is not a childlike body.
Use height 161 cm, B/W/H 77/60/85 cm and A-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 161 cm barefoot; B/W/H 77/60/85 cm and A-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Stand with restrained proud posture; left hand holds the amethyst-decorated bow, right hand rests on the black-jade quiver; maintain clearly adult facial structure.
CORE IDENTIFIERS: Straight long silver-lavender twin tails, small black-jade crown, proud mature face; explicitly 22-year-old adult.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U22",
  "name_ko": "동백",
  "name_en": "Dong Bai",
  "runtime_id": "wind_hunter",
  "sex_age": "Adult human woman, 22 years old",
  "role_faction_ko": "자전의 서량궁 · 동탁군",
  "height_cm": 161,
  "measurements_B_W_H_cm": "77/60/85",
  "bust_type": "small",
  "bust_type_ko": "빈유형",
  "cup_size": "A",
  "body_ko": "작고 평평한 가슴, 가벼운 체격과 곧은 자세의 성인 궁수",
  "skin_ko": "차가운 아이보리색의 자연스러운 성인 인간 피부.",
  "hair_ko": "은자주색 #B8A6C4 가슴 아래 길이의 곧은 양갈래, 작은 흑옥 관",
  "eyes_ko": "연자주색 #A77CBF, 자존심 강한 또렷한 눈매",
  "face_expression_ko": "작고 단정한 타원형 얼굴과 뚜렷한 성인 턱선. 고개를 세워 자존심을 보이지만 칭찬에는 시선을 피한다.",
  "outfit_ko": "자주색 짧은 궁수 포와 검정 불투명 민소매 탑, 은색 허리 장식, 덧치마와 승마 반바지",
  "equipment_ko": "자수정 장식 각궁과 흑옥 화살집",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Straight long silver-lavender twin tails, small black-jade crown, proud mature face; explicitly 22-year-old adult."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 22세 성인 여성의 얼굴·골격과 `U22`의 독립적인 외형을 유지한다.
- 키 161 cm / B·W·H 77/60/85 cm / **A컵 빈유형**가 콘셉트와 일치한다.
- 머리: 은자주색 #B8A6C4 가슴 아래 길이의 곧은 양갈래, 작은 흑옥 관. 눈: 연자주색 #A77CBF, 자존심 강한 또렷한 눈매.
- 자수정 장식 각궁과 흑옥 화살집의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
