// 共鸣（action_resonance）单测
// 对照：docs/manual/04-action-cards.md 共鸣

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
        nickname: 'bonder',
        avatarSeed: 0,
        type: 'human',
        faction: 'thief',
        characterId: '' as CardID,
        isRevealed: false,
        currentLayer: 1,
        hand: ['action_resonance', 'action_unlock'] as CardID[],
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
        nickname: 'target',
        avatarSeed: 1,
        type: 'human',
        faction: 'thief',
        characterId: '' as CardID,
        isRevealed: false,
        currentLayer: 2,
        hand: ['action_shoot', 'action_creation', 'action_kick'] as CardID[],
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
    dreamMasterID: '2',
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
    playedCardsThisTurn: [],
    lastPlayedCardThisTurn: null,
    removedFromGame: [],
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moves = (InceptionCityGame as any).phases.playing.moves;

function playRes(G: SetupState, cardId: CardID, target: string) {
  return moves.playResonance.move(
    {
      G,
      ctx: { numPlayers: 2, currentPlayer: '0', playOrder: ['0', '1'], playOrderPos: 0 },
      playerID: '0',
      random: {},
      events: {},
    },
    cardId,
    target,
  );
}

function endActionPhase(G: SetupState) {
  return moves.endActionPhase.move({
    G,
    ctx: { numPlayers: 2, currentPlayer: '0', playOrder: ['0', '1'], playOrderPos: 0 },
    playerID: '0',
    random: {},
    events: {},
  });
}

describe('共鸣（playResonance + 回合末归还）', () => {
  it('playResonance：target 手牌全部转入 bonder + 设 pending', () => {
    const s = makeState();
    const r = playRes(s, 'action_resonance' as CardID, '1');
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['1']!.hand).toEqual([]);
    // bonder 剩余手牌 = 原手牌去掉 resonance + target 的 3 张
    expect(r.players['0']!.hand).toEqual([
      'action_unlock',
      'action_shoot',
      'action_creation',
      'action_kick',
    ]);
    expect(r.pendingResonance).toEqual({ bonderPlayerID: '0', targetPlayerID: '1' });
    expect(r.deck.discardPile).toEqual(['action_resonance']);
  });

  it('endActionPhase：pendingResonance 存在 → bonder 全部手牌归还 target', () => {
    const mid = playRes(makeState(), 'action_resonance' as CardID, '1');
    const r = endActionPhase(mid);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['0']!.hand).toEqual([]);
    expect(r.players['1']!.hand).toEqual([
      'action_unlock',
      'action_shoot',
      'action_creation',
      'action_kick',
    ]);
    expect(r.pendingResonance).toBeNull();
    expect(r.turnPhase).toBe('discard');
  });

  it('endActionPhase：target 在迷失层（layer 0）→ bonder 保留手牌', () => {
    const mid = playRes(makeState(), 'action_resonance' as CardID, '1');
    const lost: SetupState = {
      ...mid,
      players: {
        ...mid.players,
        '1': { ...mid.players['1']!, currentLayer: 0 },
      },
    };
    const r = endActionPhase(lost);
    expect(r.players['0']!.hand).toEqual([
      'action_unlock',
      'action_shoot',
      'action_creation',
      'action_kick',
    ]);
    expect(r.players['1']!.hand).toEqual([]);
    expect(r.pendingResonance).toBeNull();
  });

  it('endActionPhase：target 死亡 → bonder 保留手牌', () => {
    const mid = playRes(makeState(), 'action_resonance' as CardID, '1');
    const dead: SetupState = {
      ...mid,
      players: {
        ...mid.players,
        '1': { ...mid.players['1']!, isAlive: false, deathTurn: 1 },
      },
    };
    const r = endActionPhase(dead);
    expect(r.players['0']!.hand.length).toBe(4);
    expect(r.pendingResonance).toBeNull();
  });

  it('不能对自己使用', () => {
    const s = makeState();
    expect(playRes(s, 'action_resonance' as CardID, '0')).toBe('INVALID_MOVE');
  });

  it('每回合限 1 张（pendingResonance 存在 → 拒绝）', () => {
    const mid = playRes(makeState(), 'action_resonance' as CardID, '1');
    // 构造再打一次：需要手中再有 resonance
    const again: SetupState = {
      ...mid,
      players: {
        ...mid.players,
        '0': { ...mid.players['0']!, hand: ['action_resonance', ...mid.players['0']!.hand] },
      },
    };
    expect(playRes(again, 'action_resonance' as CardID, '1')).toBe('INVALID_MOVE');
  });

  it('target 已死亡 → 拒绝打出', () => {
    const s = makeState({
      players: {
        '0': makeState().players['0']!,
        '1': { ...makeState().players['1']!, isAlive: false, deathTurn: 1 },
      },
    });
    expect(playRes(s, 'action_resonance' as CardID, '1')).toBe('INVALID_MOVE');
  });

  it('手牌不含共鸣 → 拒绝', () => {
    const s = makeState({
      players: {
        ...makeState().players,
        '0': { ...makeState().players['0']!, hand: ['action_unlock'] as CardID[] },
      },
    });
    expect(playRes(s, 'action_resonance' as CardID, '1')).toBe('INVALID_MOVE');
  });

  it('pendingGraft 存在时共鸣被阻断', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(playRes(s, 'action_resonance' as CardID, '1')).toBe('INVALID_MOVE');
  });
});
