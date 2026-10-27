import { describe, expect, it } from 'vitest';
import { TriggerBus } from './triggers';

describe('TriggerBus', () => {
  it('등록 순서대로 호출하고 페이로드를 전달', () => {
    const bus = new TriggerBus();
    const log: string[] = [];
    bus.on('onTick', (p) => log.push(`a${p.tick}`));
    bus.on('onTick', (p) => log.push(`b${p.tick}`));
    bus.emit('onTick', { tick: 3, time: 0.3 });
    expect(log).toEqual(['a3', 'b3']);
  });
  it('다른 종류 트리거는 호출하지 않음', () => {
    const bus = new TriggerBus();
    let called = 0;
    bus.on('onTick', () => called++);
    bus.emit('onTick', { tick: 0, time: 0 });
    expect(called).toBe(1);
  });
  it('반환된 함수로 구독 해제', () => {
    const bus = new TriggerBus();
    let called = 0;
    const off = bus.on('onTick', () => called++);
    off();
    bus.emit('onTick', { tick: 0, time: 0 });
    expect(called).toBe(0);
  });
});
