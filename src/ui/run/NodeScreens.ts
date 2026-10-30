import { deckPicker, cardChoice } from './cardElements';
import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import { iconButton } from './iconButton';
import { hudElement } from './hudElement';
import { encounterPreviewElement } from './encounterPreview';
import { relicCard, relicRow } from './relicElements';
import { actPresentation } from '../skin/skins';
import { appSkin } from '../skin/SkinStore';
import { eventOptionPresentation, eventSceneKind, nodeScene } from './nodePresentation';
import { playNodeFeedback } from '../feedback/ActionFeedback';
import './nodeScenes.css';

/** 노드 화면들이 공유하는 틀: 상단 상태 줄 + 제목 + 본문 */
abstract class NodeScreen {
  readonly root = el('div', 'run-node-screen');

  constructor(protected readonly commands: RunCommands) {}

  /** 화면 아래에 고정되는 행동 줄: 내용이 길어 화면을 넘어가도 진행 버튼이 항상 보인다 */
  protected actionBar(...buttons: HTMLElement[]): HTMLElement {
    const bar = el('div', 'run-sticky-actions');
    bar.append(...buttons);
    return bar;
  }

  protected frame(snap: RunSnapshot, title: string, subtitle: string, body: readonly HTMLElement[]): void {
    if (!snap.hud) return;
    const header = el('div', 'run-screen-header');
    header.append(hudElement(snap.hud), tagged(iconButton('home', '시작 화면으로', () => this.commands.toStart()), 'to-start'));
    const main = el('div', 'run-node-main');
    main.append(el('h2', 'run-screen-title', title), el('p', 'run-screen-subtitle', subtitle), ...body);
    this.root.replaceChildren(header, main);
  }
}

/** 보스 유물 선택: 후보 중 하나를 받고 다음 액트로 (건너뛸 수도 있다) */
export class BossRelicScreen extends NodeScreen {
  render(snap: RunSnapshot): void {
    const view = snap.bossRelic;
    if (!view) return;
    const grid = tagged(el('div', 'run-relic-shelf run-boss-relic-grid'), 'boss-relic-choices');
    view.relics.forEach((relic, index) => {
      const box = el('div', 'run-relic-offer');
      box.append(relicCard(relic), tagged(button('이 유물 받기', () => this.commands.claimBossRelic(index), 'dbg-btn dbg-primary run-choice-button'), `boss-relic-${index}`));
      grid.append(box);
    });
    const owned = el('section', 'run-end-section');
    owned.append(el('h3', '', `보유 유물 ${view.owned.length}개`), relicRow(view.owned, '없음'));
    const body = [
      grid,
      owned,
      this.actionBar(tagged(button('받지 않고 다음 액트로', () => this.commands.skipBossRelic(), 'dbg-btn'), 'skip-boss-relic')),
    ];
    this.frame(snap, `액트 ${view.act} 클리어 — ${actPresentation(appSkin.current, view.act)?.name ?? view.actName}`, '보스를 쓰러뜨렸습니다. 보스 유물을 하나 고르세요. 이 선택은 되돌릴 수 없습니다.', body);
  }
}

/** 액트 소개: 새 액트의 지역·보스 소개와 액트 전환 회복 결과를 보여 주고 계속한다 */
export class ActIntroScreen extends NodeScreen {
  render(snap: RunSnapshot): void {
    const view = snap.actIntro;
    if (!view) return;
    const card = tagged(el('div', 'run-act-intro'), 'act-intro');
    const act = actPresentation(appSkin.current, view.act);
    card.append(
      el('h3', 'run-act-name', `액트 ${view.act} / ${view.actCount} — ${act?.name ?? view.name}`),
      el('p', 'dbg-hint', `${act?.region ?? view.region} · ${act?.text ?? view.text}`),
      tagged(el('p', 'run-act-heal', view.healed > 0
        ? `야영을 마치고 숨을 돌렸습니다: 지휘관 HP ${view.hpBefore} → ${view.hpAfter} / ${view.maxHp} (+${view.healed})`
        : `지휘관 HP ${view.hpAfter} / ${view.maxHp} (이미 가득 찼습니다)`), 'act-heal'),
    );
    if (view.boss) card.append(el('h4', '', '이 액트의 보스'), encounterPreviewElement(view.boss));
    const go = tagged(button(`액트 ${view.act} 시작`, () => this.commands.continueAct(), 'dbg-btn dbg-primary run-big-button'), 'continue-act');
    this.frame(snap, `액트 ${view.act} — ${act?.name ?? view.name}`, '골드·유닛·덱·장비·유물은 그대로 이어집니다.', [card, this.actionBar(go)]);
  }
}

