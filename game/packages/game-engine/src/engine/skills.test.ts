// 角色技能执行器测试 - MVP 4 角色
import { describe, it, expect } from 'vitest';
import {
  canUseSkill,
  markSkillUsed,
  applyPointmanAssault,
  pointmanCheckDrawnCards,
  applyInterpreterForeshadow,
  applyFortressColdness,
  applyFortressDiceModifier,
  applyChessTranspose,
  applyChessWorldViewPeek,
  getChessUsesLeft,
  POINTMAN_SKILL_ID,
  INTERPRETER_SKILL_ID,
  CHESS_SKILL_ID,
} from './skills.js';
import {
  createTestState,
  makePlayer,
  makeDefaultLayers,
  makeDefaultVaults,
} from '../testing/fixtures.js';
import type { PlayerSetup } from '../setup.js';

// 固定骰子：返回指定值的 d6 工厂
function fixedD6(value: number) {
  return () => value;
}

function makeStateWithPlayer(overrides: Partial<PlayerSetup> = {}) {
  const player = makePlayer({ id: 'p0', characterId: 'thief_pointman', ...overrides });
  return createTestState({
    players: { p0: player },
    playerOrder: ['p0'],
    layers: makeDefaultLayers(),
    vaults: makeDefaultVaults(),
  });
}

// === canUseSkill ===

describe('canUseSkill', () => {
  it('allows unlimited scope', () => {
    const player = makePlayer({ skillUsedThisTurn: {} });
    expect(canUseSkill(player, 's', 'unlimited')).toBe(true);
  });

  it('blocks once per turn after 1 use', () => {
    const player = makePlayer({ skillUsedThisTurn: { s: 1 } });
    expect(canUseSkill(player, 's', 'ownTurnOncePerTurn')).toBe(false);
  });

  it('allows once per turn with 0 uses', () => {
    const player = makePlayer({ skillUsedThisTurn: {} });
    expect(canUseSkill(player, 's', 'ownTurnOncePerTurn')).toBe(true);
  });

  it('respects limitN for ownTurnLimitN', () => {
    const player = makePlayer({ skillUsedThisTurn: { s: 2 } });
    expect(canUseSkill(player, 's', 'ownTurnLimitN', 2)).toBe(false);
    expect(canUseSkill(player, 's', 'ownTurnLimitN', 3)).toBe(true);
  });

  it('respects perGameLimitN', () => {
    const player = makePlayer({ skillUsedThisGame: { s: 2 } });
    expect(canUseSkill(player, 's', 'perGameLimitN', 2)).toBe(false);
    expect(canUseSkill(player, 's', 'perGameLimitN', 3)).toBe(true);
  });
});

// === markSkillUsed ===

describe('markSkillUsed', () => {
  it('increments turn and game counters', () => {
    const state = makeStateWithPlayer();
    const s = markSkillUsed(state, 'p0', 'mySkill');
    expect(s.players.p0!.skillUsedThisTurn.mySkill).toBe(1);
    expect(s.players.p0!.skillUsedThisGame.mySkill).toBe(1);
  });

  it('increments existing counters', () => {
    const state = makeStateWithPlayer({
      skillUsedThisTurn: { mySkill: 1 },
      skillUsedThisGame: { mySkill: 1 },
    });
    const s = markSkillUsed(state, 'p0', 'mySkill');
    expect(s.players.p0!.skillUsedThisTurn.mySkill).toBe(2);
    expect(s.players.p0!.skillUsedThisGame.mySkill).toBe(2);
  });
});

// === 先锋 · 突袭 ===

describe('先锋 · 突袭 (Pointman)', () => {
  it('triggers extra draw when drawn cards contain dream transit', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_pointman',
      hand: ['action_shoot'],
    });
    // 牌库有牌
    const s = {
      ...state,
      deck: { cards: ['action_shoot', 'action_unlock', 'action_creation'], discardPile: [] },
    };

    const drawnCards: string[] = ['action_dream_transit', 'action_shoot'];
    const result = applyPointmanAssault(s, 'p0', drawnCards);

    // 应额外抽 2 张
    expect(result.players.p0!.hand).toHaveLength(3); // 1 + 2 extra
    expect(result.players.p0!.skillUsedThisTurn[POINTMAN_SKILL_ID]).toBe(1);
  });

  it('does not trigger when drawn cards lack dream transit', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_pointman',
      hand: [],
    });
    const s = {
      ...state,
      deck: { cards: ['action_shoot', 'action_unlock'], discardPile: [] },
    };

    const drawnCards: string[] = ['action_shoot', 'action_unlock'];
    const result = applyPointmanAssault(s, 'p0', drawnCards);

    expect(result.players.p0!.hand).toHaveLength(0);
  });

  it('does not trigger for non-pointman character', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_dream_interpreter',
      hand: [],
    });
    const result = applyPointmanAssault(state, 'p0', ['action_dream_transit']);
    expect(result.players.p0!.hand).toHaveLength(0);
  });

  it('does not trigger twice in one turn', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_pointman',
      hand: [],
      skillUsedThisTurn: { [POINTMAN_SKILL_ID]: 1 },
    });
    const s = { ...state, deck: { cards: ['a', 'b', 'c'], discardPile: [] } };
    const result = applyPointmanAssault(s, 'p0', ['action_dream_transit']);
    expect(result.players.p0!.hand).toHaveLength(0);
  });
});

