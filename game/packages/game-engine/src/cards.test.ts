import { describe, it, expect } from 'vitest';
import { applyUnlockSuccess, applyUnlockCancel, drawCards, movePlayerToLayer } from './moves.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

// 构建最小可用状态
function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 'test',
    schemaVersion: 1,
    rngSeed: 'test',
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
        hand: ['action_unlock', 'action_dream_transit', 'action_creation'],
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
    vaults: [{ id: 'vault-0', layer: 1, contentType: 'secret', isOpened: false, openedBy: null }],
    bribePool: [],
    deck: { cards: ['c1', 'c2', 'c3', 'c4'], discardPile: [] },
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
    pendingResponseWindow: null,
    pendingPeekDecision: null,
    peekReveal: null,
    pendingLibra: null,
    mazeState: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
  };
  return { ...base, ...overrides } as SetupState;
}

describe('解封（Unlock）', () => {
  it('applyUnlockSuccess 应递减心锁并更新玩家计数', () => {
    const state = makeState({
      pendingUnlock: { playerID: '0', layer: 1, cardId: 'action_unlock' },
    });

    const result = applyUnlockSuccess(state);

    expect(result.pendingUnlock).toBeNull();
    expect(result.layers[1]!.heartLockValue).toBe(2);
    expect(result.players['0']!.successfulUnlocksThisTurn).toBe(1);
    expect(result.players['0']!.unlockCount).toBe(1);
    expect(result.vaults[0]!.isOpened).toBe(false);
  });

  it('心锁归零时应打开该层金库', () => {
    const state = makeState({
      layers: {
        1: {
          layer: 1,
          dreamCardId: null,
          nightmareId: null,
          nightmareRevealed: false,
          nightmareTriggered: false,
          playersInLayer: ['0'],
          heartLockValue: 1,
        },
      },
      pendingUnlock: { playerID: '0', layer: 1, cardId: 'action_unlock' },
    });

    const result = applyUnlockSuccess(state);

    expect(result.layers[1]!.heartLockValue).toBe(0);
    expect(result.vaults[0]!.isOpened).toBe(true);
    expect(result.vaults[0]!.openedBy).toBe('0');
  });

  it('applyUnlockCancel 应清除 pendingUnlock', () => {
    const state = makeState({
      pendingUnlock: { playerID: '0', layer: 1, cardId: 'action_unlock' },
    });

    const result = applyUnlockCancel(state);

    expect(result.pendingUnlock).toBeNull();
    expect(result.layers[1]!.heartLockValue).toBe(3);
  });
});

describe('梦境穿梭剂', () => {
  it('应将玩家移动到相邻层', () => {
    const state = makeState();

    const result = movePlayerToLayer(state, '0', 2);

    expect(result.players['0']!.currentLayer).toBe(2);
    expect(result.layers[1]!.playersInLayer).not.toContain('0');
    expect(result.layers[2]!.playersInLayer).toContain('0');
  });
});

describe('凭空造物', () => {
  it('应从牌库抽2张牌', () => {
    const state = makeState();
    const initialHand = state.players['0']!.hand.length;
    const initialDeck = state.deck.cards.length;

    const result = drawCards(state, '0', 2);

    expect(result.players['0']!.hand.length).toBe(initialHand + 2);
    expect(result.deck.cards.length).toBe(initialDeck - 2);
  });
});
