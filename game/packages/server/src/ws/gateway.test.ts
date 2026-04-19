import { describe, it, expect } from 'vitest';
import { normalizeInbound } from './gateway.js';

describe('normalizeInbound', () => {
  describe('fully-formed ClientMessage passthrough', () => {
    it('preserves payload when type matches event', () => {
      const msg = { type: 'icg:heartbeat', at: 123 };
      expect(normalizeInbound('icg:heartbeat', msg)).toEqual(msg);
    });

    it('preserves ackIntent with intentID', () => {
      const msg = { type: 'icg:ackIntent', intentID: 'intent-xyz' };
      expect(normalizeInbound('icg:ackIntent', msg)).toEqual(msg);
    });
  });

  describe('heartbeat fallback', () => {
    it('builds a fresh heartbeat message from plain payload', () => {
      const result = normalizeInbound('icg:heartbeat', {});
      expect(result?.type).toBe('icg:heartbeat');
      if (result?.type === 'icg:heartbeat') {
        expect(typeof result.at).toBe('number');
      }
    });

    it('builds heartbeat when payload is null', () => {
      expect(normalizeInbound('icg:heartbeat', null)?.type).toBe('icg:heartbeat');
    });
  });

  describe('reconnect fallback', () => {
    it('parses lastEventSeq from raw payload', () => {
      const result = normalizeInbound('icg:reconnect', { lastEventSeq: 42 });
      expect(result).toEqual({ type: 'icg:reconnect', lastEventSeq: 42 });
    });

    it('defaults to 0 when lastEventSeq is missing', () => {
      expect(normalizeInbound('icg:reconnect', {})).toEqual({
        type: 'icg:reconnect',
        lastEventSeq: 0,
      });
    });

    it('coerces non-numeric lastEventSeq to 0', () => {
      expect(normalizeInbound('icg:reconnect', { lastEventSeq: 'oops' })).toEqual({
        type: 'icg:reconnect',
        lastEventSeq: 0,
      });
    });
  });

  describe('ackIntent fallback', () => {
    it('parses intentID from raw payload', () => {
      expect(normalizeInbound('icg:ackIntent', { intentID: 'abc' })).toEqual({
        type: 'icg:ackIntent',
        intentID: 'abc',
      });
    });

    it('returns null when intentID is empty/missing', () => {
      expect(normalizeInbound('icg:ackIntent', {})).toBeNull();
      expect(normalizeInbound('icg:ackIntent', { intentID: '' })).toBeNull();
    });
  });

  describe('unknown events', () => {
    it('returns null for unmapped event names', () => {
      expect(normalizeInbound('random-event', {})).toBeNull();
      expect(normalizeInbound('', null)).toBeNull();
    });
  });
});
