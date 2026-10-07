// 骰子系统测试

import { describe, it, expect } from 'vitest';
import { resolveShootCustom, BLUE_DICE_FACES, RED_DICE_FACES } from './dice.js';

describe('dice', () => {
  describe('resolveShootCustom', () => {
    it('点数在死亡面里 → kill', () => {
      expect(resolveShootCustom(1, [1], [2, 3, 4, 5])).toBe('kill');
      expect(resolveShootCustom(2, [1, 2], [3, 4, 5])).toBe('kill');
    });

    it('点数在移动面里 → move', () => {
      expect(resolveShootCustom(3, [1], [2, 3, 4, 5])).toBe('move');
      expect(resolveShootCustom(5, [1], [2, 3, 4, 5])).toBe('move');
    });

    it('既不在死亡面也不在移动面 → miss', () => {
      expect(resolveShootCustom(6, [1], [2, 3, 4, 5])).toBe('miss');
    });

    it('移动面按传入的清单算：不在清单里的点数不算移动', () => {
      expect(resolveShootCustom(2, [1], [3, 4, 5])).toBe('miss');
    });

    it('死亡面优先于移动面', () => {
      expect(resolveShootCustom(2, [2], [2, 3])).toBe('kill');
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
