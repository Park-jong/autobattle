# U15 이유 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `grove_druid`.
- 예정 채택 경로: `characters/three_kingdoms/U15/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U15, Li Ru (이유), clearly adult woman aged 32.
BODY LOCK: I-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 170 cm, B/W/H 108/67/95 cm and I-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 170 cm barefoot; B/W/H 108/67/95 cm and I-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Left arm holds the closed sealed bamboo scroll, right hand holds one metal command plaque at waist height; tilt the head slightly while keeping posture controlled.
CORE IDENTIFIERS: Ink-gray hair tucked beneath a scholar cap, purple tassel, tired thoughtful gaze, sealed bamboo scroll.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U15",
  "name_ko": "이유",
  "name_en": "Li Ru",
  "runtime_id": "grove_druid",
  "sex_age": "Adult human woman, 32 years old",
  "role_faction_ko": "낙양의 금언책사 · 동탁군",
  "height_cm": 170,
  "measurements_B_W_H_cm": "108/67/95",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "I",
  "body_ko": "풍만한 상체와 좁은 허리, 조금 기울인 목의 성숙한 책사형",
  "skin_ko": "옅은 회빛이 도는 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "먹회색 #4A454E 긴 머리를 관 안으로 접어 올림, 자주색 술 장식",
  "eyes_ko": "탁한 자주색 #9A718B, 가늘고 피곤한 눈매",
  "face_expression_ko": "긴 타원형 얼굴과 얇은 눈썹. 피로한 눈가와 입을 다문 채 옆을 살피는 사려 깊은 인상.",
  "outfit_ko": "자주색 긴 소매의 짧은 관복, 불투명 검정 교차깃 안감, 옆트임 덧자락과 반바지",
  "equipment_ko": "봉인된 죽간과 금속 명령패",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Ink-gray hair tucked beneath a scholar cap, purple tassel, tired thoughtful gaze, sealed bamboo scroll."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 32세 성인 여성의 얼굴·골격과 `U15`의 독립적인 외형을 유지한다.
- 키 170 cm / B·W·H 108/67/95 cm / **I컵 폭유형**가 콘셉트와 일치한다.
- 머리: 먹회색 #4A454E 긴 머리를 관 안으로 접어 올림, 자주색 술 장식. 눈: 탁한 자주색 #9A718B, 가늘고 피곤한 눈매.
- 봉인된 죽간과 금속 명령패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
