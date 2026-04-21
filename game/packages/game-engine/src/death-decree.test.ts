// 死亡宣言·3/4/5 单测
// 对照：docs/manual/04-action-cards.md 死亡宣言

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

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const mkLayer = (l: number, players: string[] = []) => ({
    layer: l,
    dreamCardId: null,
    nightmareId: null,
    nightmareRevealed: false,
    nightmareTriggered: false,
    playersInLayer: players,
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
      '0': makePlayer('0', ['action_shoot', 'action_death_decree_3', 'action_death_decree_5']),
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
      1: mkLayer(1, ['0', '1']),
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

function shoot(G: SetupState, roll: number, decreeId?: string) {
  return moves.playShoot.move(
    {
      G,
      ctx: { numPlayers: 2, currentPlayer: '0', playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: '0',
      random: { D6: () => roll, Die: () => roll, Shuffle: <T>(a: T[]) => a },
      events: {},
    },
    '1',
    'action_shoot' as CardID,
    decreeId as CardID | undefined,
  );
}

function shootKing(G: SetupState, roll: number, decreeId?: string) {
  return moves.playShootKing.move(
    {
      G,
      ctx: { numPlayers: 2, currentPlayer: '0', playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: '0',
      random: { D6: () => roll, Die: () => roll, Shuffle: <T>(a: T[]) => a },
      events: {},
    },
    '1',
    'action_shoot_king' as CardID,
    decreeId as CardID | undefined,
  );
}

describe('死亡宣言 · playShoot', () => {
  it('骰 3 无宣言 → 移动（base 仅 [1] 死）', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot'] as CardID[];
    const r = shoot(s, 3);
    expect(r.players['1']!.isAlive).toBe(true);
  });

  it('骰 3 + 展示宣言·3 → 死亡', () => {
    const r = shoot(makeState(), 3, 'action_death_decree_3');
    expect(r.players['1']!.isAlive).toBe(false);
  });

  it('骰 3 + 展示宣言·5 → 移动（面不匹配）', () => {
    const r = shoot(makeState(), 3, 'action_death_decree_5');
    expect(r.players['1']!.isAlive).toBe(true);
  });

  it('骰 5 + 展示宣言·5 → 死亡', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot', 'action_death_decree_5'] as CardID[];
    const r = shoot(s, 5, 'action_death_decree_5');
    expect(r.players['1']!.isAlive).toBe(false);
  });

  it('宣言卡 "展示"后保留在手（不进弃牌堆）', () => {
    const r = shoot(makeState(), 3, 'action_death_decree_3');
    expect(r.players['0']!.hand).toContain('action_death_decree_3');
    expect(r.deck.discardPile).not.toContain('action_death_decree_3');
    expect(r.deck.discardPile).toContain('action_shoot');
  });

  it('宣言不在手 → 拒绝', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot'] as CardID[];
    expect(shoot(s, 3, 'action_death_decree_3')).toBe('INVALID_MOVE');
  });

  it('非 decree cardId 传入 → 拒绝', () => {
    expect(shoot(makeState(), 3, 'action_unlock')).toBe('INVALID_MOVE');
  });
});

describe('死亡宣言 · 变体 playShootKing', () => {
  it('骰 4 无宣言 → 移动（king 死面 [1,2]）', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot_king'] as CardID[];
    // target on layer 1，king 移 → layer 2
    const r = shootKing(s, 4);
    expect(r.players['1']!.isAlive).toBe(true);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('骰 4 + 展示宣言·4 → 死亡', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot_king', 'action_death_decree_4'] as CardID[];
    const r = shootKing(s, 4, 'action_death_decree_4');
    expect(r.players['1']!.isAlive).toBe(false);
  });

  it('宣言"展示"保留手中', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_shoot_king', 'action_death_decree_4'] as CardID[];
    const r = shootKing(s, 4, 'action_death_decree_4');
    expect(r.players['0']!.hand).toEqual(['action_death_decree_4']);
  });
});
