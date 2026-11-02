# U14 서영 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `bear_warrior`.
- 예정 채택 경로: `characters/three_kingdoms/U14/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U14, Xu Rong (서영), clearly adult woman aged 29.
BODY LOCK: I-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 177 cm, B/W/H 110/70/99 cm and I-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 177 cm barefoot; B/W/H 110/70/99 cm and I-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Brace the one long-handled heavy dao with both hands angled down beside the right leg; maintain a broad grounded stance.
CORE IDENTIFIERS: Short tied purple-black hair, iron headband, large heavy blade and iron-gray single shoulder plate.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U14",
  "name_ko": "서영",
  "name_en": "Xu Rong",
  "runtime_id": "bear_warrior",
  "sex_age": "Adult human woman, 29 years old",
  "role_faction_ko": "서량의 중도 · 동탁군",
  "height_cm": 177,
  "measurements_B_W_H_cm": "110/70/99",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "I",
  "body_ko": "매우 풍만한 가슴과 넓은 어깨, 깊게 디딘 보폭의 장신 근력형",
  "skin_ko": "그을린 황갈색의 자연스러운 성인 인간 피부.",
  "hair_ko": "자주빛 흑발 #3F303D 목덜미의 짧은 묶음, 철제 머리띠",
  "eyes_ko": "적동색 #AC7054, 곧은 강한 눈매",
  "face_expression_ko": "각진 광대와 곧은 턱선. 눈썹을 수평으로 두고 앞을 바라보는 담담하고 강직한 표정.",
  "outfit_ko": "철회색 한쪽 견갑과 흑자주 불투명 전투 탑, 복부의 좁은 노출, 기마 반바지와 장갑 장화",
  "equipment_ko": "양손 장병도와 서량 군패",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Short tied purple-black hair, iron headband, large heavy blade and iron-gray single shoulder plate."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 29세 성인 여성의 얼굴·골격과 `U14`의 독립적인 외형을 유지한다.
- 키 177 cm / B·W·H 110/70/99 cm / **I컵 폭유형**가 콘셉트와 일치한다.
- 머리: 자주빛 흑발 #3F303D 목덜미의 짧은 묶음, 철제 머리띠. 눈: 적동색 #AC7054, 곧은 강한 눈매.
- 양손 장병도와 서량 군패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
