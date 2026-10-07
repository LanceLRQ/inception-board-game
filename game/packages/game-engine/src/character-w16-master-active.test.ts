// 梦主主动技能 4 角色单测（皇城/密道/天王星/冥王星）

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applySecretPassageTeleport,
  applyUranusPower,
  applyPlutoBurning,
  canImperialPickBribe,
  findMasterID,
  PLUTO_BURNING_SKILL_ID,
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

function setActionPhase(state: SetupState): SetupState {
  return { ...state, turnPhase: 'action', currentPlayerID: 'pM' };
}

function setBribePool(
  state: SetupState,
  pool: {
    id: string;
    kind?: 'deal' | 'fail';
    status: 'inPool' | 'dealt' | 'deal' | 'shattered';
  }[],
): SetupState {
  return {
    ...state,
    bribePool: pool.map((b) => ({
      id: b.id,
      kind: b.kind ?? 'fail',
      status: b.status,
      heldBy: null,
      originalOwnerId: null,
    })),
  };
}

describe('皇城（dm_imperial_city）·重金', () => {
  it('canImperialPickBribe：合法目标 + inPool 贿赂 → true', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = setBribePool(s, [
      { id: 'bribe-deal-1', kind: 'deal', status: 'inPool' },
      { id: 'bribe-fail-1', kind: 'fail', status: 'inPool' },
    ]);
    expect(canImperialPickBribe(s, 'pM', 'p1', 0)).toBe(true);
    expect(canImperialPickBribe(s, 'pM', 'p1', 1)).toBe(true);
  });

  it('canImperialPickBribe：非皇城梦主 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setBribePool(s, [{ id: 'bribe-deal-1', kind: 'deal', status: 'inPool' }]);
    expect(canImperialPickBribe(s, 'pM', 'p1', 0)).toBe(false);
  });

  it('canImperialPickBribe：贿赂已派发 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = setBribePool(s, [{ id: 'bribe-deal-1', kind: 'deal', status: 'dealt' }]);
    expect(canImperialPickBribe(s, 'pM', 'p1', 0)).toBe(false);
  });

  it('canImperialPickBribe：目标已死 → false', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = setBribePool(s, [{ id: 'bribe-deal-1', kind: 'deal', status: 'inPool' }]);
    s = {
      ...s,
      players: {
        ...s.players,
        p1: { ...s.players.p1!, isAlive: false, deathTurn: 1 },
      },
    };
    expect(canImperialPickBribe(s, 'pM', 'p1', 0)).toBe(false);
  });

  // 皇城·重金并进派发时机：金币金库打开后的三选一与【梦境窥视】效果①都可以指定池里的 1 张
  const waitingVault = (s: SetupState): SetupState => ({
    ...s,
    pendingVaultDecision: { layer: 2, openerID: 'p1' },
  });

  it('masterVaultDecision(bribe)：指定 deal → 转阵营', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = waitingVault(setActionPhase(s));
    s = setBribePool(s, [
      { id: 'bribe-fail-1', kind: 'fail', status: 'inPool' },
      { id: 'bribe-deal-1', kind: 'deal', status: 'inPool' },
    ]);
    const r = callMove(s, 'masterVaultDecision', ['bribe', { poolIndex: 1 }], {
      currentPlayer: 'pM',
    });
    expectMoveOk(r);
    expect(r.players.p1!.faction).toBe('master');
    expect(r.players.p1!.bribeReceived).toBe(1);
    expect(r.bribePool[1]!.status).toBe('deal');
    expect(r.bribePool[1]!.heldBy).toBe('p1');
  });

  it('masterVaultDecision(bribe)：指定 fail → 不转阵营', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = waitingVault(setActionPhase(s));
    s = setBribePool(s, [{ id: 'bribe-fail-1', kind: 'fail', status: 'inPool' }]);
    const r = callMove(s, 'masterVaultDecision', ['bribe', { poolIndex: 0 }], {
      currentPlayer: 'pM',
    });
    expectMoveOk(r);
    expect(r.players.p1!.faction).toBe('thief');
    expect(r.bribePool[0]!.status).toBe('dealt');
  });

  it('masterVaultDecision：非梦主调用 → INVALID', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_imperial_city');
    s = waitingVault(setActionPhase(s));
    s = setBribePool(s, [{ id: 'bribe-deal-1', kind: 'deal', status: 'inPool' }]);
    const r = callMove(s, 'masterVaultDecision', ['bribe', { poolIndex: 0 }], {
      currentPlayer: 'p1',
    });
    expect(r).toBe('INVALID_MOVE');
  });
});

