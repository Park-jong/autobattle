import { describe, expect, it } from 'vitest';
import { formation, traits, units } from '../../core/combat/testSupport';
import { BattleSession } from './BattleSession';

const A = formation([
  ['iron_shieldbearer', 1, 3, 1],
  ['arena_recruit', 1, 2, 2],
]);
const B = formation([
  ['arena_recruit', 1, 4, 1],
  ['shade_dagger', 1, 5, 2],
]);

function newSession(): BattleSession {
  return new BattleSession(units, traits, [A, B]);
}

function playToEnd(session: BattleSession): void {
  for (let i = 0; i < 5000 && session.phase !== 'finished'; i++) session.advance(0.1);
}

describe('BattleSession 편성', () => {
  it('칸 클릭으로 양쪽 영역에 배치하고 우클릭으로 제거한다', () => {
    const s = new BattleSession(units, traits);
    s.setBrush({ kind: 'unit', unitId: 'moss_warden', star: 2 });
    s.clickCell({ col: 1, row: 1 }, false);
    s.clickCell({ col: 6, row: 3 }, false);
    expect(s.snapshot().formations[0]).toEqual([{ unitId: 'moss_warden', star: 2, cell: { col: 1, row: 1 } }]);
    expect(s.snapshot().formations[1]).toHaveLength(1);
    expect(s.views()).toHaveLength(2);

    s.clickCell({ col: 1, row: 1 }, true);
    expect(s.snapshot().formations[0]).toHaveLength(0);
    s.setBrush({ kind: 'erase' });
    s.clickCell({ col: 6, row: 3 }, false);
    expect(s.snapshot().formations[1]).toHaveLength(0);
  });

  it('같은 칸에 다시 배치하면 교체하고, 활성 특성을 계산한다', () => {
    const s = newSession();
    expect(s.snapshot().traits[0].find((t) => t.traitId === 'iron_legion')?.tier).toBe(1);
    s.setBrush({ kind: 'unit', unitId: 'shade_dagger', star: 3 });
    s.clickCell({ col: 2, row: 2 }, false);
    expect(s.snapshot().formations[0]).toHaveLength(2);
    expect(s.snapshot().traits[0].find((t) => t.traitId === 'iron_legion')?.tier).toBe(0);
  });
});

describe('BattleSession 재생', () => {
  it('시작하면 끝까지 재생되어 결과가 나오고, 리셋하면 편성으로 돌아간다', () => {
    const s = newSession();
    s.start(1);
    expect(s.phase).toBe('playing');
    s.advance(1);
    expect(s.time).toBeCloseTo(1);
    playToEnd(s);
    expect(s.phase).toBe('finished');
    const result = s.snapshot().result;
    expect(result).not.toBeNull();
    expect(s.time).toBeCloseTo(result?.endTime ?? -1);
    expect(s.views().filter((v) => v.alive)).toHaveLength(result?.survivors.length ?? -1);

    s.reset();
    expect(s.phase).toBe('edit');
    expect(s.time).toBe(0);
    expect(s.snapshot().result).toBeNull();
    expect(s.snapshot().formations[0]).toHaveLength(2);
  });

  it('일시정지 중에는 시간이 흐르지 않고 배속이 적용된다', () => {
    const s = newSession();
    s.start(2);
    s.togglePause();
    s.advance(1);
    expect(s.time).toBe(0);
    s.togglePause();
    s.setSpeed(4);
    s.advance(0.5);
    expect(s.time).toBeCloseTo(2);
  });

  it('전투 중에는 편성을 바꿀 수 없다', () => {
    const s = newSession();
    s.start(1);
    s.setBrush({ kind: 'erase' });
    s.clickCell({ col: 3, row: 1 }, false);
    expect(s.snapshot().formations[0]).toHaveLength(2);
  });

  it('유닛이 없는 진영이 있거나 시드가 정수가 아니면 시작하지 않고 오류를 표시한다', () => {
    const s = new BattleSession(units, traits, [A, []]);
    s.start(1);
    expect(s.phase).toBe('edit');
    expect(s.snapshot().error).toContain('1기 이상');
    const t = newSession();
    t.start(1.5);
    expect(t.phase).toBe('edit');
    expect(t.snapshot().error).toContain('정수');
  });

  it('같은 시드면 같은 결과다', () => {
    const results = [1, 2].map(() => {
      const s = newSession();
      s.start(7);
      playToEnd(s);
      return JSON.stringify(s.snapshot().result);
    });
    expect(results[0]).toBe(results[1]);
  });
});

describe('BattleSession 편성 저장/불러오기', () => {
  it('내보낸 JSON을 다시 불러오면 같은 편성이 된다', () => {
    const s = newSession();
    const json = s.exportFormation(0);
    expect(JSON.parse(json).units[0]).toEqual({ unitId: 'iron_shieldbearer', star: 1, col: 3, row: 1 });
    const t = new BattleSession(units, traits);
    t.importFormation(0, json);
    expect(t.snapshot().formations[0]).toEqual(A);
    expect(t.views()).toHaveLength(2);
  });

  it('잘못된 JSON, 반대 진영 영역, 알 수 없는 유닛은 한국어 오류로 거부한다', () => {
    const s = new BattleSession(units, traits);
    expect(() => s.importFormation(0, '{')).toThrow('JSON');
    expect(() => s.importFormation(0, s.exportFormation(1).replace('[]', '[{"unitId":"arena_recruit","star":1,"col":5,"row":0}]'))).toThrow('영역');
    expect(() => s.importFormation(0, '{"units":[{"unitId":"nope","star":1,"col":0,"row":0}]}')).toThrow('알 수 없는 유닛');
    expect(s.snapshot().formations[0]).toHaveLength(0);
  });
});
