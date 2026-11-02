# U02 요화 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `arena_recruit`.
- 예정 채택 경로: `characters/three_kingdoms/U02/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U02, Liao Hua (요화), clearly adult woman aged 26.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 169 cm, B/W/H 91/64/92 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 169 cm barefoot; B/W/H 91/64/92 cm and D-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Hold one broad pudao with both hands in a low diagonal guard, right hand near the upper grip and left hand lower on the shaft; the repaired banner is secured behind the back.
CORE IDENTIFIERS: Dark green tied shoulder-length hair, worn white headband, repaired banner and broad blade.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U02",
  "name_ko": "요화",
  "name_en": "Liao Hua",
  "runtime_id": "arena_recruit",
  "sex_age": "Adult human woman, 26 years old",
  "role_faction_ko": "불굴의 선봉 · 촉",
  "height_cm": 169,
  "measurements_B_W_H_cm": "91/64/92",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "균형 잡힌 어깨와 단련한 허벅지의 근접 전투형",
  "skin_ko": "따뜻한 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "암녹색 #35483B 어깨 길이 묶음머리, 낡은 흰 머리띠",
  "eyes_ko": "호박색 #B38B47, 쉽게 꺾이지 않는 눈빛",
  "face_expression_ko": "살짝 각진 턱과 반듯한 콧대. 이를 드러내지 않는 끈질긴 미소, 훈련 때는 눈썹에 힘이 들어간다.",
  "outfit_ko": "백녹색 민소매 교차깃 전투복, 짧은 흉갑과 허리 갑편, 한쪽 허벅지 트임 덧자락과 반바지",
  "equipment_ko": "길게 날을 세운 박도와 수선 자국이 남은 군기",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Dark green tied shoulder-length hair, worn white headband, repaired banner and broad blade."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 26세 성인 여성의 얼굴·골격과 `U02`의 독립적인 외형을 유지한다.
- 키 169 cm / B·W·H 91/64/92 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 암녹색 #35483B 어깨 길이 묶음머리, 낡은 흰 머리띠. 눈: 호박색 #B38B47, 쉽게 꺾이지 않는 눈빛.
- 길게 날을 세운 박도와 수선 자국이 남은 군기의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
