// Dice3D 的骰面由 Die 绘制：点数与种类的纯函数契约

import { describe, it, expect } from 'vitest';
import { pipsFor } from '../Die/pips';

describe('Dice3D 骰面点数', () => {
  it('六个面各有对应数量的点', () => {
    for (let v = 1; v <= 6; v++) expect(pipsFor(v)).toHaveLength(v);
  });
});
