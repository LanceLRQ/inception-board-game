// SimpleBot L0 测试 - 有啥打啥优先级

import { describe, it, expect } from 'vitest';
import { SimpleBot } from './simpleBot.js';

describe('SimpleBot L0', () => {
  const bot = new SimpleBot();

  it('throws on empty legal moves', () => {
    expect(() => bot.play(null, [])).toThrow(/No legal moves/);
  });

  it('prefers SHOOT over other actions', () => {
    const choice = bot.play(null, ['playDreamTransit', 'playShoot', 'playCreation']);
    expect(choice).toBe('playShoot');
  });

  it('prefers Unlock over dream transit', () => {
    const choice = bot.play(null, ['playDreamTransit', 'playUnlock']);
    expect(choice).toBe('playUnlock');
  });

  it('picks endActionPhase last', () => {
    const choice = bot.play(null, ['endActionPhase', 'playShoot']);
    expect(choice).toBe('playShoot');
  });

  it('single legal move always returns it', () => {
    expect(bot.play(null, ['doDraw'])).toBe('doDraw');
  });

  it('sorts by card priority when move names tie', () => {
    // 两个 playShoot 带不同 cardId，SHOOT 和暗杀无差别优先级都 = 1
    const choice = bot.play(null, [
      'playShoot:action_creation', // cardP 99
      'playShoot:action_shoot', // cardP 1
    ]);
    expect(choice).toBe('playShoot:action_shoot');
  });

  describe('W19-B Bug fix · 响应类 move 不被 play() 主动选', () => {
    // 修复前：respondCancelUnlock=1 最高优 → bot 自己回合主动选 → engine INVALID_MOVE
    // 修复后：响应类全部 999，由 worker 顶部分支专用代发；play 永不主动选
    it('endActionPhase 优先于 respondCancelUnlock', () => {
      const choice = bot.play(null, ['endActionPhase', 'respondCancelUnlock']);
      expect(choice).toBe('endActionPhase');
    });
    it('endActionPhase 优先于 passResponse', () => {
      const choice = bot.play(null, ['endActionPhase', 'passResponse']);
      expect(choice).toBe('endActionPhase');
    });
    it('endActionPhase 优先于 peekerAcknowledge', () => {
      const choice = bot.play(null, ['endActionPhase', 'peekerAcknowledge']);
      expect(choice).toBe('endActionPhase');
    });
    it('endActionPhase 优先于 masterPeekBribeDecision', () => {
      const choice = bot.play(null, ['endActionPhase', 'masterPeekBribeDecision']);
      expect(choice).toBe('endActionPhase');
    });
    it('有 playShoot 时不主动选 playPeekMaster（低优先级）', () => {
      const choice = bot.play(null, ['playShoot', 'playPeekMaster']);
      expect(choice).toBe('playShoot');
    });
  });

  describe('playResponse', () => {
    it('respects cancelProbability=0 (always pass)', () => {
      const choice = bot.playResponse(['respondCancelUnlock', 'passResponse'], 0);
      expect(choice).toBe('passResponse');
    });
    it('respects cancelProbability=1 (always cancel)', () => {
      const choice = bot.playResponse(['respondCancelUnlock', 'passResponse'], 1);
      expect(choice).toBe('respondCancelUnlock');
    });
    it('falls back to play if no cancel/pass options', () => {
      const choice = bot.playResponse(['resolveUnlock']);
      expect(choice).toBe('resolveUnlock');
    });
  });
});
