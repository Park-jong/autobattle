# U19 손상향 — 초상화 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `ember_bladedancer`.
- 예정 채택 경로: `characters/three_kingdoms/U19/portrait.png` (생성 파일 저장됨).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U19/illustration.png`). 생성 시 같은 폴더 전신을 실제 참조로 첨부했다. 검수는 사용자가 진행한다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

같은 폴더 전신을 참조해 이미지를 생성했다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U19, Sun Shangxiang (손상향), clearly adult woman aged 23.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 167 cm, B/W/H 89/62/90 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Sun Shangxiang (U19) as the identity reference. Preserve the SAME adult face, hairstyle, hair color, eyes, skin, crown/hairpin placement, garment construction, faction colors and D-cup medium body type. Do not import another character's face or body. The textual character brief is authoritative; if the supplied image conflicts with it, correct the full-body reference before making derived assets.
COMPOSITION — PORTRAIT:
Square 1:1 canvas, target 1254x1254. One head-and-upper-torso portrait, eye-level near-front three-quarter view with natural adult proportions. Keep complete head ornaments inside the frame and show the outfit neckline and shoulders with breathing room. For very long ornaments, zoom out enough to include them rather than clipping; lower-body props may remain outside this portrait crop. The same chest volume should be visible naturally within this crop, without zooming in on the chest. Preserve this facial description: 선명한 성인 얼굴 윤곽과 시원한 입매. 자신 있게 웃고 대련 상대에게 눈썹을 치켜올린다.
IDENTITY AND EQUIPMENT CUES: Red-brown high ponytail, gold swallow ornament, twin blades and folded backup bow.
Only show the top portion of attached equipment if naturally inside the crop. Do not pull every full-body prop into a hand beside the face. Hands may stay outside the portrait; no new hands, props or facial accessories.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U19",
  "name_ko": "손상향",
  "name_en": "Sun Shangxiang",
  "runtime_id": "ember_bladedancer",
  "sex_age": "Adult human woman, 23 years old",
  "role_faction_ko": "궁요희의 쌍인 · 오",
  "height_cm": 167,
  "measurements_B_W_H_cm": "89/62/90",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "적당한 가슴 볼륨과 가는 허리, 도약에 익숙한 하체",
  "skin_ko": "건강한 복숭아빛의 자연스러운 성인 인간 피부.",
  "hair_ko": "적갈색 #B35846 높은 포니테일, 금색 제비 장식",
  "eyes_ko": "밝은 호박색 #D4A24D, 자신감 있게 올라간 눈매",
  "face_expression_ko": "선명한 성인 얼굴 윤곽과 시원한 입매. 자신 있게 웃고 대련 상대에게 눈썹을 치켜올린다.",
  "outfit_ko": "주홍 짧은 전투 재킷과 검정 불투명 교차깃 탑, 한쪽 어깨 노출, 짧은 치마와 반바지",
  "equipment_ko": "제비꼬리 쌍도와 등에 고정한 접이식 활",
  "faction_palette_motifs_ko": "아이보리·주홍·금색 / 호랑이·물결",
  "identity_lock_en": "Red-brown high ponytail, gold swallow ornament, twin blades and folded backup bow."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 23세 성인 여성의 얼굴·골격과 `U19`의 독립적인 외형을 유지한다.
- 키 167 cm / B·W·H 89/62/90 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 적갈색 #B35846 높은 포니테일, 금색 제비 장식. 눈: 밝은 호박색 #D4A24D, 자신감 있게 올라간 눈매.
- 제비꼬리 쌍도와 등에 고정한 접이식 활의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 채택 전신과 얼굴·장식·의상·체형이 같고, 초상 구도 안에서 머리 장식이 잘리지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
