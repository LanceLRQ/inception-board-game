// 万有引力（action_gravity）单测
// 对照：docs/manual/04-action-cards.md 万有引力

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, hand: string[], faction: 'thief' | 'master' = 'thief') {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: parseInt(id, 10),
    type: 'human' as const,
    faction,
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

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 't',
    schemaVersion: 1,
    rngSeed: 't',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    players: {
      '0': makePlayer('0', ['action_gravity', 'action_unlock']),
      '1': makePlayer('1', ['c-a', 'c-b']),
      '2': makePlayer('2', ['c-c']),
      '3': makePlayer('3', [], 'master'),
    } as SetupState['players'],
    playerOrder: ['0', '1', '2', '3'],
    currentPlayerID: '0',
    dreamMasterID: '3',
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
        playersInLayer: ['0', '1', '2'],
        heartLockValue: 3,
      },
    },
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
    pendingPeekDecision: null,
    peekReveal: null,
    pendingLibra: null,
    mazeState: null,
    pendingAriesChoice: null,
    pendingVirgoChoice: null,
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
    lastShootRoll: null,
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moves = (InceptionCityGame as any).phases.playing.moves;

function playGrav(G: SetupState, targetIds: string[]) {
  return moves.playGravity.move(
    {
      G,
      ctx: { numPlayers: 4, currentPlayer: '0', playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: '0',
      random: {},
      events: {},
    },
    'action_gravity' as CardID,
    targetIds,
  );
}

function pick(G: SetupState, cardId: string, currentPlayer = '0') {
  return moves.resolveGravityPick.move(
    {
      G,
      ctx: { numPlayers: 4, currentPlayer, playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: currentPlayer,
      random: {},
      events: {},
    },
    cardId as CardID,
  );
}

describe('万有引力 playGravity + resolveGravityPick', () => {
  it('单目标：target 手牌入池 + pickOrder = [bonder, target]', () => {
    const r = playGrav(makeState(), ['1']);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.pendingGravity).not.toBeNull();
    expect(r.pendingGravity.pool).toEqual(['c-a', 'c-b']);
    expect(r.pendingGravity.pickOrder).toEqual(['0', '1']);
    expect(r.pendingGravity.pickCursor).toBe(0);
    expect(r.players['1']!.hand).toEqual([]);
    // bonder 手中弃了 gravity 自身
    expect(r.players['0']!.hand).toEqual(['action_unlock']);
  });

  it('双目标：pickOrder 按 playOrder 排序', () => {
    const r = playGrav(makeState(), ['2', '1']);
    expect(r.pendingGravity.pickOrder).toEqual(['0', '1', '2']);
    expect(r.pendingGravity.pool).toEqual(['c-a', 'c-b', 'c-c']);
  });

  it('目标全无手牌 → pendingGravity 直接 null（无事发生）', () => {
    const s = makeState({
      players: {
        ...makeState().players,
        '1': makePlayer('1', []),
        '2': makePlayer('2', []),
      } as SetupState['players'],
    });
    const r = playGrav(s, ['1', '2']);
    expect(r.pendingGravity).toBeNull();
  });

  it('resolveGravityPick：从池中挑一张 + cursor 前进', () => {
    const mid = playGrav(makeState(), ['1']);
    const r = pick(mid, 'c-a');
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['0']!.hand).toEqual(['action_unlock', 'c-a']);
    expect(r.pendingGravity.pool).toEqual(['c-b']);
    expect(r.pendingGravity.pickCursor).toBe(1);
  });

  it('pool 挑完 → pendingGravity 置 null', () => {
    let s = playGrav(makeState(), ['1']);
    s = pick(s, 'c-a'); // bonder picks
    s = pick(s, 'c-b'); // cursor=1 → picker=target '1'（代理调用仍由 bonder 驱动）
    expect(s.pendingGravity).toBeNull();
    // cursor 1 对应 pickOrder[1]='1'，该张入 player 1 的手
    expect(s.players['1']!.hand).toEqual(['c-b']);
  });

  it('targetIds 含自己 → INVALID_MOVE', () => {
    expect(playGrav(makeState(), ['0'])).toBe('INVALID_MOVE');
  });

  it('targetIds 长度 > 2 → INVALID_MOVE', () => {
    expect(playGrav(makeState(), ['1', '2', '3'])).toBe('INVALID_MOVE');
  });

  it('targetIds 重复 → INVALID_MOVE', () => {
    expect(playGrav(makeState(), ['1', '1'])).toBe('INVALID_MOVE');
  });

  it('非 bonder 调 resolveGravityPick → INVALID_MOVE', () => {
    const mid = playGrav(makeState(), ['1']);
    expect(pick(mid, 'c-a', '1')).toBe('INVALID_MOVE');
  });

  it('resolveGravityPick 选不在池中的牌 → INVALID_MOVE', () => {
    const mid = playGrav(makeState(), ['1']);
    expect(pick(mid, 'not-in-pool')).toBe('INVALID_MOVE');
  });
});
