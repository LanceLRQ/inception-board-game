import { describe, it, expect } from 'vitest';
import { RandomBot } from './randomBot.js';

describe('RandomBot', () => {
  const bot = new RandomBot();

  it('should pick a legal move', () => {
    const moves = ['move1', 'move2', 'move3'];
    const choice = bot.play({}, moves);
    expect(moves).toContain(choice);
  });

  it('should throw when no legal moves', () => {
    expect(() => bot.play({}, [])).toThrow('No legal moves available');
  });

  it('should handle single move', () => {
    expect(bot.play({}, ['onlyMove'])).toBe('onlyMove');
  });
});
