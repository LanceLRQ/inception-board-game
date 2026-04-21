import { describe, it, expect } from 'vitest';
import { computeLayerOptions, computeValidLayers, ALL_LAYERS } from './logic';

describe('TargetLayerPickerDialog · logic', () => {
  describe('computeValidLayers', () => {
    it('普通卡默认 → 全部 4 层', () => {
      expect(computeValidLayers({ cardId: 'action_peek', viewerLayer: 2 })).toEqual([
        ...ALL_LAYERS,
      ]);
    });

    it('梦境穿梭剂 L2 → 相邻 [1,3]', () => {
      expect(computeValidLayers({ cardId: 'action_dream_transit', viewerLayer: 2 })).toEqual([
        1, 3,
      ]);
    });

    it('梦境穿梭剂 L1 → 相邻 [2]', () => {
      expect(computeValidLayers({ cardId: 'action_dream_transit', viewerLayer: 1 })).toEqual([2]);
    });

    it('梦境穿梭剂 L4 → 相邻 [3]', () => {
      expect(computeValidLayers({ cardId: 'action_dream_transit', viewerLayer: 4 })).toEqual([3]);
    });

    it('SHOOT·梦境穿梭剂同样走穿梭剂规则', () => {
      expect(computeValidLayers({ cardId: 'action_shoot_dream_transit', viewerLayer: 3 })).toEqual([
        2, 4,
      ]);
    });

    it('显式 validLayers 优先', () => {
      expect(
        computeValidLayers({
          cardId: 'action_dream_transit',
          viewerLayer: 2,
          validLayers: [4],
        }),
      ).toEqual([4]);
    });
  });

  describe('computeLayerOptions', () => {
    it('disabled 反映 validLayers 补集', () => {
      const opts = computeLayerOptions({ cardId: 'action_dream_transit', viewerLayer: 1 });
      expect(opts).toEqual([
        { layer: 1, disabled: true },
        { layer: 2, disabled: false },
        { layer: 3, disabled: true },
        { layer: 4, disabled: true },
      ]);
    });
  });
});
