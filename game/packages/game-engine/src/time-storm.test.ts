// 时间风暴（action_time_storm）单测
// 对照：docs/manual/04-action-cards.md 时间风暴

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 't',
    schemaVersion: 1,
    rngSeed: 't',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    players: {
      '0': {
        id: '0',
        nickname: 'P0',
        avatarSeed: 0,
        type: 'human',
        faction: 'thief',
        characterId: '' as CardID,
        isRevealed: false,
        currentLayer: 1,
        hand: ['action_time_storm', 'action_unlock'] as CardID[],
        isAlive: true,
        deathTurn: null,
        unlockCount: 0,
        shootCount: 0,
        bribeReceived: 0,
        skillUsedThisTurn: {},
        skillUsedThisGame: {},
        successfulUnlocksThisTurn: 0,
      },
    },
    playerOrder: ['0'],
    currentPlayerID: '0',
    dreamMasterID: '1',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers: {
      1: {
        layer: 1,
        dreamCardId: null,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: false,
        playersInLayer: ['0'],
        heartLockValue: 3,
      },
    },
    vaults: [],
    bribePool: [],
    deck: {
      cards: Array.from({ length: 15 }, (_, i) => `c${i}` as CardID),
      discardPile: [] as CardID[],
    },
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

function callTimeStorm(G: SetupState, cardId: CardID) {
  return moves.playTimeStorm.move(
    {
      G,
      ctx: { numPlayers: 1, currentPlayer: '0', playOrder: ['0'], playOrderPos: 0 },
      playerID: '0',
      random: {},
      events: {},
    },
    cardId,
  );
}

describe('时间风暴（playTimeStorm）', () => {
  it('从牌库顶弃 10 张 + 手牌移除该牌（不入弃牌堆）', () => {
    const s = makeState();
    const r = callTimeStorm(s, 'action_time_storm' as CardID);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.deck.cards).toHaveLength(5);
    expect(r.deck.cards[0]).toBe('c10');
    // 被弃 10 张进入 discardPile
    expect(r.deck.discardPile).toHaveLength(10);
    expect(r.deck.discardPile[0]).toBe('c0');
    // 该牌本身未入 discardPile（移出游戏）
    expect(r.deck.discardPile).not.toContain('action_time_storm');
    // 手牌仅剩 action_unlock
    expect(r.players['0']!.hand).toEqual(['action_unlock']);
  });

  it('牌库不足 10 张时弃全部', () => {
    const s = makeState({
      deck: { cards: ['x1', 'x2', 'x3'] as CardID[], discardPile: [] as CardID[] },
    });
    const r = callTimeStorm(s, 'action_time_storm' as CardID);
    expect(r.deck.cards).toHaveLength(0);
    expect(r.deck.discardPile).toHaveLength(3);
  });

  it('非 action_time_storm cardId → INVALID_MOVE', () => {
    const s = makeState();
    expect(callTimeStorm(s, 'action_unlock' as CardID)).toBe('INVALID_MOVE');
  });

  it('手牌不含时间风暴 → INVALID_MOVE', () => {
    const s = makeState({
      players: {
        '0': { ...makeState().players['0']!, hand: ['action_unlock'] as CardID[] },
      },
    });
    expect(callTimeStorm(s, 'action_time_storm' as CardID)).toBe('INVALID_MOVE');
  });

  it('非 action turnPhase → INVALID_MOVE', () => {
    const s = makeState({ turnPhase: 'draw' });
    expect(callTimeStorm(s, 'action_time_storm' as CardID)).toBe('INVALID_MOVE');
  });

  it('pendingGraft 存在时 → INVALID_MOVE', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(callTimeStorm(s, 'action_time_storm' as CardID)).toBe('INVALID_MOVE');
  });

  it('moveCounter 递增', () => {
    const s = makeState({ moveCounter: 5 });
    const r = callTimeStorm(s, 'action_time_storm' as CardID);
    expect(r.moveCounter).toBe(6);
  });
});
