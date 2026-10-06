// 解封响应窗口的到点自动放弃

import { describe, it, expect, vi, afterEach } from 'vitest';
import { startAutoPass } from './autoPass';

describe('startAutoPass', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('autoPass 为 true 时到点调用 makeMove，参数标记为静默', () => {
    vi.useFakeTimers();
    const makeMove = vi.fn();
    startAutoPass({ active: true, autoPass: true, timeoutMs: 5000, makeMove });
    vi.advanceTimersByTime(4999);
    expect(makeMove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(makeMove).toHaveBeenCalledWith('passResponse', [], { silent: true });
  });

  it('autoPass 为 false 时到点也不调用 makeMove', () => {
    vi.useFakeTimers();
    const makeMove = vi.fn();
    const stop = startAutoPass({ active: true, autoPass: false, timeoutMs: 5000, makeMove });
    vi.advanceTimersByTime(60_000);
    expect(makeMove).not.toHaveBeenCalled();
    expect(stop).toBeNull();
  });

  it('取消后不再调用；窗口不可见或无超时时不启动', () => {
    vi.useFakeTimers();
    const makeMove = vi.fn();
    const stop = startAutoPass({ active: true, autoPass: true, timeoutMs: 5000, makeMove });
    stop?.();
    vi.advanceTimersByTime(10_000);
    expect(makeMove).not.toHaveBeenCalled();
    expect(startAutoPass({ active: false, autoPass: true, timeoutMs: 5000, makeMove })).toBeNull();
    expect(startAutoPass({ active: true, autoPass: true, timeoutMs: 0, makeMove })).toBeNull();
  });
});
