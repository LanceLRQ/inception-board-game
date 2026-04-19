// 梦魇系统骨架 + 饥饿撕咬单测
// 对照：docs/manual/07-nightmare-cards.md

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import { createInitialState } from './setup.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, hand: string[], layer = 1, faction: 'thief' | 'master' = 'thief') {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: 0,
    type: 'human' as const,
    faction,
    characterId: '' as CardID,
    isRevealed: false,
    currentLayer: layer,
    hand: hand as CardID[],
    isAlive: true,
    deathTurn: null,
    unlockCount: 0,
    shootCount: 0,
    bribeReceived: 0,
    skillUsedThisTurn: {},
    skillUsedThisGame: {},
    successfulUnlocksThisTurn: 0,
  };
}

function makeLayer(l: number, nightmareId: string | null, players: string[] = []) {
  return {
    layer: l,
    dreamCardId: null,
    nightmareId: nightmareId as CardID | null,
    nightmareRevealed: false,
    nightmareTriggered: false,
    playersInLayer: players,
    heartLockValue: 3,
  };
}

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 't',
    schemaVersion: 1,
    rngSeed: 't',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    players: {
      '0': makePlayer('0', ['a', 'b', 'c', 'd'], 1),
      '1': makePlayer('1', ['x', 'y'], 1),
      '2': makePlayer('2', ['dm1'], 1, 'master'),
    } as SetupState['players'],
    playerOrder: ['0', '1', '2'],
    currentPlayerID: '2',
    dreamMasterID: '2',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers: {
      0: makeLayer(0, null, []),
      1: makeLayer(1, 'nightmare_hunger_bite', ['0', '1', '2']),
      2: makeLayer(2, 'nightmare_space_fall', []),
      3: makeLayer(3, null, []),
      4: makeLayer(4, null, []),
    } as SetupState['layers'],
    vaults: [],
    bribePool: [],
    deck: { cards: [] as CardID[], discardPile: [] as CardID[] },
    unlockThisTurn: 0,
    maxUnlockPerTurn: 1,
    usedNightmareIds: [],
    moveCounter: 0,
    activeWorldViews: [],
    pendingUnlock: null,
    pendingGraft: null,
    pendingResonance: null,
    pendingGravity: null,
    shiftSnapshot: null,
    winner: null,
    winReason: null,
    endTurn: null,
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moves = (InceptionCityGame as any).phases.playing.moves;

function call(name: string, G: SetupState, ...args: unknown[]) {
  return callWith(name, G, { D6: () => 1, Die: () => 1, Shuffle: <T>(a: T[]) => a }, ...args);
}

function callWith(
  name: string,
  G: SetupState,
  random: Record<string, unknown>,
  ...args: unknown[]
) {
  return moves[name].move(
    {
      G,
      ctx: {
        numPlayers: 3,
        currentPlayer: G.currentPlayerID,
        playOrder: G.playerOrder,
        playOrderPos: 0,
      },
      playerID: G.currentPlayerID,
      random,
      events: {},
    },
    ...args,
  );
}

describe('setup 梦魇派发', () => {
  it('每层（1-4）均有 1 张梦魇', () => {
    const s = createInitialState({
      playerCount: 5,
      playerIds: ['0', '1', '2', '3', '4'],
      nicknames: ['a', 'b', 'c', 'd', 'e'],
      rngSeed: 'test-seed',
    });
    for (let l = 1; l <= 4; l++) {
      expect(s.layers[l]!.nightmareId).not.toBeNull();
      expect(s.layers[l]!.nightmareRevealed).toBe(false);
    }
  });

  it('相同 seed 得到相同派发', () => {
    const a = createInitialState({
      playerCount: 5,
      playerIds: ['0', '1', '2', '3', '4'],
      nicknames: ['a', 'b', 'c', 'd', 'e'],
      rngSeed: 'seed-1',
    });
    const b = createInitialState({
      playerCount: 5,
      playerIds: ['0', '1', '2', '3', '4'],
      nicknames: ['a', 'b', 'c', 'd', 'e'],
      rngSeed: 'seed-1',
    });
    expect(a.layers[1]!.nightmareId).toBe(b.layers[1]!.nightmareId);
    expect(a.layers[4]!.nightmareId).toBe(b.layers[4]!.nightmareId);
  });
});

