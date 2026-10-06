import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from './logger.js';
import { startPeriodic } from './periodic.js';

describe('startPeriodic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the job once right away and then on every interval', async () => {
    const job = vi.fn(async () => {});
    const stop = startPeriodic('demo', 1_000, job);
    await vi.advanceTimersByTimeAsync(0);
    expect(job).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(job).toHaveBeenCalledTimes(4);
    stop();
  });

  it('stops running after stop()', async () => {
    const job = vi.fn(async () => {});
    const stop = startPeriodic('demo', 1_000, job);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(job).toHaveBeenCalledTimes(1);
  });

  it('logs a failing run and keeps the schedule going', async () => {
    const job = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const stop = startPeriodic('demo', 1_000, job);
    await vi.advanceTimersByTimeAsync(0);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'demo' }),
      expect.any(String),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(job).toHaveBeenCalledTimes(2);
    stop();
  });

  it('skips a tick while the previous run is still in progress', async () => {
    let release: () => void = () => {};
    const job = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const stop = startPeriodic('demo', 1_000, job);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(job).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(job).toHaveBeenCalledTimes(2);
    stop();
  });
});
