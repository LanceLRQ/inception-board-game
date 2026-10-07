import { describe, it, expect } from 'vitest';
import { computeTargetOptions, isSameLayerRequired, peekMasterTargetIds } from './logic';

describe('TargetPlayerPickerDialog · logic', () => {
  describe('isSameLayerRequired', () => {
    it('action_shoot → 同层', () => {
      expect(isSameLayerRequired('action_shoot')).toBe(true);
    });
    it('action_shoot_assassin → 跨层', () => {
      expect(isSameLayerRequired('action_shoot_assassin')).toBe(false);
    });
    it('action_shoot_drill / burst / dream_transit → 同层', () => {
      expect(isSameLayerRequired('action_shoot_drill')).toBe(true);
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
        cardId: 'action_shoot_assassin',
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

describe('TargetPlayerPickerDialog · 引擎必拒的目标', () => {
  // 本人 p1 是盗梦者，pM 是梦主
  const players = {
    p1: { isAlive: true, currentLayer: 2, nickname: 'P1' },
    p2: { isAlive: true, currentLayer: 2, nickname: 'P2' },
    p3: { isAlive: true, currentLayer: 3, nickname: 'P3' },
    p4: { isAlive: false, currentLayer: 0, nickname: 'P4' },
    pM: { isAlive: true, currentLayer: 3, nickname: 'Master' },
  };

  describe('移形换影', () => {
    it('盗梦者对梦主使用：梦主置灰并标明原因，其他盗梦者可选', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shift',
        viewerLayer: 2,
        viewerPlayerID: 'p1',
        players,
        dreamMasterID: 'pM',
        viewerIsMaster: false,
      });
      expect(opts.map((o) => o.id)).toEqual(['p2', 'p3', 'pM']);
      const master = opts.find((o) => o.id === 'pM')!;
      expect(master.disabled).toBe(true);
      expect(master.reason).toBe('masterTarget');
      expect(opts.filter((o) => o.id !== 'pM').every((o) => !o.disabled)).toBe(true);
    });

    it('梦主对盗梦者使用：全部可选', () => {
      const opts = computeTargetOptions({
        cardId: 'action_shift',
        viewerLayer: 3,
        viewerPlayerID: 'pM',
        players,
        dreamMasterID: 'pM',
        viewerIsMaster: true,
      });
      expect(opts.every((o) => !o.disabled)).toBe(true);
    });

    it('别的牌（共鸣、KICK）不限制梦主为目标', () => {
      const opts = computeTargetOptions({
        cardId: 'action_resonance',
        viewerLayer: 2,
        viewerPlayerID: 'p1',
        players,
        dreamMasterID: 'pM',
        viewerIsMaster: false,
      });
      expect(opts.find((o) => o.id === 'pM')!.disabled).toBe(false);
    });
  });

  describe('梦境窥视效果②（梦主）', () => {
    it('只列存活、持有贿赂牌的盗梦者', () => {
      const opts = computeTargetOptions({
        cardId: 'action_dream_peek',
        viewerLayer: 3,
        viewerPlayerID: 'pM',
        players,
        dreamMasterID: 'pM',
        viewerIsMaster: true,
        bribeHolderIds: ['p2', 'p4'],
      });
      // p4 持有贿赂牌但已死亡：引擎不接受
      expect(opts.map((o) => o.id)).toEqual(['p2']);
      expect(opts[0]!.disabled).toBe(false);
    });

    it('没有人持有贿赂牌：一个都不列', () => {
      expect(
        computeTargetOptions({
          cardId: 'action_dream_peek',
          viewerLayer: 3,
          viewerPlayerID: 'pM',
          players,
          dreamMasterID: 'pM',
          viewerIsMaster: true,
          bribeHolderIds: [],
        }),
      ).toEqual([]);
    });

    it('peekMasterTargetIds：不含梦主自己与已死亡者', () => {
      expect(peekMasterTargetIds(players, 'pM', 'pM', ['pM', 'p1', 'p4'])).toEqual(['p1']);
    });
  });
});
