import { describe, it, expect } from 'vitest';
import { computeTargetOptions, isSameLayerRequired } from './logic';

describe('TargetPlayerPickerDialog · logic', () => {
  describe('isSameLayerRequired', () => {
    it('action_shoot → 同层', () => {
      expect(isSameLayerRequired('action_shoot')).toBe(true);
    });
    it('action_shoot_king → 跨层', () => {
      expect(isSameLayerRequired('action_shoot_king')).toBe(false);
    });
    it('action_shoot_armor / burst / dream_transit → 同层', () => {
      expect(isSameLayerRequired('action_shoot_armor')).toBe(true);
      expect(isSameLayerRequired('action_shoot_burst')).toBe(true);
      expect(isSameLayerRequired('action_shoot_dream_transit')).toBe(true);
    });
    it('非 SHOOT / null / undefined → 不做同层限制', () => {
      expect(isSameLayerRequired('action_kick')).toBe(false);
      expect(isSameLayerRequired(null)).toBe(false);
      expect(isSameLayerRequired(undefined)).toBe(false);
    });
  });

  describe('computeTargetOptions', () => {
    const players = {
      '0': { isAlive: true, currentLayer: 2, nickname: 'P0' },
      '1': { isAlive: true, currentLayer: 2, nickname: 'P1' },
      '2': { isAlive: true, currentLayer: 4, nickname: 'Master' },
      '3': { isAlive: false, currentLayer: 1, nickname: 'Dead' },
    };

    it('过滤自己 + 死亡玩家', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shoot',
        viewerLayer: 2,
        viewerPlayerID: '0',
        players,
      });
      expect(opts.map((o) => o.id)).toEqual(['1', '2']);
    });

    it('普通 SHOOT：跨层目标 disabled + 标注跨层号', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shoot',
        viewerLayer: 2,
        viewerPlayerID: '0',
        players,
      });
      const p1 = opts.find((o) => o.id === '1')!;
      const p2 = opts.find((o) => o.id === '2')!;
      expect(p1.disabled).toBe(false);
      expect(p1.crossLayerNumber).toBeNull();
      expect(p2.disabled).toBe(true);
      expect(p2.crossLayerNumber).toBe(4);
    });

    it('刺客之王：跨层目标全部 enabled', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shoot_king',
        viewerLayer: 2,
        viewerPlayerID: '0',
        players,
      });
      for (const o of opts) expect(o.disabled).toBe(false);
    });

    it('非 SHOOT 卡（action_kick）：不做层限制', () => {
      const opts = computeTargetOptions({
        cardId: 'action_kick',
        viewerLayer: 2,
        viewerPlayerID: '0',
        players,
      });
      for (const o of opts) expect(o.disabled).toBe(false);
    });

    it('排序按数字序', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shoot',
        viewerLayer: 2,
        viewerPlayerID: 'X',
        players: {
          '10': { isAlive: true, currentLayer: 2, nickname: 'A' },
          '2': { isAlive: true, currentLayer: 2, nickname: 'B' },
          '1': { isAlive: true, currentLayer: 2, nickname: 'C' },
        },
      });
      expect(opts.map((o) => o.id)).toEqual(['1', '2', '10']);
    });
  });
});
