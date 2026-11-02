# U24 황충 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `siege_bombardier`.
- 예정 채택 경로: `characters/three_kingdoms/U24/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U24, Huang Zhong (황충), clearly adult woman aged 38.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 170 cm, B/W/H 90/65/94 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 170 cm barefoot; B/W/H 90/65/94 cm and D-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Support the folded mechanical siege crossbow with both hands in a low ready position; wooden firing chart stays strapped to the belt, no separate wheeled machine.
CORE IDENTIFIERS: Thick white braid, mature 38-year-old face with subtle expression lines, green tie and folded siege crossbow.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U24",
  "name_ko": "황충",
  "name_en": "Huang Zhong",
  "runtime_id": "siege_bombardier",
  "sex_age": "Adult human woman, 38 years old",
  "role_faction_ko": "백발의 연노장 · 촉",
  "height_cm": 170,
  "measurements_B_W_H_cm": "90/65/94",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "중간 볼륨의 가슴과 탄탄한 어깨, 흔들림 없는 사수 자세",
  "skin_ko": "옅은 황갈색의 자연스러운 성인 인간 피부.",
  "hair_ko": "은백색 #D9D9D2 굵은 땋은 머리와 짧은 옆머리, 녹색 머리끈",
  "eyes_ko": "금갈색 #B89C59, 여유 있고 날카로운 눈매",
  "face_expression_ko": "성숙한 타원형 얼굴과 단단한 턱. 눈가의 옅은 표정 주름과 여유로운 미소, 조준할 때는 입매를 다문다.",
  "outfit_ko": "아이보리 짧은 궁수 전포와 녹색 불투명 상의, 어깨 보호대, 반바지와 긴 부츠",
  "equipment_ko": "접이식 대형 노포와 목제 사격표",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Thick white braid, mature 38-year-old face with subtle expression lines, green tie and folded siege crossbow."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 38세 성인 여성의 얼굴·골격과 `U24`의 독립적인 외형을 유지한다.
- 키 170 cm / B·W·H 90/65/94 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 은백색 #D9D9D2 굵은 땋은 머리와 짧은 옆머리, 녹색 머리끈. 눈: 금갈색 #B89C59, 여유 있고 날카로운 눈매.
- 접이식 대형 노포와 목제 사격표의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
