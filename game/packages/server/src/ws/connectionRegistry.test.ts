import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionRegistry } from './connectionRegistry.js';

describe('ConnectionRegistry', () => {
  let registry: ConnectionRegistry;

  beforeEach(() => {
    registry = new ConnectionRegistry();
  });

  const meta = (socketId: string, playerID: string, matchID: string) => ({
    socketId,
    playerID,
    matchID,
    connectedAt: Date.now(),
  });

  describe('register / unregister', () => {
    it('registers a new connection and exposes by all indices', () => {
      registry.register(meta('s1', 'p1', 'm1'));

      expect(registry.getBySocket('s1')?.playerID).toBe('p1');
      expect(registry.getSocketsByPlayer('p1')).toEqual(['s1']);
      expect(registry.getSocketsByMatch('m1')).toEqual(['s1']);
      expect(registry.size()).toBe(1);
    });

    it('returns null for unknown socket', () => {
      expect(registry.getBySocket('ghost')).toBeNull();
      expect(registry.getSocketsByPlayer('x')).toEqual([]);
      expect(registry.getSocketsByMatch('y')).toEqual([]);
    });

    it('unregister removes all indices and returns the meta', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      const removed = registry.unregister('s1');

      expect(removed?.playerID).toBe('p1');
      expect(registry.getBySocket('s1')).toBeNull();
      expect(registry.getSocketsByPlayer('p1')).toEqual([]);
      expect(registry.getSocketsByMatch('m1')).toEqual([]);
      expect(registry.size()).toBe(0);
    });

    it('unregister on unknown socket returns null without throwing', () => {
      expect(registry.unregister('ghost')).toBeNull();
    });
  });

  describe('multi-device / multi-player support', () => {
    it('one player with two sockets tracks both', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      registry.register(meta('s2', 'p1', 'm1'));

      expect(new Set(registry.getSocketsByPlayer('p1'))).toEqual(new Set(['s1', 's2']));
      expect(new Set(registry.getSocketsByMatch('m1'))).toEqual(new Set(['s1', 's2']));
    });

    it('removing one of two sockets keeps the other intact', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      registry.register(meta('s2', 'p1', 'm1'));

      registry.unregister('s1');
      expect(registry.getSocketsByPlayer('p1')).toEqual(['s2']);
    });

    it('match-level listing returns distinct players', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      registry.register(meta('s2', 'p1', 'm1')); // same player, different device
      registry.register(meta('s3', 'p2', 'm1'));

      expect(new Set(registry.getMatchPlayerIds('m1'))).toEqual(new Set(['p1', 'p2']));
    });
  });

  describe('listMatchConnections', () => {
    it('returns metas grouped by match', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      registry.register(meta('s2', 'p2', 'm1'));
      registry.register(meta('s3', 'p3', 'm2'));

      const m1 = registry.listMatchConnections('m1');
      expect(m1).toHaveLength(2);
      expect(new Set(m1.map((c) => c.playerID))).toEqual(new Set(['p1', 'p2']));

      expect(registry.listMatchConnections('m-unknown')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('wipes all state', () => {
      registry.register(meta('s1', 'p1', 'm1'));
      registry.register(meta('s2', 'p2', 'm2'));

      registry.clear();
      expect(registry.size()).toBe(0);
      expect(registry.getBySocket('s1')).toBeNull();
    });
  });
});
