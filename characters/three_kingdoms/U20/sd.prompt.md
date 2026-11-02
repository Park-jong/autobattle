# U20 장료 — 전투 SD 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **이미지 생성 · 사용자 검수 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `rift_stalker`.
- 예정 채택 경로: `characters/three_kingdoms/U20/sd.png` (생성 파일 저장됨).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U20/illustration.png`). 생성 시 같은 폴더 전신을 실제 참조로 첨부했다. 검수는 사용자가 진행한다.
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

같은 폴더 전신을 참조해 이미지를 생성했다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U20, Zhang Liao (장료), clearly adult woman aged 28.
BODY LOCK: A-cup small-bust adult. Keep the chest genuinely small and nearly flat, never padded into a C/D silhouette. Preserve the specific adult shoulders, muscles, hips and height in the brief; a small bust is not a childlike body.
Use height 175 cm, B/W/H 78/62/90 cm and A-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Zhang Liao (U20) as the identity reference. Preserve the SAME adult face, hair silhouette, eyes, skin, costume, ornaments, faction colors and A-cup small body category. This is the same adult woman simplified for gameplay, not a younger version.
COMPOSITION — BATTLE SD:
Square 1:1 canvas, target 1254x1254. Exactly one complete full-body game token with compact 2.8-to-3-head-tall proportions: head about one third of total height and chin-to-boot length about two head heights. Simplify buckles, patterns and fabric into clear shapes while preserving a mature character identity. Convey the original 175 cm adult build and individual muscles/shoulders/hips through compact proportions; do not use full-body 7-head proportions here. Keep the small / A-cup category recognizable through the opaque torso silhouette, without exaggerating it beyond the full-body design.
FACE AND ORIENTATION: Face and torso turn toward IMAGE RIGHT. Keep each anatomical left/right hand assignment unchanged; rotation does not swap hands. The enemy renderer may mirror the finished sprite later. Eyes and eyebrows remain readable at small scale.
CHARACTER-SPECIFIC EQUIPMENT POSE: Both hands hold one crescent halberd pointing to image right; no lightning trail baked into the sprite.
CORE IDENTIFIERS: Long dark blue-gray ponytail, silver hair ring, cobalt light armor and crescent halberd; flat A-cup adult body.
Use a stable idle-ready stance, not a mid-attack frame. Keep complete boots, hair ornaments and the actual weapon within roughly 10 percent margins. Scale or angle long weapons within the square instead of clipping, detaching or multiplying them. Do not hide the entire torso behind shields.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U20",
  "name_ko": "장료",
  "name_en": "Zhang Liao",
  "runtime_id": "rift_stalker",
  "sex_age": "Adult human woman, 28 years old",
  "role_faction_ko": "합비의 청뢰 · 위",
  "height_cm": 175,
  "measurements_B_W_H_cm": "78/62/90",
  "bust_type": "small",
  "bust_type_ko": "빈유형",
  "cup_size": "A",
  "body_ko": "평평한 상체와 긴 다리, 탄력 있는 허리의 기동형",
  "skin_ko": "차가운 밝은 베이지색의 자연스러운 성인 인간 피부.",
  "hair_ko": "짙은 청회색 #3C4C62 긴 포니테일, 매끈한 은색 고리",
  "eyes_ko": "하늘청색 #719BC3, 서늘하고 길게 뻗은 눈매",
  "face_expression_ko": "가늘고 긴 얼굴과 뚜렷한 코끝. 감정을 절제한 표정, 목표를 정하면 시선이 곧게 고정된다.",
  "outfit_ko": "코발트 짧은 전포와 검정 불투명 하이넥 상의, 비대칭 견갑, 덧자락과 반바지",
  "equipment_ko": "청뢰 월아극과 푸른 매듭 군패",
  "faction_palette_motifs_ko": "먹색·코발트·은색 / 흑봉·현무",
  "identity_lock_en": "Long dark blue-gray ponytail, silver hair ring, cobalt light armor and crescent halberd; flat A-cup adult body."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 28세 성인 여성의 얼굴·골격과 `U20`의 독립적인 외형을 유지한다.
- 키 175 cm / B·W·H 78/62/90 cm / **A컵 빈유형**가 콘셉트와 일치한다.
- 머리: 짙은 청회색 #3C4C62 긴 포니테일, 매끈한 은색 고리. 눈: 하늘청색 #719BC3, 서늘하고 길게 뻗은 눈매.
- 청뢰 월아극과 푸른 매듭 군패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 3등신·화면 오른쪽 방향·전신과 같은 의상 윤곽을 확인한다. 공격 이펙트는 SD에 구워 넣지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
