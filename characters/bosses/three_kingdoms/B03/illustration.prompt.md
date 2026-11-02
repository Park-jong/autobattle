# B03 곽사 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../../../three_kingdoms/ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `twin_mir`.
- 예정 채택 경로: `characters/bosses/three_kingdoms/B03/illustration.png` (생성 파일 저장됨).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: B03, Guo Si (곽사), clearly adult woman aged 29.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 170 cm, B/W/H 90/64/93 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 170 cm barefoot; B/W/H 90/64/93 cm and D-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Left hand holds the round iron command fan slightly outward, right hand rests near the cyan oath token; calm backward-balanced defensive stance.
CORE IDENTIFIERS: Silver-gray bob, left-side round hair metalwork, curved iron-blue shoulders and LEFT-hand round iron fan; cyan accent.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "B03",
  "name_ko": "곽사",
  "name_en": "Guo Si",
  "runtime_id": "twin_mir",
  "sex_age": "Adult human woman, 29 years old",
  "role_faction_ko": "서량의 철장막 · 동탁군",
  "height_cm": 170,
  "measurements_B_W_H_cm": "90/64/93",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "중간 볼륨의 가슴과 둥근 어깨선, 무게중심을 뒤로 둔 방호형",
  "skin_ko": "차가운 밝은 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "은회색 #B9BAC0 어깨 위 단발, 왼쪽 둥근 철장식",
  "eyes_ko": "옅은 청록색 #70A9A1, 무표정한 눈매",
  "face_expression_ko": "부드럽게 각진 타원형 얼굴과 가는 눈썹. 입을 다문 무표정, 상대의 발끝과 진로를 살피는 시선.",
  "outfit_ko": "검정 불투명 전투복 위 철청색 곡선 견갑, 청록 허리천, 갑편 덧치마와 반바지",
  "equipment_ko": "왼손 원형 철선과 청록 결의패",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Silver-gray bob, left-side round hair metalwork, curved iron-blue shoulders and LEFT-hand round iron fan; cyan accent."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 29세 성인 여성의 얼굴·골격과 `B03`의 독립적인 외형을 유지한다.
- 키 170 cm / B·W·H 90/64/93 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 은회색 #B9BAC0 어깨 위 단발, 왼쪽 둥근 철장식. 눈: 옅은 청록색 #70A9A1, 무표정한 눈매.
- 왼손 원형 철선과 청록 결의패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
