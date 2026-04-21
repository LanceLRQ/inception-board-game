// useToastStore 单测

import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from './useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it('初始 queue 为空', () => {
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it('push 后队列新增一条，含 id/createdAt', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'hello', duration: 3000 });
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(1);
    expect(queue[0]!.id).toBe(id);
    expect(queue[0]!.message).toBe('hello');
    expect(queue[0]!.kind).toBe('info');
    expect(queue[0]!.duration).toBe(3000);
    expect(typeof queue[0]!.createdAt).toBe('number');
  });

  it('remove 按 id 删除', () => {
    const id = useToastStore.getState().push({ kind: 'info', message: 'a', duration: 0 });
    useToastStore.getState().push({ kind: 'warn', message: 'b', duration: 0 });
    useToastStore.getState().remove(id);
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(1);
    expect(queue[0]!.message).toBe('b');
  });

  it('clear 清空所有', () => {
    useToastStore.getState().push({ kind: 'info', message: 'a', duration: 0 });
    useToastStore.getState().push({ kind: 'error', message: 'b', duration: 0 });
    useToastStore.getState().clear();
    expect(useToastStore.getState().queue).toEqual([]);
  });

  it('同 id 复发 → 替换而不是追加（支持"更新"语义）', () => {
    useToastStore.getState().push({ id: 'x', kind: 'info', message: 'first', duration: 0 });
    useToastStore.getState().push({ id: 'x', kind: 'error', message: 'second', duration: 0 });
    const { queue } = useToastStore.getState();
    expect(queue.length).toBe(1);
    expect(queue[0]!.message).toBe('second');
    expect(queue[0]!.kind).toBe('error');
  });

  it('队列超过 maxVisible * 2 时截断（FIFO）', () => {
    const { maxVisible } = useToastStore.getState();
    const limit = maxVisible * 2;
    for (let i = 0; i < limit + 3; i += 1) {
      useToastStore.getState().push({ kind: 'info', message: `msg-${i}`, duration: 0 });
    }
    const { queue } = useToastStore.getState();
    expect(queue.length).toBeLessThanOrEqual(limit);
    // 最新的几条应该在队尾
    expect(queue[queue.length - 1]!.message).toBe(`msg-${limit + 2}`);
  });
});