describe('masterRevealNightmare', () => {
  it('梦主翻开 L1 梦魇 → revealed=true', () => {
    const r = call('masterRevealNightmare', makeState(), 1);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.layers[1]!.nightmareRevealed).toBe(true);
  });

  it('非梦主调用 → 拒绝', () => {
    const s = makeState({ currentPlayerID: '0' });
    expect(call('masterRevealNightmare', s, 1)).toBe('INVALID_MOVE');
  });

  it('该层无梦魇 → 拒绝', () => {
    expect(call('masterRevealNightmare', makeState(), 3)).toBe('INVALID_MOVE');
  });

  it('已翻开 → 拒绝', () => {
    const s = makeState();
    s.layers[1]!.nightmareRevealed = true;
    expect(call('masterRevealNightmare', s, 1)).toBe('INVALID_MOVE');
  });
});

describe('masterDiscardNightmare', () => {
  it('弃已翻开的梦魇：nightmareId 清空 + triggered=true + usedNightmareIds 追加', () => {
    const s = makeState();
    s.layers[1]!.nightmareRevealed = true;
    const r = call('masterDiscardNightmare', s, 1);
    expect(r.layers[1]!.nightmareId).toBeNull();
    expect(r.layers[1]!.nightmareTriggered).toBe(true);
    expect(r.usedNightmareIds).toContain('nightmare_hunger_bite');
  });

  it('未翻开 → 拒绝', () => {
    expect(call('masterDiscardNightmare', makeState(), 1)).toBe('INVALID_MOVE');
  });
});

describe('masterActivateNightmare · 饥饿撕咬', () => {
  it('该层手牌>=3 的玩家弃 3 张；<3 的入迷失层', () => {
    const s = makeState();
    s.layers[1]!.nightmareRevealed = true;
    // 0: 4 张（>=3，弃 3） / 1: 2 张（<3，入迷失层） / 2 梦主: 1 张（<3，入迷失）
    const r = call('masterActivateNightmare', s, 1);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['0']!.hand).toEqual(['d']);
    expect(r.players['1']!.currentLayer).toBe(0);
    expect(r.players['1']!.hand).toEqual(['x', 'y']); // 保留手牌
    expect(r.players['2']!.currentLayer).toBe(0);
    expect(r.deck.discardPile).toEqual(['a', 'b', 'c']);
    // 梦魇清除
    expect(r.layers[1]!.nightmareId).toBeNull();
    expect(r.layers[1]!.nightmareTriggered).toBe(true);
    expect(r.usedNightmareIds).toContain('nightmare_hunger_bite');
  });

  it('未实现的梦魇 → 拒绝', () => {
    const s = makeState();
    s.layers[3]!.nightmareId = 'nightmare_echo' as CardID; // echo 尚未实现
    s.layers[3]!.nightmareRevealed = true;
    expect(call('masterActivateNightmare', s, 3)).toBe('INVALID_MOVE');
  });

  it('未翻开 → 拒绝', () => {
    expect(call('masterActivateNightmare', makeState(), 1)).toBe('INVALID_MOVE');
  });
});

