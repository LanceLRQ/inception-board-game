// 装配层：对局结束时回收这一局的预设短语冷却记录
import { describe, it, expect, vi } from 'vitest';
import type { MatchServiceDeps } from './match/MatchService.js';
import { InMemoryMatchArchive } from './match/MatchArchive.js';
import { InMemoryMatchStore } from './match/MatchStore.js';
import { BotManager } from './services/BotManager.js';
import { ChatService } from './services/ChatService.js';

const { captured, log } = vi.hoisted(() => ({
  captured: { deps: null as MatchServiceDeps | null },
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./infra/logger.js', () => ({ logger: log }));
vi.mock('./match/MatchService.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./match/MatchService.js')>();
  class Capturing extends mod.MatchService {
    constructor(deps: MatchServiceDeps) {
      super(deps);
      captured.deps = deps;
    }
  }
  return { ...mod, MatchService: Capturing };
});

const { buildRealtime } = await import('./bootstrap.js');

describe('buildRealtime · 对局结束', () => {
  it('回收这一局的短语冷却记录', async () => {
    const dispose = vi.spyOn(ChatService.prototype, 'disposeMatch');
    const rt = buildRealtime({
      store: new InMemoryMatchStore(),
      archive: new InMemoryMatchArchive(),
      bot: new BotManager({ tickIntervalMs: 99_999 }),
      heartbeatRedis: { get: vi.fn(), setex: vi.fn(), del: vi.fn() } as never,
      httpRateLimit: async (_ctx, next) => {
        await next();
      },
    });
    await captured.deps!.onGameOver('m-1', {} as never);
    expect(dispose).toHaveBeenCalledWith('m-1');
    rt.matches.shutdown();
    rt.gateway.detach();
  });
});