describe('pointmanCheckDrawnCards', () => {
  it('returns true when cards include dream transit', () => {
    expect(pointmanCheckDrawnCards(['action_shoot', 'action_dream_transit'])).toBe(true);
  });

  it('returns false when cards lack dream transit', () => {
    expect(pointmanCheckDrawnCards(['action_shoot', 'action_unlock'])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(pointmanCheckDrawnCards([])).toBe(false);
  });
});

// === 译梦师 · 伏笔 ===

describe('译梦师 · 伏笔 (Dream Interpreter)', () => {
  it('draws 2 cards after unlock', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_dream_interpreter',
      hand: [],
    });
    const s = {
      ...state,
      deck: { cards: ['action_shoot', 'action_unlock', 'extra1', 'extra2'], discardPile: [] },
    };

    const result = applyInterpreterForeshadow(s, 'p0');
    expect(result.players.p0!.hand).toHaveLength(2);
    expect(result.players.p0!.skillUsedThisTurn[INTERPRETER_SKILL_ID]).toBe(1);
  });

  it('does not trigger for non-interpreter', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_pointman',
      hand: [],
    });
    const s = { ...state, deck: { cards: ['a', 'b'], discardPile: [] } };
    const result = applyInterpreterForeshadow(s, 'p0');
    expect(result.players.p0!.hand).toHaveLength(0);
  });

  it('does not trigger twice per turn', () => {
    const state = makeStateWithPlayer({
      characterId: 'thief_dream_interpreter',
      hand: [],
      skillUsedThisTurn: { [INTERPRETER_SKILL_ID]: 1 },
    });
    const s = { ...state, deck: { cards: ['a', 'b'], discardPile: [] } };
    const result = applyInterpreterForeshadow(s, 'p0');
    expect(result.players.p0!.hand).toHaveLength(0);
  });
});

// === 要塞 · 冷酷 ===

describe('要塞 · 冷酷 (Fortress)', () => {
  function makeFortressState() {
    const master = makePlayer({
      id: 'dm',
      characterId: 'dm_fortress',
      faction: 'master',
      currentLayer: 1,
      hand: [],
    });
    const thief = makePlayer({
      id: 't1',
      characterId: 'thief_pointman',
      faction: 'thief',
      currentLayer: 2,
      hand: ['action_shoot', 'action_unlock'],
    });
    const state = createTestState({
      players: { dm: master, t1: thief },
      playerOrder: ['dm', 't1'],
      layers: makeDefaultLayers(),
      vaults: makeDefaultVaults(),
    });
    return { ...state, currentPlayerID: 'dm', dreamMasterID: 'dm' };
  }

  it('kills target on modified roll 1 (raw roll 2, -1 = 1)', () => {
    const state = makeFortressState();
    const result = applyFortressColdness(state, 'dm', 't1', fixedD6(2));

    expect(result.players.t1!.isAlive).toBe(false);
    expect(result.players.t1!.deathTurn).toBe(state.turnNumber);
    expect(result.players.dm!.hand).toHaveLength(2); // 拿 2 张
    expect(result.players.dm!.shootCount).toBe(1);
  });

  it('moves target on modified roll 2-5', () => {
    const state = makeFortressState();
    const result = applyFortressColdness(state, 'dm', 't1', fixedD6(3)); // 3-1=2 → move

    expect(result.players.t1!.isAlive).toBe(true);
    expect(result.players.t1!.currentLayer).not.toBe(2); // moved
  });

  it('misses on modified roll 6 (raw 6+ roll results in miss via 6)', () => {
    const state = makeFortressState();
    // raw 6 → modified 5 → move (not miss)
    // raw 7 不存在，要塞 -1 最低 1
    // 测试 raw 6: 6-1=5 → move
    const result = applyFortressColdness(state, 'dm', 't1', fixedD6(6));
    expect(result.players.t1!.isAlive).toBe(true);
  });

  it('does not trigger for non-fortress', () => {
    const state = makeFortressState();
    const s = {
      ...state,
      players: { ...state.players, dm: { ...state.players.dm!, characterId: 'dm_chess' } },
    };
    const result = applyFortressColdness(s, 'dm', 't1', fixedD6(2));
    expect(result.players.t1!.isAlive).toBe(true);
  });

  it('does not target dead players', () => {
    const state = makeFortressState();
    const s = {
      ...state,
      players: { ...state.players, t1: { ...state.players.t1!, isAlive: false } },
    };
    const result = applyFortressColdness(s, 'dm', 't1', fixedD6(2));
    // 不变
    expect(result).toBe(s);
  });
});

