import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSMessageRouter } from './messageRouter.js';
import { BotManager } from '../services/BotManager.js';
import { ChatService } from '../services/ChatService.js';
import type { ClientMessage } from './types.js';

describe('WSMessageRouter', () => {
  let heartbeat: { recordHeartbeat: ReturnType<typeof vi.fn> };
  let bot: BotManager;
  let router: WSMessageRouter;

  const ctx = { matchID: 'm1', playerID: 'acct-1', seat: '1' };

  beforeEach(() => {
    heartbeat = { recordHeartbeat: vi.fn().mockResolvedValue(undefined) };
    bot = new BotManager({ tickIntervalMs: 99_999 });
    router = new WSMessageRouter({
      heartbeat: heartbeat as never,
      bot,
    });
  });

  describe('icg:heartbeat', () => {
    it('records heartbeat and restores bot control on reconnect', async () => {
      bot.onDisconnect('m1', '1');
      // simulate takeover elapsed
      bot['matches'].get('m1')!.disconnects.set('1', Date.now() - 70_000);
      bot.tick();
      expect(bot.isBotControlled('m1', '1')).toBe(true);

      const res = await router.route(ctx, { type: 'icg:heartbeat', at: Date.now() });

      expect(heartbeat.recordHeartbeat).toHaveBeenCalledWith('m1', 'acct-1');
      expect(bot.isBotControlled('m1', '1')).toBe(false);
      expect(res).toEqual({});
    });
  });

  describe('match messages', () => {
    it.each<ClientMessage>([
      { type: 'icg:move', move: 'x', args: [], intentId: 'i' },
      { type: 'icg:sync' },
    ])('returns empty for $type (handled by the match gateway)', async (msg) => {
      expect(await router.route(ctx, msg)).toEqual({});
    });
  });

  describe('icg:chatBroadcast', () => {
    it('returns empty (broadcast handled by ChatService) for valid preset', async () => {
      const broadcaster = vi.fn();
      const chat = new ChatService(broadcaster as never, { cooldownMs: 3_000 });
      const withChatRouter = new WSMessageRouter({
        heartbeat: heartbeat as never,
        bot,
        chat,
      });
      const res = await withChatRouter.route(
        { ...ctx, faction: 'thief' },
        { type: 'icg:chatBroadcast', scope: 'match', message: 'greet_hi' },
      );
      expect(res).toEqual({});
      expect(broadcaster).toHaveBeenCalledTimes(1);
    });

    it('returns icg:error with UNKNOWN_PRESET for invalid preset', async () => {
      const chat = new ChatService(vi.fn() as never, { cooldownMs: 3_000 });
      const withChatRouter = new WSMessageRouter({
        heartbeat: heartbeat as never,
        bot,
        chat,
      });
      const res = await withChatRouter.route(
        { ...ctx, faction: 'thief' },
        { type: 'icg:chatBroadcast', scope: 'match', message: 'not_exists' },
      );
      expect(res.reply?.type).toBe('icg:error');
      if (res.reply?.type === 'icg:error') {
        expect(res.reply.code).toBe('UNKNOWN_PRESET');
      }
    });

    it('returns CHAT_UNAVAILABLE when chat service not configured', async () => {
      const res = await router.route(ctx, {
        type: 'icg:chatBroadcast',
        scope: 'match',
        message: 'greet_hi',
      });
      expect(res.reply?.type).toBe('icg:error');
      if (res.reply?.type === 'icg:error') {
        expect(res.reply.code).toBe('CHAT_UNAVAILABLE');
      }
    });
  });
});
