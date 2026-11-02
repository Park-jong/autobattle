# U17 법정 — 초상화 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `battle_chaplain`.
- 예정 채택 경로: `characters/three_kingdoms/U17/portrait.png` (생성 파일 저장됨).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U17/illustration.png`). 생성 시 같은 폴더 전신을 실제 참조로 첨부했다. 검수는 사용자가 진행한다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

같은 폴더 전신을 참조해 이미지를 생성했다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U17, Fa Zheng (법정), clearly adult woman aged 29.
BODY LOCK: H-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 166 cm, B/W/H 105/65/94 cm and H-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Fa Zheng (U17) as the identity reference. Preserve the SAME adult face, hairstyle, hair color, eyes, skin, crown/hairpin placement, garment construction, faction colors and H-cup large body type. Do not import another character's face or body. The textual character brief is authoritative; if the supplied image conflicts with it, correct the full-body reference before making derived assets.
COMPOSITION — PORTRAIT:
Square 1:1 canvas, target 1254x1254. One head-and-upper-torso portrait, eye-level near-front three-quarter view with natural adult proportions. Keep complete head ornaments inside the frame and show the outfit neckline and shoulders with breathing room. For very long ornaments, zoom out enough to include them rather than clipping; lower-body props may remain outside this portrait crop. The same chest volume should be visible naturally within this crop, without zooming in on the chest. Preserve this facial description: 좁은 턱과 반듯한 코. 상대의 상태를 살피듯 눈썹을 조금 모으고 확인을 마치면 짧게 웃는다.
IDENTITY AND EQUIPMENT CUES: Neat dark-brown low ponytail, white-jade hairpin and fan, green-white scholar outfit and medicine pouch.
Only show the top portion of attached equipment if naturally inside the crop. Do not pull every full-body prop into a hand beside the face. Hands may stay outside the portrait; no new hands, props or facial accessories.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U17",
  "name_ko": "법정",
  "name_en": "Fa Zheng",
  "runtime_id": "battle_chaplain",
  "sex_age": "Adult human woman, 29 years old",
  "role_faction_ko": "백옥의 군의책사 · 촉",
  "height_cm": 166,
  "measurements_B_W_H_cm": "105/65/94",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "H",
  "body_ko": "풍만한 상체와 단정한 어깨, 작은 동작의 성인 지원형",
  "skin_ko": "따뜻한 밝은 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "짙은 밤색 #574231 단정한 낮은 포니테일, 백옥 머리핀",
  "eyes_ko": "연녹색 #86A37C, 관찰하는 날카로운 눈매",
  "face_expression_ko": "좁은 턱과 반듯한 코. 상대의 상태를 살피듯 눈썹을 조금 모으고 확인을 마치면 짧게 웃는다.",
  "outfit_ko": "백녹색 짧은 책사 포와 불투명 민소매 교차깃 안감, 허리 약낭, 덧치마와 반바지",
  "equipment_ko": "백옥 지휘선과 약낭, 접이식 지도",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Neat dark-brown low ponytail, white-jade hairpin and fan, green-white scholar outfit and medicine pouch."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 29세 성인 여성의 얼굴·골격과 `U17`의 독립적인 외형을 유지한다.
- 키 166 cm / B·W·H 105/65/94 cm / **H컵 폭유형**가 콘셉트와 일치한다.
- 머리: 짙은 밤색 #574231 단정한 낮은 포니테일, 백옥 머리핀. 눈: 연녹색 #86A37C, 관찰하는 날카로운 눈매.
- 백옥 지휘선과 약낭, 접이식 지도의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 채택 전신과 얼굴·장식·의상·체형이 같고, 초상 구도 안에서 머리 장식이 잘리지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
