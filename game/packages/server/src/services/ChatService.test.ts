import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatService } from './ChatService.js';
import type { ServerMessage } from '../ws/types.js';

describe('ChatService', () => {
  let now: number;
  let broadcasts: Array<{ matchID: string; msg: ServerMessage }>;
  let broadcaster: ReturnType<typeof vi.fn>;
  let chat: ChatService;

  beforeEach(() => {
    now = 1_000_000;
    broadcasts = [];
    broadcaster = vi.fn((matchID: string, msg: ServerMessage) => {
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
});
