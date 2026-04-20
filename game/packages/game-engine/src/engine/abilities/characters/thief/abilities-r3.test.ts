// W10-R3 · 桶 D 6 角色响应窗口类能力注册
// 对照：plans/tasks.md Phase 3 abilities registry · R3（黑洞·征收/空间女王×2/射手·心锁/恐怖分子·远程/格林射线）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from '../../../../setup.js';
import { scenarioStartOfGame3p } from '../../../../testing/scenarios.js';
import {
  blackHoleLevy,
  createDefaultRegistry,
  greenRayTransfer,
  sagittariusHeartLock,
  spaceQueenObserve,
  spaceQueenStashTop,
  terroristCrossLayer,
} from '../index.js';
import type { AbilityContext } from '../../types.js';

function ctxFor(
  state: SetupState,
  invokerID: string,
  overrides: Partial<AbilityContext> = {},
): AbilityContext {
  return {
    invokerID,
    turnNumber: state.turnNumber,
    turnPhase: state.turnPhase,
    dreamMasterID: state.dreamMasterID,
    invokerFaction: state.players[invokerID]?.faction ?? 'thief',
    d6: () => 4,
    ...overrides,
  };
}

function setCharacter(state: SetupState, playerID: string, characterId: CardID): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, characterId } } };
}

function setHand(state: SetupState, playerID: string, hand: CardID[]): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, hand } } };
}

function setLayerMembers(state: SetupState, layer: Layer, ids: string[]): SetupState {
  const li = state.layers[layer]!;
  const newPlayers = { ...state.players };
  for (const id of ids) {
    newPlayers[id] = { ...newPlayers[id]!, currentLayer: layer };
  }
  return {
    ...state,
    players: newPlayers,
    layers: { ...state.layers, [layer]: { ...li, playersInLayer: ids } },
  };
}

function setHeartLock(state: SetupState, layer: Layer, val: number): SetupState {
  const li = state.layers[layer]!;
  return { ...state, layers: { ...state.layers, [layer]: { ...li, heartLockValue: val } } };
}

// ==========================================================================
// Registry 集成
// ==========================================================================

describe('R3 · registry 扩展', () => {
  it('注册总数升至 14', () => {
    const reg = createDefaultRegistry();
    expect(reg.get(blackHoleLevy.id)).toBe(blackHoleLevy);
    expect(reg.get(spaceQueenObserve.id)).toBe(spaceQueenObserve);
    expect(reg.get(spaceQueenStashTop.id)).toBe(spaceQueenStashTop);
    expect(reg.get(sagittariusHeartLock.id)).toBe(sagittariusHeartLock);
    expect(reg.get(terroristCrossLayer.id)).toBe(terroristCrossLayer);
    expect(reg.get(greenRayTransfer.id)).toBe(greenRayTransfer);
  });

  it('onUnlock → spaceQueenObserve', () => {
    const reg = createDefaultRegistry();
    expect(reg.getByTrigger('onUnlock').map((a) => a.id)).toEqual(['thief_space_queen.skill_0']);
  });

  it('onKilled → sagittariusHeartLock', () => {
    const reg = createDefaultRegistry();
    expect(reg.getByTrigger('onKilled').map((a) => a.id)).toEqual(['thief_sagittarius.skill_1']);
  });

  it('onDiscardPhase → spaceQueenStashTop', () => {
    const reg = createDefaultRegistry();
    expect(reg.getByTrigger('onDiscardPhase').map((a) => a.id)).toEqual([
      'thief_space_queen.skill_1',
    ]);
  });
});

// ==========================================================================
// 黑洞 · 征收
// ==========================================================================

describe('R3 · 黑洞·征收', () => {
  it('canActivate ok：同层有其它玩家 + draw 阶段', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setLayerMembers(s, 1 as Layer, ['p1', 'p2']);
    const ctx = ctxFor(s, 'p1');
    expect(blackHoleLevy.canActivate(s, ctx).ok).toBe(true);
  });

  it('同层无其它玩家 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setLayerMembers(s, 1 as Layer, ['p1']);
    const ctx = ctxFor(s, 'p1');
    expect(blackHoleLevy.canActivate(s, ctx).reason).toBe('no_same_layer_others');
  });

  it('apply 无 picks → 打开响应窗口', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setLayerMembers(s, 1 as Layer, ['p1', 'p2']);
    s = setHand(s, 'p2', ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r = blackHoleLevy.apply(s, ctx, {});
    expect(r.state!.pendingResponseWindow).not.toBeNull();
    expect(r.state!.pendingResponseWindow!.responders).toEqual(['p2']);
    expect(r.events[0]!.type).toBe('black_hole_levy_window_opened');
  });

  it('apply 提供 picks → 直接结算', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_black_hole');
    s = setLayerMembers(s, 1 as Layer, ['p1', 'p2']);
    s = setHand(s, 'p2', ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r = blackHoleLevy.apply(s, ctx, { giverPicks: { p2: 'action_unlock' as CardID } });
    const next = r.state!;
    expect(next.players['p1']!.hand).toContain('action_unlock');
    expect(next.players['p2']!.hand).toHaveLength(0);
    expect(r.events[0]!.type).toBe('black_hole_levy_resolved');
  });
});

