import { el } from '../run/dom';
import { appSkin } from './SkinStore';
import { commanderArtUrl, type ArtKind } from './skins';

/** 지휘관 원화. 누락된 이미지는 숨겨 화면 조작을 방해하지 않는다. */
export function commanderArt(id: string | undefined, kind: ArtKind, className: string): HTMLImageElement | null {
  const url = id ? commanderArtUrl(appSkin.current, id, kind) : null;
  if (!url) return null;
  const img = el('img', className);
  img.src = url;
  img.alt = '';
  img.draggable = false;
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove());
  return img;
}
