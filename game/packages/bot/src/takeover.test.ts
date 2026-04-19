// AITakeoverManager 测试

import { describe, it, expect, beforeEach } from 'vitest';
import { AITakeoverManager } from './takeover.js';
import { SimpleBot } from './simpleBot.js';

describe('AITakeoverManager', () => {
  let mgr: AITakeoverManager;
  beforeEach(() => {
    mgr = new AITakeoverManager();
  });

  it('takeover registers bot for player', () => {
    mgr.takeover('P1', 'timeout');
    expect(mgr.isBotControlled('P1')).toBe(true);
    expect(mgr.getBot('P1')).toBeInstanceOf(SimpleBot);
  });

  it('restore removes takeover', () => {
    mgr.takeover('P1');
    expect(mgr.restore('P1')).toBe(true);
    expect(mgr.isBotControlled('P1')).toBe(false);
  });

  it('permanent takeover cannot be restored', () => {
    mgr.takeover('P1', 'abandoned', { onPermanent: true });
    expect(mgr.restore('P1')).toBe(false);
    expect(mgr.isBotControlled('P1')).toBe(true);
  });

  it('custom bot is honored', () => {
    const custom = new SimpleBot();
    mgr.takeover('P1', 'manual', { bot: custom });
    expect(mgr.getBot('P1')).toBe(custom);
  });

  it('list returns all records', () => {
    mgr.takeover('P1');
    mgr.takeover('P2', 'disconnect');
    const list = mgr.list();
    expect(list).toHaveLength(2);
    expect(list.map((r) => r.playerID).sort()).toEqual(['P1', 'P2']);
  });

  it('clear removes all', () => {
    mgr.takeover('P1');
    mgr.takeover('P2');
    mgr.clear();
    expect(mgr.list()).toHaveLength(0);
  });
});
