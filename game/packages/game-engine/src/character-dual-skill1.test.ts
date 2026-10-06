// 双面角色 skill_1 单测：双子·抉择 / 双鱼·洗礼 / 露娜·满月
// 对照：docs/manual/05-dream-thieves.md 双子(83)/双鱼(55)/露娜(21)

import { describe, expect, it } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import type { SetupState } from './setup.js';
import {
  applyGeminiChoice,
  applyLunaFullMoon,
  applyPiscesBlessing,
  GEMINI_CHOICE_SKILL_ID,
  LUNA_FULL_MOON_SKILL_ID,
  PISCES_BLESSING_SKILL_ID,
} from './engine/skills.js';
import { callMove, cloneState, expectMoveOk } from './testing/fixtures.js';
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

function killTo(state: SetupState, playerID: string): SetupState {
  const p = state.players[playerID];
  if (!p) return state;
  const fromL = state.layers[p.currentLayer];
  return {
    ...state,
    players: {
      ...state.players,
      [playerID]: { ...p, isAlive: false, currentLayer: 0 as Layer, deathTurn: 1 },
    },
    layers: fromL
      ? {
          ...state.layers,
          [p.currentLayer]: {
            ...fromL,
            playersInLayer: fromL.playersInLayer.filter((id) => id !== playerID),
          },
        }
      : state.layers,
  };
}

function withDeck(state: SetupState, cards: CardID[]): SetupState {
  return { ...state, deck: { cards, discardPile: state.deck.discardPile } };
}

// =============================================================================
// 双子 · 抉择（skill_1）
// =============================================================================

describe('双子 · 抉择（skill_1）', () => {
  it('梦主在更小层时，掷 2 骰抽总和 → 翻面', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setLayer(s, 'pM', 1 as Layer);
    s = withDeck(s, [
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
      'action_unlock',
    ] as CardID[]);
    const before = s.players.p1!.hand.length;
    const res = applyGeminiChoice(s, 'p1', 2, 3); // 共 5 张
    expect(res).not.toBeNull();
    expect(res!.players.p1!.hand.length - before).toBe(5);
    // 翻面
    expect(res!.players.p1!.characterId).toBe('thief_gemini_back');
    // 计数
    expect(res!.players.p1!.skillUsedThisTurn[GEMINI_CHOICE_SKILL_ID]).toBe(1);
  });

  it('梦主同层/更大层时 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini');
    // 默认 p1 与 pM 都在 L1
    const res1 = applyGeminiChoice(s, 'p1', 3, 3);
    expect(res1).toBeNull();

    s = setLayer(s, 'pM', 4 as Layer);
    const res2 = applyGeminiChoice(s, 'p1', 3, 3);
    expect(res2).toBeNull();
  });

  it('翻面后再次调用 → 拒绝（characterId 已变）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setLayer(s, 'pM', 1 as Layer);
    s = withDeck(s, new Array(15).fill('action_unlock') as CardID[]);
    const r1 = applyGeminiChoice(s, 'p1', 2, 2);
    expect(r1).not.toBeNull();
    const r2 = applyGeminiChoice(r1!, 'p1', 2, 2);
    expect(r2).toBeNull();
  });

  it('骰值越界 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setLayer(s, 'pM', 1 as Layer);
    expect(applyGeminiChoice(s, 'p1', 0, 3)).toBeNull();
    expect(applyGeminiChoice(s, 'p1', 3, 7)).toBeNull();
  });

  it('牌库不足时按现有 drawCards 语义抽完即止（不应崩溃）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_gemini');
    s = setLayer(s, 'p1', 3 as Layer);
    s = setLayer(s, 'pM', 1 as Layer);
    s = withDeck(s, ['action_unlock'] as CardID[]);
    const res = applyGeminiChoice(s, 'p1', 6, 6); // 请求 12 张，只有 1 张
    expect(res).not.toBeNull();
    expect(res!.players.p1!.characterId).toBe('thief_gemini_back');
  });

  describe('move 接入：playGeminiChoice', () => {
    function setupGemini(): SetupState {
      let s = scenarioActionPhase();
      s = setCharacter(s, 'p1', 'thief_gemini');
      s = setLayer(s, 'p1', 3 as Layer);
      s = setLayer(s, 'pM', 1 as Layer);
      return withDeck(s, new Array(20).fill('action_unlock') as CardID[]);
    }

    it('行动阶段满足条件时被接受：按两骰之和抽牌、牌库减少、角色翻面', () => {
      const s = setupGemini();
      const r = callMove(s, 'playGeminiChoice', [], { rolls: [2, 3] });
      expectMoveOk(r);
      expect(r.players.p1!.hand).toEqual(new Array(5).fill('action_unlock'));
      expect(r.deck.cards).toHaveLength(15);
      expect(r.players.p1!.characterId).toBe('thief_gemini_back');
      expect(r.players.p1!.skillUsedThisTurn[GEMINI_CHOICE_SKILL_ID]).toBe(1);
    });

    it('抽牌数取决于两次掷骰结果', () => {
      const s = setupGemini();
      const r = callMove(s, 'playGeminiChoice', [], { rolls: [6, 4] });
      expectMoveOk(r);
      expect(r.players.p1!.hand).toHaveLength(10);
      expect(r.deck.cards).toHaveLength(10);
    });

    it('不在行动阶段时被拒且状态不变', () => {
      for (const turnPhase of ['draw', 'discard'] as const) {
        const s = { ...setupGemini(), turnPhase };
        const before = cloneState(s);
        expect(callMove(s, 'playGeminiChoice', [], { rolls: [2, 3] })).toBe('INVALID_MOVE');
        expect(s).toEqual(before);
      }
    });

    it('非当前回合玩家调用时被拒', () => {
      const s = setupGemini();
      expect(callMove(s, 'playGeminiChoice', [], { rolls: [2, 3], currentPlayer: 'p2' })).toBe(
        'INVALID_MOVE',
      );
    });

    it('梦主与双子同层时被拒且状态不变', () => {
      const s = setLayer(setupGemini(), 'pM', 3 as Layer);
      const before = cloneState(s);
      expect(callMove(s, 'playGeminiChoice', [], { rolls: [2, 3] })).toBe('INVALID_MOVE');
      expect(s).toEqual(before);
    });

    it('角色不是双子时被拒', () => {
      const s = setCharacter(setupGemini(), 'p1', 'thief_pointman');
      expect(callMove(s, 'playGeminiChoice', [], { rolls: [2, 3] })).toBe('INVALID_MOVE');
    });
  });
});

