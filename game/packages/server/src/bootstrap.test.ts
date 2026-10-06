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

// 全局 IP 限流默认依赖真实 Redis，测试里注入直通的中间件
const passThrough = vi.fn(async (_ctx: unknown, next: () => Promise<unknown>) => {
  await next();
});

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
      httpRateLimit: passThrough,
    });

    const port = await rt.start(0);
    expect(port).toBeGreaterThan(0);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ status: 'ok' });
    expect(passThrough).toHaveBeenCalled();

    await rt.stop();
    expect(rt.httpServer.listening).toBe(false);
    expect(timers.pending()).toEqual([]);
    await expect(fetch(`http://127.0.0.1:${port}/health`)).rejects.toThrow();
  });

  it('stop 会等归档队列写完再返回：停机时落库的步数与快照版本一致', async () => {
    class SlowArchive extends InMemoryMatchArchive {
      override async appendStep(row: Parameters<InMemoryMatchArchive['appendStep']>[0]) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        await super.appendStep(row);
      }
    }
    const archive = new SlowArchive();
    const store = new InMemoryMatchStore();
    const rt = buildRealtime({
      store,
      archive,
      lobbyRedis: { get: vi.fn(), setex: vi.fn(), set: vi.fn(), del: vi.fn(), exists: vi.fn() },
      heartbeatRedis: { get: vi.fn(), setex: vi.fn(), del: vi.fn() } as never,
      bot: new BotManager({ tickIntervalMs: 99_999 }),
      timing: { botStepDelayMs: 1, pendingTimeoutMs: 5_000, turnTimeoutMs: 20_000 },
      httpRateLimit: passThrough,
    });
    const room = {
      id: 'room-flush',
      code: 'ABCDEF',
      ownerPlayerId: 'bot-0',
      maxPlayers: 10,
      ruleVariant: 'classic' as const,
      exCardsEnabled: false,
      expansionEnabled: false,
      status: 'waiting' as const,
      players: Array.from({ length: 4 }, (_, i) => ({
        playerId: `bot-${i}`,
        nickname: `AI${i}`,
        avatarSeed: 's',
        seat: i,
        isBot: true,
        joinedAt: 0,
      })),
      createdAt: 0,
      expiresAt: 0,
    };
    await rt.matches.createFromRoom(room);
    // 全 Bot 对局自己往前走；等到至少有几步在队列里
    for (let i = 0; i < 100 && (rt.matches.get('room-flush')?.current().stateID ?? 0) < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await rt.stop();
    const version = (await store.load('room-flush'))!.state.stateID;
    expect(version).toBeGreaterThanOrEqual(4);
    const rows = await archive.listSteps('room-flush');
    expect(rows.map((r) => r.stateID)).toEqual(Array.from({ length: version }, (_, i) => i + 1));
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
      httpRateLimit: passThrough,
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

describe('buildRealtime 的跨域配置', () => {
  async function originHeader(corsOrigin: string | undefined): Promise<string | null> {
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
      httpRateLimit: passThrough,
      ws: corsOrigin ? { corsOrigin } : undefined,
    });
    const port = await rt.start(0);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'http://a.test' },
      });
      return res.headers.get('access-control-allow-origin');
    } finally {
      await rt.stop();
    }
  }

  it('给了 corsOrigin 时 HTTP 响应带跨域头，没给时不带', async () => {
    expect(await originHeader('http://a.test')).toBe('http://a.test');
    expect(await originHeader(undefined)).toBeNull();
  });
});
