import { describe, expect, it } from 'vitest';
import { TINT_LAYERS, TOTEM_LAYER_TINTS, tintLayerAttr, totemLayerVar } from './layerTints';

describe('层级调色', () => {
  it('第 1–4 层各有一个互不相同的十六进制色，迷失层不上色', () => {
    expect(TINT_LAYERS).toEqual([1, 2, 3, 4]);
    const colors = TINT_LAYERS.map((l) => TOTEM_LAYER_TINTS[l]);
    for (const c of colors) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    expect(new Set(colors).size).toBe(4);
    expect(Object.keys(TOTEM_LAYER_TINTS)).not.toContain('0');
  });

  it('变量名按层号生成，对应 --ms-totem-l<层号>', () => {
    expect(totemLayerVar(1)).toBe('--ms-totem-l1');
    expect(totemLayerVar(4)).toBe('--ms-totem-l4');
  });
});

describe('tintLayerAttr', () => {
  it('0–4 的整数层号转成属性值（含迷失层）', () => {
    for (const l of [0, 1, 2, 3, 4]) expect(tintLayerAttr(l)).toBe(String(l));
  });

  it('越界、小数、非数值一律不输出属性', () => {
    for (const v of [-1, 5, 2.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(tintLayerAttr(v)).toBeUndefined();
    }
  });
});
