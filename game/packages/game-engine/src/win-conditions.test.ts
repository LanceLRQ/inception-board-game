// 胜负条件单测（endIf）
// 对照：docs/manual/03-game-flow.md 胜负条件

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 'test',
    schemaVersion: 1,
    rngSeed: 'test',
    phase: 'playing',
    turnPhase: 'draw',
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
        hand: [],
        isAlive: true,
        deathTurn: null,
        unlockCount: 0,
        shootCount: 0,
        bribeReceived: 0,
        skillUsedThisTurn: {},
        skillUsedThisGame: {},
        successfulUnlocksThisTurn: 0,
      },
      '1': {
        id: '1',
        nickname: 'DM',
        avatarSeed: 1,
        type: 'human',
        faction: 'master',
        characterId: '' as CardID,
        isRevealed: true,
        currentLayer: 1,
        hand: [],
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
    playerOrder: ['0', '1'],
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
        playersInLayer: ['0', '1'],
        heartLockValue: 3,
      },
    },
    vaults: [{ id: 'vault-0', layer: 1, contentType: 'secret', isOpened: false, openedBy: null }],
    bribePool: [],
    deck: { cards: ['c1', 'c2'] as CardID[], discardPile: [] },
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
    pendingAriesChoice: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
    lastShootRoll: null,
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const endIf = (InceptionCityGame as any).endIf as (args: { G: SetupState }) => any;

describe('endIf 胜负仲裁', () => {
  it('秘密金库打开 → 盗梦者胜', () => {
    const s = makeState({
      vaults: [{ id: 'vault-0', layer: 1, contentType: 'secret', isOpened: true, openedBy: '0' }],
    });
    expect(endIf({ G: s })).toEqual({ winner: 'thief', reason: 'secret_vault_opened' });
  });

  it('所有盗梦者死亡 → 梦主胜', () => {
    const s = makeState({
      players: {
        '0': {
          ...makeState().players['0']!,
          isAlive: false,
          deathTurn: 2,
        },
        '1': makeState().players['1']!,
      },
    });
    expect(endIf({ G: s })).toEqual({ winner: 'master', reason: 'all_thieves_dead' });
  });

  it('牌库耗尽 + 秘密未开 → 梦主胜', () => {
    const s = makeState({
      deck: { cards: [], discardPile: ['c1', 'c2'] },
    });
    expect(endIf({ G: s })).toEqual({ winner: 'master', reason: 'deck_exhausted' });
  });

  it('牌库耗尽 + 秘密已开 → 盗梦者优先胜（先判秘密）', () => {
    const s = makeState({
      deck: { cards: [], discardPile: [] },
      vaults: [{ id: 'vault-0', layer: 1, contentType: 'secret', isOpened: true, openedBy: '0' }],
    });
    expect(endIf({ G: s })).toEqual({ winner: 'thief', reason: 'secret_vault_opened' });
  });

  it('setup 阶段 deck 为空不判胜', () => {
    const s = makeState({
      phase: 'setup',
      deck: { cards: [], discardPile: [] },
    });
    expect(endIf({ G: s })).toBeUndefined();
  });

  it('牌库有牌 + 盗梦者活 → 游戏继续', () => {
    expect(endIf({ G: makeState() })).toBeUndefined();
  });
});
