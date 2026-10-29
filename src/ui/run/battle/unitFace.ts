import { unitAbbreviation } from '../../gameData';
import { unitArtUrl } from '../../skin/skins';
import { appSkin, type SkinStore } from '../../skin/SkinStore';
import { el } from '../dom';

/** 유닛 얼굴: 원화 스킨이면 초상화, 아니면(또는 원화가 없으면) 이름 약자. 등급 색 테두리 */
export function unitFace(unitId: string, name: string, tier: number, options: { large?: boolean; enemy?: boolean; skin?: SkinStore } = {}): HTMLElement {
  const face = el('div', `bt-face tier-${tier}${options.large ? ' large' : ''}${options.enemy ? ' enemy' : ''}`);
  const url = unitArtUrl((options.skin ?? appSkin).current, unitId, 'portrait');
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.draggable = false;
    img.addEventListener('error', () => {
      img.remove();
      face.textContent = unitAbbreviation(name);
    });
    face.append(img);
  } else {
    face.textContent = unitAbbreviation(name);
  }
  return face;
}

/** 유닛을 끄는 동안 포인터를 따라다니는 표시 */
export function unitDragGhost(unitId: string, name: string, tier: number, star: number): HTMLElement {
  const ghost = el('div', 'bt-drag-ghost');
  ghost.append(unitFace(unitId, name, tier), el('span', '', `${name} ${'★'.repeat(star)}`));
  return ghost;
}
