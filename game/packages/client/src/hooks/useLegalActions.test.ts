// useLegalActions 推导测试

import { describe, it, expect } from 'vitest';
import { computeLegalActions } from './useLegalActions.js';
import type { MockMatchState } from './useMockMatch.js';
import type { CardID } from '@icgame/shared';

function baseState(overrides: Partial<MockMatchState> = {}): MockMatchState {
  return {
    matchId: 'm',
    viewerID: 'T1',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'T1',
    dreamMasterID: 'M',
    playerOrder: ['T1', 'T2', 'M'],
    players: {
      T1: {
        id: 'T1',
        nickname: 't1',
        avatarSeed: 1,
        faction: 'thief',
        characterId: 'c' as CardID,
        isRevealed: false,
        currentLayer: 2,
        hand: ['action_shoot', 'action_unlock', 'action_dream_transit'] as CardID[],
        handCount: 3,
        isAlive: true,
      },
      T2: {
        id: 'T2',
        nickname: 't2',
        avatarSeed: 2,
        faction: 'thief',
        characterId: '',
        isRevealed: false,
        currentLayer: 2,
        hand: null,
        handCount: 3,
        isAlive: true,
      },
      M: {
        id: 'M',
        nickname: 'm',
        avatarSeed: 3,
        faction: 'master',
        characterId: '',
        isRevealed: false,
        currentLayer: 4,
        hand: null,
        handCount: 2,
        isAlive: true,
      },
    },
    layers: {
      1: { layer: 1, heartLockValue: 3, playersInLayer: [], nightmareRevealed: false },
      2: { layer: 2, heartLockValue: 2, playersInLayer: ['T1', 'T2'], nightmareRevealed: false },
      3: { layer: 3, heartLockValue: 2, playersInLayer: [], nightmareRevealed: false },
      4: { layer: 4, heartLockValue: 1, playersInLayer: ['M'], nightmareRevealed: false },
    },
    vaults: [],
    deckCount: 30,
    discardPile: [],
    pendingUnlock: null,
    ...overrides,
  };
}

describe('useLegalActions', () => {
  it('returns empty when not my turn', () => {
    const s = baseState({ currentPlayerID: 'T2' });
    const result = { current: computeLegalActions(s) };
    expect(result.current.playableCardIds.size).toBe(0);
  });

  it('returns empty during pendingUnlock response window', () => {
    const s = baseState({
      pendingUnlock: { playerID: 'T2', layer: 2, cardId: 'action_unlock' as CardID },
    });
    const result = { current: computeLegalActions(s) };
    expect(result.current.playableCardIds.size).toBe(0);
  });

  it('SHOOT playable only with same-layer targets', () => {
    const s = baseState();
    const result = { current: computeLegalActions(s) };
    expect(result.current.playableCardIds.has('action_shoot' as CardID)).toBe(true);
    expect(result.current.legalTargetsByCard['action_shoot']?.has('T2')).toBe(true);
    expect(result.current.legalTargetsByCard['action_shoot']?.has('M')).toBe(false);
  });

  it('SHOOT·刺客之王（action_shoot_king）允许跨层目标', () => {
    // 对照：docs/manual/04-action-cards.md SHOOT·刺客之王 使用目标 = 任意一层梦境的另一位玩家
    const s = baseState({
      players: {
        ...baseState().players,
        T1: {
          ...baseState().players.T1!,
          hand: ['action_shoot_king'] as CardID[],
        },
      },
    });
    const result = { current: computeLegalActions(s) };
    expect(result.current.playableCardIds.has('action_shoot_king' as CardID)).toBe(true);
    // 跨层目标 M（L4）应当可选
    expect(result.current.legalTargetsByCard['action_shoot_king']?.has('M')).toBe(true);
    expect(result.current.legalTargetsByCard['action_shoot_king']?.has('T2')).toBe(true);
  });

  it('普通 SHOOT 不允许跨层目标（L2 viewer → L4 梦主 M 不在列表）', () => {
    const s = baseState();
    const result = { current: computeLegalActions(s) };
    expect(result.current.legalTargetsByCard['action_shoot']?.has('M')).toBe(false);
  });

  it('unlock unplayable when no heart lock', () => {
    const s = baseState({
      layers: {
        1: { layer: 1, heartLockValue: 3, playersInLayer: [], nightmareRevealed: false },
        2: { layer: 2, heartLockValue: 0, playersInLayer: ['T1'], nightmareRevealed: false },
        3: { layer: 3, heartLockValue: 2, playersInLayer: [], nightmareRevealed: false },
        4: { layer: 4, heartLockValue: 1, playersInLayer: ['M'], nightmareRevealed: false },
      },
    });
    const result = { current: computeLegalActions(s) };
    expect(result.current.playableCardIds.has('action_unlock' as CardID)).toBe(false);
  });

  it('dream transit offers adjacent layers only', () => {
    const s = baseState();
    const result = { current: computeLegalActions(s) };
    const legalLayers = result.current.legalLayersByCard['action_dream_transit'];
    expect(legalLayers?.has(1)).toBe(true);
    expect(legalLayers?.has(3)).toBe(true);
    expect(legalLayers?.has(4)).toBe(false);
  });

  it('master view: masterMoveLayers populated', () => {
    const s = baseState({ viewerID: 'M', currentPlayerID: 'M' });
    const result = { current: computeLegalActions(s) };
    expect(result.current.masterMoveLayers.has(3)).toBe(true);
    expect(result.current.masterMoveLayers.has(2)).toBe(false);
  });
});