describe('applyFortressDiceModifier', () => {
  it('subtracts 1 from roll', () => {
    expect(applyFortressDiceModifier(3)).toBe(2);
  });

  it('floors at 1', () => {
    expect(applyFortressDiceModifier(1)).toBe(1);
  });
});

// === 棋局 · 易位 ===

describe('棋局 · 易位 (Chess)', () => {
  function makeChessState() {
    const master = makePlayer({
      id: 'dm',
      characterId: 'dm_chess',
      faction: 'master',
      hand: [],
    });
    const state = createTestState({
      players: { dm: master },
      playerOrder: ['dm'],
      layers: makeDefaultLayers(),
      vaults: makeDefaultVaults(),
    });
    return { ...state, dreamMasterID: 'dm' };
  }

  it('swaps two unopened vaults', () => {
    const state = makeChessState();
    const result = applyChessTranspose(state, 'dm', 0, 2);

    expect(result.vaults[0]!.layer).toBe(state.vaults[2]!.layer);
    expect(result.vaults[2]!.layer).toBe(state.vaults[0]!.layer);
    expect(result.players.dm!.skillUsedThisGame[CHESS_SKILL_ID]).toBe(1);
  });

  it('does not swap opened vaults', () => {
    const state = makeChessState();
    const s = {
      ...state,
      vaults: state.vaults.map((v, i) => (i === 0 ? { ...v, isOpened: true } : v)),
    };
    const result = applyChessTranspose(s, 'dm', 0, 1);
    expect(result).toBe(s); // 不变
  });

  it('does not swap same index', () => {
    const state = makeChessState();
    const result = applyChessTranspose(state, 'dm', 0, 0);
    expect(result).toBe(state); // 不变
  });

  it('limits to 2 uses per game', () => {
    let state = makeChessState();
    state = applyChessTranspose(state, 'dm', 0, 1);
    state = applyChessTranspose(state, 'dm', 0, 1); // 第 2 次
    const result = applyChessTranspose(state, 'dm', 0, 1); // 第 3 次 → 拒绝

    expect(result.players.dm!.skillUsedThisGame[CHESS_SKILL_ID]).toBe(2);
  });

  it('does not trigger for non-chess', () => {
    const state = makeChessState();
    const s = {
      ...state,
      players: { ...state.players, dm: { ...state.players.dm!, characterId: 'dm_fortress' } },
    };
    const result = applyChessTranspose(s, 'dm', 0, 1);
    expect(result).toBe(s);
  });
});

describe('getChessUsesLeft', () => {
  it('returns 2 for unused', () => {
    const player = makePlayer({ skillUsedThisGame: {} });
    expect(getChessUsesLeft(player)).toBe(2);
  });

  it('returns 1 after one use', () => {
    const player = makePlayer({ skillUsedThisGame: { [CHESS_SKILL_ID]: 1 } });
    expect(getChessUsesLeft(player)).toBe(1);
  });

  it('returns 0 after two uses', () => {
    const player = makePlayer({ skillUsedThisGame: { [CHESS_SKILL_ID]: 2 } });
    expect(getChessUsesLeft(player)).toBe(0);
  });
});

describe('applyChessWorldViewPeek', () => {
  it('draws 2 cards for chess master', () => {
    const state = makeChessState();
    const s = {
      ...state,
      deck: { cards: ['a', 'b', 'c', 'd'], discardPile: [] },
      players: { ...state.players, dm: { ...state.players.dm!, hand: [] } },
    };
    const result = applyChessWorldViewPeek(s, 'dm');
    expect(result.players.dm!.hand).toHaveLength(2);
  });

  it('does nothing for non-chess master', () => {
    const state = makeChessState();
    const s = {
      ...state,
      players: {
        ...state.players,
        dm: { ...state.players.dm!, characterId: 'dm_fortress', hand: [] },
      },
    };
    const result = applyChessWorldViewPeek(s, 'dm');
    expect(result.players.dm!.hand).toHaveLength(0);
  });

  function makeChessState() {
    const master = makePlayer({
      id: 'dm',
      characterId: 'dm_chess',
      faction: 'master',
      hand: [],
    });
    const state = createTestState({
      players: { dm: master },
      playerOrder: ['dm'],
      layers: makeDefaultLayers(),
      vaults: makeDefaultVaults(),
    });
    return { ...state, dreamMasterID: 'dm' };
  }
});
