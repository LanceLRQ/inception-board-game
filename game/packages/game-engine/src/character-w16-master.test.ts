// W16-A 梦主 6 角色单测（纯函数）
// 对照：plans/tasks.md Phase 3 W16
// 港口 / 盛夏 / 黑洞·DM / 海王星·泓洋 / 木星·巅峰 / 土星·领地

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyHarborTsunami,
  isHarborWorldActive,
  checkHarborWin,
  getMidsummerExtraDraws,
  getMidsummerWorldThiefBonus,
  applyBlackHoleReverse,
  isBlackHoleWorldActive,
  getEffectiveMaxUnlockPerTurn,
  applyNeptuneStorm,
  checkNeptuneWin,
  isJupiterPeakWorldActive,
  isJupiterPeakLayerOK,
  shouldJupiterThunderKill,
  applyM4CarbineModifier,
  applySaturnDecree,
  canSaturnFreeMove,
  findMasterID,
  getMasterCharacterID,
} from './engine/skills.js';
import { scenarioStartOfGame3p } from './testing/scenarios.js';

function setMasterCharacter(state: SetupState, characterId: CardID): SetupState {
  const mid = findMasterID(state)!;
  const m = state.players[mid]!;
  return { ...state, players: { ...state.players, [mid]: { ...m, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setLayerHL(state: SetupState, layer: Layer, value: number): SetupState {
  const li = state.layers[layer]!;
  return { ...state, layers: { ...state.layers, [layer]: { ...li, heartLockValue: value } } };
}

function setVaultOpened(state: SetupState, vaultIndex: number, openedBy: string): SetupState {
  return {
    ...state,
    vaults: state.vaults.map((v, i) => (i === vaultIndex ? { ...v, isOpened: true, openedBy } : v)),
  };
}

describe('W16-A · 梦主公共 helper', () => {
  it('findMasterID 返回 master 玩家', () => {
    const s = scenarioStartOfGame3p();
    expect(findMasterID(s)).toBe('pM');
  });

  it('getMasterCharacterID 返回梦主角色 ID', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    expect(getMasterCharacterID(s)).toBe('dm_fortress');
  });
});

describe('W16-A · 港口（dm_harbor）', () => {
  describe('海啸 applyHarborTsunami', () => {
    it('1-5 点击杀盗梦者并直接进迷失层', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      // p1 投到 1，p2 投到 6
      const next = applyHarborTsunami(s, [1, 6]);
      expect(next.players.p1!.isAlive).toBe(false);
      expect(next.players.p1!.currentLayer).toBe(0);
      expect(next.players.p2!.isAlive).toBe(true);
    });

    it('6 点全员躲过', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      const next = applyHarborTsunami(s, [6, 6]);
      expect(next.players.p1!.isAlive).toBe(true);
      expect(next.players.p2!.isAlive).toBe(true);
    });

    it('梦主非港口则无副作用', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
      const next = applyHarborTsunami(s, [1, 1]);
      expect(next).toBe(s);
    });

    it('盗梦者死亡时不交手牌（直接跳过击杀状态）', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      s = setHand(s, 'p1', ['action_unlock', 'action_unlock', 'action_unlock']);
      const masterHandBefore = s.players.pM!.hand.length;
      const next = applyHarborTsunami(s, [3, 6]);
      expect(next.players.p1!.isAlive).toBe(false);
      expect(next.players.pM!.hand.length).toBe(masterHandBefore);
    });

    it('已死亡盗梦者不重复处理', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      s = {
        ...s,
        players: {
          ...s.players,
          p1: { ...s.players.p1!, isAlive: false, deathTurn: 1, currentLayer: 0 as Layer },
        },
      };
      const next = applyHarborTsunami(s, [1, 6]);
      // p2 是第一个 alive thief，roll[0]=1 → 杀 p2
      expect(next.players.p2!.isAlive).toBe(false);
    });
  });

  describe('世界观 / 胜利', () => {
    it('isHarborWorldActive 仅梦主为港口时 true', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      expect(isHarborWorldActive(s)).toBe(true);
      const s2 = setMasterCharacter(s, 'dm_fortress');
      expect(isHarborWorldActive(s2)).toBe(false);
    });

    it('checkHarborWin：< 2 金库未触发', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      expect(checkHarborWin(s)).toBe(false);
    });

    it('checkHarborWin：≥2 金库且秘密未开 → 梦主胜', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      const coinIdxs = s.vaults
        .map((v, i) => (v.contentType === 'coin' ? i : -1))
        .filter((i) => i >= 0);
      s = setVaultOpened(s, coinIdxs[0]!, 'p1');
      s = setVaultOpened(s, coinIdxs[1]!, 'p1');
      expect(checkHarborWin(s)).toBe(true);
    });

    it('checkHarborWin：秘密金库已开 → 不触发（盗梦者已胜）', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_harbor');
      const secretIdx = s.vaults.findIndex((v) => v.contentType === 'secret');
      const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
      s = setVaultOpened(s, secretIdx, 'p1');
      s = setVaultOpened(s, coinIdx, 'p1');
      expect(checkHarborWin(s)).toBe(false);
    });
  });
});

