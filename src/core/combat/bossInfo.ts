import type { UnitDef } from '../data/unit';
import type { UnitCatalog } from '../data/unitLoader';

/** 미리보기·UI에 보여 줄 보스 패턴 설명 (패턴 데이터에서 만든다) */
export interface BossPatternInfo {
  unitId: string;
  unitName: string;
  /** 패턴 이름 (예: 열 강타) */
  title: string;
  /** 규칙 설명 한 줄씩 */
  lines: string[];
}

const DAMAGE_LABEL = { physical: '물리', magic: '마법' } as const;

/** 보스 유닛의 패턴 설명. 패턴이 없는 유닛은 null */
export function describeBossPattern(def: UnitDef, units: UnitCatalog): BossPatternInfo | null {
  const pattern = def.pattern;
  if (!pattern) return null;
  const base = { unitId: def.id, unitName: def.name };
  switch (pattern.kind) {
    case 'columnStrike':
      return {
        ...base, title: '열 강타',
        lines: [
          `${pattern.intervalSeconds}초마다 한 열 전체에 ${DAMAGE_LABEL[pattern.dmgType]} 피해 ${pattern.damage} (${pattern.telegraphSeconds}초 전 예고).`,
          '대상은 아군이 가장 많이 선 열입니다. 진형 교대·피해 감소 카드로 대응하세요.',
        ],
      };
    case 'twinRevive': {
      const partner = units.get(pattern.partner)?.name ?? pattern.partner;
      return {
        ...base, title: '쌍둥이 부활',
        lines: [
          `${def.name}·${partner} 중 한쪽이 쓰러지면 ${pattern.windowSeconds}초 안에 나머지도 쓰러뜨려야 합니다.`,
          `제한 시간이 지나면 쓰러진 쪽이 최대 HP ${pattern.reviveHpPct}%로 부활합니다. 집중 포화·범위 주문으로 둘을 거의 동시에 처치하세요.`,
        ],
      };
    }
    case 'phaseSummon':
      return {
        ...base, title: '군단 소집',
        lines: [
          ...pattern.phases.map((phase, i) => {
            const names = phase.summon.map((s) => `${units.get(s.unitId)?.name ?? s.unitId} ${'★'.repeat(s.star)}`).join(', ');
            return `${i + 2}페이즈 (HP ${phase.hpPct}% 이하): 증원 ${names}.`;
          }),
          '페이즈가 바뀔 때마다 아군의 보호막과 카드·스킬 버프가 해제됩니다. 연쇄·징집·궁극기로 흐름을 되찾으세요.',
        ],
      };
  }
}
