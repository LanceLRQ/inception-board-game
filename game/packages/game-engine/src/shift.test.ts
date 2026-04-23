// 移形换影（EX，action_shift）单测
// 对照：docs/manual/04-action-cards.md 移形换影

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(
  id: string,
  characterId: string,
  faction: 'thief' | 'master' = 'thief',
  hand: string[] = [],
) {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: 0,
    type: 'human' as const,
    faction,
    characterId: characterId as CardID,
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
      '0': makePlayer('0', 'thief_pointman', 'thief', ['action_shift']),
      '1': makePlayer('1', 'thief_dream_interpreter', 'thief'),
      '2': makePlayer('2', 'dm_fortress', 'master'),
    } as SetupState['players'],
    playerOrder: ['0', '1', '2'],
    currentPlayerID: '0',
    dreamMasterID: '2',
    ruleVariant: 'classic',
    exCardsEnabled: true,
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
    pendingPeekDecision: null,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const turn = (InceptionCityGame as any).phases.playing.turn;

function shift(G: SetupState, targetID: string, self = '0') {
  return moves.playShift.move(
    {
      G,
      ctx: { numPlayers: 3, currentPlayer: self, playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: self,
      random: {},
      events: {},
    },
    'action_shift' as CardID,
    targetID,
  );
}

describe('移形换影 playShift', () => {
  it('盗梦者交换另一盗梦者的角色 + 首次设 snapshot', () => {
    const r = shift(makeState(), '1');
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['0']!.characterId).toBe('thief_dream_interpreter');
    expect(r.players['1']!.characterId).toBe('thief_pointman');
    expect(r.shiftSnapshot).toEqual({
      '0': 'thief_pointman',
      '1': 'thief_dream_interpreter',
      '2': 'dm_fortress',
    });
  });

  it('盗梦者不能对梦主使用 → 拒绝', () => {
    expect(shift(makeState(), '2')).toBe('INVALID_MOVE');
  });

  it('梦主可对盗梦者使用', () => {
    const s = makeState({
      currentPlayerID: '2',
      players: {
        '0': makePlayer('0', 'thief_pointman'),
        '1': makePlayer('1', 'thief_dream_interpreter'),
        '2': makePlayer('2', 'dm_fortress', 'master', ['action_shift']),
      } as SetupState['players'],
    });
    const r = shift(s, '0', '2');
    expect(r.players['2']!.characterId).toBe('thief_pointman');
    expect(r.players['0']!.characterId).toBe('dm_fortress');
  });

  it('不能对自己使用', () => {
    expect(shift(makeState(), '0')).toBe('INVALID_MOVE');
  });

  it('连续多次 shift：snapshot 保留最初状态', () => {
    const s = shift(makeState(), '1');
    // 再次交换回去
    s.players['0']!.hand = ['action_shift'] as CardID[];
    const r = shift(s, '1');
    expect(r.shiftSnapshot).toEqual({
      '0': 'thief_pointman',
      '1': 'thief_dream_interpreter',
      '2': 'dm_fortress',
    });
    // 第二次后应回到原始角色（0:pointman 1:dream_interpreter）
    expect(r.players['0']!.characterId).toBe('thief_pointman');
    expect(r.players['1']!.characterId).toBe('thief_dream_interpreter');
  });

  it('turn.onEnd 还原快照并清 snapshot', () => {
    const mid = shift(makeState(), '1');
    // 模拟 onEnd 调用
    const r = turn.onEnd({
      G: mid,
      ctx: { numPlayers: 3, currentPlayer: '0', playOrder: mid.playerOrder, playOrderPos: 0 },
    });
    expect(r.shiftSnapshot).toBeNull();
    expect(r.players['0']!.characterId).toBe('thief_pointman');
    expect(r.players['1']!.characterId).toBe('thief_dream_interpreter');
  });

  it('turn.onEnd 无 snapshot → G 不变', () => {
    const s = makeState();
    const r = turn.onEnd({
      G: s,
      ctx: { numPlayers: 3, currentPlayer: '0', playOrder: s.playerOrder, playOrderPos: 0 },
    });
    expect(r).toBe(s);
  });

  it('手牌不含 action_shift → 拒绝', () => {
    const s = makeState();
    s.players['0']!.hand = [] as CardID[];
    expect(shift(s, '1')).toBe('INVALID_MOVE');
  });

  it('pendingGraft 存在时 → 拒绝', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(shift(s, '1')).toBe('INVALID_MOVE');
  });
});