describe('密道（dm_secret_passage）·传送', () => {
  it('applySecretPassageTeleport：弃穿梭剂 + 送目标到迷失层', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setHand(s, 'pM', ['action_dream_transit' as CardID, 'action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, 'pM', 'p1', 'action_dream_transit');
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(0);
    expect(r!.players.p1!.isAlive).toBe(false); // 迷失层即死亡状态；传送不算击杀，所以不交手牌
    expect(r!.players.pM!.hand.length).toBe(1);
    expect(r!.deck.discardPile).toContain('action_dream_transit');
  });

  it('保留手牌（跳过击杀状态）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setHand(s, 'pM', ['action_dream_transit' as CardID]);
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    const r = applySecretPassageTeleport(s, 'pM', 'p1', 'action_dream_transit');
    expect(r!.players.p1!.hand).toEqual(['action_unlock', 'action_kick']);
  });

  it('回合限 2 次', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setHand(s, 'pM', [
      'action_dream_transit' as CardID,
      'action_dream_transit' as CardID,
      'action_dream_transit' as CardID,
    ]);
    let r = applySecretPassageTeleport(s, 'pM', 'p1', 'action_dream_transit')!;
    r = applySecretPassageTeleport(r, 'pM', 'p2', 'action_dream_transit')!;
    expect(r.players.p1!.currentLayer).toBe(0);
    expect(r.players.p2!.currentLayer).toBe(0);
    // 第 3 次失败
    const r3 = applySecretPassageTeleport(r, 'pM', 'p1', 'action_dream_transit');
    expect(r3).toBeNull();
  });

  it('梦主非密道 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setHand(s, 'pM', ['action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, 'pM', 'p1', 'action_dream_transit');
    expect(r).toBeNull();
  });

  it('手牌没穿梭剂 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    const r = applySecretPassageTeleport(s, 'pM', 'p1', 'action_dream_transit');
    expect(r).toBeNull();
  });

  it('目标非盗梦者 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setHand(s, 'pM', ['action_dream_transit' as CardID]);
    const r = applySecretPassageTeleport(s, 'pM', 'pM', 'action_dream_transit');
    expect(r).toBeNull();
  });

  it('move playSecretPassageTeleport：成功调用', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_secret_passage');
    s = setActionPhase(s);
    s = setHand(s, 'pM', ['action_dream_transit' as CardID]);
    const r = callMove(s, 'playSecretPassageTeleport', ['p1', 'action_dream_transit'], {
      currentPlayer: 'pM',
    });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(0);
  });
});

describe('天王星·苍穹（dm_uranus_firmament）·权力', () => {
  it('applyUranusPower：移动盗梦者到指定层', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [
      { id: 'b1', status: 'inPool' },
      { id: 'b2', status: 'inPool' },
    ]);
    const r = applyUranusPower(s, 'pM', 'p1', 3 as Layer);
    expect(r).not.toBeNull();
    expect(r!.players.p1!.currentLayer).toBe(3);
  });

  it('不能停留同层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    const r = applyUranusPower(s, 'pM', 'p1', 1 as Layer);
    expect(r).toBeNull();
  });

  it('不能送迷失层 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    const r = applyUranusPower(s, 'pM', 'p1', 0 as Layer);
    expect(r).toBeNull();
  });

  it('上限 = 未派发贿赂数', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    const r = applyUranusPower(s, 'pM', 'p1', 2 as Layer)!;
    // 只有 1 张未派发，第 2 次应失败
    const r2 = applyUranusPower(r, 'pM', 'p2', 3 as Layer);
    expect(r2).toBeNull();
  });

  it('未派发贿赂为 0 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'dealt' }]);
    const r = applyUranusPower(s, 'pM', 'p1', 2 as Layer);
    expect(r).toBeNull();
  });

  it('梦主非天王星 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    const r = applyUranusPower(s, 'pM', 'p1', 2 as Layer);
    expect(r).toBeNull();
  });

  it('move useUranusPower：成功调用', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setActionPhase(s);
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    const r = callMove(s, 'useUranusPower', ['p1', 4], { currentPlayer: 'pM' });
    expectMoveOk(r);
    expect(r.players.p1!.currentLayer).toBe(4);
  });
});