/** 상점: 카드 구매 + 카드 제거(덱 카드 고르기) */
export class ShopScreen extends NodeScreen {
  private removing = false;
  private tab: 'cards' | 'relics' | 'removal' = 'cards';

  render(snap: RunSnapshot): void {
    const shop = snap.shop;
    if (!shop) return;
    const previous = this.currentSnap;
    const sameVisit = previous?.hud?.seed === snap.hud?.seed && previous?.hud?.act === snap.hud?.act && previous?.hud?.floor === snap.hud?.floor;
    if (!sameVisit) { this.tab = 'cards'; this.removing = false; }
    const boughtCard = sameVisit ? shop.cards.find((entry) => entry.sold && previous?.shop?.cards.find((old) => old.slot === entry.slot)?.sold === false) : undefined;
    const boughtRelic = sameVisit ? shop.relics.find((entry) => entry.sold && previous?.shop?.relics.find((old) => old.slot === entry.slot)?.sold === false) : undefined;
    this.currentSnap = snap;
    this.root.className = 'run-node-screen node-market';
    const hero = el('section', 'node-market-hero');
    const intro = el('div', 'node-market-intro');
    intro.append(el('span', 'node-eyebrow', `액트 ${snap.hud?.act} · ${snap.hud?.floor}층 / 보급 거점`),
      el('h2', '', appSkin.current === 'modern' ? '보급 교환소' : '떠돌이 상인의 가게'),
      el('p', 'node-merchant-quote', '“다음 전투에 필요한 한 수, 여기서 찾아보세요.”'));
    const wallet = tagged(el('div', 'node-wallet'), 'shop-wallet');
    wallet.append(el('span', '', '사용 가능한 골드'), el('strong', '', `${shop.gold} G`), el('small', '', '카드는 덱에 추가되고, 유물은 바로 효과를 얻습니다'));
    intro.append(wallet); hero.append(nodeScene('market'), intro);
    const tabs = el('nav', 'node-market-tabs');
    tabs.setAttribute('aria-label', '상점 진열대');
    for (const [id, label] of [['cards', `전술 카드 ${shop.cards.filter((c) => !c.sold).length}`], ['relics', `유물 ${shop.relics.filter((c) => !c.sold).length}`], ['removal', '덱 정비']] as const) {
      const tab = tagged(button(label, () => { this.tab = id; this.removing = false; this.render(this.currentSnap); }, `node-market-tab${this.tab === id ? ' active' : ''}`), `market-tab-${id}`);
      tab.setAttribute('aria-pressed', String(this.tab === id)); tabs.append(tab);
    }
    const grid = tagged(el('div', 'run-card-grid face-grid'), 'shop-cards');
    grid.hidden = this.tab !== 'cards';
    for (const entry of shop.cards) {
      const product = cardChoice(entry, {
        label: entry.sold ? '판매 완료' : `구매 ${entry.price}G`,
        badge: `${entry.price}G`,
        disabled: !entry.affordable,
        reason: entry.sold ? null : entry.reason,
        onChoose: () => this.commands.buyShopCard(entry.slot),
        testId: `buy-card-${entry.slot}`,
        face: true,
      });
      product.classList.add('node-market-product');
      product.classList.toggle('sold', entry.sold);
      product.dataset.marketSlot = String(entry.slot);
      if (entry.sold) product.append(el('span', 'node-sold-stamp', '거래 완료'));
      grid.append(product);
    }
    const relicGrid = tagged(el('div', 'run-relic-shelf'), 'shop-relics');
    for (const entry of shop.relics) {
      const box = el('div', 'run-relic-offer');
      box.classList.add('node-market-product');
      box.classList.toggle('sold', entry.sold);
      box.dataset.relicSlot = String(entry.slot);
      box.append(relicCard(entry.relic));
      const buy = tagged(button(entry.sold ? '구매 완료' : `유물 구매 ${entry.price}G`, () => this.commands.buyShopRelic(entry.slot), 'dbg-btn run-choice-button'), `buy-relic-${entry.slot}`);
      buy.disabled = !entry.affordable;
      box.append(buy);
      if (!entry.sold && entry.reason) box.append(el('p', 'run-choice-reason', entry.reason));
      relicGrid.append(box);
    }
    const relicSection = el('section', 'run-shop-relics');
    relicSection.hidden = this.tab !== 'relics';
    relicSection.append(el('h3', '', '유물'), shop.relics.length > 0 ? relicGrid : el('p', 'dbg-hint', '진열된 유물이 없습니다.'));
    const removal = el('section', 'run-shop-removal');
    removal.hidden = this.tab !== 'removal';
    const open = tagged(button(`카드 제거 ${shop.removal.price}G`, () => { this.removing = !this.removing; this.render(this.currentSnap); }), 'open-removal');
    open.disabled = !shop.removal.affordable;
    const removalIcon = el('span', 'node-service-icon', '✂');
    removal.append(removalIcon, el('span', 'node-eyebrow', '덱 정비 서비스'), el('h3', '', '불필요한 작전을 덜어내세요'),
      el('p', 'node-service-description', '덱에서 카드 1장을 영구히 제거합니다. 필요한 카드가 더 자주 손에 들어오도록 덱을 정리하세요.'),
      el('p', 'dbg-hint', '이용할 때마다 다음 제거 가격이 25G 오릅니다.'), open);
    if (shop.removal.reason) removal.append(el('p', 'run-choice-reason', shop.removal.reason));
    const shelf = el('section', 'node-market-shelf');
    shelf.append(tabs, grid, relicSection, removal);
    const body: HTMLElement[] = [hero, shelf];
    if (this.removing && shop.removal.affordable) {
      body.push(deckPicker({
        title: '제거할 카드를 고르세요',
        items: shop.removal.candidates.map((card) => ({ key: card.instanceId, card })),
        actionLabel: `제거 ${shop.removal.price}G`,
        onPick: (id) => { this.removing = false; this.commands.removeCard(id); },
        onCancel: () => { this.removing = false; this.render(this.currentSnap); },
        testId: 'removal-picker',
        face: true,
      }));
    } else this.removing = false;
    body.push(this.actionBar(el('span', 'node-footer-note', '유닛 모집은 전투 준비 화면에서 할 수 있습니다.'), tagged(button('상점 나가기 →', () => this.commands.leaveShop(), 'dbg-btn dbg-primary'), 'leave-shop')));
    this.frame(snap, '상점', '다음 전투를 준비하세요.', body);
    const purchased = boughtCard?.name ?? boughtRelic?.relic.name;
    if (purchased) queueMicrotask(() => {
      const anchor = this.root.querySelector<HTMLElement>(boughtCard ? `[data-market-slot="${boughtCard.slot}"]` : `[data-relic-slot="${boughtRelic!.slot}"]`);
      if (anchor) playNodeFeedback({ kind: 'purchase', label: `${purchased} 획득`, amount: -(boughtCard?.price ?? boughtRelic!.price) }, anchor);
    });
    if (sameVisit && previous?.shop && shop.removal.price > previous.shop.removal.price) {
      queueMicrotask(() => playNodeFeedback({ kind: 'event', label: '덱 정비 완료 · 카드 제거' }, removal));
    }
  }

