/** Cosmetic identities only; combat data and balance remain data-driven. */
export const SKIN_ATLAS_URL = `${import.meta.env.BASE_URL}skins/neon-agents.png`;
export const SKIN_TEXTURE = 'neon-agents';
export const SD_ATLAS_URL = `${import.meta.env.BASE_URL}skins/neon-agents-sd.png`;
export const SD_TEXTURE = 'neon-agents-sd';
export const SKIN_EVENT = 'afterhours:skinchange';
export const AGENTS = [
  { name: '세라', english: 'SERA', role: 'FIELD COMMANDER', color: '#bc9cff', quote: '내 신호만 기다려.' },
  { name: '루비', english: 'RUBY', role: 'ASSAULT SPECIALIST', color: '#ff707c', quote: '오늘 밤은 조금 뜨거울 거야.' },
  { name: '바이올렛', english: 'VIOLET', role: 'SIGNAL HACKER', color: '#ed91d3', quote: '네 시선까지 해킹해줄게.' },
  { name: '리브', english: 'LIV', role: 'RECON OPERATOR', color: '#b4df9c', quote: '가까이 와. 작전 설명해줄게.' },
  { name: '아이스', english: 'ICE', role: 'PRECISION SHOOTER', color: '#94dafa', quote: '눈을 떼지 마. 한순간이니까.' },
  { name: '레이븐', english: 'RAVEN', role: 'COVERT OPERATIVE', color: '#ff819b', quote: '어둠 속에선 내가 먼저야.' },
] as const;
const UNIT_SKINS: Record<string, number> = {
  iron_shieldbearer: 0, arena_recruit: 1, legion_crossbow: 4, moss_warden: 3,
  grove_archer: 3, shade_dagger: 5, ember_kindler: 1, abyss_whisperer: 2,
};
const UNIT_ROLES: Record<string, string> = {
  iron_shieldbearer: '실드 가드', arena_recruit: '근접 돌격수', legion_crossbow: '정밀 사수',
  moss_warden: '전투 지원병', grove_archer: '정찰 사수', shade_dagger: '잠입 요원',
  ember_kindler: '화력 전문가', abyss_whisperer: '시그널 해커',
};
export function unitSkinIndex(unitId: string): number { return UNIT_SKINS[unitId] ?? 0; }
export function unitSkinName(unitId: string): string { return AGENTS[unitSkinIndex(unitId)]!.name; }
export function unitSkinRole(unitId: string): string { return UNIT_ROLES[unitId] ?? unitId; }
export function portraitStyle(node: HTMLElement, index: number): void {
  node.style.setProperty('--portrait-x', `${index * 20}%`);
  node.style.setProperty('--agent-color', AGENTS[index]?.color ?? AGENTS[0].color);
}
export function selectedAgent(): number {
  try {
    const value = Number(localStorage.getItem('afterhours.agent') ?? 0);
    return Number.isInteger(value) && value >= 0 && value < AGENTS.length ? value : 0;
  } catch { return 0; }
}
export function setupSkinGallery(): void {
  document.documentElement.style.setProperty('--skin-atlas', `url("${SKIN_ATLAS_URL}")`);
  const dialog = document.querySelector<HTMLDialogElement>('#skin-gallery');
  const grid = document.getElementById('gallery-grid');
  if (!dialog || !grid) return;
  const buttons: HTMLButtonElement[] = [];
  for (const [index, agent] of AGENTS.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-agent';
    button.setAttribute('aria-label', `${agent.name} 화면 스킨 선택`);
    portraitStyle(button, index);
    const portrait = document.createElement('span');
    portrait.className = 'gallery-portrait';
    const text = document.createElement('span');
    text.className = 'gallery-agent-info';
    const code = document.createElement('small');
    code.textContent = `0${index + 1} / ${agent.role}`;
    const name = document.createElement('strong');
    name.textContent = `${agent.name} ${agent.english}`;
    const quote = document.createElement('span');
    quote.textContent = agent.quote;
    text.append(code, name, quote);
    button.append(portrait, text);
    button.addEventListener('click', () => {
      try { localStorage.setItem('afterhours.agent', String(index)); } catch { /* Storage can be blocked. */ }
      markSelected(index);
      window.dispatchEvent(new CustomEvent(SKIN_EVENT, { detail: index }));
    });
    grid.append(button);
    buttons.push(button);
  }
  function markSelected(index: number): void {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  }
  markSelected(selectedAgent());
  document.getElementById('open-gallery')?.addEventListener('click', () => dialog.showModal());
  document.getElementById('close-gallery')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
}
