# U16 초선 — 전신 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성**.
- 스킨 / 데이터 ID: `three_kingdoms` / `shadow_panther`.
- 예정 채택 경로: `characters/three_kingdoms/U16/illustration.png` (현재 파일 없음).
- 참조: 없음 — 이 캐릭터의 신규 전신 디자인. modern 원화는 선택적으로 화풍만 참고하며 얼굴·체형·장비를 복사하지 않는다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

전신을 먼저 생성·검수해 채택한 뒤에만 이 폴더의 초상화·SD 프롬프트를 사용한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U16, Diao Chan (초선), clearly adult woman aged 24.
BODY LOCK: D-cup medium-bust adult, within C-to-D only. Keep a natural moderate chest projection, clearly distinct from both flat A-cup and H-to-K silhouettes. Preserve her individual shoulder width, muscles and hips.
Use height 165 cm, B/W/H 88/60/90 cm and D-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

COMPOSITION — FULL BODY:
Vertical 2:3 canvas, target 1024x1536. Natural adult proportions about 7 to 8 heads tall; eye-level near-front three-quarter view. Include complete head ornaments, hair, both feet and all principal weapons with 8-12 percent clean margins. Her height is 165 cm barefoot; B/W/H 88/60/90 cm and D-cup are design targets, not text to print. Keep tall, stocky, slender or muscular proportions specific to this character.
CHARACTER-SPECIFIC POSE: Stand in a poised dancer's guard; right hand reveals one short blade clear of its opaque silk sleeve, left hand gathers the sleeve cloth near the waist; no spinning fabric cloud.
CORE IDENTIFIERS: Two-loop dark-brown hair arrangement with long back hair, crescent hairpin and lavender opaque sleeve costume.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U16",
  "name_ko": "초선",
  "name_en": "Diao Chan",
  "runtime_id": "shadow_panther",
  "sex_age": "Adult human woman, 24 years old",
  "role_faction_ko": "월하의 비단칼 · 동탁군",
  "height_cm": 165,
  "measurements_B_W_H_cm": "88/60/90",
  "bust_type": "medium",
  "bust_type_ko": "중간형",
  "cup_size": "D",
  "body_ko": "길고 유연한 팔다리와 가는 허리의 무희형",
  "skin_ko": "복숭아빛 상아색의 자연스러운 성인 인간 피부.",
  "hair_ko": "진갈색 #503D48 장발을 두 갈래 고리로 틀고 긴 뒷머리를 늘임",
  "eyes_ko": "분홍 자주색 #B57298, 웃음 아래 경계가 보이는 눈매",
  "face_expression_ko": "부드러운 성인 턱선과 또렷한 입술. 공연할 때는 밝은 미소, 임무 때는 시선과 입매가 차분해진다.",
  "outfit_ko": "연자주 어깨 트임 무희 겸 첩보복, 불투명 교차깃 상의, 긴 소매천, 덧치마와 안쪽 반바지",
  "equipment_ko": "비단 소매에 숨긴 짧은 칼과 월형 비녀",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Two-loop dark-brown hair arrangement with long back hair, crescent hairpin and lavender opaque sleeve costume."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 24세 성인 여성의 얼굴·골격과 `U16`의 독립적인 외형을 유지한다.
- 키 165 cm / B·W·H 88/60/90 cm / **D컵 중간형**가 콘셉트와 일치한다.
- 머리: 진갈색 #503D48 장발을 두 갈래 고리로 틀고 긴 뒷머리를 늘임. 눈: 분홍 자주색 #B57298, 웃음 아래 경계가 보이는 눈매.
- 비단 소매에 숨긴 짧은 칼과 월형 비녀의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 7~8등신·2:3 구도와 장식·무기·발끝이 잘리지 않는지 확인한다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