  private currentSnap!: RunSnapshot;
}

/** 이벤트: 선택지(불가 사유 표시) → 추가 카드 선택 → 결과 */
export class EventScreen extends NodeScreen {
  private previous: RunSnapshot | undefined;
  private choiceBefore: { gold: number; hp: number } | null = null;

  render(snap: RunSnapshot): void {
    const event = snap.event;
    if (!event) return;
    const previous = this.previous;
    const sameVisit = previous?.hud?.seed === snap.hud?.seed && previous?.hud?.act === snap.hud?.act && previous?.hud?.floor === snap.hud?.floor && previous?.event?.eventId === event.eventId;
    if (!sameVisit) this.choiceBefore = null;
    if (sameVisit && previous?.event?.chosen === null && event.chosen !== null && previous.hud) this.choiceBefore = { gold: previous.hud.gold, hp: previous.hud.hp };
    this.previous = snap;
    this.root.className = 'run-node-screen node-event';
    const layout = el('div', 'node-encounter-layout');
    const story = el('section', 'node-story');
    const storyCopy = el('div', 'node-story-copy');
    storyCopy.append(el('span', 'node-eyebrow', `액트 ${snap.hud?.act} · ${snap.hud?.floor}층 / 뜻밖의 만남`), el('h2', '', event.title), el('p', 'run-event-text', event.text));
    story.append(nodeScene(eventSceneKind(event.eventId ?? '')), storyCopy);
    const decision = el('section', 'node-decision');
    const heading = el('header', 'node-decision-head');
    heading.append(el('span', 'node-eyebrow', event.finished ? '조우 완료' : event.chosen !== null ? '선택 결과' : '선택의 순간'),
      el('h3', '', event.chosen === null ? '어떻게 하시겠습니까?' : event.pending ? '마지막 선택을 마무리하세요' : '당신의 선택이 여정에 남았습니다'));
    decision.append(heading);
    const body: HTMLElement[] = [layout];
    const choices = tagged(el('div', 'run-event-choices'), 'event-choices');
    for (const choice of event.choices) {
      const row = el('div', 'run-event-choice');
      const selected = event.chosen === choice.index;
      const pick = tagged(button('', () => this.commands.chooseEventOption(choice.index), `dbg-btn run-event-button${selected ? ' selected' : ''}`), `event-choice-${choice.index}`);
      const presentation = eventOptionPresentation(choice.text);
      const copy = el('span', 'node-choice-copy');
      copy.append(el('strong', '', presentation.title));
      const consequences = el('span', 'node-consequences');
      for (const text of presentation.consequences) consequences.append(el('span', /저주|HP\s*[-−]|-\d+G/u.test(text) ? 'cost' : 'gain', text));
      if (presentation.consequences.length === 0) consequences.append(el('span', '', '이 선택으로 진행'));
      copy.append(consequences);
      pick.append(el('span', 'node-choice-number', selected ? '✓' : String(choice.index + 1).padStart(2, '0')), copy, el('span', 'node-choice-arrow', selected ? '선택 완료' : '→'));
      pick.setAttribute('aria-label', choice.text);
      pick.disabled = !choice.enabled || event.chosen !== null;
      row.append(pick);
      if (!choice.enabled && choice.reason) row.append(el('p', 'run-choice-reason', choice.reason));
      choices.append(row);
    }
    decision.append(choices);
    layout.append(story, decision);
    if (event.messages.length > 0) {
      const log = tagged(el('div', 'run-event-result'), 'event-result');
      log.setAttribute('role', 'status');
      log.append(el('span', 'node-eyebrow', '결과'), el('h3', '', event.finished ? '선택이 완료되었습니다' : '새로운 기회가 열렸습니다'));
      if (this.choiceBefore && snap.hud) {
        const changes = el('div', 'node-result-changes');
        const gold = snap.hud.gold - this.choiceBefore.gold, hp = snap.hud.hp - this.choiceBefore.hp;
        if (gold !== 0) changes.append(el('span', gold > 0 ? 'gain' : 'cost', `골드 ${gold > 0 ? '+' : ''}${gold} G`));
        if (hp !== 0) changes.append(el('span', hp > 0 ? 'gain' : 'cost', `HP ${hp > 0 ? '+' : ''}${hp}`));
        log.append(changes);
      }
      for (const message of event.messages) log.append(el('p', '', message));
      decision.append(log);
    }
    const pending = event.pending;
    if (pending?.kind === 'gainCard') {
      const grid = tagged(el('div', 'run-card-grid face-grid'), 'event-pending');
      for (const option of pending.options) {
        grid.append(cardChoice(option.card, { label: '이 카드 받기', onChoose: () => this.commands.pickEventOption(option.optionIndex), testId: `event-pick-${option.optionIndex}`, face: true }));
      }
      body.push(el('h3', '', pending.title), grid);
    } else if (pending) {
      body.push(deckPicker({
        title: pending.title,
        items: pending.options.map((o) => ({ key: o.optionIndex, card: o.card })),
        actionLabel: pending.kind === 'removeCard' ? '제거' : '강화',
        onPick: (index) => this.commands.pickEventOption(index),
        testId: 'event-pending',
        face: true,
      }));
    }
    if (event.finished) body.push(this.actionBar(el('span', 'node-footer-note', '선택의 결과가 적용되었습니다.'), tagged(button('여정 계속 →', () => this.commands.finishEvent(), 'dbg-btn dbg-primary'), 'finish-event')));
    this.frame(snap, event.title, '이벤트', body);
    if (sameVisit && previous?.event?.chosen === null && event.chosen !== null) {
      queueMicrotask(() => playNodeFeedback({ kind: 'event', label: '선택 결과 적용' }, decision));
    }
    if (event.pending && (!sameVisit || previous?.event?.pending?.kind !== event.pending.kind)) {
      queueMicrotask(() => this.root.querySelector<HTMLElement>('[data-testid="event-pending"]')?.scrollIntoView({ block: 'start', behavior: document.body.dataset.motion === 'reduced' ? 'auto' : 'smooth' }));
    }
    if (sameVisit && event.finished && !previous?.event?.finished) {
      queueMicrotask(() => {
        const result = this.root.querySelector<HTMLElement>('[data-testid="event-result"]');
        if (!result) return;
        result.tabIndex = -1;
        result.focus({ preventScroll: true });
        result.scrollIntoView({ block: 'center', behavior: document.body.dataset.motion === 'reduced' ? 'auto' : 'smooth' });
      });
    }
  }
}

