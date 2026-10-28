/** 렌더링 상수 모음: 해상도, 배치, 색, 타이밍을 여기서만 조정한다. */

/** 게임 좌표계 크기 (HiDPI에서도 게임 좌표는 이 값 그대로) */
export const STAGE = {
  WIDTH: 1280,
  HEIGHT: 720,
  /** 캔버스 해상도 배율의 상한 (메모리 보호) */
  MAX_DPR: 3,
} as const;

export const LAYOUT = {
  CELL_SIZE: 104,
  BOARD_X: 224,
  BOARD_Y: 120,
  TIME_Y: 40,
  SIDE_LABEL_Y: 100,
  FRONT_LABEL_Y: 650,
  UNIT_RADIUS: 26,
  BAR_WIDTH: 76,
  HP_BAR_HEIGHT: 9,
  MANA_BAR_HEIGHT: 5,
  /** 칸 중심 기준 막대 y 오프셋 */
  HP_BAR_Y: -50,
  MANA_BAR_Y: -39,
  STAR_Y: 34,
  BADGE_Y: 46,
  BADGE_SIZE: 14,
  /** 카드 사용 배너(보드 아래)와 CP 변화 표시(오른쪽 위) 위치 */
  CARD_BANNER_Y: 684,
  CP_TEXT_Y: 64,
} as const;

export const COLORS = {
  BACKGROUND: 0x1b1f2a,
  ALLY_CELL_A: 0x24405f,
  ALLY_CELL_B: 0x2b4b70,
  ENEMY_CELL_A: 0x5f2a2a,
  ENEMY_CELL_B: 0x713333,
  FRONT_TINT: 0xffffff,
  GRID_LINE: 0x0e1118,
  OVERHEAT_BORDER: 0xff3b30,
  /** 카드 대상 지정: 유효 대상 / 선택됨 / 범위 미리보기 / 조준 표식 / 불사 */
  TARGET_VALID: 0x7dffb0,
  TARGET_SELECTED: 0xffd54a,
  TARGET_AREA: 0xffe27a,
  TARGET_DROP_ZONE: 0xbfe3ff,
  AIM_MARK: 0xff4d4d,
  UNDYING: 0xd9a6ff,
  CARD_PULSE: 0xfff2a8,
  /** 보스 열 강타 예고 / 발동 */
  TELEGRAPH: 0xff3b30,
  STRIKE: 0xffe0d0,
  SWAP_TRAIL: 0x9be29b,
  /** 쌍둥이 보스 부활 대기 / 부활, 군주 페이즈 전환의 버프 해제 */
  REVIVE: 0xc27bff,
  REVIVE_FLASH: 0xf0d9ff,
  DISPEL: 0x9ad1ff,
  /** 궁극기: 운석 예고 / 착탄 / 지휘관별 지속 효과 표시 */
  METEOR: 0xff8a3d,
  METEOR_IMPACT: 0xfff0c0,
  ULTIMATE_AURA_HARTEN: 0x6fb8ff,
  ULTIMATE_AURA_NOX: 0xc27bff,
  ULTIMATE_AURA_DEFAULT: 0xffd54a,
  BOARD_BORDER: 0x3a4152,
  HOVER_OK: 0x9be29b,
  HOVER_BAD: 0xff7b7b,

  ALLY_UNIT: 0x4aa3ff,
  ENEMY_UNIT: 0xff6a5a,
  UNIT_OUTLINE: 0x0b0d12,

  HP_BACK: 0x151820,
  HP_ALLY: 0x5fd068,
  HP_ENEMY: 0xe0554a,
  SHIELD: 0xe8f4ff,
  MANA: 0x4f8dff,

  ATTACK_ALLY: 0x8fd0ff,
  ATTACK_ENEMY: 0xffb0a0,
} as const;

