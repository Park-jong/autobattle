# U01 주창 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `iron_shieldbearer`.
- 예정 채택 경로: `characters/three_kingdoms/U01/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U01, Zhou Cang (주창), clearly adult woman aged 25.
BODY LOCK: C-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 166 cm, B/W/H 88/63/90 cm and C-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 166 cm barefoot; B/W/H 88/63/90 cm and C-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Left arm supports a peach-emblem shield slightly away from the torso, right hand lowers the short ring-pommel dao; show her grounded protective stance.
CORE IDENTIFIERS: Dark brown thick braid, peach-emblem shield, jade-green cloth; solid forearms and protective expression.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U01",
  "name_ko": "주창",
  "name_en": "Zhou Cang",
  "runtime_id": "iron_shieldbearer",
  "sex_age": "Adult human woman, 25 years old",
  "role_faction_ko": "도원 방패위 · 촉",
  "height_cm": 166,
  "measurements_B_W_H_cm": "88/63/90",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "C",
  "body_ko": "방패를 버티는 단단한 전완과 안정된 하체",
  "skin_ko": "햇볕에 그을린 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "흑갈색 #44332C 머리를 굵은 한 갈래로 묶고 녹색 매듭 장식",
  "eyes_ko": "갈색 #8B6942, 솔직하고 둥근 눈매",
  "face_expression_ko": "네모에 가까운 타원형 얼굴과 굵은 눈썹. 긴장할 때 입을 꾹 다물고 동료 앞에서는 수줍게 웃는다.",
  "outfit_ko": "초록 짧은 두루마기와 백색 교차깃 탑, 한쪽 견갑, 분할 덧치마와 반바지",
  "equipment_ko": "복숭아꽃 문양 방패와 짧은 환도",
  "faction_palette_motifs_ko": "백색·비취·금색 / 복숭아꽃·청룡",
  "identity_lock_en": "Dark brown thick braid, peach-emblem shield, jade-green cloth; solid forearms and protective expression."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 25세 성인 여성의 얼굴·골격과 `U01`의 독립적인 외형을 유지한다.
- 키 166 cm / B·W·H 88/63/90 cm / **C컵 중간형**가 콘셉트와 일치한다.
- 머리: 흑갈색 #44332C 머리를 굵은 한 갈래로 묶고 녹색 매듭 장식. 눈: 갈색 #8B6942, 솔직하고 둥근 눈매.
- 복숭아꽃 문양 방패와 짧은 환도의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
