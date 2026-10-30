# B03 장막 안드로이드 미르 — 전투 SD 생성 프롬프트

[보스 설정](README.md) · [공통 기준](../../ART_DIRECTION.md)

- 스킨 / 게임 ID: `modern` / `twin_mir`
- 참조: characters/bosses/modern/B03/illustration.png (최신 채택 전신; 실제 이미지로 첨부)
- 예정 채택 경로: `characters/bosses/modern/B03/sd.png`
- 배경 옵션: 이미지 생성 도구의 `transparent_background: true`.
- 적용 기준: 성인 여성형 이족 안드로이드와 몸에 붙은 괴이한 산업 장비.
- 개정 전 디자인을 참조하지 않는다. 최신 전신이 없으면 먼저 전신을 확정하고 실제 참조 이미지로 첨부한다.

## 실행 프롬프트

```text
Original modern urban tactical anime boss asset for CITY OPERATION. Premium clean 2D anime game art, precise elegant linework, two or three controlled cel-shadow values, believable ceramic, matte metal and synthetic fabric materials. Soft neutral upper-left lighting.

Use the attached approved full-body illustration of this exact boss in this exact skin as the identity, face, hairstyle, body proportions, material, clothing and equipment reference. Preserve the revised design faithfully.

SUBJECT — B03, 장막 안드로이드 미르, runtime ID twin_mir:
ONE eerie bipedal female android, MIR, with the appearance of a clearly adult 25-year-old woman. Same slender elongated humanoid anatomy and porcelain facial structure as SER, exactly two arms, two hands and two legs on articulated feet. Humanlike pale ceramic face with a nose, mouth, two turquoise irises, fine temple and jaw seams and an unnaturally constant gentle smile. Silver-gray short bob with side-swept bangs. Opaque charcoal synthetic undersuit (#39414F), ceramic-white chest and pelvic armor (#E4E9EF), rounded downward-curving shoulder plates, pale turquoise support lights (#78D5D0), subtle muted mauve fittings (#9B8AA7), clean exposed metal knee and ankle joints. ONE semicircular rib-cage shield projector is physically mounted to the outside of her LEFT forearm, comprising exactly THREE curved solid armor ribs; retain the left hand, no extra arm. Short restraint collars at neck and waist are fixed to the body frame, never floating. ONE vertical tubular recovery unit is fixed to the back. Left-half broken circular chest core remains visible. Upright grounded guarding stance, small rib projector below chest height without hiding the face. Uncanny mechanical restraint apparatus, no gore. No floating drone hull, thrust pods, hovering stance or projected shield bubble.

COMPOSITION:
One complete full-body SD battle token, square 1:1 canvas (target 1024x1024), about 3 to 3.5 heads tall, retaining clearly adult female identity. Preserve the two arms, two hands and two grounded legs, adult porcelain face, bob haircut, distinctive shoulder shape and attached forearm equipment. Simplify piping into thick connected shapes. Face toward SCREEN RIGHT in an eye-level near-front three-quarter stance. Include both feet, hair and all major equipment within 8-12 percent margins. Readable at a 104px board cell and distinguishable at 64px.


OUTPUT:
Exactly ONE subject, no second twin or additional characters. Real transparent PNG alpha, no scenery, background, floor, base, cast shadow plane, vignette, painted checkerboard, text, numbers, labels, logos, UI, frame or watermark. Confine small emissive lights to the body or attached equipment. No detached glow cloud, shield bubble, spell circle, telegraph lane, projectile or explosion. Clean readable edges, connected anatomy and equipment.
```

## 검수 포인트

- 인간형 얼굴 · 곡선 어깨 · 청록 코어 · 왼팔 늑골형 투사기의 식별 요소가 유지되는지 확인한다.
- 은회 단발·둥근 어깨·왼팔의 반원 케이지를 남긴다. 늑골형 장비는 굵은 리브 3개, 구속 링은 몸에 붙은 짧은 곡선으로 단순화한다.
- 세르와 동일한 성인 여성형 얼굴 골격·세라믹 재질·반쪽 고리 코어. 미르는 은회 단발·청록·곡선 장비로 구분하고 세르의 삼지 소각기를 쓰지 않는다.
- 팔·손·다리는 각각 두 개이며 장비는 몸에 부착되어 있는지 확인한다.
- 화면 오른쪽 원본과 적 진영 좌우 반전, 104px·64px 축소에서 가독성을 확인한다.

실제 제작 호출의 추가 구도 지시와 참조 경로는 [생성 이력](../generation-log.json)에 보존했다.