describe('冥王星·地狱（dm_pluto_hell）·业火', () => {
  it('applyPlutoBurning：弃 1 + 触发<2 手牌的盗梦者抽 2', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    s = setHand(s, 'p1', []); // 0 手牌 → 触发
    s = setHand(s, 'p2', ['action_unlock' as CardID, 'action_unlock' as CardID]); // 2 手牌 → 不触发
    s = {
      ...s,
      deck: {
        cards: ['action_shoot', 'action_shoot', 'action_unlock', 'action_unlock'] as CardID[],
        discardPile: [],
      },
    };
    const r = applyPlutoBurning(s, 'pM', 'action_kick');
    expect(r).not.toBeNull();
    expect(r!.players.pM!.hand.length).toBe(0);
    expect(r!.deck.discardPile).toContain('action_kick');
    expect(r!.players.p1!.hand.length).toBe(2);
    expect(r!.players.p2!.hand.length).toBe(2);
  });

  it('不限次数：仍有盗梦者手牌不足 2 张时可以再次发动（docs/manual/06-dream-master.md 冥王星·地狱 详述）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'pM', ['action_kick' as CardID, 'action_unlock' as CardID]);
    s = setHand(s, 'p1', []);
    s = {
      ...s,
      deck: {
        cards: ['action_shoot', 'action_shoot', 'action_unlock', 'action_unlock'] as CardID[],
        discardPile: [],
      },
    };
    const r = applyPlutoBurning(s, 'pM', 'action_kick')!;
    // p1 已抽到 2 张，没有盗梦者手牌不足 2 张：前置条件不满足，不能无故启动
    expect(applyPlutoBurning(r, 'pM', 'action_unlock')).toBeNull();
    // 有盗梦者手牌又不足 2 张时，同一回合第二次发动合法
    const refilled = {
      ...setHand(r, 'p1', []),
      deck: { cards: Array<CardID>(4).fill('action_kick' as CardID), discardPile: [] },
    };
    const again = applyPlutoBurning(refilled, 'pM', 'action_unlock');
    expect(again).not.toBeNull();
    expect(again!.players.p1!.hand.length).toBe(2);
  });

  it('手牌没目标 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'pM', ['action_unlock' as CardID]);
    const r = applyPlutoBurning(s, 'pM', 'action_kick');
    expect(r).toBeNull();
  });

  it('梦主非冥王星 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    const r = applyPlutoBurning(s, 'pM', 'action_kick');
    expect(r).toBeNull();
  });

  it('本回合已有使用记录也不影响再次发动', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    s = setHand(s, 'p1', []);
    s = markSkillUsed(s, 'pM', PLUTO_BURNING_SKILL_ID);
    const r = applyPlutoBurning(s, 'pM', 'action_kick');
    expect(r).not.toBeNull();
  });

  // 前置检查：无手牌<2 的盗梦者时拒绝发动（不浪费弃牌）
  // 对照：docs/manual/06-dream-master.md 冥王星·地狱 §30 "不产生效果的技能不能无故启动"
  it('无手牌<2 的盗梦者 → null（不消耗弃牌 / 不标 skillUsed）', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    // 所有盗梦者手牌 >= 2 → 不应允许发动
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_unlock' as CardID]);
    s = setHand(s, 'p2', ['action_unlock' as CardID, 'action_unlock' as CardID]);
    const r = applyPlutoBurning(s, 'pM', 'action_kick');
    expect(r).toBeNull();
    // 母 state 未被修改：弃牌堆不含 action_kick、master 手牌仍有 action_kick
    expect(s.deck.discardPile).not.toContain('action_kick');
    expect(s.players.pM!.hand).toContain('action_kick');
  });

  it('move usePlutoBurning：成功调用', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_pluto_hell');
    s = setActionPhase(s);
    s = setHand(s, 'pM', ['action_kick' as CardID]);
    s = setHand(s, 'p1', []);
    s = {
      ...s,
      deck: {
        cards: ['action_shoot', 'action_shoot'] as CardID[],
        discardPile: [],
      },
    };
    const r = callMove(s, 'usePlutoBurning', ['action_kick'], { currentPlayer: 'pM' });
    expectMoveOk(r);
    expect(r.players.p1!.hand.length).toBe(2);
  });
});
