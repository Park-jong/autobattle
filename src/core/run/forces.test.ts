import { describe, expect, it } from 'vitest';
import { deckCards, removableCards, upgradableCards } from '../cards';
import { cardCatalog, harten, units } from '../combat/testSupport';
import { PlayerForces } from './forces';

const make = () => PlayerForces.create(units, cardCatalog, harten, { management: 1, deck: 2 }, 'starter');

describe('PlayerForces (로스터·덱·장비·골드 이어받기)', () => {
  it('시작: 지휘관 시작 2기, 10G, 시작 덱 10장', () => {
    const forces = make();
    expect(forces.formation().map((e) => e.unitId)).toEqual(['iron_shieldbearer', 'iron_shieldbearer']);
    expect(forces.economy.gold).toBe(10);
    expect(deckCards(forces.deck)).toHaveLength(10);
  });

  it('준비 손패는 한 판 안에서 같고, 덱을 편집하면 새로 뽑는다', () => {
    const forces = make();
    const first = forces.deckForBattle();
    expect(first.hand).toHaveLength(5);
    expect(forces.deckForBattle()).toEqual(first);
    forces.addCard('firestorm');
    const second = forces.deckForBattle();
    expect(second.hand).toHaveLength(5);
    expect(deckCards(second)).toHaveLength(11);
  });

  it('전투가 끝나면 시뮬이 정리한 덱을 이어받고 장비를 소유 유닛에 저장한다', () => {
    const forces = make();
    const prepared = forces.deckForBattle();
    const ended = structuredClone(prepared);
    ended.discard.push(...ended.hand);
    ended.hand = [];
    forces.finishBattle(ended, new Map([[0, ['forged_blade']], [1, []], [2, ['should_be_ignored']]]));
    expect(forces.deck).toEqual(ended);
    expect(forces.formation().map((e) => e.equipment)).toEqual([['forged_blade'], undefined]);
    expect(forces.deckForBattle().hand).toHaveLength(5); // 다음 판 준비 때 다시 뽑는다
  });

  it('장비 카드 확정은 준비 화면을 다시 만들어도 카드가 복구되지 않게 소모 더미로 보낸다', () => {
    const forces = make();
    const target = forces.deckForBattle().hand[0]!;
    forces.commitEquipmentCard(target.instanceId);
    expect(deckCards(forces.deck).some((c) => c.instanceId === target.instanceId)).toBe(false);
    expect(forces.deckForBattle().hand.some((c) => c.instanceId === target.instanceId)).toBe(false);
    expect(forces.deckForBattle().exhaust.map((c) => c.instanceId)).toContain(target.instanceId);
  });

  it('JSON 저장/복원 후 같은 상태·같은 이후 결과', () => {
    const forces = make();
    forces.economy.settleBattle('a#0', 'normal', 'win');
    forces.management.reroll();
    forces.addCard('abyss_pact');
    const restored = PlayerForces.restore(units, cardCatalog, JSON.parse(JSON.stringify(forces.serialize())));
    expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(forces.serialize()));
    for (const f of [forces, restored]) {
      f.management.reroll();
      f.refreshShop();
      f.addCard('firestorm');
    }
    expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(forces.serialize()));
  });
});

describe('유닛 제공 카드: 공허 대사제·화산 예언자 (M5-4 2부-C)', () => {
  const pairs = [
    { unitId: 'void_hierophant', cardId: 'rift_opening' },
    { unitId: 'volcano_oracle', cardId: 'prophesied_calamity' },
  ] as const;
  /** 준비 덱의 모든 더미에서 해당 카드의 인스턴스 */
  const copies = (forces: PlayerForces, cardId: string) => {
    const deck = forces.deckForBattle();
    return [...deck.draw, ...deck.hand, ...deck.discard, ...deck.exhaust].filter((c) => c.cardId === cardId);
  };

  for (const { unitId, cardId } of pairs) {
    it(`${unitId}: 보드에 올리면 ${cardId}가 덱에 추가되고 벤치·판매 시 제거된다`, () => {
      const forces = make();
      expect(forces.management.addOwnedUnit(unitId, 1, 'bench').ok).toBe(true);
      const id = forces.management.snapshot().bench.find((u) => u?.unitId === unitId)!.id;
      expect(copies(forces, cardId)).toHaveLength(0); // 벤치에서는 제공하지 않는다
      expect(forces.management.moveToBoard(id, { col: 2, row: 2 }).ok).toBe(true);
      const onBoard = copies(forces, cardId);
      expect(onBoard).toHaveLength(1);
      expect(onBoard[0]).toMatchObject({ grantedBy: String(id), upgraded: false });
      expect(copies(forces, cardId)).toHaveLength(1); // 다시 동기화해도 한 장
      forces.management.moveToBench(id);
      expect(copies(forces, cardId)).toHaveLength(0);
      forces.management.moveToBoard(id, { col: 2, row: 2 });
      expect(copies(forces, cardId)).toHaveLength(1);
      forces.management.sell(id);
      expect(copies(forces, cardId)).toHaveLength(0);
    });

    it(`${unitId}: 3성이면 강화 버전이 제공되고, 손패·버린·소모 더미에서도 제거된다`, () => {
      const forces = make();
      expect(forces.management.addOwnedUnit(unitId, 3, 'board').ok).toBe(true);
      const id = forces.management.snapshot().board.find((u) => u.unitId === unitId)!.id;
      expect(copies(forces, cardId)).toMatchObject([{ upgraded: true }]);
      // 준비 덱에서 제공 카드를 손패→버린→소모 더미로 옮겨 가며 확인 (원본 덱이 아니라 준비 덱도 동기화된다)
      for (const pile of ['hand', 'discard', 'exhaust'] as const) {
        const deck = forces.deckForBattle();
        const all = [...deck.draw, ...deck.hand, ...deck.discard, ...deck.exhaust];
        const granted = all.find((c) => c.cardId === cardId)!;
        for (const list of [deck.draw, deck.hand, deck.discard, deck.exhaust]) {
          const at = list.indexOf(granted);
          if (at >= 0) list.splice(at, 1);
        }
        deck[pile].push(granted);
        expect(copies(forces, cardId)).toHaveLength(1);
        forces.management.moveToBench(id);
        expect(copies(forces, cardId)).toHaveLength(0);
        forces.management.moveToBoard(id, { col: 2, row: 2 });
        expect(copies(forces, cardId)).toHaveLength(1); // 새 인스턴스가 다시 들어온다
      }
    });
  }

  it('제공 카드는 제거·강화 대상이 아니다 (유닛과 함께 관리)', () => {
    const forces = make();
    forces.management.addOwnedUnit('void_hierophant', 1, 'board');
    const prepared = forces.deckForBattle();
    expect([...prepared.draw, ...prepared.hand].some((c) => c.cardId === 'rift_opening')).toBe(true);
    expect(removableCards(prepared).some((c) => c.cardId === 'rift_opening')).toBe(false);
    expect(upgradableCards(prepared, cardCatalog).some((c) => c.cardId === 'rift_opening')).toBe(false);
  });
});
