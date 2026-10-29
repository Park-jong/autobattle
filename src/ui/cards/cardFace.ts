import type { CardType } from '../../core/data/card';
import type { Rarity } from '../../core/data/card';
import { appSkin } from '../skin/SkinStore';
import { unitArtUrl } from '../skin/skins';

/** 카드 그림 칸의 종류 문양 */
const TYPE_GLYPHS: Record<CardType, string> = { operation: '⚑', command: '⚔', spell: '✦', equipment: '◈', curse: '☠' };
/** 아카데미 스킨에서 카드 그림 칸에 깔아 두는 유닛 초상화 (종류별) */
const ART_UNITS: Record<CardType, string> = {
  operation: 'iron_shieldbearer', command: 'legion_centurion', spell: 'ember_kindler', equipment: 'ember_smith', curse: 'void_hierophant',
};

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

  const baseCost = card.baseCost ?? card.cost;
  const cost = node('span', card.cost < baseCost ? 'hcard-cost reduced' : card.cost > baseCost ? 'hcard-cost raised' : 'hcard-cost', String(card.cost));
  if (card.cost !== baseCost) cost.title = `기본 비용 ${baseCost} → ${card.cost} (${card.cost < baseCost ? '주술사 특성' : '방해 변이'})`;

  const art = node('div', 'hcard-art');
  const artUrl = unitArtUrl(appSkin.current, ART_UNITS[card.type], 'portrait');
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
    node('div', 'hcard-type', `${card.typeLabel} · ${card.targetLabel}`),
    node('div', 'hcard-text', card.text),
  );
  if (card.tags.length > 0) root.append(node('div', 'hcard-tags', card.tags.join(' · ')));
  return root;
}
