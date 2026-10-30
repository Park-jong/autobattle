# B02 소각 안드로이드 세르 — 초상 생성 프롬프트

[보스 설정](README.md) · [공통 기준](../../ART_DIRECTION.md)

- 스킨 / 게임 ID: `modern` / `twin_ser`
- 참조: characters/bosses/modern/B02/illustration.png (최신 채택 전신; 실제 이미지로 첨부)
- 예정 채택 경로: `characters/bosses/modern/B02/portrait.png`
- 배경 옵션: 이미지 생성 도구의 `transparent_background: true`.
- 적용 기준: 성인 여성형 이족 안드로이드와 몸에 붙은 괴이한 산업 장비.
- 개정 전 디자인을 참조하지 않는다. 최신 전신이 없으면 먼저 전신을 확정하고 실제 참조 이미지로 첨부한다.

## 실행 프롬프트

```text
Original modern urban tactical anime boss asset for CITY OPERATION. Premium clean 2D anime game art, precise elegant linework, two or three controlled cel-shadow values, believable ceramic, matte metal and synthetic fabric materials. Soft neutral upper-left lighting.

Use the attached approved full-body illustration of this exact boss in this exact skin as the identity, face, hairstyle, body proportions, material, clothing and equipment reference. Preserve the revised design faithfully.

SUBJECT — B02, 소각 안드로이드 세르, runtime ID twin_ser:
ONE eerie bipedal female android, SER, with the appearance of a clearly adult 25-year-old woman. Slender elongated humanoid anatomy, exactly two arms, two hands and two legs, standing on two articulated feet. Pale porcelain humanlike face with a nose, mouth, two orange irises and fine temple and jaw seams, short asymmetric black bob, a subtly vacant half-smile. Opaque charcoal synthetic undersuit (#292F3A), ceramic-white chest and pelvic armor (#E4E9EF), sharply upward triangular shoulder plates and exposed clean metal knee and ankle joints. Orange thermal accents (#F36E43). ONE three-pronged claw-shaped thermal emitter is physically mounted to the outside of her RIGHT forearm; retain the normal right hand, do not replace the hand or add an extra arm. ONE vertical tubular reactor is rigidly fixed to her back with connected plumbing. Right-half broken circular chest core remains visible. Slight forward stance, weapon lowered beside the body, left hand relaxed. Uncanny industrial execution equipment attached to an android body, no gore. No floating drone hull, thrust pods or hovering stance.

COMPOSITION:
Square 1:1 portrait (target 1024x1024), from the complete head through upper chest. Show her adult feminine porcelain face, two eyes, fine temple seams, distinctive bob, shoulder shape and half-ring chest core. A small part of the signature forearm equipment may enter at the edge without hiding her face. This is a humanoid android bust portrait. Keep all head ornaments in frame. Lower body and most weapons remain outside the crop.
The subject brief describes the full design for consistency. Do not squeeze hidden limbs or the full body into this portrait.

OUTPUT:
Exactly ONE subject, no second twin or additional characters. Real transparent PNG alpha, no scenery, background, floor, base, cast shadow plane, vignette, painted checkerboard, text, numbers, labels, logos, UI, frame or watermark. Confine small emissive lights to the body or attached equipment. No detached glow cloud, shield bubble, spell circle, telegraph lane, projectile or explosion. Clean readable edges, connected anatomy and equipment.
```

## 검수 포인트

- 인간형 얼굴 · 삼각 어깨 · 주황 코어 · 오른팔 삼지 소각기의 식별 요소가 유지되는지 확인한다.
- 성인 여성형 얼굴과 머리·어깨·가슴 반쪽 고리 코어가 보이는 인물 흉상. 주황 홍채와 관자놀이 접합선으로 안드로이드임을 읽게 한다.
- 미르와 동일한 성인 여성형 얼굴 골격·세라믹 재질·반쪽 고리 코어. 세르는 검은 단발·주황·삼각 어깨·삼지 장비, 미르는 은회 단발·청록·곡선 어깨·늑골형 장비.
- 팔·손·다리는 각각 두 개이며 장비는 몸에 부착되어 있는지 확인한다.

실제 제작 호출의 추가 구도 지시와 참조 경로는 [생성 이력](../generation-log.json)에 보존했다.

