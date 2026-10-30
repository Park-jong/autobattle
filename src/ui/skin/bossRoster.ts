import type { SkinId } from './skins';

/** 보스는 상점 유닛·지휘관 로스터와 별도로 관리한다. 전투·저장 ID는 그대로 사용한다. */
export const BOSS_ART_CODES: Readonly<Record<string, string>> = {
  gate_breaker: 'B01', twin_ser: 'B02', twin_mir: 'B03', legion_lord: 'B04',
};

export interface BossSkinProfile {
  name: string;
  role: string;
  skillName: string;
  bio: string;
}

const PROFILES: Readonly<Record<'academy' | 'modern', Readonly<Record<string, BossSkinProfile>>>> = {
  academy: {
    gate_breaker: { name: '봉인문 파괴 골렘', role: '봉쇄된 정문의 수호자', skillName: '균열 강타', bio: '봉쇄 의식으로 수호 명령이 뒤틀린 석재 골렘. 거대한 공성 추로 탈출로를 짓뭉갠다.' },
    twin_ser: { name: '쌍둥이 화로령 세르', role: '대화로의 점화 주술체', skillName: '불꽃 낙인', bio: '대화로에서 갈라진 점화의 반쪽. 미르와 나눈 혼불로 서로를 되살린다.' },
    twin_mir: { name: '쌍둥이 재의령 미르', role: '대화로의 방호 주술체', skillName: '재의 장막', bio: '대화로의 잿불을 지키는 보존의 반쪽. 화로륜으로 재를 모아 세르의 혼불을 지킨다.' },
    legion_lord: { name: '봉쇄 의식의 군주 바르칸', role: '심연의 촉수 군주', skillName: '군주의 촉수', bio: '학원의 방위 의식을 삼킨 심연의 군주. 왕관형 갑각과 여섯 촉수에 봉인 장치가 융합되어 있다.' },
  },
  modern: {
    gate_breaker: { name: '중장 진압 병기', role: '무인 공성 로봇', skillName: '유압 강타', bio: '변조된 피아식별 명령으로 대피로를 봉쇄한 무인 진압 병기. 오른팔의 유압 파일벙커로 전열을 무너뜨린다.' },
    twin_ser: { name: '소각 안드로이드 세르', role: '공격형 쌍둥이 안드로이드', skillName: '소각 낙인', bio: '오른팔 삼지 소각기를 장착한 집행 안드로이드. 미르와 공유하는 인격 백업으로 재기동한다.' },
    twin_mir: { name: '장막 안드로이드 미르', role: '방호형 쌍둥이 안드로이드', skillName: '방호 장막', bio: '왼팔의 늑골형 투사기로 부대를 보호하는 안드로이드. 세르와 같은 인격 원형과 복구 키를 공유한다.' },
    legion_lord: { name: '최고통수관 바르칸', role: '도시 봉쇄망의 최고통수관', skillName: '통수관의 칼날', bio: '군수 재벌과 도시 봉쇄망을 지배하는 최고통수관. 맞춤 실크와 보석, 정밀 외골격을 갖추고 여유롭게 전장을 지휘한다.' },
  },
};

export function bossProfile(skin: SkinId, unitId: string): BossSkinProfile | undefined {
  return skin === 'default' ? undefined : PROFILES[skin][unitId];
}
