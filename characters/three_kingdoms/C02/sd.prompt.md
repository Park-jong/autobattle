# C02 손권 — 전투 SD 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `cmd_isera`.
- 예정 채택 경로: `characters/three_kingdoms/C02/sd.png` (현재 파일 없음).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/C02/illustration.png`). **현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: C02, Sun Quan (손권), clearly adult woman aged 24.
BODY LOCK: A-cup small-bust adult. Keep the chest genuinely small and nearly flat, never padded into a C/D silhouette. Preserve the specific adult shoulders, muscles, hips and height in the brief; a small bust is not a childlike body.
Use height 162 cm, B/W/H 78/60/86 cm and A-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Sun Quan (C02) as the identity reference. Preserve the SAME adult face, hair silhouette, eyes, skin, costume, ornaments, faction colors and A-cup small body category. This is the same adult woman simplified for gameplay, not a younger version.
COMPOSITION — BATTLE SD:
Square 1:1 canvas, target 1254x1254. Exactly one complete full-body game token with compact 2.8-to-3-head-tall proportions: head about one third of total height and chin-to-boot length about two head heights. Simplify buckles, patterns and fabric into clear shapes while preserving a mature character identity. Convey the original 162 cm adult build and individual muscles/shoulders/hips through compact proportions; do not use full-body 7-head proportions here. Keep the small / A-cup category recognizable through the opaque torso silhouette, without exaggerating it beyond the full-body design.
FACE AND ORIENTATION: Face and torso turn toward IMAGE RIGHT. Keep each anatomical left/right hand assignment unchanged; rotation does not swap hands. The enemy renderer may mirror the finished sprite later. Eyes and eyebrows remain readable at small scale.
CHARACTER-SPECIFIC EQUIPMENT POSE: Present the dao toward image right while the closed command fan stays near the left hip; tiger ornament remains visible.
CORE IDENTIFIERS: Red-brown asymmetric braided bob, gold tiger hairpin, turquoise eyes and unmistakably flat A-cup silhouette. The command fan is a hand-held folding fan, not a boat.
Use a stable idle-ready stance, not a mid-attack frame. Keep complete boots, hair ornaments and the actual weapon within roughly 10 percent margins. Scale or angle long weapons within the square instead of clipping, detaching or multiplying them. Do not hide the entire torso behind shields.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "C02",
  "name_ko": "손권",
  "name_en": "Sun Quan",
  "runtime_id": "cmd_isera",
  "sex_age": "Adult human woman, 24 years old",
  "role_faction_ko": "벽안의 강동 군주 · 오",
  "height_cm": 162,
  "measurements_B_W_H_cm": "78/60/86",
  "bust_type": "small",
  "bust_type_ko": "빈유형",
  "cup_size": "A",
  "body_ko": "작고 평평한 가슴, 좁은 어깨와 날렵한 허리, 곧게 선 작은 체격의 성인 지휘관",
  "skin_ko": "밝은 복숭아빛의 자연스러운 성인 인간 피부.",
  "hair_ko": "적갈색 #AE563E 단발을 한쪽만 땋아 금색 호랑이 비녀로 고정",
  "eyes_ko": "청록색 #419F9A, 시선이 또렷한 벽안",
  "face_expression_ko": "짧은 타원형 얼굴과 또렷한 성인 턱선. 턱을 살짝 들고 자신 있게 웃으며 검토할 때 입술을 다문다.",
  "outfit_ko": "주홍색 짧은 지휘 포와 검정 불투명 민소매 교차깃 상의, 금장 허리띠, 앞이 갈라진 덧치마와 반바지, 경량 장화",
  "equipment_ko": "고정도와 호랑이 인장, 접이식 수군 지휘선",
  "faction_palette_motifs_ko": "아이보리·주홍·금색 / 호랑이·물결",
  "identity_lock_en": "Red-brown asymmetric braided bob, gold tiger hairpin, turquoise eyes and unmistakably flat A-cup silhouette. The command fan is a hand-held folding fan, not a boat."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 24세 성인 여성의 얼굴·골격과 `C02`의 독립적인 외형을 유지한다.
- 키 162 cm / B·W·H 78/60/86 cm / **A컵 빈유형**가 콘셉트와 일치한다.
- 머리: 적갈색 #AE563E 단발을 한쪽만 땋아 금색 호랑이 비녀로 고정. 눈: 청록색 #419F9A, 시선이 또렷한 벽안.
- 고정도와 호랑이 인장, 접이식 수군 지휘선의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 3등신·화면 오른쪽 방향·전신과 같은 의상 윤곽을 확인한다. 공격 이펙트는 SD에 구워 넣지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
