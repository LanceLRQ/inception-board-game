import { describe, it, expect, vi } from 'vitest';
import { buildRealtime, timingFromEnv } from './bootstrap.js';
import { DEFAULT_TIMING } from './match/scheduling.js';
import { InMemoryMatchArchive } from './match/MatchArchive.js';
import { InMemoryMatchStore } from './match/MatchStore.js';
import { BotManager } from './services/BotManager.js';
import { FakeTimers } from './testing/fakeTimers.js';

const { log } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./infra/logger.js', () => ({ logger: log }));
// 全局 IP 限流依赖真实 Redis，这里换成直通
vi.mock('./middleware/rateLimit.js', () => ({
  rateLimitMiddleware: async (_ctx: unknown, next: () => Promise<unknown>) => next(),
  playerRateLimit: () => async (_ctx: unknown, next: () => Promise<unknown>) => next(),
}));

describe('buildRealtime', () => {
  it('starts on a system-assigned port, serves /health, and stops cleanly', async () => {
    const timers = new FakeTimers();
    const lobbyRedis = {
      get: vi.fn().mockResolvedValue(null),
      setex: vi.fn().mockResolvedValue('OK'),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
      exists: vi.fn().mockResolvedValue(0),
    };
    const bot = new BotManager({ tickIntervalMs: 99_999 });
    const rt = buildRealtime({
      store: new InMemoryMatchStore(),
      archive: new InMemoryMatchArchive(),
      lobbyRedis,
      heartbeatRedis: { get: vi.fn(), setex: vi.fn(), del: vi.fn() } as never,
      timers,
      bot,
    });

    const port = await rt.start(0);
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ status: 'ok' });

    await rt.stop();
    expect(rt.httpServer.listening).toBe(false);
    expect(timers.pending()).toEqual([]);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  it('exposes a matches service bound to the gateway', () => {
    const rt = buildRealtime({
      store: new InMemoryMatchStore(),
      archive: new InMemoryMatchArchive(),
      lobbyRedis: {
        get: vi.fn(),
        setex: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        exists: vi.fn(),
      },
      heartbeatRedis: { get: vi.fn(), setex: vi.fn(), del: vi.fn() } as never,
    });
    expect(rt.matches.get('nope')).toBeNull();
    expect(() => rt.gateway.sendSeats('nope')).not.toThrow();
    rt.matches.shutdown();
    rt.gateway.detach();
  });
});

describe('timingFromEnv', () => {
  it('returns defaults when nothing is set', () => {
    expect(timingFromEnv({})).toEqual(DEFAULT_TIMING);
  });

  it('reads the three overrides', () => {
    expect(
      timingFromEnv({
        MATCH_BOT_STEP_DELAY_MS: '50',
        MATCH_PENDING_TIMEOUT_MS: '1000',
        MATCH_TURN_TIMEOUT_MS: '2000',
      }),
    ).toEqual({ botStepDelayMs: 50, pendingTimeoutMs: 1000, turnTimeoutMs: 2000 });
  });

  it('falls back to defaults on invalid values and warns', () => {
    log.warn.mockClear();
    const t = timingFromEnv({
      MATCH_BOT_STEP_DELAY_MS: 'abc',
      MATCH_PENDING_TIMEOUT_MS: '-5',
      MATCH_TURN_TIMEOUT_MS: '1.5',
    });
    expect(t).toEqual(DEFAULT_TIMING);
    expect(log.warn).toHaveBeenCalledTimes(3);
  });
});
