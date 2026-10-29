import { deckPicker, cardChoice } from './cardElements';
import type { RunCommands, RunSnapshot } from './contracts';
import { button, el, tagged } from './dom';
import { hudElement } from './hudElement';
import { encounterPreviewElement } from './encounterPreview';
import { relicCard, relicRow } from './relicElements';

/** 노드 화면들이 공유하는 틀: 상단 상태 줄 + 제목 + 본문 */
abstract class NodeScreen {
  readonly root = el('div', 'run-node-screen');

  constructor(protected readonly commands: RunCommands) {}

  protected frame(snap: RunSnapshot, title: string, subtitle: string, body: readonly HTMLElement[]): void {
    if (!snap.hud) return;
    const header = el('div', 'run-screen-header');
    header.append(hudElement(snap.hud), tagged(button('시작 화면', () => this.commands.toStart()), 'to-start'));
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
      tagged(button('받지 않고 다음 액트로', () => this.commands.skipBossRelic(), 'dbg-btn'), 'skip-boss-relic'),
      owned,
    ];
    this.frame(snap, `액트 ${view.act} 클리어 — ${view.actName}`, '보스를 쓰러뜨렸습니다. 보스 유물을 하나 고르세요. 이 선택은 되돌릴 수 없습니다.', body);
  }
}

/** 액트 소개: 새 액트의 지역·보스 소개와 액트 전환 회복 결과를 보여 주고 계속한다 */
export class ActIntroScreen extends NodeScreen {
  render(snap: RunSnapshot): void {
    const view = snap.actIntro;
    if (!view) return;
    const card = tagged(el('div', 'run-act-intro'), 'act-intro');
    card.append(
      el('h3', 'run-act-name', `액트 ${view.act} / ${view.actCount} — ${view.name}`),
      el('p', 'dbg-hint', `${view.region} · ${view.text}`),
      tagged(el('p', 'run-act-heal', view.healed > 0
        ? `야영을 마치고 숨을 돌렸습니다: 지휘관 HP ${view.hpBefore} → ${view.hpAfter} / ${view.maxHp} (+${view.healed})`
        : `지휘관 HP ${view.hpAfter} / ${view.maxHp} (이미 가득 찼습니다)`), 'act-heal'),
    );
    if (view.boss) card.append(el('h4', '', '이 액트의 보스'), encounterPreviewElement(view.boss));
    const go = tagged(button(`액트 ${view.act} 시작`, () => this.commands.continueAct(), 'dbg-btn dbg-primary run-big-button'), 'continue-act');
    this.frame(snap, `액트 ${view.act} — ${view.name}`, '골드·유닛·덱·장비·유물은 그대로 이어집니다.', [card, go]);
  }
}

/** 상점: 카드 구매 + 카드 제거(덱 카드 고르기) */
export class ShopScreen extends NodeScreen {
  private removing = false;