/** 야영지: 휴식 / 카드 강화(덱 카드 고르기) / 유닛 승급 중 택1 */
export class CampScreen extends NodeScreen {
  private mode: 'upgrade' | 'promote' | null = null;
  private currentSnap!: RunSnapshot;

  render(snap: RunSnapshot): void {
    const camp = snap.camp;
    if (!camp) return;
    this.currentSnap = snap;
    const choose = (mode: 'upgrade' | 'promote'): void => { this.mode = this.mode === mode ? null : mode; this.render(this.currentSnap); };
    const actions = tagged(el('div', 'run-camp-actions'), 'camp-actions');
    const heal = tagged(button(camp.canHeal ? `휴식: HP +${camp.healAmount}` : '휴식 (HP 가득)', () => this.commands.campHeal(), 'dbg-btn run-camp-button'), 'camp-heal');
    heal.disabled = !camp.canHeal;
    const upgrade = tagged(button('단련: 카드 강화', () => choose('upgrade'), `dbg-btn run-camp-button${this.mode === 'upgrade' ? ' selected' : ''}`), 'camp-upgrade');
    upgrade.disabled = camp.upgradable.length === 0;
    const promote = tagged(button('승급: 유닛 한 성급 올리기', () => choose('promote'), `dbg-btn run-camp-button${this.mode === 'promote' ? ' selected' : ''}`), 'camp-promote');
    promote.disabled = camp.promotions.length === 0;
    actions.append(heal, upgrade, promote);
    const body: HTMLElement[] = [actions];
    if (camp.upgradable.length === 0) body.push(el('p', 'run-choice-reason', '강화할 수 있는 카드가 없습니다.'));
    if (camp.promotions.length === 0) body.push(el('p', 'run-choice-reason', '승급할 수 있는 유닛이 없습니다.'));
    if (this.mode === 'upgrade' && camp.upgradable.length > 0) {
      body.push(deckPicker({
        title: '강화할 카드를 고르세요 (한 번만 고를 수 있습니다)',
        items: camp.upgradable.map((card) => ({ key: card.instanceId, card })),
        actionLabel: '강화',
        onPick: (id) => { this.mode = null; this.commands.campUpgrade(id); },
        onCancel: () => choose('upgrade'),
        testId: 'upgrade-picker',
        face: true,
      }));
    } else if (this.mode === 'promote' && camp.promotions.length > 0) {
      const list = tagged(el('div', 'run-promotions'), 'promotion-list');
      for (const p of camp.promotions) {
        const row = el('div', 'run-promotion');
        row.append(
          el('strong', '', `${p.unitName} ${'★'.repeat(p.star)} → ${'★'.repeat(p.nextStar)}`),
          el('span', '', `${p.cost}G · 같은 유닛 ${p.extraCopies}기 분 재고 사용`),
        );
        const go = tagged(button('승급', () => { this.mode = null; this.commands.campPromote(p.id); }), `promote-${p.id}`);
        go.disabled = !p.available;
        row.append(go);
        if (p.reason) row.append(el('span', 'run-choice-reason', p.reason));
        list.append(row);
      }
      body.push(list);
    } else this.mode = null;
    body.push(this.actionBar(tagged(button('아무것도 하지 않고 떠나기', () => { this.mode = null; this.commands.leaveCamp(); }), 'leave-camp')));
    this.frame(snap, '야영지', `HP ${camp.hp}/${camp.maxHp} · ${camp.gold}G · 휴식 / 카드 강화 / 유닛 승급 중 하나를 고르세요.`, body);
  }
}
