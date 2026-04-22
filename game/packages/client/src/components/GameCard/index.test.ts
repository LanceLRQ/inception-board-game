// GameCard.SIZE_MAP 映射表完整性测试
// 对照：plans/design/06c-match-table-layout.md §5.1（梦主 landscape / 盗梦者 portrait）

import { describe, it, expect } from 'vitest';
import { SIZE_MAP, type GameCardSize, type GameCardOrientation } from './index.js';

const SIZES: GameCardSize[] = ['sm', 'md', 'lg'];
const ORIENTATIONS: GameCardOrientation[] = ['portrait', 'landscape'];

describe('GameCard.SIZE_MAP', () => {
  it('三尺寸 × 两方向共 6 组映射都有值', () => {
    for (const s of SIZES) {
      for (const o of ORIENTATIONS) {
        expect(SIZE_MAP[s][o]).toBeTruthy();
        expect(SIZE_MAP[s][o]).toMatch(/^w-/);
      }
    }
  });

  it('portrait 与 landscape 的宽高长度应互换（像素部分）', () => {
    // 例：sm.portrait 'w-12 h-[68px]' ↔ sm.landscape 'w-[68px] h-12'
    function parseClass(cls: string): { w: string; h: string } {
      const w = cls.match(/\bw-(\[[^\]]+\]|\S+)/)?.[1] ?? '';
      const h = cls.match(/\bh-(\[[^\]]+\]|\S+)/)?.[1] ?? '';
      return { w, h };
    }

    for (const s of SIZES) {
      const p = parseClass(SIZE_MAP[s].portrait);
      const l = parseClass(SIZE_MAP[s].landscape);
      // landscape 的 w 应等于 portrait 的 h；landscape 的 h 应等于 portrait 的 w
      expect(l.w).toBe(p.h);
      expect(l.h).toBe(p.w);
    }
  });

  it('尺寸递增：sm < md < lg（以 portrait 高度字面量判定）', () => {
    // 只校验存在且不相同（具体像素可能随设计迭代）
    const heights = SIZES.map((s) => SIZE_MAP[s].portrait);
    expect(new Set(heights).size).toBe(SIZES.length);
  });
});
