// Dice3D 纯函数测试（SVG 路径解析）

import { describe, it, expect } from 'vitest';
import { diceSvgPath } from './index';

describe('diceSvgPath', () => {
  it('maps red 1-6 to correct paths', () => {
    for (let v = 1; v <= 6; v++) {
      expect(diceSvgPath('red', v)).toBe(`/dice/dice-red-${v}.svg`);
    }
  });

  it('maps blue 1-6 to correct paths', () => {
    for (let v = 1; v <= 6; v++) {
      expect(diceSvgPath('blue', v)).toBe(`/dice/dice-blue-${v}.svg`);
    }
  });

  it('preserves face parameter verbatim (validation at caller)', () => {
    expect(diceSvgPath('red', 7)).toBe('/dice/dice-red-7.svg');
  });
});
