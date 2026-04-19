// 零信任事件广播测试
// 对照：plans/design/07-backend-network.md §7.9b

import { describe, it, expect } from 'vitest';
import {
  resolveRecipients,
  rewriteForViewer,
  distribute,
  Events,
  type BroadcastEvent,
  type BroadcastContext,
} from './broadcaster.js';
import type { CardID } from '@icgame/shared';

const ctx: BroadcastContext = {
  dreamMasterID: 'M',
  allPlayerIDs: ['T1', 'T2', 'T3', 'M'],
};

function makeEvent(overrides: Partial<BroadcastEvent>): BroadcastEvent {
  return {
    eventKind: 'test.event',
    matchId: 'match-1',
    seq: 1,
    timestamp: 0,
    visibility: 'public',
    payload: {},
    ...overrides,
  };
}

describe('Broadcaster', () => {
  describe('resolveRecipients', () => {
    it('public → all players', () => {
      const e = makeEvent({ visibility: 'public' });
      expect(resolveRecipients(e, ctx).sort()).toEqual(['M', 'T1', 'T2', 'T3']);
    });
    it('master-only → only master', () => {
      const e = makeEvent({ visibility: 'master-only' });
      expect(resolveRecipients(e, ctx)).toEqual(['M']);
    });
    it('actor-only → only actor', () => {
      const e = makeEvent({ visibility: 'actor-only', actor: 'T1' });
      expect(resolveRecipients(e, ctx)).toEqual(['T1']);
    });
    it('actor+target → actor + targets (deduped)', () => {
      const e = makeEvent({
        visibility: 'actor+target',
        actor: 'T1',
        targets: ['T2', 'T1'],
      });
      const r = resolveRecipients(e, ctx).sort();
      expect(r).toEqual(['T1', 'T2']);
    });
    it('actor+master → actor + master', () => {
      const e = makeEvent({ visibility: 'actor+master', actor: 'T1' });
      expect(resolveRecipients(e, ctx).sort()).toEqual(['M', 'T1']);
    });
  });

  describe('rewriteForViewer', () => {
    it('returns null for non-recipient', () => {
      const e = makeEvent({ visibility: 'master-only' });
      expect(rewriteForViewer(e, 'T1', ctx)).toBeNull();
    });
    it('scrubs sensitive fields for non-actor/non-master', () => {
      const e = makeEvent({
        visibility: 'public',
        actor: 'T1',
        payload: { actor: 'T1', secret: 'abc', other: 'ok' },
        sensitiveFields: ['secret'],
      });
      const rewritten = rewriteForViewer(e, 'T3', ctx);
      expect(rewritten).not.toBeNull();
      expect(rewritten!.payload.secret).toBeUndefined();
      expect(rewritten!.payload.other).toBe('ok');
    });
    it('keeps sensitive fields for actor', () => {
      const e = makeEvent({
        visibility: 'public',
        actor: 'T1',
        payload: { secret: 'abc' },
        sensitiveFields: ['secret'],
      });
      const rewritten = rewriteForViewer(e, 'T1', ctx);
      expect(rewritten!.payload.secret).toBe('abc');
    });
    it('keeps sensitive fields for master', () => {
      const e = makeEvent({
        visibility: 'public',
        actor: 'T1',
        payload: { secret: 'abc' },
        sensitiveFields: ['secret'],
      });
      const rewritten = rewriteForViewer(e, 'M', ctx);
      expect(rewritten!.payload.secret).toBe('abc');
    });
  });

  describe('distribute', () => {
    it('produces one copy per recipient', () => {
      const e = makeEvent({ visibility: 'public' });
      const out = distribute(e, ctx);
      expect(out).toHaveLength(4);
      expect(new Set(out.map((o) => o.recipient))).toEqual(new Set(['T1', 'T2', 'T3', 'M']));
    });
    it('master-only produces single copy', () => {
      const e = makeEvent({ visibility: 'master-only' });
      const out = distribute(e, ctx);
      expect(out).toHaveLength(1);
      expect(out[0]!.recipient).toBe('M');
    });
  });

  describe('Events factory', () => {
    it('cardDrawn is actor-only', () => {
      const e = Events.cardDrawn('m', 1, 'T1', ['c1', 'c2'] as CardID[]);
      expect(e.visibility).toBe('actor-only');
      const recipients = resolveRecipients(e, ctx);
      expect(recipients).toEqual(['T1']);
    });
    it('shootResolved is public', () => {
      const e = Events.shootResolved('m', 1, 'T1', 'T2', 5, 'kill');
      expect(e.visibility).toBe('public');
    });
    it('bribeDealt scrubs status for non-actor/non-master', () => {
      const e = Events.bribeDealt('m', 1, 'T1', 'T2', 'b1', 'shattered');
      const rewrittenForT3 = rewriteForViewer(e, 'T3', ctx);
      // T3 不在 recipients 内，应被剔除
      expect(rewrittenForT3).toBeNull();
      // T1 actor 应看到 status
      const rewrittenForT1 = rewriteForViewer(e, 'T1', ctx);
      expect(rewrittenForT1!.payload.status).toBe('shattered');
      // M 梦主应看到 status
      const rewrittenForM = rewriteForViewer(e, 'M', ctx);
      expect(rewrittenForM!.payload.status).toBe('shattered');
    });
  });

  // === Fuzzer-style 抓包保证 ===
  describe('Fuzzer: no information leakage', () => {
    it('non-recipients never receive any copy', () => {
      const events: BroadcastEvent[] = [
        Events.cardDrawn('m', 1, 'T1', ['c1'] as CardID[]),
        Events.bribeDealt('m', 2, 'T1', 'T2', 'b1', 'deal'),
      ];
      for (const e of events) {
        const out = distribute(e, ctx);
        const allowed = new Set(resolveRecipients(e, ctx));
        for (const { recipient } of out) {
          expect(allowed.has(recipient)).toBe(true);
        }
      }
    });
    it('sensitive fields never leak to non-privileged viewer', () => {
      const e = Events.bribeDealt('m', 1, 'T1', 'T2', 'b1', 'shattered');
      // T1 + M 合法 recipients（actor+master）；T2 不在
      const forT2 = rewriteForViewer(e, 'T2', ctx);
      expect(forT2).toBeNull();
    });
  });
});
