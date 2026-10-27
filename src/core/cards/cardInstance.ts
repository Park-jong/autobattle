/** 덱 안의 카드 한 장. 같은 카드를 여러 장 가진 경우 instanceId로 구분한다. JSON 직렬화 가능. */
export interface CardInstance {
  instanceId: number;
  cardId: string;
  /** 강화(+) 여부. 강화 카드는 upgrade의 효과·비용을 쓴다 */
  upgraded: boolean;
  /** 보드의 소유 유닛이 제공한 카드. 기본 카드와 구분해 제거/강화한다 */
  grantedBy?: string;
}

/** 덱 생성용 명세 (instanceId는 덱이 부여) */
export interface DeckCardSpec {
  cardId: string;
  upgraded?: boolean;
}