// =============================================================================
// 双鱼 · 洗礼（skill_1）
// =============================================================================

describe('双鱼 · 洗礼（skill_1）', () => {
  it('L2 + 复活 1 人 + 翻面：玩家与被复活者都到 L3', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 2 as Layer);
    s = killTo(s, 'p2');
    const res = applyPiscesBlessing(s, 'p1', 'p2');
    expect(res).not.toBeNull();
    expect(res!.players.p1!.currentLayer).toBe(3);
    expect(res!.players.p2!.isAlive).toBe(true);
    expect(res!.players.p2!.currentLayer).toBe(3);
    expect(res!.players.p1!.characterId).toBe('thief_pisces_back');
  });

  it('可选：仅 +1 层不复活 + 翻面', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 1 as Layer);
    const res = applyPiscesBlessing(s, 'p1', null);
    expect(res).not.toBeNull();
    expect(res!.players.p1!.currentLayer).toBe(2);
    expect(res!.players.p1!.characterId).toBe('thief_pisces_back');
  });

  it('第 4 层 → 拒绝（无相邻更大层）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 4 as Layer);
    expect(applyPiscesBlessing(s, 'p1', null)).toBeNull();
  });

  it('迷失层 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = killTo(s, 'p1');
    expect(applyPiscesBlessing(s, 'p1', null)).toBeNull();
  });

  it('翻面后再次调用 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_pisces');
    s = setLayer(s, 'p1', 2 as Layer);
    const r1 = applyPiscesBlessing(s, 'p1', null);
    expect(r1).not.toBeNull();
    const r2 = applyPiscesBlessing(r1!, 'p1', null);
    expect(r2).toBeNull();
  });
});

// =============================================================================
// 露娜 · 满月（skill_1）
// =============================================================================

