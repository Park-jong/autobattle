import { appSkin } from '../skin/SkinStore';
import { unitArtUrl } from '../skin/skins';
import { el } from './dom';

export type SceneKind = 'market' | 'depot' | 'scout' | 'forge' | 'rift' | 'camp';
export function eventSceneKind(id: string): SceneKind {
  return ({ abandoned_depot: 'depot', wounded_scout: 'scout', gate_smith: 'forge', rift_altar: 'rift', deserter_camp: 'camp' } as Record<string, SceneKind>)[id] ?? 'camp';
}

/** Split only the final written consequence summary; gameplay still uses core effects. */
export function eventOptionPresentation(text: string): { title: string; consequences: string[] } {
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/u);
  return match ? { title: match[1]!.trim(), consequences: match[2]!.split(/,\s*/u).filter(Boolean) } : { title: text, consequences: [] };
}

const CHARACTERS: Record<SceneKind, string> = {
  market: 'grove_druid', depot: 'legion_crossbow', scout: 'grove_archer', forge: 'ember_smith', rift: 'abyss_whisperer', camp: 'arena_recruit',
};

let sceneId = 0;
/** A code-drawn location and existing character art form a distinct scene for each encounter. */
export function nodeScene(kind: SceneKind): HTMLElement {
  const root = el('div', `node-scene scene-${kind}`);
  root.setAttribute('aria-hidden', 'true');
  const id = `location-${++sceneId}`;
  const common = `<defs><linearGradient id="${id}" x2="0" y2="1"><stop stop-color="#24374f"/><stop offset="1" stop-color="#0c1525"/></linearGradient></defs><rect width="560" height="400" fill="url(#${id})"/><circle cx="390" cy="100" r="145" fill="currentColor" opacity=".08"/><path d="M0 330L560 270V400H0Z" fill="#0b1320"/><path d="M0 350L560 290M40 400L280 240M260 400L330 250M500 400L410 260" stroke="currentColor" opacity=".12"/>`;
  const locations: Record<SceneKind, string> = {
    market: '<path d="M40 145H400V175H40Z" fill="#9a684a"/><path d="M45 145L78 78H370L400 145Z" fill="#517783"/><path d="M84 80L64 145M156 80L146 145M228 80V145M300 80L310 145M368 80L390 145" stroke="#d9b57a" stroke-width="24" opacity=".75"/><path d="M64 175V320M378 175V300M45 250H390" stroke="#8e7356" stroke-width="12"/><rect x="75" y="252" width="280" height="62" rx="5" fill="#453f3b"/><path d="M108 245V198H140V245M180 245V184H220V245M264 245V204H292V245" fill="#7e9bba" stroke="#b6c4c7" stroke-width="3"/><circle cx="320" cy="228" r="17" fill="#dbb76c"/><path d="M45 183H390" stroke="#f5d58c" stroke-width="3"/>',
    depot: '<path d="M40 310V100L220 45L382 100V300Z" fill="#334454" stroke="#8194a4" stroke-width="4"/><path d="M155 310V140H300V300" fill="#0c1724" stroke="#63788d" stroke-width="8"/><path d="M38 100L218 45L386 100" fill="none" stroke="#a0a6a1" stroke-width="10"/><path d="M68 251H157V320H68ZM105 180H190V247H105ZM290 248H376V314H290Z" fill="#665844" stroke="#b29a6c" stroke-width="3"/><path d="M79 262L145 308M116 190L179 235M300 258L364 304" stroke="#aa946c" stroke-width="4"/>',
    scout: '<path d="M30 302L180 100L380 302Z" fill="#3d5b65" stroke="#94b5b0" stroke-width="3"/><path d="M132 300L190 175L252 300Z" fill="#101c2a"/><path d="M185 135V200M156 166H215" stroke="#d4c79c" stroke-width="12"/><path d="M16 320H385" stroke="#647b77" stroke-width="4"/><rect x="50" y="270" width="78" height="54" rx="5" fill="#6c7668"/><path d="M76 279V315M61 297H91" stroke="#d5d8b6" stroke-width="7"/>',
    forge: '<path d="M50 300V65H260V310" fill="#3c3437" stroke="#73616a" stroke-width="4"/><path d="M95 280V175Q155 100 218 175V280" fill="#171523" stroke="#8a6354" stroke-width="8"/><ellipse cx="155" cy="263" rx="58" ry="27" fill="#ef8546" opacity=".5"/><path d="M120 265Q95 217 146 190Q141 225 169 213Q207 245 184 265Z" fill="#f3b66b"/><path d="M235 290L255 258H365L380 278L345 298L330 325H265L273 298Z" fill="#718191" stroke="#b8bcb6" stroke-width="3"/><path d="M289 169L332 218M277 154L297 141L324 171L308 187Z" fill="#8e9caa" stroke="#b8c3cc" stroke-width="3"/>',
    rift: '<path d="M90 320L125 278H343L378 320Z" fill="#545069" stroke="#a38dab" stroke-width="3"/><path d="M146 278V250H320V278M183 250V220H286V250" fill="#6d5a78" stroke="#ba95b4" stroke-width="3"/><ellipse cx="235" cy="162" rx="66" ry="91" fill="#9475d0" opacity=".15" stroke="#ccafff" stroke-width="4"/><path d="M248 63L213 131L250 148L214 225L265 163L233 142Z" fill="#e3ccff"/><circle cx="235" cy="162" r="118" fill="none" stroke="#bba2e4" stroke-dasharray="3 16" stroke-width="3"/><path d="M112 70L93 307M356 70L376 306" stroke="#596074" stroke-width="18"/>',
    camp: '<path d="M22 304L110 170L229 303Z" fill="#5c6661" stroke="#a3a992" stroke-width="3"/><path d="M252 288L340 126L442 289Z" fill="#454f56" stroke="#8a9695" stroke-width="3"/><ellipse cx="235" cy="325" rx="62" ry="17" fill="#e3ab56" opacity=".2"/><path d="M197 320L267 293M200 293L271 321" stroke="#8c6345" stroke-width="10"/><path d="M215 307Q195 272 231 245Q224 268 249 279Q272 301 247 312Z" fill="#e9aa62"/><path d="M233 239Q250 213 236 187" fill="none" stroke="#c3c2b6" opacity=".3" stroke-width="5"/>',
  };
  root.innerHTML = `<svg viewBox="0 0 560 400" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${common}${locations[kind]}<g fill="currentColor" opacity=".5"><circle cx="68" cy="60" r="2"/><circle cx="330" cy="48" r="2"/><circle cx="295" cy="104" r="3"/><circle cx="450" cy="206" r="2"/></g></svg>`;
  const url = unitArtUrl(appSkin.current, CHARACTERS[kind], 'illustration');
  if (url) {
    const figure = el('img', 'node-scene-character'); figure.src = url; figure.alt = ''; figure.draggable = false;
    figure.addEventListener('error', () => figure.remove()); root.append(figure);
  }
  root.append(el('span', 'node-scene-stamp', kind === 'market' ? 'SUPPLY / TRADE' : 'ENCOUNTER'));
  return root;
}
