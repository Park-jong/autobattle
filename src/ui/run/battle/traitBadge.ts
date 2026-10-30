import { button } from '../dom';

/** Shared silhouettes stay recognizable when a skin changes trait names. */
const EMBLEMS: Readonly<Record<string, string>> = {
  iron_legion: '<path d="M5 21V7l3-3 4 3 4-3 3 3v14M9 21v-6h6v6M5 11h14M9 7v4m6-4v4"/>',
  ember: '<path d="M13 3c1 5 6 7 6 12a7 7 0 0 1-14 0c0-3 2-6 4-8 0 4 2 5 3 5 2-3 2-6 1-9Z"/><path d="M12 15c-3 3-2 6 0 6s3-3 0-6Z"/>',
  abyss: '<path d="M18 4a9 9 0 1 0 2 14A8 8 0 0 1 18 4Z"/><path d="m16 7 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
  forest_pact: '<path d="M20 4C10 2 3 7 5 14c2 7 15 6 15-10ZM4 21 16 9M9 16v-5m0 5h5"/>',
  guardian: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="M12 7v10M8 11h8"/>',
  gladiator: '<path d="m4 3 5 2 10 12-2 2L5 9 4 3ZM20 3l-5 2-3 4m-3 3-4 5 2 2 5-4M4 16l4 4m8-16 4 4M3 21l3-3m12 0 3 3"/>',
  marksman: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  mystic: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5V4Z"/><path d="M2 5V2h3m14 0h3v3M2 19v3h3m14 0h3v-3"/>',
  assassin: '<path d="m18 3 3 3-10 10-4 1 1-4L18 3ZM5 15l4 4M3 21l4-4M15 6l3 3"/>',
};

/** Icon-only button; its accessible name and tooltip retain the full trait name. */
export function traitBadge(id: string, name: string, kind: 'origin' | 'job'): HTMLButtonElement {
  const badge = button('', () => {}, `bt-trait-emblem ${kind} emblem-${id}`);
  badge.setAttribute('aria-label', `${kind === 'origin' ? '소속' : '직업'}: ${name}`);
  badge.title = name;
  const shape = EMBLEMS[id] ?? '<path d="m12 3 9 9-9 9-9-9 9-9Z"/>';
  badge.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
  return badge;
}
