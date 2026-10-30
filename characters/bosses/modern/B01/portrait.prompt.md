# B01 중장 진압 병기 — 초상 생성 프롬프트

[보스 설정](README.md) · [공통 기준](../../ART_DIRECTION.md)

- 스킨 / 게임 ID: `modern` / `gate_breaker`
- 참조: characters/bosses/modern/B01/illustration.png (채택 전신; 실제 이미지로 첨부)
- 예정 채택 경로: `characters/bosses/modern/B01/portrait.png`
- 배경 옵션: 이미지 생성 도구의 `transparent_background: true`.
- 전신이 없으면 먼저 전신을 확정한다. 참조 이미지를 도구에 실제로 첨부하며 경로를 텍스트에 쓰는 것만으로 대신하지 않는다.

## 실행 프롬프트

```text
Original modern urban tactical anime boss asset for CITY OPERATION. Premium clean 2D anime game art, crisp controlled linework, two or three cel-shadow values, believable matte armor, ceramic panels, optics and mechanical joints as applicable. Sophisticated clear machinery, no photorealism or gore.

Use the attached approved full-body illustration of this exact boss in this exact skin as the identity, material, palette and equipment reference. Preserve its mask or helmet, eye/sensor count, core shape, body structure and prop ownership. Do not redesign the boss or borrow a different skin's equipment.

SUBJECT — B01, 중장 진압 병기, runtime ID gate_breaker:
One autonomous bipedal urban siege robot, broad rectangular charcoal armor (#303945), ceramic-white plates (#E5EAF0), restrained orange warning lights (#FF864A). Small recessed head with exactly one vertical orange optical sensor and no human face or pilot. Exactly two stout mechanical legs and two arms with plausible joints. Its RIGHT forearm terminates in one large vertical rectangular hydraulic pile bunker instead of a hand; LEFT arm has one compact articulated gripper and a small protective plate. Keyhole-shaped armored reactor hatch at the chest, no readable markings. Low grounded stance with the pile bunker beside the body. Original modern urban tactical anime machinery, no tank tracks, extra limbs, magical runes or floating rubble.

COMPOSITION:
Square 1:1 portrait (target 1024x1024), head through broad upper torso. Keep the full head and enough rectangular shoulders and upper chest core to identify the siege boss. Do not crop to only a tiny eye or invent a human face. Lower body and most of the ram are outside the frame.
The subject brief defines the complete design for consistency; do not show hidden limbs, the full body or all equipment just to fit every described part into this portrait.

OUTPUT:
Exactly ONE subject, no army, second twin or additional characters. Real transparent PNG alpha, no background, scenery, floor, platform, cast shadow plane, vignette, painted checkerboard, text, labels, numbers, logos, UI, frame or watermark. Neutral soft upper-left lighting. Confine emissive accents to the body or contained equipment; no detached glow cloud, full shield bubble, spell circles, telegraph lanes, projectiles or explosions. Maintain distinct material boundaries and clean readable edges.
```

## 검수 포인트

- 전신과 가면/투구·눈/센서·재질·코어 모양이 일치하는지 확인한다.
- 정사각 축소 상태에서 보스 종류를 식별할 수 있는지 확인한다.
- 얼굴과 머리 장식이 잘리지 않고 아래 몸통은 자연스럽게 프레임 밖으로 이어지는지 확인한다.

실제 제작 호출의 추가 구도 지시와 참조 경로는 [생성 이력](../generation-log.json)에 보존했다.