describe('masterActivateNightmare · 绝望风暴', () => {
  it('从牌库顶弃 10 张（无其他已开金库时）', () => {
    const s = makeState({
      deck: {
        cards: Array.from({ length: 15 }, (_, i) => `c${i}` as CardID),
        discardPile: [] as CardID[],
      },
      layers: {
        ...makeState().layers,
        1: { ...makeState().layers[1]!, nightmareId: 'nightmare_despair_storm' as CardID },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    const r = call('masterActivateNightmare', s, 1);
    expect(r.deck.cards).toHaveLength(5);
    expect(r.deck.discardPile).toHaveLength(10);
    expect(r.deck.discardPile[0]).toBe('c0');
  });

  it('+5 × 其他已开金库（同层金库不计）', () => {
    const s = makeState({
      deck: {
        cards: Array.from({ length: 30 }, (_, i) => `c${i}` as CardID),
        discardPile: [] as CardID[],
      },
      vaults: [
        { id: 'v1', layer: 2, contentType: 'coin', isOpened: true, openedBy: '0' },
        { id: 'v2', layer: 3, contentType: 'coin', isOpened: true, openedBy: '0' },
        { id: 'v3', layer: 1, contentType: 'coin', isOpened: true, openedBy: '0' }, // 同层不计
        { id: 'v4', layer: 4, contentType: 'secret', isOpened: false, openedBy: null },
      ],
      layers: {
        ...makeState().layers,
        1: { ...makeState().layers[1]!, nightmareId: 'nightmare_despair_storm' as CardID },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    const r = call('masterActivateNightmare', s, 1);
    // 10 + 5*2 = 20 张
    expect(r.deck.discardPile).toHaveLength(20);
    expect(r.deck.cards).toHaveLength(10);
  });
});

describe('masterActivateNightmare · 深空坠落', () => {
  it('同层盗梦者：骰 5/6/layer → 迷失层；否则移到骰子对应层', () => {
    const s = makeState({
      layers: {
        ...makeState().layers,
        1: {
          ...makeState().layers[1]!,
          nightmareId: 'nightmare_space_fall' as CardID,
          playersInLayer: ['0', '1'],
        },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    // 玩家 0 骰 3 → 移到层 3；玩家 1 骰 2 → 移到层 2
    let cnt = 0;
    const rolls = [3, 2];
    const r = callWith(
      'masterActivateNightmare',
      s,
      { D6: () => rolls[cnt++]!, Die: () => 1, Shuffle: <T>(a: T[]) => a },
      1,
    );
    expect(r.players['0']!.currentLayer).toBe(3);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('骰 5 → 迷失层', () => {
    const s = makeState({
      layers: {
        ...makeState().layers,
        1: {
          ...makeState().layers[1]!,
          nightmareId: 'nightmare_space_fall' as CardID,
          playersInLayer: ['0'],
        },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    const r = callWith(
      'masterActivateNightmare',
      s,
      { D6: () => 5, Die: () => 1, Shuffle: <T>(a: T[]) => a },
      1,
    );
    expect(r.players['0']!.currentLayer).toBe(0);
  });

  it('骰 = 当前层数（1） → 迷失层', () => {
    const s = makeState({
      layers: {
        ...makeState().layers,
        1: {
          ...makeState().layers[1]!,
          nightmareId: 'nightmare_space_fall' as CardID,
          playersInLayer: ['0'],
        },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    const r = callWith(
      'masterActivateNightmare',
      s,
      { D6: () => 1, Die: () => 1, Shuffle: <T>(a: T[]) => a },
      1,
    );
    // roll=1 == layer=1 → lost
    expect(r.players['0']!.currentLayer).toBe(0);
  });
});

describe('masterActivateNightmare · 致命漩涡', () => {
  it('当层玩家入迷失层（保留手牌）；其他玩家移到当层 + 弃所有手牌', () => {
    const s = makeState({
      players: {
        '0': makePlayer('0', ['a', 'b'], 1), // 当层
        '1': makePlayer('1', ['x', 'y'], 2), // 其他层
        '2': makePlayer('2', ['dm1'], 1, 'master'), // 当层
      } as SetupState['players'],
      layers: {
        ...makeState().layers,
        1: {
          ...makeState().layers[1]!,
          nightmareId: 'nightmare_vortex' as CardID,
          playersInLayer: ['0', '2'],
        },
        2: { ...makeState().layers[2]!, playersInLayer: ['1'] },
      } as SetupState['layers'],
    });
    s.layers[1]!.nightmareRevealed = true;
    const r = call('masterActivateNightmare', s, 1);
    expect(r.players['0']!.currentLayer).toBe(0);
    expect(r.players['0']!.hand).toEqual(['a', 'b']); // 保留
    expect(r.players['2']!.currentLayer).toBe(0);
    expect(r.players['1']!.currentLayer).toBe(1); // 移到 layer 1
    expect(r.players['1']!.hand).toEqual([]); // 手牌弃掉
    expect(r.deck.discardPile).toContain('x');
    expect(r.deck.discardPile).toContain('y');
  });
});
