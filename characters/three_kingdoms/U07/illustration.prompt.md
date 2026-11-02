# U07 황개 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `ember_slinger`.
- 예정 채택 경로: `characters/three_kingdoms/U07/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U07, Huang Gai (황개), clearly adult woman aged 34.
BODY LOCK: H-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 171 cm, B/W/H 107/68/96 cm and H-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 171 cm barefoot; B/W/H 107/68/96 cm and H-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Right hand holds one capped firepot beside the hip, not raised for a throw; left hand carries a short iron flail low and away from the legs.
CORE IDENTIFIERS: High thick gray-white ponytail, muscular shoulders, red naval outfit, capped firepot.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U07",
  "name_ko": "황개",
  "name_en": "Huang Gai",
  "runtime_id": "ember_slinger",
  "sex_age": "Adult human woman, 34 years old",
  "role_faction_ko": "화선의 노장 · 오",
  "height_cm": 171,
  "measurements_B_W_H_cm": "107/68/96",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "H",
  "body_ko": "풍만한 가슴과 발달한 어깨·전완의 성인 근력형",
  "skin_ko": "건강하게 그을린 구리빛의 자연스러운 성인 인간 피부.",
  "hair_ko": "회백색 #BFC3BF 긴 머리를 굵게 올려 묶고 주홍 머리끈",
  "eyes_ko": "적갈색 #9B5544, 웃음 주름이 살짝 잡히는 강한 눈매",
  "face_expression_ko": "넓고 균형 잡힌 얼굴과 시원한 눈썹. 자신감 있는 큰 웃음과 눈가의 옅은 표정 주름.",
  "outfit_ko": "주홍 민소매 수군복과 검은 불투명 흉부 안감, 허리 갑편, 짧은 전투 반바지, 긴 완갑",
  "equipment_ko": "화약 항아리와 짧은 철편",
  "faction_palette_motifs_ko": "아이보리·주홍·금색 / 호랑이·물결",
  "identity_lock_en": "High thick gray-white ponytail, muscular shoulders, red naval outfit, capped firepot."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 34세 성인 여성의 얼굴·골격과 `U07`의 독립적인 외형을 유지한다.
- 키 171 cm / B·W·H 107/68/96 cm / **H컵 폭유형**가 콘셉트와 일치한다.
- 머리: 회백색 #BFC3BF 긴 머리를 굵게 올려 묶고 주홍 머리끈. 눈: 적갈색 #9B5544, 웃음 주름이 살짝 잡히는 강한 눈매.
- 화약 항아리와 짧은 철편의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
