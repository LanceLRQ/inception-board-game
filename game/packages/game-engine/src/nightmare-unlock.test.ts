// 梦魇解封行动牌单测
// 对照：docs/manual/04-action-cards.md 梦魇解封

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, hand: string[]) {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: 0,
    type: 'human' as const,
    faction: 'thief' as const,
    characterId: '' as CardID,
    isRevealed: false,
    currentLayer: 1,
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

function makeLayer(l: number, nightmareId: string | null, revealed = false) {
  return {
    layer: l,
    dreamCardId: null,
    nightmareId: nightmareId as CardID | null,
    nightmareRevealed: revealed,
    nightmareTriggered: false,
    playersInLayer: [],
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
      '0': makePlayer('0', ['action_nightmare_unlock', 'action_unlock']),
    } as SetupState['players'],
    playerOrder: ['0'],
    currentPlayerID: '0',
    dreamMasterID: '1',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers: {
      1: makeLayer(1, 'nightmare_hunger_bite'),
      2: makeLayer(2, null),
      3: makeLayer(3, 'nightmare_echo', true), // 已翻开
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
    pendingResponseWindow: null,
    pendingLibra: null,
    mazeState: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moves = (InceptionCityGame as any).phases.playing.moves;

function play(G: SetupState, layer: number) {
  return moves.playNightmareUnlock.move(
    {
      G,
      ctx: { numPlayers: 1, currentPlayer: '0', playOrder: ['0'], playOrderPos: 0 },
      playerID: '0',
      random: { D6: () => 1, Die: () => 1, Shuffle: <T>(a: T[]) => a },
      events: {},
    },
    'action_nightmare_unlock' as CardID,
    layer,
  );
}

describe('playNightmareUnlock', () => {
  it('翻开面朝下的梦魇 + 弃掉自身', () => {
    const r = play(makeState(), 1);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.layers[1]!.nightmareRevealed).toBe(true);
    expect(r.layers[1]!.nightmareId).toBe('nightmare_hunger_bite');
    expect(r.deck.discardPile).toEqual(['action_nightmare_unlock']);
    expect(r.players['0']!.hand).toEqual(['action_unlock']);
  });

  it('该层无梦魇 → 拒绝', () => {
    expect(play(makeState(), 2)).toBe('INVALID_MOVE');
  });

  it('梦魇已翻开 → 拒绝（不重复翻）', () => {
    expect(play(makeState(), 3)).toBe('INVALID_MOVE');
  });

  it('手牌不含该牌 → 拒绝', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_unlock'] as CardID[];
    expect(play(s, 1)).toBe('INVALID_MOVE');
  });

  it('cardId 错误 → 拒绝', () => {
    const r = moves.playNightmareUnlock.move(
      {
        G: makeState(),
        ctx: { numPlayers: 1, currentPlayer: '0', playOrder: ['0'], playOrderPos: 0 },
        playerID: '0',
        random: {},
        events: {},
      },
      'action_unlock' as CardID,
      1,
    );
    expect(r).toBe('INVALID_MOVE');
  });

  it('pendingGraft 存在 → 拒绝', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(play(s, 1)).toBe('INVALID_MOVE');
  });

  it('非 action 阶段 → 拒绝', () => {
    const s = makeState({ turnPhase: 'draw' });
    expect(play(s, 1)).toBe('INVALID_MOVE');
  });
});
