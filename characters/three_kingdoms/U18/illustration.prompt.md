# U18 여몽 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `ember_smith`.
- 예정 채택 경로: `characters/three_kingdoms/U18/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U18, Lu Meng (여몽), clearly adult woman aged 28.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 174 cm, B/W/H 91/66/94 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 174 cm barefoot; B/W/H 91/66/94 cm and D-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Left arm supports the anchor-emblem shield slightly outward; right hand lowers the naval dao; the closed military book is secured at the belt.
CORE IDENTIFIERS: High black tied hair with white headcloth, anchor shield and compact white shoulder cloth.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U18",
  "name_ko": "여몽",
  "name_en": "Lu Meng",
  "runtime_id": "ember_smith",
  "sex_age": "Adult human woman, 28 years old",
  "role_faction_ko": "백의의 수군방패 · 오",
  "height_cm": 174,
  "measurements_B_W_H_cm": "91/66/94",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "중간 볼륨의 가슴과 발달한 등, 넓게 선 방호형",
  "skin_ko": "옅게 그을린 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "흑색 #282D32 머리를 높은 매듭으로 묶고 흰 두건",
  "eyes_ko": "갈청색 #6C8489, 단단하고 신중한 눈매",
  "face_expression_ko": "단단한 턱선과 낮게 정돈한 눈썹. 입을 다문 신중한 표정에 병서를 읽을 때 집중한 눈빛이 더해진다.",
  "outfit_ko": "백색 어깨 덧옷과 주홍 불투명 전투 상의, 작은 흉갑, 기마 반바지와 긴 갑편",
  "equipment_ko": "닻 문양 방패와 군도, 접힌 병서",
  "faction_palette_motifs_ko": "아이보리·주홍·금색 / 호랑이·물결",
  "identity_lock_en": "High black tied hair with white headcloth, anchor shield and compact white shoulder cloth."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 28세 성인 여성의 얼굴·골격과 `U18`의 독립적인 외형을 유지한다.
- 키 174 cm / B·W·H 91/66/94 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 흑색 #282D32 머리를 높은 매듭으로 묶고 흰 두건. 눈: 갈청색 #6C8489, 단단하고 신중한 눈매.
- 닻 문양 방패와 군도, 접힌 병서의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
