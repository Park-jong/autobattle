import { unitAbbreviation } from '../../gameData';
import { unitArtUrl } from '../../skin/skins';
import { appSkin, type SkinStore } from '../../skin/SkinStore';
import { el } from '../dom';

/** 유닛 얼굴: 원화 스킨이면 초상화, 아니면(또는 원화가 없으면) 이름 약자. 등급 색 테두리 */
export function unitFace(unitId: string, name: string, tier: number, options: { large?: boolean; enemy?: boolean; skin?: SkinStore } = {}): HTMLElement {
  const face = el('div', `bt-face tier-${tier}${options.large ? ' large' : ''}${options.enemy ? ' enemy' : ''}`);
  face.append(tierBadge(tier));
  const url = unitArtUrl((options.skin ?? appSkin).current, unitId, 'portrait');
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      img.remove();
      face.prepend(unitAbbreviation(name));
    });
    face.append(img);
  } else {
    face.prepend(unitAbbreviation(name));
  }
  return face;
}

/** 유닛을 끄는 동안 포인터를 따라다니는 표시 */
export function unitDragGhost(unitId: string, name: string, tier: number, star: number, skin: SkinStore = appSkin): HTMLElement {
  // 보드 위 유닛과 같은 모양: 원화 스킨이면 진영색 받침 + SD 원화, 아니면 진영색 원 + 이름 약자. 아래에 별
  const ghost = el('div', `bt-drag-ghost tier-${tier}`);
  const token = el('div', 'bt-token');
  const plain = () => {
    token.classList.add('plain');
    token.textContent = unitAbbreviation(name);
  };
  const url = unitArtUrl(skin.current, unitId, 'sd');
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      img.remove();
      plain();
    });
    token.append(img);
  } else {
    plain();
  }
  ghost.append(token, tierBadge(tier), el('div', 'bt-token-stars', '★'.repeat(star)));
  ghost.title = name;
  return ghost;
}

export function tierBadge(tier: number): HTMLElement {
  const badge = el('span', `bt-tier-badge tier-${tier}`, String(tier));
  badge.setAttribute('aria-label', `${tier}등급`);
  badge.title = `기본 ${tier}등급 · 별은 합성 성급`;
  return badge;
}
