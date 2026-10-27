import type { CpPool } from '../cards/commandPoints';
import type { Cell } from './board';

/**
 * 카드 대상 지정값.
 * - none: 대상 없음 (target.kind "none")
 * - unit: 유닛 1명 (allyUnit / enemyUnit)
 * - units: 아군 여러 명 (allyUnits, 중복 불가)
 * - cell: 칸 (cell / area3x3, 3×3이면 중심 칸)
 */
export type PlayTarget =
  | { kind: 'none' }
  | { kind: 'unit'; uid: number }
  | { kind: 'units'; uids: number[] }
  | { kind: 'cell'; cell: Cell };

/**
 * 카드 사용 명령. tick = 전투 시작부터의 틱 번호이며 그 틱의 모든 유닛 행동보다 먼저 실행된다.
 * 작전(operation) 카드는 tick 0으로 적으면 준비 단계(전투 시작 전)에 사용된다.
 */
export interface CardCommand {
  tick: number;
  cardInstanceId: number;
  target: PlayTarget;
}

export type PlayResult =
  | { ok: true; /** 사용 후 해당 풀의 남은 CP */ cp: number; pool: CpPool }
  | { ok: false; /** 한국어 실패 사유 */ reason: string };

/** 예약 명령이 실패한 기록 (이벤트 로그에는 남지 않는다) */
export interface RejectedCommand {
  command: CardCommand;
  reason: string;
}
