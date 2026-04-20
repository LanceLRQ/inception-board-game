// W16-D 梦主世界观补充：天王星·苍穹（行动牌移动弃牌 hook）+ 火星·战场（弃 2 非SHOOT 换 SHOOT）
// 对照：plans/tasks.md Phase 3 W16

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  isUranusFirmamentWorldActive,
  applyUranusFirmamentMoveDiscard,
  isMarsBattlefieldWorldActive,
  applyMarsBattlefieldExchange,
  findMasterID,
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

function setBribePool(
  state: SetupState,
  pool: { id: string; status: 'inPool' | 'dealt' | 'deal' | 'shattered' }[],
): SetupState {
  return {
    ...state,
    bribePool: pool.map((b) => ({
      id: b.id,
      status: b.status,
      heldBy: null,
      originalOwnerId: null,
    })),
  };
}

function withDeck(state: SetupState, cards: CardID[]): SetupState {
  return { ...state, deck: { cards, discardPile: [] } };
}

describe('W16-D · 天王星·苍穹世界观（行动牌移动弃牌）', () => {
  it('isUranusFirmamentWorldActive', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    expect(isUranusFirmamentWorldActive(s)).toBe(true);
  });

  it('applyUranusFirmamentMoveDiscard：贿赂池有剩余 → 弃 1 张', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    s = withDeck(s, ['action_unlock', 'action_kick'] as CardID[]);
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r.deck.cards.length).toBe(1);
    expect(r.deck.discardPile.length).toBe(1);
  });

  it('applyUranusFirmamentMoveDiscard：贿赂全派完 → 弃 2 张', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'dealt' }]);
    s = withDeck(s, ['action_unlock', 'action_kick', 'action_shoot'] as CardID[]);
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r.deck.cards.length).toBe(1);
    expect(r.deck.discardPile.length).toBe(2);
  });

  it('applyUranusFirmamentMoveDiscard：非天王星梦主 → 不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = withDeck(s, ['action_unlock'] as CardID[]);
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r).toBe(s);
  });

  it('applyUranusFirmamentMoveDiscard：梦主自己不触发', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    s = withDeck(s, ['action_unlock'] as CardID[]);
    const r = applyUranusFirmamentMoveDiscard(s, 'pM');
    expect(r).toBe(s);
  });

  it('applyUranusFirmamentMoveDiscard：牌库空 → 不弃', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
    s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
    s = withDeck(s, []);
    const r = applyUranusFirmamentMoveDiscard(s, 'p1');
    expect(r).toBe(s);
  });

  describe('集成：playDreamTransit 触发弃牌', () => {
    it('盗梦者用穿梭剂移动 → 牌库顶 -1', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
      s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
      s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
      s = setHand(s, 'p1', ['action_dream_transit' as CardID]);
      s = withDeck(s, ['action_unlock', 'action_unlock', 'action_unlock'] as CardID[]);
      const r = callMove(s, 'playDreamTransit', ['action_dream_transit', 2], {
        currentPlayer: 'p1',
      });
      expectMoveOk(r);
      expect(r.players.p1!.currentLayer).toBe(2);
      // 弃 1（贿赂池仍有 1）
      expect(r.deck.cards.length).toBe(2);
    });
  });

  describe('集成：playKick 跨层交换 → 双方各触发一次', () => {
    it('p1(L1) 与 p2(L2) KICK → 弃 2 张', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
      s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
      s = setLayer(s, 'p2', 2 as Layer);
      s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
      s = setHand(s, 'p1', ['action_kick' as CardID]);
      s = withDeck(s, ['action_unlock', 'action_unlock', 'action_unlock'] as CardID[]);
      const r = callMove(s, 'playKick', ['action_kick', 'p2'], { currentPlayer: 'p1' });
      expectMoveOk(r);
      expect(r.players.p1!.currentLayer).toBe(2);
      expect(r.players.p2!.currentLayer).toBe(1);
      // 双触发：弃 2
      expect(r.deck.cards.length).toBe(1);
    });

    it('p1 与 p2 同层 KICK → 不触发', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
      s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
      s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
      s = setHand(s, 'p1', ['action_kick' as CardID]);
      s = withDeck(s, ['action_unlock', 'action_unlock'] as CardID[]);
      const r = callMove(s, 'playKick', ['action_kick', 'p2'], { currentPlayer: 'p1' });
      expectMoveOk(r);
      // 同层不触发
      expect(r.deck.cards.length).toBe(2);
    });
  });

  describe('集成：playTelekinesis 拉过来 → target 触发', () => {
    it('p2(L2) 被拉到 L1 → 弃 1', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
      s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
      s = setLayer(s, 'p2', 2 as Layer);
      s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
      s = setHand(s, 'p1', ['action_telekinesis' as CardID]);
      s = withDeck(s, ['action_unlock', 'action_unlock'] as CardID[]);
      const r = callMove(s, 'playTelekinesis', ['action_telekinesis', 'p2'], {
        currentPlayer: 'p1',
      });
      expectMoveOk(r);
      expect(r.players.p2!.currentLayer).toBe(1);
      expect(r.deck.cards.length).toBe(1);
    });

    it('target 已在同层 → 不触发', () => {
      let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_uranus_firmament');
      s = setBribePool(s, [{ id: 'b1', status: 'inPool' }]);
      s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
      s = setHand(s, 'p1', ['action_telekinesis' as CardID]);
      s = withDeck(s, ['action_unlock', 'action_unlock'] as CardID[]);
      const r = callMove(s, 'playTelekinesis', ['action_telekinesis', 'p2'], {
        currentPlayer: 'p1',
      });
      expectMoveOk(r);
      expect(r.deck.cards.length).toBe(2);
    });
  });
});