// ==========================================================================
// 空间女王 · 监察
// ==========================================================================

describe('R3 · 空间女王·监察（onUnlock）', () => {
  it('canActivate ok：角色匹配', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    const ctx = ctxFor(s, 'p1');
    expect(spaceQueenObserve.canActivate(s, ctx).ok).toBe(true);
  });

  it('apply：抽 1 张（有牌库）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    s = { ...s, deck: { ...s.deck, cards: ['action_unlock' as CardID] } };
    const ctx = ctxFor(s, 'p1');
    const r = spaceQueenObserve.apply(s, ctx, {});
    expect(r.state!.players['p1']!.hand).toContain('action_unlock');
  });
});

// ==========================================================================
// 空间女王 · 放置（onDiscardPhase）
// ==========================================================================

describe('R3 · 空间女王·放置', () => {
  it('canActivate ok：角色 + 手牌非空', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    expect(spaceQueenStashTop.canActivate(s, ctx).ok).toBe(true);
  });

  it('手牌空 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    s = setHand(s, 'p1', []);
    const ctx = ctxFor(s, 'p1');
    expect(spaceQueenStashTop.canActivate(s, ctx).reason).toBe('no_hand');
  });

  it('apply：1 张手牌放到牌库顶', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_space_queen');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    const ctx = ctxFor(s, 'p1');
    const r = spaceQueenStashTop.apply(s, ctx, { cardId: 'action_unlock' as CardID });
    const next = r.state!;
    expect(next.players['p1']!.hand).toHaveLength(0);
    expect(next.deck.cards[0]).toBe('action_unlock');
  });
});

// ==========================================================================
// 射手 · 心锁（onKilled + perGame 限 1）
// ==========================================================================

describe('R3 · 射手·心锁', () => {
  it('canActivate ok：射手 + 未用过', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sagittarius');
    const ctx = ctxFor(s, 'p1');
    expect(sagittariusHeartLock.canActivate(s, ctx).ok).toBe(true);
  });

  it('apply：layer 2 delta=+1 → 心锁 +1', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sagittarius');
    s = setHeartLock(s, 2 as Layer, 3);
    const ctx = ctxFor(s, 'p1');
    const r = sagittariusHeartLock.apply(s, ctx, { layer: 2, delta: 1 });
    expect(r.state!.layers[2]!.heartLockValue).toBe(4);
  });

  it('perGame 限 1 次：第 2 次拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sagittarius');
    s = setHeartLock(s, 2 as Layer, 3);
    const ctx = ctxFor(s, 'p1');
    const r1 = sagittariusHeartLock.apply(s, ctx, { layer: 2, delta: 1 });
    expect(sagittariusHeartLock.canActivate(r1.state!, ctx).reason).toBe('usage_exhausted');
  });

  it('delta=-1 + cap=6 + 心锁=0 → 保持 0（下限守护）', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_sagittarius');
    s = setHeartLock(s, 2 as Layer, 0);
    const ctx = ctxFor(s, 'p1');
    const r = sagittariusHeartLock.apply(s, ctx, { layer: 2, delta: -1 });
    expect(r.state!.layers[2]!.heartLockValue).toBe(0);
  });
});

// ==========================================================================
// 恐怖分子 · 远程（被动）
// ==========================================================================

describe('R3 · 恐怖分子·远程（passive）', () => {
  it('canActivate ok：角色匹配', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_terrorist');
    const ctx = ctxFor(s, 'p1');
    expect(terroristCrossLayer.canActivate(s, ctx).ok).toBe(true);
  });

  it('apply：被动 state 不变', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_terrorist');
    const ctx = ctxFor(s, 'p1');
    const r = terroristCrossLayer.apply(s, ctx, {});
    expect(r.state).toBe(s);
  });
});

// ==========================================================================
// 格林射线
// ==========================================================================

describe('R3 · 格林射线', () => {
  it('canActivate ok：action 阶段 + 手牌含穿梭剂+SHOOT', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_dream_transit' as CardID, 'action_shoot' as CardID]);
    s = { ...s, turnPhase: 'action' };
    const ctx = ctxFor(s, 'p1');
    expect(greenRayTransfer.canActivate(s, ctx).ok).toBe(true);
  });

  it('手牌缺 SHOOT → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_dream_transit' as CardID]);
    s = { ...s, turnPhase: 'action' };
    const ctx = ctxFor(s, 'p1');
    expect(greenRayTransfer.canActivate(s, ctx).reason).toBe('condition_not_met');
  });

  it('非 action 阶段 → 拒绝', () => {
    let s = scenarioStartOfGame3p();
    s = setCharacter(s, 'p1', 'thief_green_ray');
    s = setHand(s, 'p1', ['action_dream_transit' as CardID, 'action_shoot' as CardID]);
    const ctx = ctxFor(s, 'p1');
    expect(greenRayTransfer.canActivate(s, ctx).reason).toBe('wrong_phase');
  });
});
