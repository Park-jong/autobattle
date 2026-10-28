// 덱 시작·손패 뽑기는 core로 옮겼다 (런 코어와 공유). 기존 UI 코드의 import 경로를 유지하기 위한 재수출.
export { createStartingDeck, dealOpeningHand } from '../../core/cards/deckSetup';
