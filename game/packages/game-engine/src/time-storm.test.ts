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
    pendingResponseWindow: null,
    pendingPeekDecision: null,
    pendingVaultDecision: null,
    peekReveal: null,
    pendingLibra: null,
    mazeState: null,
    pendingAriesChoice: null,
    pendingVirgoChoice: null,
    pendingShootResponse: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
    lastShootRoll: null,
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
  it('牌库顶 10 张进弃牌堆，只有时间风暴自己移出游戏', () => {
    const s = makeState();
    const r = callTimeStorm(s, 'action_time_storm' as CardID);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.deck.cards).toHaveLength(5);
    expect(r.deck.cards[0]).toBe('c10');
    // 被翻的 10 张进入 discardPile，removedFromGame 只有风暴本身
    expect(r.deck.discardPile).toHaveLength(10);
    expect(r.deck.discardPile).toContain('c0');
    expect(r.deck.discardPile).toContain('c9');
    expect(r.removedFromGame).toEqual(['action_time_storm']);
    // 手牌仅剩 action_unlock
    expect(r.players['0']!.hand).toEqual(['action_unlock']);
  });

  it('牌库不足 10 张时翻全部，同样进弃牌堆', () => {
    const s = makeState({
      deck: { cards: ['x1', 'x2', 'x3'] as CardID[], discardPile: [] as CardID[] },
    });
    const r = callTimeStorm(s, 'action_time_storm' as CardID);
    expect(r.deck.cards).toHaveLength(0);
    expect(r.deck.discardPile).toEqual(['x1', 'x2', 'x3']);
    expect(r.removedFromGame).toEqual(['action_time_storm']);
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

// 弃牌阶段弃掉时间风暴也触发效果
// 对照：docs/manual/04-action-cards.md 时间风暴 "从手中使用或弃掉时都触发效果"
describe('时间风暴（doDiscard 弃牌阶段触发）', () => {
  function callDoDiscard(G: SetupState, cardIds: CardID[]) {
    let endTurnCalled = false;
    const r = moves.doDiscard.move(
      {
        G,
        ctx: { numPlayers: 1, currentPlayer: '0', playOrder: ['0'], playOrderPos: 0 },
        playerID: '0',
        random: {},
        events: {
          endTurn: () => {
            endTurnCalled = true;
          },
        },
      },
      cardIds,
    );
    return { r, endTurnCalled };
  }

  function makeDiscardState(): SetupState {
    return makeState({
      turnPhase: 'discard',
      players: {
        '0': {
          ...makeState().players['0']!,
          // 手牌超限 6 张，其中 1 张时间风暴，discard 时必须弃 1 张
          hand: [
            'action_time_storm',
            'action_unlock',
            'action_unlock',
            'action_unlock',
            'action_unlock',
            'action_unlock',
          ] as CardID[],
        },
      },
    });
  }

  it('弃掉时间风暴 → 触发效果：牌库顶 10 张进弃牌堆，风暴自己移出游戏', () => {
    const s = makeDiscardState();
    const { r } = callDoDiscard(s, ['action_time_storm' as CardID]);
    expect(r.deck.discardPile).not.toContain('action_time_storm');
    expect(r.removedFromGame).toEqual(['action_time_storm']);
    // 翻 10 张牌库顶（deck 起始 15 张 → 剩 5）
    expect(r.deck.cards).toHaveLength(5);
    expect(r.deck.discardPile).toHaveLength(10);
  });

  it('弃掉非时间风暴（比如 action_unlock）→ 不触发风暴效果，正常进 discardPile', () => {
    const s = makeDiscardState();
    const { r } = callDoDiscard(s, ['action_unlock' as CardID]);
    expect(r.deck.discardPile).toEqual(['action_unlock']);
    expect(r.deck.cards).toHaveLength(15); // 牌库未动
    expect(r.removedFromGame).toHaveLength(0);
  });

  it('一次性弃 2 张时间风暴 → 各自触发一次，各翻 10 张（牌库不足则翻完）', () => {
    const s = makeState({
      turnPhase: 'discard',
      players: {
        '0': {
          ...makeState().players['0']!,
          hand: [
            'action_time_storm',
            'action_time_storm',
            'action_unlock',
            'action_unlock',
            'action_unlock',
            'action_unlock',
            'action_unlock',
          ] as CardID[],
        },
      },
    });
    const { r } = callDoDiscard(s, ['action_time_storm' as CardID, 'action_time_storm' as CardID]);
    // 最多翻 20 张；此 fixture deck 仅 15 张 → 全翻 15 张，进弃牌堆
    expect(r.deck.cards).toHaveLength(0);
    expect(r.deck.discardPile).toHaveLength(15);
    // 移出游戏的只有两张风暴自己
    expect(r.removedFromGame).toEqual(['action_time_storm', 'action_time_storm']);
  });
});
