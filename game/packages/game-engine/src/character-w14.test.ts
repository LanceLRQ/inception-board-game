// W14 混合 9 角色单测
// 对照：plans/tasks.md Phase 3 W14 · 小丑/影子/恐怖分子/黑天鹅/黑洞/欺诈师/降世神通/空间女王/梦境猎手
// 对照：docs/manual/05-dream-thieves.md
//
// 完整接入：影子 / 降世神通 / 梦境猎手 / 欺诈师 / 恐怖分子（SHOOT 跨层）
// 纯函数：小丑 / 黑洞 / 黑天鹅 / 空间女王（接入待响应窗口/pending state 批次）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyShadeFollow,
  applyHlninoFlow,
  applyExtractorBounty,
  applyForgerExchange,
  isTerroristCrossLayerActive,
  jokerDrawCount,
  applyBlackHoleLevy,
  applyBlackSwanTour,
  applySpaceQueenObserve,
  applySpaceQueenStashTop,
  FORGER_SKILL_ID,
  BLACK_HOLE_LEVY_SKILL_ID,
  BLACK_SWAN_SKILL_ID,
} from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
import { scenarioActionPhase } from './testing/scenarios.js';

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  const oldL = p.currentLayer;
  if (oldL === layer) return state;
  const fromL = state.layers[oldL];
  const toL = state.layers[layer];
  if (!fromL || !toL) return state;
  return {
    ...state,
    players: { ...state.players, [playerID]: { ...p, currentLayer: layer } },
    layers: {
      ...state.layers,
      [oldL]: { ...fromL, playersInLayer: fromL.playersInLayer.filter((id) => id !== playerID) },
      [layer]: { ...toL, playersInLayer: [...toL.playersInLayer, playerID] },
    },
  };
}

// ============================================================================
// 影子 · 潜伏
// ============================================================================
describe('影子 · 潜伏（thief_shade）', () => {
  it('成功：移到梦主所在层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_shade' as CardID);
    s = setLayer(s, 'pM', 3 as Layer);
    const r = applyShadeFollow(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(3);
  });

  it('拒绝：与梦主已同层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_shade' as CardID);
    expect(applyShadeFollow(s, 'p1')).toBeNull();
  });

  it('拒绝：梦主在迷失层', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_shade' as CardID);
    s = {
      ...s,
      players: { ...s.players, pM: { ...s.players.pM!, currentLayer: 0 } },
    };
    expect(applyShadeFollow(s, 'p1')).toBeNull();
  });

  it('move 接入：playShadeFollow', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_shade' as CardID);
    s = setLayer(s, 'pM', 2 as Layer);
    const r = callMove(s, 'playShadeFollow', []);
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(2);
  });
});

// ============================================================================
// 降世神通 · 顺流
// ============================================================================
describe('降世神通 · 顺流（thief_hlnino）', () => {
  it('1→2：抽 2 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_hlnino' as CardID);
    s = { ...s, deck: { cards: ['action_kick', 'action_unlock'] as CardID[], discardPile: [] } };
    const r = applyHlninoFlow(s, 'p1', 1, 2);
    expect(r.players.p1!.hand).toEqual(['action_kick', 'action_unlock']);
  });

  it('2→1（数字变小）：不抽', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_hlnino' as CardID);
    s = { ...s, deck: { cards: ['action_kick'] as CardID[], discardPile: [] } };
    const r = applyHlninoFlow(s, 'p1', 2, 1);
    expect(r).toBe(s);
  });

  it('集成：playDreamTransit 1→2 触发抽 2', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_hlnino' as CardID);
    s = setHand(s, 'p1', ['action_dream_transit'] as CardID[]);
    s = { ...s, deck: { cards: ['action_kick', 'action_unlock'] as CardID[], discardPile: [] } };
    const r = callMove(s, 'playDreamTransit', ['action_dream_transit' as CardID, 2]);
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(2);
    expect(r.players.p1!.hand).toEqual(['action_kick', 'action_unlock']);
  });
});