describe('W16-D · 火星·战场世界观（弃 2 非SHOOT 换 SHOOT）', () => {
  it('isMarsBattlefieldWorldActive', () => {
    const s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    expect(isMarsBattlefieldWorldActive(s)).toBe(true);
  });

  it('applyMarsBattlefieldExchange：弃 2 非 SHOOT 换 SHOOT 入手', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot', 'action_unlock'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_kick'],
      'action_shoot',
    );
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toContain('action_shoot');
    expect(r!.players.p1!.hand.length).toBe(1);
    expect(r!.deck.discardPile).not.toContain('action_shoot');
    expect(r!.deck.discardPile).toContain('action_unlock');
    expect(r!.deck.discardPile).toContain('action_kick');
  });

  it('弃牌含 SHOOT 类 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_shoot' as CardID, 'action_kick' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot_king'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_shoot', 'action_kick'],
      'action_shoot_king',
    );
    expect(r).toBeNull();
  });

  it('目标牌非 SHOOT 类 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_graft'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_kick'],
      'action_graft',
    );
    expect(r).toBeNull();
  });

  it('目标 SHOOT 不在弃牌堆 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    s = { ...s, deck: { cards: [], discardPile: [] } };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_kick'],
      'action_shoot',
    );
    expect(r).toBeNull();
  });

  it('手牌不含弃牌之一 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_kick'],
      'action_shoot',
    );
    expect(r).toBeNull();
  });

  it('梦主非火星 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_fortress');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_kick'],
      'action_shoot',
    );
    expect(r).toBeNull();
  });

  it('同名两张：手牌须有 2 张', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_unlock' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_unlock'],
      'action_shoot',
    );
    expect(r).not.toBeNull();
    expect(r!.players.p1!.hand).toEqual(['action_shoot']);
  });

  it('同名两张但手牌只有 1 张 → null', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = setHand(s, 'p1', ['action_unlock' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot'] as CardID[] },
    };
    const r = applyMarsBattlefieldExchange(
      s,
      'p1',
      ['action_unlock', 'action_unlock'],
      'action_shoot',
    );
    expect(r).toBeNull();
  });

  it('move useMarsBattlefield：成功调用', () => {
    let s = setMasterCharacter(scenarioStartOfGame3p(), 'dm_mars_battlefield');
    s = { ...s, turnPhase: 'action', currentPlayerID: 'p1' };
    s = setHand(s, 'p1', ['action_unlock' as CardID, 'action_kick' as CardID]);
    s = {
      ...s,
      deck: { cards: [], discardPile: ['action_shoot'] as CardID[] },
    };
    const r = callMove(s, 'useMarsBattlefield', ['action_unlock', 'action_kick', 'action_shoot'], {
      currentPlayer: 'p1',
    });
    expectMoveOk(r);
    expect(r.players.p1!.hand).toContain('action_shoot');
  });
});
