import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BotManager } from './BotManager.js';
import type { TakeoverRecord } from '@icgame/bot';

const { log } = vi.hoisted(() => ({
  log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../infra/logger.js', () => ({ logger: log }));

describe('BotManager', () => {
  let now: number;
  let bot: BotManager;

  beforeEach(() => {
    now = 1_000_000;
    bot = new BotManager({
      takeoverThresholdMs: 60_000,
      hardCutoffMs: 180_000,
      tickIntervalMs: 5_000,
      now: () => now,
    });
  });

  afterEach(() => {
    bot.stop();
  });

  describe('disconnect / reconnect bookkeeping', () => {
    it('onDisconnect records timestamp, snapshot reflects it', () => {
      bot.onDisconnect('m1', 'p1');
      const snap = bot.snapshot('m1');

      expect(snap?.disconnects).toEqual([{ playerID: 'p1', disconnectedAt: now }]);
      expect(snap?.takeovers).toEqual([]);
    });

    it('onReconnect clears the disconnect entry and restores AI', () => {
      bot.onDisconnect('m1', 'p1');
      now += 70_000;
      bot.tick(); // triggers takeover

      expect(bot.isBotControlled('m1', 'p1')).toBe(true);

      bot.onReconnect('m1', 'p1');
      expect(bot.isBotControlled('m1', 'p1')).toBe(false);
      expect(bot.snapshot('m1')?.disconnects).toEqual([]);
    });

    it('onReconnect on unknown match is a no-op', () => {
      expect(() => bot.onReconnect('unknown', 'px')).not.toThrow();
    });
  });

  describe('tick thresholds', () => {
    it('does not take over before threshold', () => {
      bot.onDisconnect('m1', 'p1');
      now += 30_000;
      bot.tick();
      expect(bot.isBotControlled('m1', 'p1')).toBe(false);
    });

    it('takes over at >= 60s', () => {
      bot.onDisconnect('m1', 'p1');
      now += 60_000;
      bot.tick();
      expect(bot.isBotControlled('m1', 'p1')).toBe(true);
    });

    it('double tick does not re-take over already-controlled player', () => {
      const listener = vi.fn<(matchID: string, record: TakeoverRecord) => void>();
      bot.onTakeover(listener);

      bot.onDisconnect('m1', 'p1');
      now += 60_000;
      bot.tick();
      bot.tick();
      bot.tick();

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('hard cutoff at 3min fires abandon listener', () => {
      const abandon = vi.fn();
      bot.onAbandon(abandon);

      bot.onDisconnect('m1', 'p1');
      now += 180_000;
      bot.tick();

      expect(abandon).toHaveBeenCalledWith('m1', 'p1');
    });
  });

  describe('permanent takeover (friend-room host leaving)', () => {
    it('markPermanent keeps bot control after reconnect', () => {
      bot.markPermanent('m1', 'p1');
      expect(bot.isBotControlled('m1', 'p1')).toBe(true);

      bot.onReconnect('m1', 'p1');
      expect(bot.isBotControlled('m1', 'p1')).toBe(true);
    });
  });

  describe('listeners', () => {
    it('onTakeover listener receives match + record', () => {
      const calls: Array<{ matchID: string; record: TakeoverRecord }> = [];
      bot.onTakeover((matchID, record) => calls.push({ matchID, record }));

      bot.onDisconnect('m1', 'p1');
      now += 60_000;
      bot.tick();

      expect(calls).toHaveLength(1);
      expect(calls[0]!.matchID).toBe('m1');
      expect(calls[0]!.record.playerID).toBe('p1');
      expect(calls[0]!.record.reason).toBe('disconnect');
    });

    it('unsubscribing prevents future callbacks', () => {
      const listener = vi.fn();
      const unsub = bot.onTakeover(listener);
      unsub();

      bot.onDisconnect('m1', 'p1');
      now += 60_000;
      bot.tick();

      expect(listener).not.toHaveBeenCalled();
    });

    it('listener errors are swallowed', () => {
      bot.onTakeover(() => {
        throw new Error('boom');
      });

      expect(() => {
        bot.onDisconnect('m1', 'p1');
        now += 60_000;
        bot.tick();
      }).not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('start/stop are idempotent', () => {
      bot.start();
      bot.start();
      bot.stop();
      bot.stop();
      expect(true).toBe(true);
    });

    it('disposeMatch clears everything for that match', () => {
      bot.onDisconnect('m1', 'p1');
      bot.onDisconnect('m2', 'p2');

      bot.disposeMatch('m1');
      expect(bot.snapshot('m1')).toBeNull();
      expect(bot.snapshot('m2')?.disconnects).toHaveLength(1);
    });
  });

  describe('multi-match isolation', () => {
    it('takeover in one match does not affect another', () => {
      bot.onDisconnect('m1', 'p1');
      bot.onDisconnect('m2', 'p1'); // same player, different match
      now += 60_000;
      bot.tick();

      expect(bot.isBotControlled('m1', 'p1')).toBe(true);
      expect(bot.isBotControlled('m2', 'p1')).toBe(true);

      bot.onReconnect('m1', 'p1');
      expect(bot.isBotControlled('m1', 'p1')).toBe(false);
      expect(bot.isBotControlled('m2', 'p1')).toBe(true);
    });
  });

  describe('idle takeover', () => {
    it('takes over after the threshold of consecutive timeouts and fires takeover once', () => {
      const listener = vi.fn<(matchID: string, record: TakeoverRecord) => void>();
      bot.onTakeover(listener);

      bot.recordTimeout('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
      expect(listener).not.toHaveBeenCalled();

      bot.recordTimeout('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(true);
      expect(bot.takeoverReason('m1', 's1')).toBe('idle');
      expect(listener).toHaveBeenCalledTimes(1);

      bot.recordTimeout('m1', 's1');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('threshold is configurable', () => {
      const b = new BotManager({ idleTakeoverThreshold: 3, now: () => now });
      b.recordTimeout('m1', 's1');
      b.recordTimeout('m1', 's1');
      expect(b.isBotControlled('m1', 's1')).toBe(false);
      b.recordTimeout('m1', 's1');
      expect(b.isBotControlled('m1', 's1')).toBe(true);
    });

    it('a player move clears the streak', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordPlayerMove('m1', 's1');
      bot.recordTimeout('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
      bot.recordTimeout('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(true);
    });

    it('counts per seat', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordTimeout('m1', 's2');
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
      expect(bot.isBotControlled('m1', 's2')).toBe(false);
    });

    it('idle takeover survives disconnect and reconnect', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordTimeout('m1', 's1');
      bot.onDisconnect('m1', 's1');
      now += 70_000;
      bot.tick();
      bot.onReconnect('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(true);
      expect(bot.takeoverReason('m1', 's1')).toBe('idle');
    });

    it('disconnect takeover reports its own reason and is lifted by reconnect', () => {
      bot.onDisconnect('m1', 's1');
      now += 60_000;
      bot.tick();
      expect(bot.takeoverReason('m1', 's1')).toBe('disconnected');
      bot.onReconnect('m1', 's1');
      expect(bot.takeoverReason('m1', 's1')).toBeUndefined();
    });

    it('resume lifts both reasons and resets the streak', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordTimeout('m1', 's1');
      bot.onDisconnect('m1', 's1');
      now += 60_000;
      bot.tick();
      expect(bot.resume('m1', 's1')).toBe(true);
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
      // 计数已清零：再一次超时不会立刻重新托管
      bot.recordTimeout('m1', 's1');
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
    });

    it('resume on a seat that is not taken over is a no-op', () => {
      expect(bot.resume('m1', 's1')).toBe(false);
      bot.recordTimeout('m1', 's1');
      expect(bot.resume('m1', 's1')).toBe(false);
    });

    it('resume cannot lift a permanent takeover', () => {
      bot.markPermanent('m1', 's1');
      expect(bot.resume('m1', 's1')).toBe(false);
      expect(bot.isBotControlled('m1', 's1')).toBe(true);
    });

    it('disposeMatch drops idle state', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordTimeout('m1', 's1');
      bot.disposeMatch('m1');
      expect(bot.isBotControlled('m1', 's1')).toBe(false);
    });

    it('logs start and release at info level', () => {
      bot.recordTimeout('m1', 's1');
      bot.recordTimeout('m1', 's1');
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ matchID: 'm1', seat: 's1' }),
        'idle takeover started',
      );
      bot.resume('m1', 's1');
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ matchID: 'm1', seat: 's1' }),
        'takeover released by player',
      );
    });
  });
});