// ============================================================================
// 梦境猎手 · 满载
// ============================================================================
describe('梦境猎手 · 满载（thief_extractor）', () => {
  it('当层心锁=4 → 抽 4 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_extractor' as CardID);
    s = setLayer(s, 'p1', 2 as Layer); // L2 默认 heartLockValue=4
    s = {
      ...s,
      deck: {
        cards: ['action_kick', 'action_unlock', 'action_creation', 'action_peek'] as CardID[],
        discardPile: [],
      },
    };
    const r = applyExtractorBounty(s, 'p1');
    expect(r.players.p1!.hand.length).toBe(4);
  });

  it('当层心锁=0 → 不抽', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_extractor' as CardID);
    s = {
      ...s,
      layers: { ...s.layers, 1: { ...s.layers[1]!, heartLockValue: 0 } },
    };
    const r = applyExtractorBounty(s, 'p1');
    expect(r).toBe(s);
  });
});

// ============================================================================
// 欺诈师 · 盗心
// ============================================================================
describe('欺诈师 · 盗心（thief_forger）', () => {
  function setupForgerScenario(): SetupState {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_forger' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    s = setHand(s, 'p2', ['action_creation', 'action_peek'] as CardID[]);
    return s;
  }

  it('成功：抽 2 张 + 还 2 张', () => {
    const s = setupForgerScenario();
    const r = applyForgerExchange(s, 'p1', {
      targetID: 'p2',
      takenFromTarget: ['action_creation', 'action_peek'] as CardID[],
      returnedToTarget: ['action_kick', 'action_unlock'] as CardID[],
    });
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_creation', 'action_peek']);
    expect(r!.players.p2!.hand).toEqual(['action_kick', 'action_unlock']);
    expect(r!.players.p1!.skillUsedThisTurn[FORGER_SKILL_ID]).toBe(1);
  });

  it('拒绝：抽 0 张', () => {
    const s = setupForgerScenario();
    const r = applyForgerExchange(s, 'p1', {
      targetID: 'p2',
      takenFromTarget: [],
      returnedToTarget: [],
    });
    expect(r).toBeNull();
  });

  it('拒绝：抽数与还数不等', () => {
    const s = setupForgerScenario();
    const r = applyForgerExchange(s, 'p1', {
      targetID: 'p2',
      takenFromTarget: ['action_creation'] as CardID[],
      returnedToTarget: ['action_kick', 'action_unlock'] as CardID[],
    });
    expect(r).toBeNull();
  });

  it('拒绝：还的牌不在 self 手中', () => {
    const s = setupForgerScenario();
    const r = applyForgerExchange(s, 'p1', {
      targetID: 'p2',
      takenFromTarget: ['action_creation'] as CardID[],
      returnedToTarget: ['action_shoot' as CardID],
    });
    expect(r).toBeNull();
  });

  it('move 接入：playForgerExchange', () => {
    const s = setupForgerScenario();
    const r = callMove(s, 'playForgerExchange', [
      {
        targetID: 'p2',
        takenFromTarget: ['action_creation'] as CardID[],
        returnedToTarget: ['action_kick'] as CardID[],
      },
    ]);
    expectMoveOk(r);
    expect(r.players.p1!.hand).toContain('action_creation');
    expect(r.players.p2!.hand).toContain('action_kick');
  });
});

// ============================================================================
// 恐怖分子 · 远程（SHOOT 跨层）
// ============================================================================
describe('恐怖分子 · 远程（thief_terrorist）', () => {
  it('isTerroristCrossLayerActive：恐怖分子活着 → true', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_terrorist' as CardID);
    expect(isTerroristCrossLayerActive(s.players.p1!)).toBe(true);
  });

  it('isTerroristCrossLayerActive：非恐怖分子 → false', () => {
    const s = scenarioActionPhase();
    expect(isTerroristCrossLayerActive(s.players.p1!)).toBe(false);
  });

  it('集成：跨层 SHOOT 通过校验', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_terrorist' as CardID);
    s = setHand(s, 'p1', ['action_shoot'] as CardID[]);
    s = setLayer(s, 'p2', 3 as Layer);
    const r = callMove(s, 'playShoot', ['p2', 'action_shoot' as CardID], { rolls: [1] });
    expectMoveOk(r);
    expect(r.players.p2!.isAlive).toBe(false);
  });
});

