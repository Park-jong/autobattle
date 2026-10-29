/**
 * 위협 레벨 표시 정보를 만드는 순수 함수 모음 (Phaser·DOM 비의존).
 * 시작 화면의 레벨 선택, 테스트 시작 패널의 선택지, HUD 배지가 같은 문구를 쓴다.
 */
import type { ThreatCatalog } from '../../core/data/threatLoader';

/** 누적 패널티 한 줄: 어느 레벨에서 더해졌는가 */
export interface ThreatPenaltyLine {
  level: number;
  name: string;
  text: string;
}

/** 선택 가능한 레벨 한 칸 (레벨 0 = 기본 난이도) */
export interface ThreatLevelRow {
  level: number;
  /** 선택 목록 문구: "레벨 3 — 날 선 칼날" / "레벨 0 — 기본" */
  label: string;
  /** 고를 수 있는가 (해금된 레벨) */
  selectable: boolean;
  /** 잠겨 있으면 해금 안내 ("레벨 2 승리 시 해금"), 아니면 빈 문자열 */
  lockText: string;
  /** 이 레벨에 적용되는 누적 패널티 (레벨 1~N, 레벨 0이면 빈 목록) */
  penalties: ThreatPenaltyLine[];
  /** 전공 보너스 % (레벨 × 레벨당 비율). 레벨 0이면 0 */
  bonusPct: number;
  /** 전공 보너스 안내 문장 */
  bonusText: string;
}

export interface ThreatPickerView {
  /** 고를 수 있는 최고 레벨 */
  maxSelectable: number;
  rows: ThreatLevelRow[];
}

/** 레벨 이름 ("기본" 또는 데이터의 이름) */
export function threatName(catalog: ThreatCatalog, level: number): string {
  return level <= 0 ? '기본' : catalog.get(level)?.name ?? `레벨 ${level}`;
}

/** HUD 배지·종료 화면에 쓰는 문구: "위협 레벨 3 — 날 선 칼날" */
export function threatLabel(catalog: ThreatCatalog, level: number): string {
  return `위협 레벨 ${level} — ${threatName(catalog, level)}`;
}

/**
 * 레벨 0~최고 레벨의 선택 정보. maxSelectable 이하만 고를 수 있다
 * (테스트 시작 패널은 전부 연다 = catalog.maxLevel, 시작 화면은 메타 진행이 정한 값).
 */
export function buildThreatPicker(catalog: ThreatCatalog, maxSelectable: number, bonusPctPerLevel: number): ThreatPickerView {
  const rows: ThreatLevelRow[] = [];
  for (let level = 0; level <= catalog.maxLevel; level += 1) {
    const selectable = level <= maxSelectable;
    const bonusPct = level * bonusPctPerLevel;
    rows.push({
      level,
      label: level === 0 ? '레벨 0 — 기본' : `레벨 ${level} — ${threatName(catalog, level)}`,
      selectable,
      lockText: selectable ? '' : `레벨 ${level - 1} 승리 시 해금`,
      penalties: catalog.upTo(level).map((def) => ({ level: def.level, name: def.name, text: def.text })),
      bonusPct,
      bonusText: bonusPct > 0 ? `전공 포인트 +${bonusPct}%` : '전공 보너스 없음',
    });
  }
  return { maxSelectable: Math.min(maxSelectable, catalog.maxLevel), rows };
}

/** 선택한 레벨을 고를 수 있는 범위(0~maxSelectable)의 정수로 맞춘다. 올바르지 않으면 0 */
export function clampThreatLevel(level: number, picker: ThreatPickerView): number {
  return Number.isInteger(level) && level >= 0 ? Math.min(level, picker.maxSelectable) : 0;
}
