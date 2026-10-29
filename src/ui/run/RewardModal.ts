import { cardFaceElement } from '../cards/cardFace';
import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import { hudElement } from './hudElement';
import { relicCard } from './relicElements';
import type { CardView } from './runViews';

/** 보상 카드 한 장: 손패와 같은 카드 모양 + 아래 버튼. 카드 자체를 눌러도 고른다 */
function rewardCard(card: CardView, index: number, onChoose: () => void): HTMLElement {
  const root = el('div', 'rw-choice');
  const face = cardFaceElement({ ...card, tags: [...card.tags, ...(card.hpCostLabel ? [card.hpCostLabel] : [])] });
  face.classList.add('rw-card');
  face.tabIndex = 0;
  face.setAttribute('role', 'button');
  face.setAttribute('aria-label', `${card.name} 받기. ${card.text}`);
  face.addEventListener('click', onChoose);
  face.addEventListener('keydown', (e) => {
    if (e.target !== face || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onChoose();
  });
  const holder = el('div', 'rw-card-zoom');
  holder.append(face);
  root.append(holder, tagged(button('이 카드 받기', onChoose, 'rw-btn rw-primary'), `reward-${index}`));
  return root;
}

/**
 * 카드 보상 창(모달): 전투 화면 위에 띄워 카드 3장 중 1장을 받거나 건너뛴다. 정예면 유물도 함께 보여준다.
 * 전투 화면 뒤 배경이 없을 때(저장본에서 이어하기)는 같은 창이 빈 배경 위에 뜨고, 그때만 상단 상태 줄을 붙인다.
 * 창 뒤 배경(어두운 막)이 화면 전체를 덮어 전투 화면의 상점·벤치·손패 조작을 막는다.
 */
export class RewardModal {
  readonly root = tagged(el('div', 'rw-backdrop'), 'reward-modal');

  constructor(private readonly commands: RunCommands) {
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '카드 보상');
  }

  render(snap: RunSnapshot): void {
    const reward = snap.reward;
    this.root.hidden = reward === null;
    if (!reward) {
      this.root.replaceChildren();
      return;
    }
    this.root.classList.toggle('solo', snap.battle === null);
    const panel = el('div', 'rw-panel');
    // 전투 화면이 뒤에 없으면(상단 바가 없다) 상태 줄을 모달에 직접 붙인다
    if (snap.battle === null && snap.hud) {
      const header = el('div', 'rw-header');
      header.append(hudElement(snap.hud), tagged(button('시작 화면', () => this.commands.toStart(), 'rw-btn'), 'to-start'));
      panel.append(header);
    }
    panel.append(
      el('h2', 'rw-title', '보상'),
      el('p', 'rw-subtitle', reward.source === 'elite' ? '정예를 쓰러뜨렸습니다. 유물과 카드 1장을 얻으세요.' : '승리! 카드 1장을 덱에 추가하세요.'),
    );
    if (reward.relic) {
      const box = tagged(el('section', 'rw-relic'), 'reward-relic');
      box.append(el('h3', '', '정예 보상: 유물'), relicCard(reward.relic));
      if (reward.relicClaimed) box.append(el('p', 'run-relic-claimed', '유물을 획득했습니다.'));
      else {
        box.append(
          tagged(button('유물 받기', () => this.commands.claimRelic(), 'rw-btn rw-primary'), 'claim-relic'),
          el('p', 'rw-hint', '카드를 고르거나 건너뛰면 유물도 함께 받습니다.'),
        );
      }
      panel.append(box);
    }
    const grid = tagged(el('div', 'rw-cards'), 'reward-cards');
    reward.cards.forEach((card, index) => grid.append(rewardCard(card, index, () => this.commands.claimReward(index))));
    panel.append(grid, tagged(button('건너뛰기', () => this.commands.skipReward(), 'rw-btn'), 'skip-reward'));
    this.root.replaceChildren(panel);
  }
}