  render(snap: RunSnapshot): void {
    const shop = snap.shop;
    if (!shop) return;
    const grid = tagged(el('div', 'run-card-grid'), 'shop-cards');
    for (const entry of shop.cards) {
      grid.append(cardChoice(entry, {
        label: entry.sold ? '판매 완료' : `구매 ${entry.price}G`,
        badge: `${entry.price}G`,
        disabled: !entry.affordable,
        reason: entry.sold ? null : entry.reason,
        onChoose: () => this.commands.buyShopCard(entry.slot),
        testId: `buy-card-${entry.slot}`,
      }));
    }
    const relicGrid = tagged(el('div', 'run-relic-shelf'), 'shop-relics');
    for (const entry of shop.relics) {
      const box = el('div', 'run-relic-offer');
      box.append(relicCard(entry.relic));
      const buy = tagged(button(entry.sold ? '구매 완료' : `유물 구매 ${entry.price}G`, () => this.commands.buyShopRelic(entry.slot), 'dbg-btn run-choice-button'), `buy-relic-${entry.slot}`);
      buy.disabled = !entry.affordable;
      box.append(buy);
      if (!entry.sold && entry.reason) box.append(el('p', 'run-choice-reason', entry.reason));
      relicGrid.append(box);
    }
    const relicSection = el('section', 'run-shop-relics');
    relicSection.append(el('h3', '', '유물'), shop.relics.length > 0 ? relicGrid : el('p', 'dbg-hint', '진열된 유물이 없습니다.'));
    const removal = el('section', 'run-shop-removal');
    const open = tagged(button(`카드 제거 ${shop.removal.price}G`, () => { this.removing = !this.removing; this.render(this.currentSnap); }), 'open-removal');
    open.disabled = !shop.removal.affordable;
    removal.append(el('h3', '', '카드 제거'), el('p', 'dbg-hint', '덱에서 카드 1장을 영구히 없앱니다. 제거할 때마다 가격이 25G 오릅니다.'), open);
    if (shop.removal.reason) removal.append(el('p', 'run-choice-reason', shop.removal.reason));
    const body: HTMLElement[] = [grid, relicSection, removal];
    if (this.removing && shop.removal.affordable) {
      body.push(deckPicker({
        title: '제거할 카드를 고르세요',
        items: shop.removal.candidates.map((card) => ({ key: card.instanceId, card })),
        actionLabel: `제거 ${shop.removal.price}G`,
        onPick: (id) => { this.removing = false; this.commands.removeCard(id); },
        onCancel: () => { this.removing = false; this.render(this.currentSnap); },
        testId: 'removal-picker',
      }));
    } else this.removing = false;
    body.push(tagged(button('상점 나가기', () => this.commands.leaveShop(), 'dbg-btn dbg-primary'), 'leave-shop'));
    this.currentSnap = snap;
    this.frame(snap, '상점', `보유 골드 ${shop.gold}G · 유닛은 전투 준비 화면의 상점에서 살 수 있습니다.`, body);
  }

  private currentSnap!: RunSnapshot;
}

/** 이벤트: 선택지(불가 사유 표시) → 추가 카드 선택 → 결과 */
export class EventScreen extends NodeScreen {
  render(snap: RunSnapshot): void {
    const event = snap.event;
    if (!event) return;
    const body: HTMLElement[] = [el('p', 'run-event-text', event.text)];
    const choices = tagged(el('div', 'run-event-choices'), 'event-choices');
    for (const choice of event.choices) {
      const row = el('div', 'run-event-choice');
      const pick = tagged(button(choice.text, () => this.commands.chooseEventOption(choice.index), `dbg-btn run-event-button${event.chosen === choice.index ? ' selected' : ''}`), `event-choice-${choice.index}`);
      pick.disabled = !choice.enabled || event.chosen !== null;
      row.append(pick);
      if (!choice.enabled && choice.reason) row.append(el('p', 'run-choice-reason', choice.reason));
      choices.append(row);
    }
    body.push(choices);
    if (event.messages.length > 0) {
      const log = tagged(el('div', 'run-event-result'), 'event-result');
      for (const message of event.messages) log.append(el('p', '', message));
      body.push(log);
    }
    const pending = event.pending;
    if (pending?.kind === 'gainCard') {
      const grid = tagged(el('div', 'run-card-grid'), 'event-pending');
      for (const option of pending.options) {
        grid.append(cardChoice(option.card, { label: '이 카드 받기', onChoose: () => this.commands.pickEventOption(option.optionIndex), testId: `event-pick-${option.optionIndex}` }));
      }
      body.push(el('h3', '', pending.title), grid);
    } else if (pending) {
      body.push(deckPicker({
        title: pending.title,
        items: pending.options.map((o) => ({ key: o.optionIndex, card: o.card })),
        actionLabel: pending.kind === 'removeCard' ? '제거' : '강화',
        onPick: (index) => this.commands.pickEventOption(index),
        testId: 'event-pending',
      }));
    }
    if (event.finished) body.push(tagged(button('계속', () => this.commands.finishEvent(), 'dbg-btn dbg-primary'), 'finish-event'));
    this.frame(snap, event.title, '이벤트', body);
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
    body.push(tagged(button('아무것도 하지 않고 떠나기', () => { this.mode = null; this.commands.leaveCamp(); }), 'leave-camp'));
    this.frame(snap, '야영지', `HP ${camp.hp}/${camp.maxHp} · ${camp.gold}G · 휴식 / 카드 강화 / 유닛 승급 중 하나를 고르세요.`, body);
  }
}