describe('W16-A · 盛夏（dm_midsummer）', () => {
  it('充盈：未派发贿赂数即额外抽牌', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_midsummer');
    s = {
      ...s,
      bribePool: [
        { id: 'b1', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'b2', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'b3', status: 'inPool', heldBy: null, originalOwnerId: null },
      ],
    };
    expect(getMidsummerExtraDraws(s)).toBe(3);
  });

  it('充盈：非盛夏梦主返回 0', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    expect(getMidsummerExtraDraws(s)).toBe(0);
  });

  it('盛夏世界观：盗梦者 +1 抽', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_midsummer');
    expect(getMidsummerWorldThiefBonus(s)).toBe(1);
  });

  it('非盛夏：世界观抽牌 +0', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    expect(getMidsummerWorldThiefBonus(s)).toBe(0);
  });

  it('空贿赂池 → 0 额外抽', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_midsummer');
    s = { ...s, bribePool: [] };
    expect(getMidsummerExtraDraws(s)).toBe(0);
  });
});

describe('W16-A · 黑洞·DM（dm_black_hole）', () => {
  describe('倒流 applyBlackHoleReverse', () => {
    it('未开金库的层 +2 心锁，受 cap 限制', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_black_hole');
      s = setLayerHL(s, 1, 1);
      s = setLayerHL(s, 2, 5);
      const caps = { 1: 5, 2: 5, 3: 5, 4: 5 };
      const next = applyBlackHoleReverse(s, caps);
      expect(next.layers[1]!.heartLockValue).toBe(3);
      expect(next.layers[2]!.heartLockValue).toBe(5); // cap
    });

    it('已开金库的层 → 不增', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_black_hole');
      s = setLayerHL(s, 1, 0);
      const v1Idx = s.vaults.findIndex((v) => v.layer === 1);
      s = setVaultOpened(s, v1Idx, 'p1');
      const next = applyBlackHoleReverse(s, { 1: 5, 2: 5, 3: 5, 4: 5 });
      expect(next.layers[1]!.heartLockValue).toBe(0);
    });

    it('梦主非黑洞 → 无副作用', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
      s = setLayerHL(s, 1, 1);
      const next = applyBlackHoleReverse(s, { 1: 5, 2: 5, 3: 5, 4: 5 });
      expect(next).toBe(s);
    });
  });

  describe('世界观', () => {
    it('isBlackHoleWorldActive：黑洞梦主时 true', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_black_hole');
      expect(isBlackHoleWorldActive(s)).toBe(true);
    });

    it('getEffectiveMaxUnlockPerTurn：黑洞 → 至少 2', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_black_hole');
      expect(getEffectiveMaxUnlockPerTurn(s, 1)).toBe(2);
    });

    it('getEffectiveMaxUnlockPerTurn：非黑洞 → 沿用 base', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
      expect(getEffectiveMaxUnlockPerTurn(s, 1)).toBe(1);
    });
  });
});

describe('W16-A · 海王星·泓洋（dm_neptune_ocean）', () => {
  it('风暴：弃 5 张牌库顶', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    const next = applyNeptuneStorm(s);
    expect(next.deck.cards.length).toBe(5);
    expect(next.deck.discardPile.length).toBe(5);
  });

  it('风暴：牌库 < 5 时全部弃光', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    s = {
      ...s,
      deck: { cards: ['action_unlock' as CardID, 'action_unlock' as CardID], discardPile: [] },
    };
    const next = applyNeptuneStorm(s);
    expect(next.deck.cards.length).toBe(0);
    expect(next.deck.discardPile.length).toBe(2);
  });

  it('风暴：非海王星 → 无副作用', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    const next = applyNeptuneStorm(s);
    expect(next).toBe(s);
  });

  it('泓洋胜利：金币金库被打开 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    const coinIdx = s.vaults.findIndex((v) => v.contentType === 'coin');
    s = setVaultOpened(s, coinIdx, 'p1');
    expect(checkNeptuneWin(s)).toBe(true);
  });

  it('泓洋胜利：仅秘密金库开 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_neptune_ocean');
    const secretIdx = s.vaults.findIndex((v) => v.contentType === 'secret');
    s = setVaultOpened(s, secretIdx, 'p1');
    expect(checkNeptuneWin(s)).toBe(false);
  });
});

