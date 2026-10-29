import { describe, expect, it } from 'vitest';
import metaJson from '../../../data/meta.json';
import { runDeps } from '../run/testSupport';
import { loadMeta } from './metaLoader';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Data = { points: Record<string, unknown>; unlocks: Record<string, unknown>[] };
const { commanders, relics } = runDeps;

function errorOf(edit: (d: Data) => void): string {
  const data = clone(metaJson) as unknown as Data;
  edit(data);
  try {
    loadMeta(data, commanders, relics);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('에러가 발생해야 함');
}

describe('loadMeta', () => {
  it('실제 data/meta.json이 통과하고 지휘관 2 + 유물 12 항목이 있다', () => {
    const catalog = loadMeta(metaJson, commanders, relics);
    expect(catalog.ofTarget('commander').map((e) => e.id)).toEqual(['cmd_isera', 'cmd_nox']);
    expect(catalog.ofTarget('relic')).toHaveLength(12);
    expect(catalog.get('cmd_nox')).toMatchObject({ price: 120, condition: { type: 'bossKilled', act: 2 } });
    expect(catalog.get('old_baton')).toBeUndefined();
  });

  it('잠그는 대상 집합 = commanders.json·relics.json에서 unlock 문구가 있는 항목', () => {
    const catalog = loadMeta(metaJson, commanders, relics);
    const locked = new Set(catalog.unlocks.map((e) => e.id));
    const withText = [...commanders.commanders.filter((c) => c.unlock), ...relics.relics.filter((r) => r.unlock)].map((x) => x.id);
    expect([...locked].sort()).toEqual([...withText].sort());
    expect(locked.has('cmd_harten')).toBe(false);
  });

  it('모르는 필드·잘못된 값을 위치와 함께 거부한다', () => {
    expect(errorOf((d) => { d.points.bonus = 1; })).toContain('points.bonus: 알 수 없는 필드');
    expect(errorOf((d) => { d.points.perFloor = -1; })).toContain('points.perFloor: 0 이상이어야 함');
    expect(errorOf((d) => { d.unlocks[0]!.price = 0; })).toContain('unlocks[0].price: 1 이상이어야 함');
    expect(errorOf((d) => { d.unlocks[0]!.extra = 1; })).toContain('unlocks[0].extra: 알 수 없는 필드');
    expect(errorOf((d) => { d.unlocks[0]!.target = 'card'; })).toContain('unlocks[0].target: 알 수 없는 값 "card"');
    expect(errorOf((d) => { d.unlocks[0]!.condition = { type: 'winAll' }; })).toContain('unlocks[0].condition.type: 알 수 없는 값 "winAll"');
    expect(errorOf((d) => { d.unlocks[0]!.condition = { type: 'runsCompleted' }; })).toContain('unlocks[0].condition.count: 필수 필드 누락');
    expect(errorOf((d) => { d.unlocks[0]!.condition = { type: 'unitStar3', count: 1 }; })).toContain('unlocks[0].condition.count: 알 수 없는 필드');
    expect(errorOf((d) => { d.unlocks[0]!.condition = { type: 'eliteKills', count: 1.5 }; })).toContain('unlocks[0].condition.count: 정수여야 함');
  });

  it('중복 id와 없는 지휘관·유물 id를 거부한다', () => {
    expect(errorOf((d) => { d.unlocks[1]!.id = 'cmd_isera'; })).toContain('unlocks[1].id: 중복된 id "cmd_isera" (unlocks[0]와 동일)');
    expect(errorOf((d) => { d.unlocks[0]!.id = 'cmd_ghost'; })).toContain('unlocks[0].id: commanders.json에 없는 지휘관 id "cmd_ghost"');
    expect(errorOf((d) => { d.unlocks[2]!.id = 'ghost_relic'; })).toContain('unlocks[2].id: relics.json에 없는 유물 id "ghost_relic"');
  });

  it('잠그는 대상 집합이 unlock 문구와 어긋나면 거부한다', () => {
    // 해금 항목이 빠짐
    expect(errorOf((d) => { d.unlocks.splice(0, 1); })).toContain('"cmd_isera"에 unlock 문구가 있는데 meta.json에 해금 항목이 없음');
    // 문구가 없는 유물을 잠금
    expect(errorOf((d) => { d.unlocks.push({ target: 'relic', id: 'old_baton', price: 5, condition: { type: 'unitStar3' } }); }))
      .toContain('"old_baton"는 relics.json에 unlock 문구가 없음');
    // 문구가 없는 지휘관(하르텐)을 잠금
    expect(errorOf((d) => { d.unlocks.push({ target: 'commander', id: 'cmd_harten', price: 5, condition: { type: 'unitStar3' } }); }))
      .toContain('"cmd_harten"는 commanders.json에 unlock 문구가 없음');
  });
});
