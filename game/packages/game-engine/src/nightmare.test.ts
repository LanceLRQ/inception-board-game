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
      random: {},
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
    s.layers[2]!.nightmareRevealed = true; // space_fall 尚未实现
    expect(call('masterActivateNightmare', s, 2)).toBe('INVALID_MOVE');
  });

  it('未翻开 → 拒绝', () => {
    expect(call('masterActivateNightmare', makeState(), 1)).toBe('INVALID_MOVE');
  });
});
