# B03 쌍둥이 재의령 미르 — 전투 SD 생성 프롬프트

[보스 설정](README.md) · [공통 기준](../../ART_DIRECTION.md)

- 스킨 / 게임 ID: `academy` / `twin_mir`
- 참조: characters/bosses/academy/B03/illustration.png (채택 전신; 실제 이미지로 첨부)
- 예정 채택 경로: `characters/bosses/academy/B03/sd.png`
- 배경 옵션: 이미지 생성 도구의 `transparent_background: true`.
- 전신이 없으면 먼저 전신을 확정한다. 참조 이미지를 도구에 실제로 첨부하며 경로를 텍스트에 쓰는 것만으로 대신하지 않는다.

## 실행 프롬프트

```text
Original magical-academy fantasy boss asset. Premium clean 2D anime game art, crisp controlled linework, two or three cel-shadow values, coherent stone, ceramic, copper, iron and cloth materials as applicable. Ominous restrained design matching a colorful anime roster, no photorealism or gore.

Use the attached approved full-body illustration of this exact boss in this exact skin as the identity, material, palette and equipment reference. Preserve its mask or helmet, eye/sensor count, core shape, body structure and prop ownership. Do not redesign the boss or borrow a different skin's equipment.

SUBJECT — B03, 쌍둥이 재의령 미르, runtime ID twin_mir:
One nonhuman ash shaman construct, MIR, the protective half of a twin pair. Ash-gray ceramic body (#656774), muted mauve-gray mantle (#9B8AA7), restrained pale turquoise core light (#88D7CF), copper fittings (#BE824E). Rounded downward-curving hood and bell-shaped mantle, pale porcelain mask with two almost horizontal eye slits and no mouth, no human skin or hair. Exactly two thin ceramic arms and two short visible legs. Both hands support ONE small solid copper brazier ring below chest height toward the body's left side, leaving the face and left-half broken circular chest core visible. Calm upright guarding stance. Shared ceramic-and-copper construction with SER but rounded geometry, no flame crown or trident. No shield bubble, magic circle, ash cloud or other twin.

COMPOSITION:
One complete full-body SD battle game token, square 1:1 canvas (target 1024x1024). About 3 to 3.5 heads tall for the golem, shaman construct or armored commander, without changing species or making the mature commander look like a child. Preserve the signature silhouette, core and one main prop, simplify tiny surface details. Face toward SCREEN RIGHT in an eye-level near-front three-quarter battle-ready stance. Keep all head ornaments, both feet and weapon tips inside 8-12 percent margins. Readable at a 104px board cell and distinguishable at 64px.


OUTPUT:
Exactly ONE subject, no army, second twin or additional characters. Real transparent PNG alpha, no background, scenery, floor, platform, cast shadow plane, vignette, painted checkerboard, text, labels, numbers, logos, UI, frame or watermark. Neutral soft upper-left lighting. Confine emissive accents to the body or contained equipment; no detached glow cloud, full shield bubble, spell circles, telegraph lanes, projectiles or explosions. Maintain distinct material boundaries and clean readable edges.
```

## 검수 포인트

- 둥근 두건·종 망토·작은 구리 고리의 세 형태를 유지. 반투명 보호막은 기본 SD에 굽지 않는다.
- 화면 오른쪽을 향하는 원본과 적 진영용 좌우 반전 양쪽에서 식별 가능한지 확인한다.
- 104px·64px 축소, 투명 테두리, 체력바와의 간섭은 후속 게임 연결 단계에서 확인한다.
- B02 세르와 같은 도자기·구리 재질과 반쪽 고리 코어. 미르는 둥근 방어형이며 세르의 삼각 왕관·삼지 지팡이를 쓰지 않는다.

실제 실행에 사용한 구도 지시와 참조 경로는 [생성 이력](../generation-log.json)에 보존했다.