/** 텍스트 색 (CSS 문자열) */
export const TEXT_COLORS = {
  TITLE: '#ffffff',
  MUTED: '#9aa3b5',
  UNIT_NAME: '#ffffff',
  STAR: '#ffd54a',
  PHYSICAL: '#ff9a4d',
  MAGIC: '#c58bff',
  HEAL: '#6be37a',
  SKILL: '#fff2a8',
  OVERHEAT: '#ff5a4a',
  CARD_BANNER: '#fff2a8',
  ULTIMATE: '#ffb454',
  REVIVE: '#d9a6ff',
  PHASE: '#ff8a8a',
  CP: '#7fd6ff',
} as const;

export const FONT_FAMILY = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

/** 연출 지속 시간(전투 시간 기준 초). 배속·일시정지를 따라간다 */
export const TIMING = {
  ATTACK_LINE: 0.18,
  DAMAGE_TEXT: 0.9,
  HEAL_TEXT: 0.9,
  SKILL_TEXT: 1.1,
  DEATH_FADE: 0.6,
  OVERHEAT_BANNER: 2.5,
  CARD_BANNER: 1.6,
  CARD_PULSE: 0.7,
  SWAP_TRAIL: 0.5,
  /** 보스 열 강타가 발동하는 순간 번쩍이는 시간 */
  STRIKE_FLASH: 0.45,
  /** 궁극기 이름 배너 / 운석 착탄 번쩍임 */
  ULTIMATE_BANNER: 2.2,
  IMPACT_FLASH: 0.55,
  /** 쌍둥이 부활 번쩍임 / 처치 확정 글자 / 군주 페이즈 배너 / 버프 해제 링 (EFFECT_WINDOW 이하) */
  REVIVE_FLASH: 0.8,
  REVIVE_CANCEL_TEXT: 1.4,
  PHASE_BANNER: 2.4,
  DISPEL_FLASH: 0.7,
  CP_TEXT: 1.2,
  /** 진형 교대 등 순간이동을 미끄러지듯 보여주는 시간 */
  SLIDE: 0.25,
  /** 연출 이벤트 조회 창: 가장 긴 연출 지속 시간 이상이어야 함 */
  EFFECT_WINDOW: 2.5,
} as const;

/** 카드 UI 상수 (슬로모션·판정·토스트) */
export const CARD_UI = {
  /** 카드를 집은 동안 재생 속도 배율 (배속 설정에 곱한다) */
  SLOWMO_FACTOR: 0.25,
  /** 이 거리(px) 이상 움직이면 클릭이 아니라 드래그로 본다 */
  DRAG_START_PX: 8,
  /** 유닛 클릭 판정 반경 (게임 좌표, 보간된 위치 기준) */
  UNIT_PICK_RADIUS: 52,
  /** 토스트 표시 시간(초, 실시간) */
  TOAST_SECONDS: 3.2,
  /** 손패 영역 높이(px, CSS) */
  HAND_HEIGHT: 176,
} as const;

export const MOTION = {
  DAMAGE_RISE_PX: 44,
  SKILL_RISE_PX: 10,
} as const;

/** 상태 아이콘(글자 배지). 정의되지 않은 상태는 표시하지 않는다 */
export interface StatusBadge {
  label: string;
  color: number;
  /** 정확히 일치하거나 접두사(예: statMod:)로 일치 */
  match: (name: string) => boolean;
}

export const STATUS_BADGES: readonly StatusBadge[] = [
  { label: '기', color: 0xffd54a, match: (n) => n === 'stun' },
  { label: '화', color: 0xff8a3d, match: (n) => n === 'burn' },
  { label: '방', color: 0x7fd6ff, match: (n) => n === 'damageTakenMult' },
  { label: '불', color: 0xd9a6ff, match: (n) => n === 'undying' },
  { label: '침', color: 0xb0b8c8, match: (n) => n === 'silence' },
  { label: '속', color: 0x91c975, match: (n) => n === 'root' },
  { label: '흡', color: 0xec91a9, match: (n) => n === 'lifesteal' },
  { label: '도', color: 0xff6a8a, match: (n) => n === 'forceTarget' || n === 'taunted' },
  { label: '치', color: 0x6be37a, match: (n) => n === 'healAura' },
  { label: '강', color: 0x9be29b, match: (n) => n.startsWith('statMod:') || n === 'extraShots' },
];