describe('W16-A · 木星·巅峰（dm_jupiter_peak）', () => {
  it('isJupiterPeakWorldActive', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_jupiter_peak');
    expect(isJupiterPeakWorldActive(s)).toBe(true);
  });

  it('巅峰世界观：同层 OK', () => {
    expect(isJupiterPeakLayerOK(2, 2)).toBe(true);
  });

  it('巅峰世界观：相邻层 OK', () => {
    expect(isJupiterPeakLayerOK(2, 3)).toBe(true);
    expect(isJupiterPeakLayerOK(3, 2)).toBe(true);
  });

  it('巅峰世界观：跨 2 层不 OK', () => {
    expect(isJupiterPeakLayerOK(1, 3)).toBe(false);
  });

  it('巅峰世界观：迷失层不 OK', () => {
    expect(isJupiterPeakLayerOK(0, 1)).toBe(false);
  });

  it('雷霆：roll < 梦主层 → 击杀', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 3)).toBe(true);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, 4)).toBe(false);
  });

  it('雷霆：非木星梦主 → 不触发', () => {
    expect(shouldJupiterThunderKill('dm_fortress', 4, 1)).toBe(false);
  });

  it('雷霆：梦主在迷失层 → 不触发', () => {
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 0, 1)).toBe(false);
  });
});

// B4 · M4 卡宾枪 dice modifier（与 shouldJupiterThunderKill 组合使用）
// 对照：docs/manual/03-game-flow.md §80-81 M4 卡宾枪 + 05-dream-thieves.md §111
describe('M4 卡宾枪 · dice modifier', () => {
  it('梦主身份 → 骰 -1（clamp [1,6]）', () => {
    expect(applyM4CarbineModifier(true, 6)).toBe(5);
    expect(applyM4CarbineModifier(true, 4)).toBe(3);
    expect(applyM4CarbineModifier(true, 1)).toBe(1); // clamp 下限
  });

  it('非梦主（盗梦者自杀或贿赂盗梦者 SHOOT）→ 不修饰', () => {
    expect(applyM4CarbineModifier(false, 6)).toBe(6);
    expect(applyM4CarbineModifier(false, 1)).toBe(1);
  });

  it('木星·雷霆 + M4 叠加（manual §50 示例）：4 层梦主 vs 3 层盗梦者掷 4 → 击杀', () => {
    // 旧版：baseRoll=4 → shouldJupiterThunderKill('dm_jupiter_peak', 4, 4) = false（不击杀）
    // 新版：applyM4CarbineModifier(true, 4) = 3，shouldJupiterThunderKill(..., 3) = true（击杀）
    const finalRoll = applyM4CarbineModifier(true, 4);
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, finalRoll)).toBe(true);
    // 对比：骰 5 → M4 后 4，仍然 ≥ 4 层 → 不击杀
    expect(shouldJupiterThunderKill('dm_jupiter_peak', 4, applyM4CarbineModifier(true, 5))).toBe(
      false,
    );
  });
});

describe('W16-A · 土星·领地（dm_saturn_territory）', () => {
  describe('律令 applySaturnDecree', () => {
    it('弃 1 手牌 + 抽 1', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      s = setHand(s, 'pM', ['action_unlock' as CardID, 'action_kick' as CardID]);
      s = {
        ...s,
        deck: { cards: ['action_shoot' as CardID, 'action_graft' as CardID], discardPile: [] },
      };
      const next = applySaturnDecree(s, 'pM', 'action_kick');
      expect(next).not.toBeNull();
      expect(next!.players.pM!.hand).toEqual(['action_unlock', 'action_shoot']);
      expect(next!.deck.discardPile).toContain('action_kick');
    });

    it('手牌不含目标 → null', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      s = setHand(s, 'pM', ['action_unlock' as CardID]);
      const next = applySaturnDecree(s, 'pM', 'action_kick');
      expect(next).toBeNull();
    });

    it('梦主非土星 → null', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
      s = setHand(s, 'pM', ['action_unlock' as CardID]);
      const next = applySaturnDecree(s, 'pM', 'action_unlock');
      expect(next).toBeNull();
    });

    it('梦主已死 → null', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      s = {
        ...s,
        players: {
          ...s.players,
          pM: { ...s.players.pM!, isAlive: false, deathTurn: 1, hand: ['action_unlock' as CardID] },
        },
      };
      const next = applySaturnDecree(s, 'pM', 'action_unlock');
      expect(next).toBeNull();
    });
  });

  describe('领地世界观 canSaturnFreeMove', () => {
    it('盗梦者持有贿赂 → true', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      s = {
        ...s,
        players: {
          ...s.players,
          p1: { ...s.players.p1!, bribeReceived: 1 },
        },
      };
      expect(canSaturnFreeMove(s, 'p1')).toBe(true);
    });

    it('盗梦者无贿赂 → false', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      expect(canSaturnFreeMove(s, 'p1')).toBe(false);
    });

    it('梦主非土星 → false', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
      s = {
        ...s,
        players: { ...s.players, p1: { ...s.players.p1!, bribeReceived: 1 } },
      };
      expect(canSaturnFreeMove(s, 'p1')).toBe(false);
    });

    it('梦主自己 → false', () => {
      const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
      expect(canSaturnFreeMove(s, 'pM')).toBe(false);
    });
  });
});
