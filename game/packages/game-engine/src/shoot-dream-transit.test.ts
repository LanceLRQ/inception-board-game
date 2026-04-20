// SHOOT·梦境穿梭剂单测（双模式）
// 对照：docs/manual/04-action-cards.md SHOOT·梦境穿梭剂

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, hand: string[], layer = 1) {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: 0,
    type: 'human' as const,
    faction: 'thief' as const,
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

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const mkLayer = (l: number) => ({
    layer: l,
    dreamCardId: null,
    nightmareId: null,
    nightmareRevealed: false,
    nightmareTriggered: false,
    playersInLayer: [] as string[],
    heartLockValue: 3,
  });
  const base: SetupState = {
    matchId: 't',
    schemaVersion: 1,
    rngSeed: 't',
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    players: {
      '0': makePlayer('0', ['action_shoot_dream_transit']),
      '1': makePlayer('1', []),
    } as SetupState['players'],
    playerOrder: ['0', '1'],
    currentPlayerID: '0',
    dreamMasterID: '2',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers: {
      0: mkLayer(0),
      1: mkLayer(1),
      2: mkLayer(2),
      3: mkLayer(3),
      4: mkLayer(4),
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
  };
  base.layers[1]!.playersInLayer = ['0', '1'];
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const moves = (InceptionCityGame as any).phases.playing.moves;

function call(G: SetupState, mode: 'shoot' | 'transit', targetOrLayer: string | number, roll = 3) {
  return moves.playShootDreamTransit.move(
    {
      G,
      ctx: { numPlayers: 2, currentPlayer: '0', playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: '0',
      random: { D6: () => roll, Die: () => roll, Shuffle: <T>(a: T[]) => a },
      events: {},
    },
    'action_shoot_dream_transit' as CardID,
    mode,
    targetOrLayer,
  );
}

describe('SHOOT·梦境穿梭剂 playShootDreamTransit', () => {
  it('transit 模式：移动到相邻层', () => {
    const r = call(makeState(), 'transit', 2);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.players['0']!.currentLayer).toBe(2);
  });

  it('transit 模式：非相邻层拒绝', () => {
    expect(call(makeState(), 'transit', 3)).toBe('INVALID_MOVE');
  });

  it('shoot 模式：骰 1 杀死目标', () => {
    const r = call(makeState(), 'shoot', '1', 1);
    expect(r.players['1']!.isAlive).toBe(false);
    expect(r.players['1']!.currentLayer).toBe(0);
  });

  it('shoot 模式：骰 3 移动', () => {
    const r = call(makeState(), 'shoot', '1', 3);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('shoot 模式：不同层拒绝（基础 SHOOT 同层规则）', () => {
    const s = makeState();
    s.players['1']!.currentLayer = 2;
    expect(call(s, 'shoot', '1', 3)).toBe('INVALID_MOVE');
  });

  it('cardId 错误 → 拒绝', () => {
    const s = makeState();
    const bad = moves.playShootDreamTransit.move(
      {
        G: s,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: s.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 1, Die: () => 1, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      'action_shoot' as CardID,
      'transit',
      2,
    );
    expect(bad).toBe('INVALID_MOVE');
  });

  it('模式/参数类型不匹配 → 拒绝', () => {
    // transit 应传 number，传 string 拒绝
    expect(call(makeState(), 'transit', '1')).toBe('INVALID_MOVE');
    // shoot 应传 string，传 number 拒绝
    expect(call(makeState(), 'shoot', 2)).toBe('INVALID_MOVE');
  });

  it('pendingGraft 存在 → 拒绝', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(call(s, 'transit', 2)).toBe('INVALID_MOVE');
  });
});