describe('露娜 · 满月（skill_1）', () => {
  it('弃 2 非 SHOOT + 复活 1 人 + 翻面', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[]);
    s = killTo(s, 'p2');
    const res = applyLunaFullMoon(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[], [
      'p2',
    ]);
    expect(res).not.toBeNull();
    expect(res!.players.p1!.hand).toEqual([]);
    expect(res!.players.p2!.isAlive).toBe(true);
    expect(res!.players.p2!.currentLayer).toBe(res!.players.p1!.currentLayer);
    expect(res!.players.p1!.characterId).toBe('thief_luna_back');
    expect(res!.deck.discardPile).toContain('action_unlock');
    expect(res!.deck.discardPile).toContain('action_dream_view');
  });

  it('复活 0 人只翻面（manual 明允）', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[]);
    const res = applyLunaFullMoon(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[], []);
    expect(res).not.toBeNull();
    expect(res!.players.p1!.characterId).toBe('thief_luna_back');
    expect(res!.players.p1!.hand).toEqual([]);
  });

  it('弃牌含 SHOOT → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_unlock', 'action_shoot'] as CardID[]);
    const res = applyLunaFullMoon(s, 'p1', ['action_unlock', 'action_shoot'] as CardID[], []);
    expect(res).toBeNull();
  });

  it('弃牌数 != 2 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_unlock'] as CardID[]);
    const res = applyLunaFullMoon(s, 'p1', ['action_unlock'] as CardID[], []);
    expect(res).toBeNull();
  });

  it('翻面后再次调用 → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', [
      'action_unlock',
      'action_dream_view',
      'action_unlock',
      'action_dream_view',
    ] as CardID[]);
    const r1 = applyLunaFullMoon(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[], []);
    expect(r1).not.toBeNull();
    expect(r1!.players.p1!.skillUsedThisTurn[LUNA_FULL_MOON_SKILL_ID]).toBe(1);
    const r2 = applyLunaFullMoon(r1!, 'p1', ['action_unlock', 'action_dream_view'] as CardID[], []);
    expect(r2).toBeNull();
  });

  it('将已活着的目标作为 reviveID → 拒绝', () => {
    let s = scenarioActionPhase();
    s = setCharacter(s, 'p1', 'thief_luna');
    s = setHand(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[]);
    const res = applyLunaFullMoon(s, 'p1', ['action_unlock', 'action_dream_view'] as CardID[], [
      'p2',
    ]);
    expect(res).toBeNull();
  });

  it('PISCES_BLESSING_SKILL_ID 常量语法稳定（防常量改名）', () => {
    expect(PISCES_BLESSING_SKILL_ID).toBe('thief_pisces.skill_1');
  });

  describe('move 接入：playLunaFullMoon', () => {
    const discard = ['action_unlock', 'action_dream_view'] as CardID[];

    function setupLuna(): SetupState {
      let s = scenarioActionPhase();
      s = setCharacter(s, 'p1', 'thief_luna');
      s = setLayer(s, 'p1', 2 as Layer);
      s = setHand(s, 'p1', [...discard, 'action_kick'] as CardID[]);
      return killTo(s, 'p2');
    }

    it('行动阶段满足条件时被接受：弃指定两张牌、复活到当前层、角色翻面、计数递增', () => {
      const s = setupLuna();
      const r = callMove(s, 'playLunaFullMoon', [discard, ['p2']]);
      expectMoveOk(r);
      expect(r.players.p1!.hand).toEqual(['action_kick']);
      expect(r.deck.discardPile).toEqual(discard);
      expect(r.players.p2!.isAlive).toBe(true);
      expect(r.players.p2!.deathTurn).toBeNull();
      expect(r.players.p2!.currentLayer).toBe(2);
      expect(r.layers[2]!.playersInLayer).toContain('p2');
      expect(r.players.p1!.characterId).toBe('thief_luna_back');
      expect(r.players.p1!.skillUsedThisTurn[LUNA_FULL_MOON_SKILL_ID]).toBe(1);
      expect(r.moveCounter).toBe(s.moveCounter + 1);
    });

    it('复活名单为空时只弃牌并翻面', () => {
      const s = setupLuna();
      const r = callMove(s, 'playLunaFullMoon', [discard, []]);
      expectMoveOk(r);
      expect(r.players.p1!.hand).toEqual(['action_kick']);
      expect(r.players.p2!.isAlive).toBe(false);
      expect(r.players.p1!.characterId).toBe('thief_luna_back');
    });

    it('不在行动阶段时被拒且状态不变', () => {
      for (const turnPhase of ['draw', 'discard'] as const) {
        const s = { ...setupLuna(), turnPhase };
        const before = cloneState(s);
        expect(callMove(s, 'playLunaFullMoon', [discard, ['p2']])).toBe('INVALID_MOVE');
        expect(s).toEqual(before);
      }
    });

    it('非当前回合玩家调用时被拒', () => {
      const s = setupLuna();
      expect(callMove(s, 'playLunaFullMoon', [discard, ['p2']], { currentPlayer: 'p2' })).toBe(
        'INVALID_MOVE',
      );
    });

    it('角色不是露娜时被拒且状态不变', () => {
      const s = setCharacter(setupLuna(), 'p1', 'thief_pointman');
      const before = cloneState(s);
      expect(callMove(s, 'playLunaFullMoon', [discard, ['p2']])).toBe('INVALID_MOVE');
      expect(s).toEqual(before);
    });

    it('弃牌含 SHOOT 时被拒', () => {
      let s = setupLuna();
      s = setHand(s, 'p1', ['action_unlock', 'action_shoot'] as CardID[]);
      expect(
        callMove(s, 'playLunaFullMoon', [['action_unlock', 'action_shoot'] as CardID[], ['p2']]),
      ).toBe('INVALID_MOVE');
    });

    it('弃牌参数不是数组时被拒', () => {
      const s = setupLuna();
      expect(callMove(s, 'playLunaFullMoon', ['action_unlock', ['p2']])).toBe('INVALID_MOVE');
    });

    it('复活参数不是数组时被拒', () => {
      const s = setupLuna();
      expect(callMove(s, 'playLunaFullMoon', [discard, 'p2'])).toBe('INVALID_MOVE');
    });
  });
});
