// WindowTimerManager 单测
// 对照：plans/report/phase3-out-of-turn-interaction-review.md OOT-06 · F11
//
// 采用 vitest fake timers 精确控制时间流逝，验证：
//   - scheduleTimeout / cancelTimeout 基本语义
//   - 同 key 重入覆盖
//   - onExpire 异常不影响后续 timer
//   - recoverFromSnapshots 按剩余时间重建
//   - shutdown 清理所有 timer 且拒绝后续 schedule

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WindowTimerManager, type WindowTimerSnapshot } from './WindowTimerManager.js';

describe('WindowTimerManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 0, 0, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('scheduleTimeout / onExpire', () => {
    it('delayMs 后触发 onExpire', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 30_000);
      expect(mgr.activeCount()).toBe(1);

      vi.advanceTimersByTime(29_999);
      expect(onExpire).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      await vi.runAllTimersAsync();
      expect(onExpire).toHaveBeenCalledWith('m1:0');
      expect(mgr.activeCount()).toBe(0);
    });

    it('同 key 重入：后者覆盖前者', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 10_000);
      mgr.scheduleTimeout('m1:0', 5_000);
      expect(mgr.activeCount()).toBe(1);

      vi.advanceTimersByTime(5_000);
      await vi.runAllTimersAsync();
      expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('零/负 delayMs：立即触发（但异步）', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', -100);
      expect(onExpire).not.toHaveBeenCalled(); // 异步 defer
      await vi.runAllTimersAsync();
      expect(onExpire).toHaveBeenCalled();
    });

    it('getRemainingMs 反映倒计时', () => {
      const mgr = new WindowTimerManager(() => {});
      mgr.scheduleTimeout('m1:0', 30_000);
      expect(mgr.getRemainingMs('m1:0')).toBe(30_000);
      vi.advanceTimersByTime(10_000);
      expect(mgr.getRemainingMs('m1:0')).toBe(20_000);
      vi.advanceTimersByTime(25_000);
      expect(mgr.getRemainingMs('m1:0')).toBe(null); // 已过期，entry 清理
    });
  });

  describe('cancelTimeout', () => {
    it('取消后不触发 onExpire', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 30_000);
      const cancelled = mgr.cancelTimeout('m1:0');
      expect(cancelled).toBe(true);
      expect(mgr.activeCount()).toBe(0);

      vi.advanceTimersByTime(60_000);
      await vi.runAllTimersAsync();
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('取消不存在的 key 返回 false', () => {
      const mgr = new WindowTimerManager(() => {});
      expect(mgr.cancelTimeout('nonexistent')).toBe(false);
    });
  });

  describe('onExpire 异常容错', () => {
    it('onExpire 抛错不影响其他 timer', async () => {
      const onExpire = vi.fn((key: string) => {
        if (key === 'm1:0') throw new Error('boom');
      });
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 1_000);
      mgr.scheduleTimeout('m2:0', 2_000);

      vi.advanceTimersByTime(2_500);
      await vi.runAllTimersAsync();
      expect(onExpire).toHaveBeenCalledTimes(2);
      expect(mgr.activeCount()).toBe(0);
    });

    it('onExpire 返回 rejected promise 不崩溃', async () => {
      const onExpire = vi.fn(() => Promise.reject(new Error('async fail')));
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 1_000);

      vi.advanceTimersByTime(1_000);
      await vi.runAllTimersAsync();
      // 无抛出到顶层即通过
      expect(onExpire).toHaveBeenCalled();
    });
  });

  describe('recoverFromSnapshots', () => {
    it('按剩余时间重建 timer', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      const now = Date.now();
      const items: WindowTimerSnapshot[] = [
        { key: 'm1:0', openedAtMs: now - 10_000, timeoutMs: 30_000 }, // 剩 20s
        { key: 'm2:0', openedAtMs: now - 5_000, timeoutMs: 30_000 }, // 剩 25s
      ];
      const recovered = mgr.recoverFromSnapshots(items);
      expect(recovered).toBe(2);
      expect(mgr.activeCount()).toBe(2);

      await vi.advanceTimersByTimeAsync(20_000);
      expect(onExpire).toHaveBeenCalledWith('m1:0');
      expect(onExpire).not.toHaveBeenCalledWith('m2:0');

      await vi.advanceTimersByTimeAsync(5_000);
      expect(onExpire).toHaveBeenCalledWith('m2:0');
    });

    it('已过期的 snapshot 立即触发', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      const now = Date.now();
      // 超时 5s 前就该到期
      mgr.recoverFromSnapshots([{ key: 'm1:0', openedAtMs: now - 35_000, timeoutMs: 30_000 }]);
      await vi.runAllTimersAsync();
      expect(onExpire).toHaveBeenCalledWith('m1:0');
    });

    it('空列表返回 0', () => {
      const mgr = new WindowTimerManager(() => {});
      expect(mgr.recoverFromSnapshots([])).toBe(0);
    });
  });

  describe('shutdown', () => {
    it('shutdown 取消所有 timer', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.scheduleTimeout('m1:0', 10_000);
      mgr.scheduleTimeout('m2:0', 20_000);
      expect(mgr.activeCount()).toBe(2);

      mgr.shutdown();
      expect(mgr.activeCount()).toBe(0);

      vi.advanceTimersByTime(30_000);
      await vi.runAllTimersAsync();
      expect(onExpire).not.toHaveBeenCalled();
    });

    it('shutdown 后 schedule 被忽略', async () => {
      const onExpire = vi.fn();
      const mgr = new WindowTimerManager(onExpire);
      mgr.shutdown();
      mgr.scheduleTimeout('m1:0', 1_000);
      expect(mgr.activeCount()).toBe(0);

      vi.advanceTimersByTime(5_000);
      await vi.runAllTimersAsync();
      expect(onExpire).not.toHaveBeenCalled();
    });
  });
});
