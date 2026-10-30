# 보스 게임 UI 연결

[전체 목록](README.md) · [공통 아트 기준](ART_DIRECTION.md) · [검증 결과](UI_VERIFICATION.md)

아카데미·modern 보스 원화 총 24장의 배포 파일과 UI 연결을 완료했다. 전투 수치·데이터 ID·런 저장 형식은 유지한다.

## 매핑과 표시

- `src/ui/skin/bossRoster.ts`: 보스 전용 ID → B01~B04 매핑과 두 테마의 이름·역할·스킬 표시명·설명. 상점 유닛 30명·지휘관 3명의 로스터와 분리한다.
- `src/ui/skin/skins.ts`: 일반 유닛 30종과 보스 4종을 합쳐 원화 URL·텍스처 키·미리 읽기 목록을 만든다. 기본 도형 스킨과 없는 유닛은 기존 원화 없음 처리를 유지한다.
- `src/ui/battle/BattleScene.ts`: 기존 로더와 스프라이트 경로가 두 테마의 보스 SD를 읽는다. 적 방향·HP·보호막·마나·상태·부활·페이즈 표시는 기존 렌더링을 사용한다.
- `src/ui/run/encounterPreview.ts`: 보스 노드와 액트 소개 미리보기에 전신 카드를 표시한다. 세르·미르는 별도 카드로 나란히 표시한다.
- `src/ui/run/battle/UnitInfoPanel.ts`: 보스 전신·초상·이름·역할·설명을 표시한다. 전투 중 적·보스를 클릭해 읽기 전용 정보를 열며 층 보정 수치를 적용한다.
- 현대전 세르·미르는 소각/장막 안드로이드, 바르칸은 최고통수관으로 표시한다. 아카데미 바르칸은 촉수 군주로 표시한다.

## 이미지 경로

| 구분 | 경로 |
|---|---|
| 원본 | `characters/bosses/{academy|modern}/{B01~B04}/{illustration|portrait|sd}.png` |
| 배포 | `public/skins/{academy|modern}/{illustration|portrait|sd}/{B01~B04}.png` |
| 텍스처 | `skin:{skin}:{kind}:{unitId}` |

전신은 384×576, 초상과 SD는 256×256으로 내보낸다. 원본은 보존하고 RGBA 투명도를 유지한다. Vite 빌드는 public의 배포 파일을 포함한다.

## 다시 내보내기

```powershell
./tools/skin-assets.ps1 -Skin academy -BossesOnly
./tools/skin-assets.ps1 -Skin modern -BossesOnly
```

`-BossesOnly`를 생략하면 기존 U01~U30·C01~C03와 보스 B01~B04를 함께 내보낸다.

## 검증 기록

[아카데미 원본·배포 검증](academy/asset-manifest.json) · [현대전 원본·배포 검증](modern/asset-manifest.json)

원본 생성 프롬프트·참조 이미지·생성 경로·해시는 각 테마의 generation-log.json과 asset-manifest.json에 보존한다. 원화 원본과 배포 파일의 해시를 별도로 기록했다. UI와 스킨 회귀 검사는 [UI_VERIFICATION.md](UI_VERIFICATION.md)를 따른다.

