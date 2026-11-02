# U03 관평 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `legion_crossbow`.
- 예정 채택 경로: `characters/three_kingdoms/U03/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U03, Guan Ping (관평), clearly adult woman aged 23.
BODY LOCK: A-cup small-bust adult. Keep the chest genuinely small and nearly flat, never padded into a C/D silhouette. Preserve the specific adult shoulders, muscles, hips and height in the brief; a small bust is not a childlike body.
Use height 167 cm, B/W/H 77/61/87 cm and A-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 167 cm barefoot; B/W/H 77/61/87 cm and A-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Support the large decorated repeating crossbow with both hands at waist-to-chest height, aiming diagonally away from the face; quiver secured at the waist.
CORE IDENTIFIERS: Dark teal small high bun, silver-jade dragon carving on a repeating crossbow, flat A-cup torso.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U03",
  "name_ko": "관평",
  "name_en": "Guan Ping",
  "runtime_id": "legion_crossbow",
  "sex_age": "Adult human woman, 23 years old",
  "role_faction_ko": "청룡 쇠뇌수 · 촉",
  "height_cm": 167,
  "measurements_B_W_H_cm": "77/61/87",
  "bust_type": "small",
  "bust_type_ko": "빈유형",
  "cup_size": "A",
  "body_ko": "평평한 상체와 긴 팔, 침착하게 조준하는 사수 체형",
  "skin_ko": "밝은 상아색의 자연스러운 성인 인간 피부.",
  "hair_ko": "청흑색 #253F42 생머리를 작은 높은 경단으로 묶고 짧은 옆머리",
  "eyes_ko": "청록색 #4D9991, 반듯한 눈매",
  "face_expression_ko": "정돈된 긴 타원형 얼굴, 반듯한 눈썹과 다문 입. 조준할 때 고개를 조금 기울인다.",
  "outfit_ko": "청록 짧은 포와 백색 하이넥 민소매 상의, 얇은 청룡 견갑, 활동성 있는 반바지와 덧치마",
  "equipment_ko": "청룡 조각이 달린 대형 연노와 허리 화살통",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Dark teal small high bun, silver-jade dragon carving on a repeating crossbow, flat A-cup torso."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 23세 성인 여성의 얼굴·골격과 `U03`의 독립적인 외형을 유지한다.
- 키 167 cm / B·W·H 77/61/87 cm / **A컵 빈유형**가 콘셉트와 일치한다.
- 머리: 청흑색 #253F42 생머리를 작은 높은 경단으로 묶고 짧은 옆머리. 눈: 청록색 #4D9991, 반듯한 눈매.
- 청룡 조각이 달린 대형 연노와 허리 화살통의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
