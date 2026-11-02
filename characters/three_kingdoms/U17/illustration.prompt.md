# U17 법정 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `battle_chaplain`.
- 예정 채택 경로: `characters/three_kingdoms/U17/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U17, Fa Zheng (법정), clearly adult woman aged 29.
BODY LOCK: H-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 166 cm, B/W/H 105/65/94 cm and H-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 166 cm barefoot; B/W/H 105/65/94 cm and H-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Right hand opens a small white-jade command fan at chest height without covering the face; left hand rests on a secured medicine pouch, folded map remains attached at the belt.
CORE IDENTIFIERS: Neat dark-brown low ponytail, white-jade hairpin and fan, green-white scholar outfit and medicine pouch.

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
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
