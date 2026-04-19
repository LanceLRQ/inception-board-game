import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WSMessageRouter } from './messageRouter.js';
import { BotManager } from '../services/BotManager.js';

describe('WSMessageRouter', () => {
  let heartbeat: { recordHeartbeat: ReturnType<typeof vi.fn> };
  let reconnect: {
    getMissingEvents: ReturnType<typeof vi.fn>;
    markIntentProcessed: ReturnType<typeof vi.fn>;
  };
  let bot: BotManager;
  let router: WSMessageRouter;

  const ctx = { matchID: 'm1', playerID: 'p1' };

  beforeEach(() => {
    heartbeat = { recordHeartbeat: vi.fn().mockResolvedValue(undefined) };
    reconnect = {
      getMissingEvents: vi.fn().mockResolvedValue({ needsFullSync: false, fromSeq: 5 }),
      markIntentProcessed: vi.fn().mockResolvedValue(undefined),
    };
    bot = new BotManager({ tickIntervalMs: 99_999 });
    router = new WSMessageRouter({
      heartbeat: heartbeat as never,
      reconnect: reconnect as never,
      bot,
    });
  });

  describe('icg:heartbeat', () => {
    it('records heartbeat and restores bot control on reconnect', async () => {
      bot.onDisconnect('m1', 'p1');
      // simulate takeover elapsed
      bot['matches'].get('m1')!.disconnects.set('p1', Date.now() - 70_000);
      bot.tick();
      expect(bot.isBotControlled('m1', 'p1')).toBe(true);

      const res = await router.route(ctx, { type: 'icg:heartbeat', at: Date.now() });

      expect(heartbeat.recordHeartbeat).toHaveBeenCalledWith('m1', 'p1');
      expect(bot.isBotControlled('m1', 'p1')).toBe(false);
      expect(res).toEqual({});
    });
  });

  describe('icg:reconnect', () => {
    it('returns sync reply with filtered flag when incremental sync is possible', async () => {
      const res = await router.route(ctx, { type: 'icg:reconnect', lastEventSeq: 3 });

      expect(heartbeat.recordHeartbeat).toHaveBeenCalled();
      expect(reconnect.getMissingEvents).toHaveBeenCalledWith('m1', 3);
      expect(res.reply?.type).toBe('sync');
      if (res.reply?.type === 'sync') {
        const [, info] = res.reply.args;
        expect((info as { filtered: boolean }).filtered).toBe(true);
      }
    });

    it('marks filtered=false when full sync is required', async () => {
      reconnect.getMissingEvents.mockResolvedValue({ needsFullSync: true, fromSeq: 0 });
      const res = await router.route(ctx, { type: 'icg:reconnect', lastEventSeq: 0 });

      expect(res.reply?.type).toBe('sync');
      if (res.reply?.type === 'sync') {
        const [, info] = res.reply.args;
        expect((info as { filtered: boolean }).filtered).toBe(false);
      }
    });
  });

  describe('icg:ackIntent', () => {
    it('marks intent processed and returns empty result', async () => {
      const res = await router.route(ctx, { type: 'icg:ackIntent', intentID: 'intent-42' });
      expect(reconnect.markIntentProcessed).toHaveBeenCalledWith('m1', 'p1', 'intent-42');
      expect(res).toEqual({});
    });
  });

  describe('icg:spectateStart', () => {
    it('returns SPECTATE_NOT_AVAILABLE error (MVP)', async () => {
      const res = await router.route(ctx, { type: 'icg:spectateStart', matchID: 'm1' });
      expect(res.reply?.type).toBe('icg:error');
      if (res.reply?.type === 'icg:error') {
        expect(res.reply.code).toBe('SPECTATE_NOT_AVAILABLE');
      }
    });
  });

  describe('BGIO passthrough types', () => {
    it.each([
      { type: 'update', args: ['m1', 1, null, 'p1'] },
      { type: 'sync', args: ['m1', 'p1'] },
      { type: 'chat', args: ['m1', { sender: 'p1', text: 'hi', sentAt: 0 }] },
    ] as const)('returns empty for $type (handled by BGIO)', async (msg) => {
      const res = await router.route(ctx, msg as never);
      expect(res).toEqual({});
    });
  });

  describe('icg:chatBroadcast (placeholder)', () => {
    it('returns empty in MVP', async () => {
      const res = await router.route(ctx, {
        type: 'icg:chatBroadcast',
        scope: 'match',
        message: 'hi',
      });
      expect(res).toEqual({});
    });
  });
});
