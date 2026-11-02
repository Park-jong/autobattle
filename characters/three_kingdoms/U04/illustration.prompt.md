# U04 고순 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `moss_warden`.
- 예정 채택 경로: `characters/three_kingdoms/U04/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U04, Gao Shun (고순), clearly adult woman aged 28.
BODY LOCK: A-cup small-bust adult. Keep the chest genuinely small and nearly flat, never padded into a C/D silhouette. Preserve the specific adult shoulders, muscles, hips and height in the brief; a small bust is not a childlike body.
Use height 172 cm, B/W/H 79/63/90 cm and A-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 172 cm barefoot; B/W/H 79/63/90 cm and A-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Plant the rectangular greatshield in front of the left side with left forearm behind its grip; right hand holds the command token close to the waist; keep face and torso readable.
CORE IDENTIFIERS: Short charcoal bob, straight rectangular shield, iron-gray armor and restrained expression.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U04",
  "name_ko": "고순",
  "name_en": "Gao Shun",
  "runtime_id": "moss_warden",
  "sex_age": "Adult human woman, 28 years old",
  "role_faction_ko": "함진영의 철벽 · 동탁군",
  "height_cm": 172,
  "measurements_B_W_H_cm": "79/63/90",
  "bust_type": "small",
  "bust_type_ko": "빈유형",
  "cup_size": "A",
  "body_ko": "작은 가슴과 넓은 어깨, 낮은 자세를 유지하는 방진형",
  "skin_ko": "중성 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "회흑색 #47454A 짧은 보브, 왼쪽 관자놀이 은색 철편",
  "eyes_ko": "회색 #8D939B, 수평의 엄격한 눈매",
  "face_expression_ko": "뚜렷한 광대와 단단한 턱선. 표정 변화가 적고 상대를 정면으로 보는 엄격한 인상.",
  "outfit_ko": "검정 불투명 교차깃 군복과 철회색 어깨 갑옷, 자주색 허리끈, 짧은 갑편 덧치마와 반바지",
  "equipment_ko": "직사각 대방패와 함진영 지휘패",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Short charcoal bob, straight rectangular shield, iron-gray armor and restrained expression."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 28세 성인 여성의 얼굴·골격과 `U04`의 독립적인 외형을 유지한다.
- 키 172 cm / B·W·H 79/63/90 cm / **A컵 빈유형**가 콘셉트와 일치한다.
- 머리: 회흑색 #47454A 짧은 보브, 왼쪽 관자놀이 은색 철편. 눈: 회색 #8D939B, 수평의 엄격한 눈매.
- 직사각 대방패와 함진영 지휘패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
