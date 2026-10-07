import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from './ChatService.js';
import type { BroadcastableMessage } from '../ws/types.js';
import type { ChatLog, ChatLogEntry } from './ChatLog.js';
import { logger } from '../infra/logger.js';

describe('ChatService', () => {
  let now: number;
  let broadcasts: Array<{ matchID: string; msg: BroadcastableMessage }>;
  let broadcaster: ReturnType<typeof vi.fn>;
  let chat: ChatService;

  beforeEach(() => {
    now = 1_000_000;
    broadcasts = [];
    broadcaster = vi.fn((matchID: string, msg: BroadcastableMessage) => {
      broadcasts.push({ matchID, msg });
    });
    chat = new ChatService(broadcaster as never, {
      cooldownMs: 3_000,
      now: () => now,
    });
  });

  describe('send (happy path)', () => {
    it('accepts a valid preset and broadcasts icg:chatMessage', () => {
      const result = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });

      expect(result.ok).toBe(true);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]?.matchID).toBe('m1');
      if (broadcasts[0]?.msg.type === 'icg:chatMessage') {
        expect(broadcasts[0]?.msg.message.phraseId).toBe('greet_hi');
        expect(broadcasts[0]?.msg.message.sender).toBe('p1');
        expect(broadcasts[0]?.msg.message.sentAt).toBe(now);
      }
    });

    it('returns preset payload with sentAt matching now()', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'all',
        presetId: 'emotion_gg',
      });
      if (r.ok) {
        expect(r.payload.sentAt).toBe(now);
        expect(r.payload.presetId).toBe('emotion_gg');
      }
    });
  });

  describe('unknown preset', () => {
    it('rejects with UNKNOWN_PRESET and does not broadcast', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'not_exists',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('UNKNOWN_PRESET');
      expect(broadcasts).toHaveLength(0);
    });

    it('rejects free-form text (prevents UGC bypass)', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: '<script>alert(1)</script>',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('faction restrictions', () => {
    it('rejects tactic_push when sent by master', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'master1',
        senderFaction: 'master',
        presetId: 'tactic_push',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('FACTION_FORBIDDEN');
      expect(broadcasts).toHaveLength(0);
    });

    it('allows all-faction preset regardless of sender', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'master1',
        senderFaction: 'master',
        presetId: 'emotion_gg',
      });
      expect(r.ok).toBe(true);
    });

    it('allows thief-only preset for thief sender', () => {
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'tactic_push',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('cooldown (3s)', () => {
    it('blocks second send within 3s', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      now += 1_000;
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'emotion_gg',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe('COOLDOWN');
        expect(r.retryAfterMs).toBe(2_000);
      }
      expect(broadcasts).toHaveLength(1);
    });

    it('allows send exactly at cooldown boundary', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      now += 3_000;
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'emotion_gg',
      });
      expect(r.ok).toBe(true);
      expect(broadcasts).toHaveLength(2);
    });

    it('cooldown is per-player, not global', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      const r = chat.send({
        matchID: 'm1',
        senderID: 'p2',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      expect(r.ok).toBe(true);
      expect(broadcasts).toHaveLength(2);
    });

    it('cooldown is per-match, not cross-match', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      const r = chat.send({
        matchID: 'm2',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('remainingCooldown', () => {
    it('returns 0 when never sent', () => {
      expect(chat.remainingCooldown('m1', 'p1')).toBe(0);
    });

    it('returns correct remaining ms mid-cooldown', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      now += 500;
      expect(chat.remainingCooldown('m1', 'p1')).toBe(2_500);
    });

    it('returns 0 after cooldown expires', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      now += 3_500;
      expect(chat.remainingCooldown('m1', 'p1')).toBe(0);
    });
  });

  describe('disposeMatch', () => {
    it('clears cooldowns for a match but keeps others', () => {
      chat.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      chat.send({
        matchID: 'm2',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      chat.disposeMatch('m1');
      now += 100; // still within cooldown for m2
      expect(chat.remainingCooldown('m1', 'p1')).toBe(0);
      expect(chat.remainingCooldown('m2', 'p1')).toBeGreaterThan(0);
    });
  });

  describe('broadcaster error handling', () => {
    it('still returns ok when broadcaster throws', () => {
      const badBroadcaster = vi.fn(() => {
        throw new Error('boom');
      });
      const svc = new ChatService(badBroadcaster as never, { cooldownMs: 3_000, now: () => now });
      const r = svc.send({
        matchID: 'm1',
        senderID: 'p1',
        senderFaction: 'thief',
        presetId: 'greet_hi',
      });
      expect(r.ok).toBe(true);
    });
  });

  describe('memory', () => {
    it('冷却记录过多时顺手清掉已过冷却期的', () => {
      for (let i = 0; i < 1_100; i++) {
        chat.send({
          matchID: `m${i}`,
          senderID: '1',
          senderFaction: 'thief',
          presetId: 'greet_hi',
        });
      }
      now += 10_000;
      chat.send({ matchID: 'fresh', senderID: '1', senderFaction: 'thief', presetId: 'greet_hi' });
      const size = (chat as unknown as { lastSentAt: Map<string, number> }).lastSentAt.size;
      expect(size).toBeLessThan(10);
    });
  });

  describe('聊天记录落库', () => {
    const input = {
      matchID: 'm1',
      senderID: '3',
      senderPlayerId: 'acct-3',
      senderFaction: 'thief',
      presetId: 'greet_hi',
    };
    const makeLog = () => {
      const entries: ChatLogEntry[] = [];
      const log: ChatLog = {
        record: vi.fn(async (e: ChatLogEntry) => {
          entries.push(e);
        }),
      };
      return { entries, log };
    };

    it('广播一条就记一行：对局、账号、座位号、短语、时间、范围', () => {
      const { entries, log } = makeLog();
      const c = new ChatService(broadcaster as never, { cooldownMs: 3_000, now: () => now, log });
      expect(c.send(input).ok).toBe(true);
      expect(entries).toEqual([
        {
          matchID: 'm1',
          senderPlayerId: 'acct-3',
          seat: 3,
          phraseId: 'greet_hi',
          sentAt: new Date(now),
          broadcastTo: 'all',
        },
      ]);
    });

    it('没有账号的发送者（Bot 座位）记成空账号', () => {
      const { entries, log } = makeLog();
      const c = new ChatService(broadcaster as never, { cooldownMs: 3_000, now: () => now, log });
      c.send({ matchID: 'm1', senderID: '3', senderFaction: 'thief', presetId: 'greet_hi' });
      expect(entries[0]?.senderPlayerId).toBeNull();
    });

    it('被拒绝的短语（未知、阵营不符、冷却中）不记', () => {
      const { log } = makeLog();
      const c = new ChatService(broadcaster as never, { cooldownMs: 3_000, now: () => now, log });
      c.send({ ...input, presetId: 'nope' });
      c.send({ ...input, senderFaction: 'master', presetId: 'tactic_push' });
      c.send(input);
      c.send(input);
      expect(log.record).toHaveBeenCalledTimes(1);
    });

    it('写库永远不挂住也不影响广播与返回', () => {
      const log: ChatLog = { record: () => new Promise<void>(() => {}) };
      const c = new ChatService(broadcaster as never, { cooldownMs: 3_000, now: () => now, log });
      expect(c.send(input).ok).toBe(true);
      expect(broadcasts).toHaveLength(1);
    });

    it('写库失败只记 WARN：异步失败与同步抛错都不影响结果；短时间内只记一次', async () => {
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      try {
        let mode: 'reject' | 'throw' = 'reject';
        const log: ChatLog = {
          record: () => {
            if (mode === 'throw') throw new Error('sync boom');
            return Promise.reject(new Error('fk'));
          },
        };
        const c = new ChatService(broadcaster as never, {
          cooldownMs: 0,
          now: () => now,
          log,
        });
        expect(c.send(input).ok).toBe(true);
        mode = 'throw';
        expect(c.send(input).ok).toBe(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(broadcasts).toHaveLength(2);
        expect(warn).toHaveBeenCalledTimes(1);
        // 过了静默期再失败，会再记一次
        now += 61_000;
        c.send(input);
        await Promise.resolve();
        await Promise.resolve();
        expect(warn).toHaveBeenCalledTimes(2);
      } finally {
        warn.mockRestore();
      }
    });
  });
});
