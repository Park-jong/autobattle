# U30 여포 — 전투 SD 생성 프롬프트

[캐릭터 콘셉트](README.md) · [공통 작화 기준](../ART_DIRECTION.md)

- 상태: **프롬프트 작성 완료 · 이미지 미생성 · 전신 참조 대기**.
- 스킨 / 데이터 ID: `three_kingdoms` / `elder_treeking`.
- 예정 채택 경로: `characters/three_kingdoms/U30/sd.png` (현재 파일 없음).
- 참조: 같은 폴더의 채택 전신 `illustration.png` (`characters/three_kingdoms/U30/illustration.png`). **현재 파일 없음: 전신 생성·채택 후 실제 이미지를 첨부해야 실행 가능.**
- 향후 생성 도구 옵션: `transparent_background: true`. 배경을 투명하게 보이도록 칠하는 대신 실제 알파 채널로 출력한다.
- 이 문서는 준비된 프롬프트이며 이미지 생성 실행 기록이 아니다.

참조 전신이 아직 없으므로 현재는 프롬프트 준비 상태다. 파일명만 프롬프트에 적는 것으로 참조가 전달되지 않으며, 생성 시 채택 전신 파일을 실제 이미지 입력으로 첨부한다.

## 실행 프롬프트

```text
Create one original production character asset for YEONHWA THREE KINGDOMS, a fantasy Three Kingdoms strategy game with an all-adult female cast. Use premium clean 2D anime game illustration, precise consistent linework, restrained two-to-three-level cel shading, subtle material separation between silk, cloth, jade and metal, soft neutral upper-left lighting. A single clearly adult HUMAN WOMAN only, with a mature face and adult skeletal structure. This is an independent female reinterpretation of a historical character, not a male portrait, not a copy of an existing franchise character. Use the CHARACTER BRIEF below as authoritative identity and costume information; the Korean visual descriptions are part of the executable prompt. Use faction motifs as decorative shapes, not readable writing.

SUBJECT: U30, Lu Bu (여포), clearly adult woman aged 27.
BODY LOCK: K-cup large-bust adult, within H-to-K only. Preserve a substantially full bust supported by the opaque costume's actual tailoring; do not flatten it to medium or enlarge it beyond the stated cup. Keep her individual muscles, shoulders, waist and hips.
Use height 183 cm, B/W/H 116/72/102 cm and K-cup together as artistic targets. Do not infer a different cup size from bust circumference alone.

REFERENCE AND IDENTITY:
Use the attached ACCEPTED FULL-BODY ILLUSTRATION of Lu Bu (U30) as the identity reference. Preserve the SAME adult face, hair silhouette, eyes, skin, costume, ornaments, faction colors and K-cup large body category. This is the same adult woman simplified for gameplay, not a younger version.
COMPOSITION — BATTLE SD:
Square 1:1 canvas, target 1254x1254. Exactly one complete full-body game token with compact 2.8-to-3-head-tall proportions: head about one third of total height and chin-to-boot length about two head heights. Simplify buckles, patterns and fabric into clear shapes while preserving a mature character identity. Convey the original 183 cm adult build and individual muscles/shoulders/hips through compact proportions; do not use full-body 7-head proportions here. Keep the large / K-cup category recognizable through the opaque torso silhouette, without exaggerating it beyond the full-body design.
FACE AND ORIENTATION: Face and torso turn toward IMAGE RIGHT. Keep each anatomical left/right hand assignment unchanged; rotation does not swap hands. The enemy renderer may mirror the finished sprite later. Eyes and eyebrows remain readable at small scale.
CHARACTER-SPECIFIC EQUIPMENT POSE: One halberd held in both hands points toward image right; simplify the two plumes into two distinct curved arcs, leave generous margins.
CORE IDENTIFIERS: Very high long black ponytail, exactly two long red pheasant plumes, black-purple gold armor and one Fangtian halberd; no actual horse.
Use a stable idle-ready stance, not a mid-attack frame. Keep complete boots, hair ornaments and the actual weapon within roughly 10 percent margins. Scale or angle long weapons within the square instead of clipping, detaching or multiplying them. Do not hide the entire torso behind shields.

CHARACTER BRIEF (Korean visual descriptions are authoritative):
{
  "code": "U30",
  "name_ko": "여포",
  "name_en": "Lu Bu",
  "runtime_id": "elder_treeking",
  "sex_age": "Adult human woman, 27 years old",
  "role_faction_ko": "무쌍의 비장 · 동탁군",
  "height_cm": 183,
  "measurements_B_W_H_cm": "116/72/102",
  "bust_type": "large",
  "bust_type_ko": "폭유형",
  "cup_size": "K",
  "body_ko": "매우 풍만한 상체와 넓은 어깨, 긴 다리와 선명한 근육의 초장신 전투형",
  "skin_ko": "따뜻한 밝은 황갈색의 자연스러운 성인 인간 피부.",
  "hair_ko": "칠흑색 #25222B 허리 아래 높은 포니테일, 길게 휜 붉은 꿩깃 두 가닥",
  "eyes_ko": "선홍색 #C84B60, 자신감 넘치는 강한 눈매",
  "face_expression_ko": "강한 광대와 뚜렷한 성인 턱선, 도톰한 입술. 턱을 들어 호쾌하게 웃고 전투 중에는 상대에게 시선을 고정한다.",
  "outfit_ko": "흑자주 불투명 전투 보디스와 금색 어깨 갑주, 짧은 붉은 망토, 분할 갑편 덧치마와 반바지",
  "equipment_ko": "방천화극과 적토 문양 허리패",
  "faction_palette_motifs_ko": "철회색·흑자주·적동 / 관문·옥새",
  "identity_lock_en": "Very high long black ponytail, exactly two long red pheasant plumes, black-purple gold armor and one Fangtian halberd; no actual horse."
}

OUTPUT AND EXCLUSIONS:
Real transparent PNG alpha. Exactly one subject, exactly two arms, two hands and two legs with naturally connected anatomy and clear prop ownership. No scenery, palace, battlefield, floor, platform, shadow plane, colored backdrop, vignette or painted checkerboard. No captions, measurements, character name, labels, readable text, logos, frame, card UI or watermark. No animals, mounts, companions, extra faces, detached weapons or floating props. No extra limbs, mechanical bodies or animal ears/tails. Clothing is opaque and securely fitted, with the coverage and openings specified in the brief; keep the pose focused on command or combat readiness. Do not add attacks, projectiles, flames outside equipment, floating magic circles, magical barrier bubbles, trails, explosions or damage telegraphs. Those effects are separate runtime layers. Small physical lantern light is allowed only inside the lantern. Physical shields specified in the character brief are required equipment and must remain visible.
```

## 검수 포인트

- 27세 성인 여성의 얼굴·골격과 `U30`의 독립적인 외형을 유지한다.
- 키 183 cm / B·W·H 116/72/102 cm / **K컵 폭유형**가 콘셉트와 일치한다.
- 머리: 칠흑색 #25222B 허리 아래 높은 포니테일, 길게 휜 붉은 꿩깃 두 가닥. 눈: 선홍색 #C84B60, 자신감 넘치는 강한 눈매.
- 방천화극과 적토 문양 허리패의 형태·개수·장착 위치와 양손의 소유 관계가 명확하다.
- 약 3등신·화면 오른쪽 방향·전신과 같은 의상 윤곽을 확인한다. 공격 이펙트는 SD에 구워 넣지 않는다.
- 실제 생성 전에는 완료 이미지·생성 시각·해시·검수 완료를 기록하지 않는다.
