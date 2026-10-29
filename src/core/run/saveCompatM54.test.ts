import { describe, expect, it } from 'vitest';
import { MANAGEMENT } from '../management';
import { RunController } from './index';
import fixture from './runSaveV3M53.fixture.json';
import { driveTo, finishBattle, newRun, runDeps } from './testSupport';

/**
 * 유닛 14종 → 30종(M5-4) 이전(커밋 4b33a11)에 만든 v3 저장본을 새 코드가 읽는지 확인한다.
 * 저장본의 유닛 풀에는 신규 16종 재고가 없으므로 복원할 때 기본 재고로 채운다.
 */
const saves = fixture as unknown as Record<'shop' | 'map' | 'test', Record<string, unknown>>;
const NEW_UNITS = MANAGEMENT.POOL_ADDED_IN_M54;
const poolOf = (save: Record<string, unknown>): Record<string, number> => (save as { forces: { management: { pool: Record<string, number> } } }).forces.management.pool;

describe('M5-4 이전 v3 저장본 호환', () => {
  it('저장본에는 신규 유닛 풀이 없다 (픽스처 확인)', () => {
    for (const save of Object.values(saves)) {
      expect((save as { version: number }).version).toBe(3);
      for (const id of NEW_UNITS) expect(poolOf(save)).not.toHaveProperty(id);
    }
  });

  it.each(['shop', 'map', 'test'] as const)('%s 저장본이 복원되고 신규 유닛 재고가 기본 개수로 채워진다', (key) => {
    const run = RunController.restore(runDeps, saves[key]);
    const pool = poolOf(run.serialize() as unknown as Record<string, unknown>);
    for (const id of NEW_UNITS) expect(pool[id]).toBe(MANAGEMENT.POOL_COPIES[runDeps.units.get(id)?.tier ?? 0]);
    // 다시 저장하면 새 형식이고, 그 저장본도 그대로 복원된다
    const again = JSON.parse(JSON.stringify(run.serialize()));
    expect(JSON.parse(JSON.stringify(RunController.restore(runDeps, again).serialize()))).toEqual(again);
  });

  it('복원한 런을 계속 진행할 수 있다 (상점 구매·노드 진행·전투 정산)', () => {
    const run = RunController.restore(runDeps, saves.shop);
    expect(run.phase).toBe('shop');
    run.leaveShop();
    driveTo(run, 'combat');
    expect(finishBattle(run, 'win')).toMatchObject({ ok: true });
    const test = RunController.restore(runDeps, saves.test);
    expect(test.testInfo).not.toBeNull();
    const target = test.availableNodes()[0]!;
    expect(test.chooseNode(target.id).ok).toBe(true);
    expect(finishBattle(test, 'win')).toMatchObject({ ok: true });
  });

  it('신규 유닛이 아닌 유닛의 재고가 빠진 저장본은 여전히 손상으로 거부한다', () => {
    const broken = JSON.parse(JSON.stringify(saves.shop));
    delete broken.forces.management.pool.iron_shieldbearer;
    expect(() => RunController.restore(runDeps, broken)).toThrow(/pool\.iron_shieldbearer/);
  });

  it('알 수 없는 풀 항목은 여전히 거부한다', () => {
    const broken = JSON.parse(JSON.stringify(saves.shop));
    broken.forces.management.pool.ghost_unit = 3;
    expect(() => RunController.restore(runDeps, broken)).toThrow(/ghost_unit/);
  });

  it('새 런을 저장하면 신규 유닛 재고가 들어 있다', () => {
    const run = newRun(3);
    const pool = poolOf(run.serialize() as unknown as Record<string, unknown>);
    for (const id of NEW_UNITS) expect(pool[id]).toBeGreaterThan(0);
  });
});
