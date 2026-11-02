# U21 하후연 — 초상화 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `void_sniper`.
- 예정 채택 경로: `characters/three_kingdoms/U21/portrait.png` (현재 파일 없음).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U21/illustration.png`). **현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U21, Xiahou Yuan (하후연), clearly adult woman aged 27.
BODY LOCK: C-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 171 cm, B/W/H 88/63/91 cm and C-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Xiahou Yuan (U21) as the identity reference. Preserve the SAME adult face, hairstyle, hair color, eyes, skin, crown/hairpin placement, garment construction, faction colors and C-cup medium body type. Do not import another character's face or body. The textual character brief is authoritative; if the supplied image conflicts with it, correct the full-body reference before making derived assets.
COMPOSITION — PORTRAIT:
Square 1:1 canvas, target 1254x1254. One head-and-upper-torso portrait, eye-level near-front three-quarter view with natural adult proportions. Keep complete head ornaments inside the frame and show the outfit neckline and shoulders with breathing room. For very long ornaments, zoom out enough to include them rather than clipping; lower-body props may remain outside this portrait crop. The same chest volume should be visible naturally within this crop, without zooming in on the chest. Preserve this facial description: 긴 턱과 잘 드러나는 광대. 먼 곳을 볼 때 눈을 살짝 좁히고 동료에게는 가볍게 웃는다.
IDENTITY AND EQUIPMENT CUES: Short gray-brown side ponytail, blue feather ornament, long blue bow and three-pronged arrow feathers.
Only show the top portion of attached equipment if naturally inside the crop. Do not pull every full-body prop into a hand beside the face. Hands may stay outside the portrait; no new hands, props or facial accessories.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U21",
  "name_ko": "하후연",
  "name_en": "Xiahou Yuan",
  "runtime_id": "void_sniper",
  "sex_age": "Adult human woman, 27 years old",
  "role_faction_ko": "천리의 청궁 · 위",
  "height_cm": 171,
  "measurements_B_W_H_cm": "88/63/91",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "C",
  "body_ko": "중간 볼륨의 가슴과 긴 팔, 곧은 등선의 사수형",
  "skin_ko": "햇볕에 그을린 밀빛의 자연스러운 성인 인간 피부.",
  "hair_ko": "회갈색 #817B72 짧은 옆묶음, 파란 깃 장식",
  "eyes_ko": "남청색 #547FA9, 먼 곳을 꿰뚫는 눈매",
  "face_expression_ko": "긴 턱과 잘 드러나는 광대. 먼 곳을 볼 때 눈을 살짝 좁히고 동료에게는 가볍게 웃는다.",
  "outfit_ko": "남색 짧은 궁수 포와 불투명 회색 민소매 상의, 손가락 보호 장갑, 반바지와 얇은 덧치마",
  "equipment_ko": "긴 청색 각궁과 세 갈래 깃 화살",
  "faction_palette_motifs_ko": "먹색·코발트·은색 / 흑봉·현무",
  "identity_lock_en": "Short gray-brown side ponytail, blue feather ornament, long blue bow and three-pronged arrow feathers."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 27세 성인 여성의 얼굴·골격과 `U21`의 독립적인 외형을 유지한다.
- 키 171 cm / B·W·H 88/63/91 cm / **C컵 중간형**가 콘셉트와 일치한다.
- 머리: 회갈색 #817B72 짧은 옆묶음, 파란 깃 장식. 눈: 남청색 #547FA9, 먼 곳을 꿰뚫는 눈매.
- 긴 청색 각궁과 세 갈래 깃 화살의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 채택 전신과 얼굴·장식·의상·체형이 같고, 초상 구도 안에서 머리 장식이 잘리지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
