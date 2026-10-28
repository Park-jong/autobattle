import { describe, expect, it } from 'vitest';
import { deckCards } from '../cards';
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