// ============================================================================
// 小丑 · 赌博（纯函数）
// ============================================================================
describe('小丑 · 赌博（thief_joker）', () => {
  it('jokerDrawCount clamp [1,6]', () => {
    expect(jokerDrawCount(0)).toBe(1);
    expect(jokerDrawCount(3)).toBe(3);
    expect(jokerDrawCount(7)).toBe(6);
  });
});

// ============================================================================
// 黑洞 · 征收（纯函数）
// ============================================================================
describe('黑洞 · 征收（thief_black_hole · 1/2）', () => {
  it('成功：所有同层玩家各给 1 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_black_hole' as CardID);
    s = setHand(s, 'p2', ['action_unlock'] as CardID[]);
    s = setHand(s, 'pM', ['action_kick'] as CardID[]);
    const r = applyBlackHoleLevy(s, 'p1', {
      p2: 'action_unlock' as CardID,
      pM: 'action_kick' as CardID,
    });
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_unlock', 'action_kick']);
    expect(r!.players.p2!.hand).toEqual([]);
    expect(r!.players.pM!.hand).toEqual([]);
    expect(r!.players.p1!.skillUsedThisTurn[BLACK_HOLE_LEVY_SKILL_ID]).toBe(1);
  });

  it('拒绝：缺少某玩家的 pick', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_black_hole' as CardID);
    s = setHand(s, 'p2', ['action_unlock'] as CardID[]);
    expect(applyBlackHoleLevy(s, 'p1', {})).toBeNull();
  });
});

// ============================================================================
// 黑天鹅 · 巡演（纯函数）
// ============================================================================
describe('黑天鹅 · 巡演（thief_black_swan）', () => {
  it('成功：分发全部手牌 + 抽 4 张', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_black_swan' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    s = {
      ...s,
      deck: {
        cards: ['action_creation', 'action_peek', 'action_shoot', 'action_kick'] as CardID[],
        discardPile: [],
      },
    };
    const r = applyBlackSwanTour(s, 'p1', {
      p2: ['action_kick', 'action_unlock'] as CardID[],
    });
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand.length).toBe(4);
    expect(r!.players.p2!.hand).toEqual(['action_kick', 'action_unlock']);
    expect(r!.players.p1!.skillUsedThisTurn[BLACK_SWAN_SKILL_ID]).toBe(1);
  });

  it('拒绝：分发不到全部手牌', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_black_swan' as CardID);
    s = setHand(s, 'p1', ['action_kick', 'action_unlock'] as CardID[]);
    expect(applyBlackSwanTour(s, 'p1', { p2: ['action_kick'] as CardID[] })).toBeNull();
  });

  it('拒绝：分发给梦主', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_black_swan' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    expect(applyBlackSwanTour(s, 'p1', { pM: ['action_kick'] as CardID[] })).toBeNull();
  });
});

// ============================================================================
// 空间女王 · 监察（纯函数）
// ============================================================================
describe('空间女王（thief_space_queen）', () => {
  it('observe：抽 1', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_space_queen' as CardID);
    s = { ...s, deck: { cards: ['action_kick'] as CardID[], discardPile: [] } };
    const r = applySpaceQueenObserve(s, 'p1');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_kick']);
  });

  it('stashTop：放手牌到牌库顶', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_space_queen' as CardID);
    s = setHand(s, 'p1', ['action_kick'] as CardID[]);
    s = { ...s, deck: { cards: ['action_unlock'] as CardID[], discardPile: [] } };
    const r = applySpaceQueenStashTop(s, 'p1', 'action_kick' as CardID);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual([]);
    expect(r!.deck.cards).toEqual(['action_kick', 'action_unlock']);
  });

  it('stashTop 拒绝：牌不在手中', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_space_queen' as CardID);
    expect(applySpaceQueenStashTop(s, 'p1', 'action_kick' as CardID)).toBeNull();
  });
});
