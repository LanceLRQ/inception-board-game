// reconnectReducer 状态机纯函数测试

import { describe, it, expect } from 'vitest';
import { reconnectReducer, type ReconnectState } from './useReconnect';

const INITIAL: ReconnectState = {
  status: 'healthy',
  disconnectedAt: null,
  attempts: 0,
  lastTick: 0,
};

describe('reconnectReducer', () => {
  describe('connection actions', () => {
    it('connected → resets to healthy', () => {
      const mid: ReconnectState = {
        status: 'reconnecting',
        disconnectedAt: 1000,
        attempts: 3,
        lastTick: 2000,
      };
      const next = reconnectReducer(mid, {
        type: 'connection',
        state: 'connected',
        at: 3000,
      });
      expect(next.status).toBe('healthy');
      expect(next.disconnectedAt).toBeNull();
      expect(next.attempts).toBe(0);
    });

    it('reconnecting from healthy records disconnectedAt', () => {
      const next = reconnectReducer(INITIAL, {
        type: 'connection',
        state: 'reconnecting',
        at: 1000,
      });
      expect(next.status).toBe('reconnecting');
      expect(next.disconnectedAt).toBe(1000);
      expect(next.attempts).toBe(1);
    });

    it('reconnecting increments attempts but keeps original disconnectedAt', () => {
      let s = reconnectReducer(INITIAL, {
        type: 'connection',
        state: 'reconnecting',
        at: 1000,
      });
      s = reconnectReducer(s, { type: 'connection', state: 'reconnecting', at: 2000 });
      s = reconnectReducer(s, { type: 'connection', state: 'reconnecting', at: 3000 });
      expect(s.disconnectedAt).toBe(1000);
      expect(s.attempts).toBe(3);
    });

    it('disconnected → reconnecting (socket may still retry)', () => {
      const next = reconnectReducer(INITIAL, {
        type: 'connection',
        state: 'disconnected',
        at: 1000,
      });
      expect(next.status).toBe('reconnecting');
      expect(next.disconnectedAt).toBe(1000);
    });

    it('failed → dead', () => {
      const next = reconnectReducer(INITIAL, {
        type: 'connection',
        state: 'failed',
        at: 1000,
      });
      expect(next.status).toBe('dead');
    });

    it('connecting is a no-op on status', () => {
      const next = reconnectReducer(INITIAL, {
        type: 'connection',
        state: 'connecting',
        at: 1000,
      });
      expect(next).toEqual(INITIAL);
    });
  });

  describe('tick actions', () => {
    const warnMs = 3_000;
    const hardMs = 180_000;

    it('tick on healthy is a no-op', () => {
      const next = reconnectReducer(INITIAL, {
        type: 'tick',
        at: 5_000,
        warnAfterMs: warnMs,
        hardCutoffMs: hardMs,
      });
      expect(next).toEqual(INITIAL);
    });

    it('reconnecting stays reconnecting below warnAfter', () => {
      const s: ReconnectState = {
        status: 'reconnecting',
        disconnectedAt: 1_000,
        attempts: 1,
        lastTick: 1_000,
      };
      const next = reconnectReducer(s, {
        type: 'tick',
        at: 2_000,
        warnAfterMs: warnMs,
        hardCutoffMs: hardMs,
      });
      expect(next.status).toBe('reconnecting');
    });

    it('reconnecting → stale after warnAfter', () => {
      const s: ReconnectState = {
        status: 'reconnecting',
        disconnectedAt: 1_000,
        attempts: 1,
        lastTick: 1_000,
      };
      const next = reconnectReducer(s, {
        type: 'tick',
        at: 5_000,
        warnAfterMs: warnMs,
        hardCutoffMs: hardMs,
      });
      expect(next.status).toBe('stale');
    });

    it('stale → dead after hardCutoff', () => {
      const s: ReconnectState = {
        status: 'stale',
        disconnectedAt: 1_000,
        attempts: 3,
        lastTick: 5_000,
      };
      const next = reconnectReducer(s, {
        type: 'tick',
        at: 181_500,
        warnAfterMs: warnMs,
        hardCutoffMs: hardMs,
      });
      expect(next.status).toBe('dead');
    });
  });

  describe('reset', () => {
    it('wipes state back to initial', () => {
      const s: ReconnectState = {
        status: 'stale',
        disconnectedAt: 1_000,
        attempts: 5,
        lastTick: 2_000,
      };
      expect(reconnectReducer(s, { type: 'reset' })).toEqual(INITIAL);
    });
  });
});
