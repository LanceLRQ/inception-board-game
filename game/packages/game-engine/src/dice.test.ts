// 骰子系统测试

import { describe, it, expect } from 'vitest';
import { rollDice, resolveShoot, BLUE_DICE_FACES, RED_DICE_FACES } from './dice.js';

describe('dice', () => {
  describe('rollDice', () => {
    // 固定 d6 返回值（模拟 BGIO Random API）
    const fixedD6 = () => 3;

    it('rolls single die by default', () => {
      const result = rollDice(fixedD6);
      expect(result.values).toEqual([3]);
      expect(result.total).toBe(3);
      expect(result.modified).toBe(3);
    });

    it('rolls multiple dice', () => {
      const seq = [2, 5, 1][Symbol.iterator]();
      const d6 = () => seq.next().value as number;
      const result = rollDice(d6, 3);
      expect(result.values).toEqual([2, 5, 1]);
      expect(result.total).toBe(8);
    });

    it('applies positive modifiers clamped to 6', () => {
      const result = rollDice(fixedD6, 1, [{ source: 'test', value: 10 }]);
      expect(result.total).toBe(3);
      expect(result.modified).toBe(6); // min(6, 3+10)
    });

    it('applies negative modifiers clamped to 1', () => {
      const result = rollDice(fixedD6, 1, [{ source: 'test', value: -10 }]);
      expect(result.modified).toBe(1); // max(1, 3-10)
    });

    it('sums multiple modifiers', () => {
      const result = rollDice(fixedD6, 1, [
        { source: 'a', value: 2 },
        { source: 'b', value: -1 },
      ]);
      expect(result.modified).toBe(4); // 3 + 2 - 1
    });

    it('preserves modifiers in result', () => {
      const mods = [{ source: 'skill', value: 1 }];
      const result = rollDice(fixedD6, 1, mods);
      expect(result.modifiers).toEqual(mods);
    });
  });

  describe('resolveShoot', () => {
    it('kill when roll matches death face', () => {
      expect(resolveShoot(1, [1])).toBe('kill');
    });

    it('kill with multiple death faces', () => {
      expect(resolveShoot(2, [1, 2])).toBe('kill');
    });

    it('move when roll is 2-5 and not death face', () => {
      expect(resolveShoot(3, [1])).toBe('move');
      expect(resolveShoot(2, [1])).toBe('move');
      expect(resolveShoot(5, [1])).toBe('move');
    });

    it('miss when roll is 6 and not death face', () => {
      expect(resolveShoot(6, [1])).toBe('miss');
    });

    it('uses default death faces [1]', () => {
      expect(resolveShoot(1)).toBe('kill');
      expect(resolveShoot(4)).toBe('move');
      expect(resolveShoot(6)).toBe('miss');
    });

    it('assassin death faces [1,2]', () => {
      expect(resolveShoot(1, [1, 2])).toBe('kill');
      expect(resolveShoot(2, [1, 2])).toBe('kill');
      expect(resolveShoot(3, [1, 2])).toBe('move');
    });
  });

  describe('dice face constants', () => {
    it('BLUE_DICE_FACES has 6 faces 1-6', () => {
      expect(BLUE_DICE_FACES).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('RED_DICE_FACES has 6 faces 1-6', () => {
      expect(RED_DICE_FACES).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });
});
