# U07 황개 — 초상화 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `ember_slinger`.
- 예정 채택 경로: `characters/three_kingdoms/U07/portrait.png` (현재 파일 없음).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U07/illustration.png`). **현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U07, Huang Gai (황개), clearly adult woman aged 34.
BODY LOCK: H-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 171 cm, B/W/H 107/68/96 cm and H-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Huang Gai (U07) as the identity reference. Preserve the SAME adult face, hairstyle, hair color, eyes, skin, crown/hairpin placement, garment construction, faction colors and H-cup large body type. Do not import another character's face or body. The textual character brief is authoritative; if the supplied image conflicts with it, correct the full-body reference before making derived assets.
COMPOSITION — PORTRAIT:
Square 1:1 canvas, target 1254x1254. One head-and-upper-torso portrait, eye-level near-front three-quarter view with natural adult proportions. Keep complete head ornaments inside the frame and show the outfit neckline and shoulders with breathing room. For very long ornaments, zoom out enough to include them rather than clipping; lower-body props may remain outside this portrait crop. The same chest volume should be visible naturally within this crop, without zooming in on the chest. Preserve this facial description: 넓고 균형 잡힌 얼굴과 시원한 눈썹. 자신감 있는 큰 웃음과 눈가의 옅은 표정 주름.
IDENTITY AND EQUIPMENT CUES: High thick gray-white ponytail, muscular shoulders, red naval outfit, capped firepot.
Only show the top portion of attached equipment if naturally inside the crop. Do not pull every full-body prop into a hand beside the face. Hands may stay outside the portrait; no new hands, props or facial accessories.

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
- 채택 전신과 얼굴·장식·의상·체형이 같고, 초상 구도 안에서 머리 장식이 잘리지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
