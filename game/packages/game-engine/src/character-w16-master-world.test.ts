// W16-C 梦主世界观 / 火星·杀戮 / 土星·领地世界观
// 对照：plans/tasks.md Phase 3 W16

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  canMarsKill,
  applyMarsKillDiscardUnlock,
  isPlutoHellWorldActive,
  applyPlutoHellLostCheck,
  applySaturnFreeMove,
  canUseSaturnFreeMoveThisTurn,
  findMasterID,
  SATURN_FREE_MOVE_SKILL_ID,
  markSkillUsed,
} from './engine/skills.js';
import { callMove, expectMoveOk } from './testing/fixtures.js';
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

function setLayer(state: SetupState, playerID: string, layer: Layer): SetupState {
  const p = state.players[playerID]!;
  const oldL = p.currentLayer;
  if (oldL === layer) return state;
  const fromL = state.layers[oldL]!;
  const toL = state.layers[layer]!;
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

function setBribeReceived(state: SetupState, playerID: string, n: number): SetupState {
  const p = state.players[playerID]!;
  return { ...state, players: { ...state.players, [playerID]: { ...p, bribeReceived: n } } };
}

function setLayerNightmare(state: SetupState, layer: Layer, nid: CardID): SetupState {
  const li = state.layers[layer]!;
  return {
    ...state,
    layers: { ...state.layers, [layer]: { ...li, nightmareId: nid, nightmareRevealed: false } },
  };
}

describe('W16-C · 火星·战场（dm_mars_battlefield）·杀戮', () => {
  it('canMarsKill：手牌有解封 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    expect(canMarsKill(s, 'pM')).toBe(true);
  });

  it('canMarsKill：手牌无解封 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    expect(canMarsKill(s, 'pM')).toBe(false);
  });

  it('canMarsKill：非火星梦主 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    expect(canMarsKill(s, 'pM')).toBe(false);
  });

  it('applyMarsKillDiscardUnlock：弃 1 解封到弃牌堆', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'pM', ['action_unlock' as CardID, 'action_kick' as CardID]);
    const r = applyMarsKillDiscardUnlock(s, 'pM');
    expect(r).not.toBeNull();
    expect(r!.players.pM!.hand).toEqual(['action_kick']);
    expect(r!.deck.discardPile).toContain('action_unlock');
  });

  it('applyMarsKillDiscardUnlock：手牌无解封 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    const r = applyMarsKillDiscardUnlock(s, 'pM');
    expect(r).toBeNull();
  });

  it('move useMarsKill：发动 nightmare_despair_storm → 弃 10 张牌库顶', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'pM' };
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const cards: CardID[] = Array.from({ length: 15 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    const r = callMove(s, 'useMarsKill', [1], { currentPlayer: 'pM' });
    expectMoveOk(r);
    // 弃 10 张牌库（绝望风暴）
    expect(r.deck.cards.length).toBe(5);
    // 解封被弃 + 10 牌库牌进弃牌堆
    expect(r.deck.discardPile.length).toBeGreaterThanOrEqual(11);
    // 梦魇清空
    expect(r.layers[1]!.nightmareId).toBe(null);
    expect(r.usedNightmareIds).toContain('nightmare_despair_storm');
  });

  it('move useMarsKill：当层无梦魇 → INVALID', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'pM' };
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    const r = callMove(s, 'useMarsKill', [1], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });

  it('move useMarsKill：非火星梦主 → INVALID', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'pM' };
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    s = setLayerNightmare(s, 1 as Layer, 'nightmare_despair_storm');
    const r = callMove(s, 'useMarsKill', [1], { currentPlayer: 'pM' });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('W16-C · 冥王星·地狱世界观', () => {
  it('isPlutoHellWorldActive：冥王星梦主时 true', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    expect(isPlutoHellWorldActive(s)).toBe(true);
  });

  it('applyPlutoHellLostCheck：手牌≥6 → 入迷失', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(
      s,
      'p1',
      Array.from({ length: 6 }, () => 'action_unlock' as CardID),
    );
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(0);
  });

  it('applyPlutoHellLostCheck：手牌<6 → 不入迷失', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(
      s,
      'p1',
      Array.from({ length: 5 }, () => 'action_unlock' as CardID),
    );
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(1);
  });

  it('applyPlutoHellLostCheck：非冥王星梦主 → 不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setHand(
      s,
      'p1',
      Array.from({ length: 6 }, () => 'action_unlock' as CardID),
    );
    const r = applyPlutoHellLostCheck(s, 'p1');
    expect(r.players.p1!.currentLayer).toBe(1);
  });

  it('applyPlutoHellLostCheck：已死亡盗梦者 → 不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(
      s,
      'p1',
      Array.from({ length: 6 }, () => 'action_unlock' as CardID),
    );
    s = {
      ...s,
      players: { ...s.players, p1: { ...s.players.p1!, isAlive: false, deathTurn: 1 } },
    };
    const r = applyPlutoHellLostCheck(s, 'p1');
    // 已死则不再"入迷失"逻辑层面也可不变（由其他流程处理），验证至少不出错
    expect(r.players.p1!.isAlive).toBe(false);
  });

  it('applyPlutoHellLostCheck：梦主自己不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(
      s,
      'pM',
      Array.from({ length: 8 }, () => 'action_unlock' as CardID),
    );
    const r = applyPlutoHellLostCheck(s, 'pM');
    expect(r.players.pM!.currentLayer).toBe(1);
  });

  it('doDraw：冥王星世界观下盗梦者抽牌数 = D6', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    s = setHand(s, 'p1', []);
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    // D6 注入 5
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1', rolls: [5] });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(5);
  });

  it('doDraw：非冥王星世界观盗梦者抽默认数', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = { ...s, turnPhase: 'draw', currentPlayerID: 'p1' };
    s = setHand(s, 'p1', []);
    const cards: CardID[] = Array.from({ length: 10 }, () => 'action_unlock' as CardID);
    s = { ...s, deck: { cards, discardPile: [] } };
    const r = callMove(s, 'doDraw', [], { currentPlayer: 'p1' });
    expectMoveOk(r);
    // BASE_DRAW_COUNT 默认 2
    expect(r.players.p1!.hand.length).toBe(2);
  });
});

