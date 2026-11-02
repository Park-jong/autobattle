# C01 유비 — 초상화 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `cmd_harten`.
- 예정 채택 경로: `characters/three_kingdoms/C01/portrait.png` (현재 파일 없음).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/C01/illustration.png`). **현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: C01, Liu Bei (유비), clearly adult woman aged 28.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 168 cm, B/W/H 90/63/92 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Liu Bei (C01) as the identity reference. Preserve the SAME adult face, hairstyle, hair color, eyes, skin, crown/hairpin placement, garment construction, faction colors and D-cup medium body type. Do not import another character's face or body. The textual character brief is authoritative; if the supplied image conflicts with it, correct the full-body reference before making derived assets.
COMPOSITION — PORTRAIT:
Square 1:1 canvas, target 1254x1254. One head-and-upper-torso portrait, eye-level near-front three-quarter view with natural adult proportions. Keep complete head ornaments inside the frame and show the outfit neckline and shoulders with breathing room. For very long ornaments, zoom out enough to include them rather than clipping; lower-body props may remain outside this portrait crop. The same chest volume should be visible naturally within this crop, without zooming in on the chest. Preserve this facial description: 부드러운 타원형 얼굴과 단정한 입매. 다정하게 미소 짓다가도 대열이 위험하면 눈썹을 단단히 모은다.
IDENTITY AND EQUIPMENT CUES: Peach-blossom jade hairpin, low brown braid, paired straight swords; warm and resolute ruler.
Only show the top portion of attached equipment if naturally inside the crop. Do not pull every full-body prop into a hand beside the face. Hands may stay outside the portrait; no new hands, props or facial accessories.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "C01",
  "name_ko": "유비",
  "name_en": "Liu Bei",
  "runtime_id": "cmd_harten",
  "sex_age": "Adult human woman, 28 years old",
  "role_faction_ko": "도원맹약의 군주 · 촉",
  "height_cm": 168,
  "measurements_B_W_H_cm": "90/63/92",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "부드러운 어깨와 탄탄한 하체, 두 자루 검을 반듯하게 든 균형형",
  "skin_ko": "따뜻한 상아색의 자연스러운 성인 인간 피부.",
  "hair_ko": "밤갈색 #624238 장발을 낮게 땋고 복숭아꽃 옥비녀로 고정",
  "eyes_ko": "비취색 #57946D, 부드럽지만 흔들림 없는 눈매",
  "face_expression_ko": "부드러운 타원형 얼굴과 단정한 입매. 다정하게 미소 짓다가도 대열이 위험하면 눈썹을 단단히 모은다.",
  "outfit_ko": "백색 교차깃 상의와 비취색 짧은 견갑, 어깨 트임 망토, 금실 복숭아 문양 덧치마와 안쪽 반바지, 무릎 장화",
  "equipment_ko": "한 쌍의 쌍고검과 복숭아꽃 매듭 군기",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Peach-blossom jade hairpin, low brown braid, paired straight swords; warm and resolute ruler."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 28세 성인 여성의 얼굴·골격과 `C01`의 독립적인 외형을 유지한다.
- 키 168 cm / B·W·H 90/63/92 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 밤갈색 #624238 장발을 낮게 땋고 복숭아꽃 옥비녀로 고정. 눈: 비취색 #57946D, 부드럽지만 흔들림 없는 눈매.
- 한 쌍의 쌍고검과 복숭아꽃 매듭 군기의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 채택 전신과 얼굴·장식·의상·체형이 같고, 초상 구도 안에서 머리 장식이 잘리지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
