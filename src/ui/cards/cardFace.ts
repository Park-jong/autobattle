import type { CardType } from '../../core/data/card';
import type { Rarity } from '../../core/data/card';
import { appSkin } from '../skin/SkinStore';
import { cardArtUrl, cardTypeSkinName } from '../skin/skins';

/** 카드 그림 칸의 종류 문양 */
const TYPE_GLYPHS: Record<CardType, string> = { operation: '⚑', command: '⚔', spell: '✦', equipment: '◈', curse: '☠' };

/** 카드 모양에 필요한 표시 정보 (손패 카드·보상 카드가 공통으로 만족한다) */
export interface CardFaceSpec {
  name: string;
  type: CardType;
  typeLabel: string;
  targetLabel: string;
  rarity: Rarity;
  cost: number;
  /** 조정 전 비용. cost와 다르면 올랐는지/내렸는지 색으로 표시한다 (생략하면 조정 없음) */
  baseCost?: number;
  upgraded: boolean;
  text: string;
  tags: readonly string[];
  /** 카드 id (공용 카드 그림을 카드마다 고정해 고를 때 쓴다) */
  cardId?: string;
  /** 소유: 지휘관 id(전용 카드 — 그 지휘관 초상화) 또는 'neutral'(공용). 생략하면 공용으로 본다 */
  owner?: string;
}

/**
 * 설명 길이 단계: 카드 폭(112px)에서 기본 글씨(10px)는 약 33자까지 들어간다.
 * 그보다 길면 m(8.6px) → l(7.6px) → xl(6.9px) 순으로 설명 글씨·줄 간격만 줄인다 (그림 칸 높이는 그대로).
 */
export function textSize(text: string): 's' | 'm' | 'l' | 'xl' {
  const length = Array.from(text).length;
  if (length <= 33) return 's';
  if (length <= 48) return 'm';
  if (length <= 70) return 'l';
  return 'xl';
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) made.textContent = text;
  return made;
}

/**
 * 카드 모양(비용 보석·이름 띠·그림 칸·종류/대상 줄·설명·태그·희귀도 보석)의 루트를 만든다.
 * 손패(HandPanel)와 보상 창이 같이 쓴다. 클릭 처리·상태 클래스·부가 표시는 부르는 쪽이 덧붙인다.
 */
export function cardFaceElement(card: CardFaceSpec): HTMLElement {
  const root = node('div', `hcard type-${card.type} rarity-${card.rarity}`);
  root.classList.toggle('upgraded', card.upgraded);
  // 설명이 길면 글씨를 줄여 카드 안에 다 들어가게 한다 (handPanel.css의 data-text 단계)
  root.dataset.text = textSize(card.text);

  const baseCost = card.baseCost ?? card.cost;
  const cost = node('span', card.cost < baseCost ? 'hcard-cost reduced' : card.cost > baseCost ? 'hcard-cost raised' : 'hcard-cost', String(card.cost));
  if (card.cost !== baseCost) cost.title = `기본 비용 ${baseCost} → ${card.cost} (${card.cost < baseCost ? '주술사 특성' : '방해 변이'})`;

  const art = node('div', 'hcard-art');
  // 지휘관 전용 카드는 그 지휘관 초상화, 공용 카드는 설명·종류에 어울리는 유닛 초상화 (스킨마다 다른 원화)
  const artUrl = cardArtUrl(appSkin.current, card);
  if (artUrl) {
    const img = node('img', 'academy-card-art');
    img.src = artUrl;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    art.append(img);
  }
  art.append(node('span', 'academy-card-glyph', TYPE_GLYPHS[card.type]));

  root.append(
    cost,
    node('div', 'hcard-name', card.name),
    art,
    node('div', 'hcard-type', `${cardTypeSkinName(appSkin.current, card.type, card.typeLabel)} · ${card.targetLabel}`),
    node('div', 'hcard-text', card.text),
  );
  if (card.tags.length > 0) root.append(node('div', 'hcard-tags', card.tags.join(' · ')));
  return root;
}