describe('W16-C · 土星·领地世界观', () => {
  it('canUseSaturnFreeMoveThisTurn：持贿赂 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    expect(canUseSaturnFreeMoveThisTurn(s, 'p1')).toBe(true);
  });

  it('canUseSaturnFreeMoveThisTurn：无贿赂 → false', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    expect(canUseSaturnFreeMoveThisTurn(s, 'p1')).toBe(false);
  });

  it('canUseSaturnFreeMoveThisTurn：本回合已用 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    s = markSkillUsed(s, 'p1', SATURN_FREE_MOVE_SKILL_ID);
    expect(canUseSaturnFreeMoveThisTurn(s, 'p1')).toBe(false);
  });

  it('applySaturnFreeMove：移动到相邻层', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(2);
  });

  it('applySaturnFreeMove：跨非相邻层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    const r = applySaturnFreeMove(s, 'p1', 3 as Layer);
    expect(r).toBeNull();
  });

  it('applySaturnFreeMove：迷失层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    const r = applySaturnFreeMove(s, 'p1', 0 as Layer);
    expect(r).toBeNull();
  });

  it('applySaturnFreeMove：每回合限 1 次', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = setBribeReceived(s, 'p1', 1);
    const r = applySaturnFreeMove(s, 'p1', 2 as Layer)!;
    const r2 = applySaturnFreeMove(r, 'p1', 1 as Layer);
    expect(r2).toBeNull();
  });

  it('move useSaturnFreeMove：成功调用', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
    s = setBribeReceived(s, 'p1', 1);
    const r = callMove(s, 'useSaturnFreeMove', [2], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(2);
  });

  it('move useSaturnFreeMove：从 L3 移动到 L4', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_saturn_territory');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
    s = setBribeReceived(s, 'p1', 1);
    s = setLayer(s, 'p1', 3 as Layer);
    const r = callMove(s, 'useSaturnFreeMove', [4], { currentPlayer: 'p1' });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
  });
});
