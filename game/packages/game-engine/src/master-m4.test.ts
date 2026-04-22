// M4 梦主优势单测：M4-3 迷失层自动复活 + M4-4 金币金库派贿赂
// 对照：docs/manual/08-appendix.md M4 梦主优势 第 3/4 条

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, faction: 'thief' | 'master', layer: number, alive = true) {
  return {
    id,
    nickname: `P${id}`,
    avatarSeed: 0,
    type: 'human' as const,
    faction,
    characterId: '' as CardID,
    isRevealed: false,
    currentLayer: layer,
    hand: [] as CardID[],
    isAlive: alive,
    deathTurn: alive ? null : 1,
    unlockCount: 0,
    shootCount: 0,
    bribeReceived: 0,
    skillUsedThisTurn: {},
    skillUsedThisGame: {},
    successfulUnlocksThisTurn: 0,
  };
}

function makeBribePool() {
  return [
    { id: 'bribe-deal-0', status: 'inPool' as const, heldBy: null, originalOwnerId: null },
    { id: 'bribe-deal-1', status: 'inPool' as const, heldBy: null, originalOwnerId: null },
    { id: 'bribe-fail-0', status: 'inPool' as const, heldBy: null, originalOwnerId: null },
  ];
}

function makeState(overrides: Partial<SetupState> = {}): SetupState {
  const base: SetupState = {
    matchId: 't',
    schemaVersion: 1,
    rngSeed: 't',
    phase: 'playing',
    turnPhase: 'turnStart',
    turnNumber: 1,
    players: {
      dm: makePlayer('dm', 'master', 0), // 梦主默认处于迷失层
      '1': makePlayer('1', 'thief', 1),
    } as SetupState['players'],
    playerOrder: ['dm', '1'],
    currentPlayerID: 'dm',
    dreamMasterID: 'dm',
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    layers: {
      0: {
        layer: 0,
        dreamCardId: null,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: false,
        playersInLayer: ['dm'],
        heartLockValue: 0,
      },
      1: {
        layer: 1,
        dreamCardId: null,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: false,
        playersInLayer: ['1'],
        heartLockValue: 1,
      },
      2: {
        layer: 2,
        dreamCardId: null,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: false,
        playersInLayer: [],
        heartLockValue: 3,
      },
    } as SetupState['layers'],
    vaults: [],
    bribePool: makeBribePool(),
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
    lastShootRoll: null,
  };
  return { ...base, ...overrides } as SetupState;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gameAny = InceptionCityGame as any;
const onBegin = gameAny.phases.playing.turn.onBegin;
const moves = gameAny.phases.playing.moves;

function runOnBegin(G: SetupState, currentPlayer: string): SetupState {
  return onBegin({
    G,
    ctx: { numPlayers: 2, currentPlayer, playOrder: G.playerOrder, playOrderPos: 0 },
  });
}

describe('M4-3 梦主迷失层自动复活', () => {
  it('梦主回合开始时处于 layer 0 → 自动移至 layer 1', () => {
    const s = makeState();
    // 前置条件：梦主在迷失层
    expect(s.players.dm!.currentLayer).toBe(0);
    const r = runOnBegin(s, 'dm');
    // 自动复活到 layer 1
    expect(r.players.dm!.currentLayer).toBe(1);
    expect(r.players.dm!.isAlive).toBe(true);
    expect(r.players.dm!.deathTurn).toBeNull();
  });

  it('梦主已死亡 + 迷失层 → 站起来复活', () => {
    const s = makeState({
      players: {
        dm: { ...makePlayer('dm', 'master', 0, false), deathTurn: 0 },
        '1': makePlayer('1', 'thief', 1),
      } as SetupState['players'],
    });
    const r = runOnBegin(s, 'dm');
    expect(r.players.dm!.isAlive).toBe(true);
    expect(r.players.dm!.currentLayer).toBe(1);
    expect(r.players.dm!.deathTurn).toBeNull();
  });

  it('梦主已在 layer 1 → 不触发复活逻辑（无副作用）', () => {
    const s = makeState({
      players: {
        dm: makePlayer('dm', 'master', 1),
        '1': makePlayer('1', 'thief', 1),
      } as SetupState['players'],
      layers: {
        0: {
          layer: 0,
          dreamCardId: null,
          nightmareId: null,
          nightmareRevealed: false,
          nightmareTriggered: false,
          playersInLayer: [],
          heartLockValue: 0,
        },
        1: {
          layer: 1,
          dreamCardId: null,
          nightmareId: null,
          nightmareRevealed: false,
          nightmareTriggered: false,
          playersInLayer: ['dm', '1'],
          heartLockValue: 1,
        },
      } as SetupState['layers'],
    });
    const r = runOnBegin(s, 'dm');
    expect(r.players.dm!.currentLayer).toBe(1);
  });

  it('盗梦者回合开始 + 盗梦者在迷失层 → 不自动复活（仅对梦主生效）', () => {
    const s = makeState({
      currentPlayerID: '1',
      players: {
        dm: makePlayer('dm', 'master', 1),
        '1': makePlayer('1', 'thief', 0, false),
      } as SetupState['players'],
    });
    const r = runOnBegin(s, '1');
    expect(r.players['1']!.currentLayer).toBe(0);
    expect(r.players['1']!.isAlive).toBe(false);
  });
});

describe('M4-4 金币金库开启 → 派 1 张贿赂给打开者', () => {
  function makeCoinVaultState(): SetupState {
    return makeState({
      turnPhase: 'action',
      pendingUnlock: {
        playerID: '1',
        layer: 1,
        cardId: 'action_unlock' as CardID,
      },
      layers: {
        0: {
          layer: 0,
          dreamCardId: null,
          nightmareId: null,
          nightmareRevealed: false,
          nightmareTriggered: false,
          playersInLayer: [],
          heartLockValue: 0,
        },
        1: {
          // 心锁 1 —— resolveUnlock 将归零 → 打开第一个未开金库
          layer: 1,
          dreamCardId: null,
          nightmareId: null,
          nightmareRevealed: false,
          nightmareTriggered: false,
          playersInLayer: ['1'],
          heartLockValue: 1,
        },
      } as SetupState['layers'],
      vaults: [
        {
          id: 'v1',
          layer: 1,
          contentType: 'coin',
          isOpened: false,
          openedBy: null,
        },
      ],
    });
  }

  function runResolveUnlock(G: SetupState) {
    return moves.resolveUnlock.move({
      G,
      ctx: { numPlayers: 2, currentPlayer: '1', playOrder: G.playerOrder, playOrderPos: 1 },
      playerID: '1',
      random: { D6: () => 1, Die: () => 1, Shuffle: <T>(arr: T[]) => arr },
      events: {},
    });
  }

  it('解封成功 + 打开 coin 金库 → openedBy 获得 1 张贿赂', () => {
    const s = makeCoinVaultState();
    const before = s.players['1']!.bribeReceived;
    const r = runResolveUnlock(s);
    expect(r).not.toBe('INVALID_MOVE');
    const rState = r as SetupState;
    expect(rState.vaults[0]!.isOpened).toBe(true);
    expect(rState.vaults[0]!.openedBy).toBe('1');
    // 目标收到 1 张贿赂
    expect(rState.players['1']!.bribeReceived).toBe(before + 1);
    // bribePool 中有一张从 inPool 转为 dealt 或 deal
    const dealtOrDeal = rState.bribePool.filter((b) => b.status !== 'inPool').length;
    expect(dealtOrDeal).toBe(1);
  });

  it('解封成功但心锁未归零（heartLock>1）→ 不开金库、不派贿赂', () => {
    const s = makeCoinVaultState();
    s.layers[1]!.heartLockValue = 2;
    const r = runResolveUnlock(s) as SetupState;
    expect(r.vaults[0]!.isOpened).toBe(false);
    expect(r.players['1']!.bribeReceived).toBe(0);
    expect(r.bribePool.every((b) => b.status === 'inPool')).toBe(true);
  });

  it('打开非 coin 金库（如 secret）→ 不触发 M4-4 贿赂派发', () => {
    const s = makeCoinVaultState();
    s.vaults[0]!.contentType = 'secret';
    const r = runResolveUnlock(s) as SetupState;
    expect(r.vaults[0]!.isOpened).toBe(true);
    // secret 金库开启属于盗梦者胜利条件，贿赂派发不触发
    expect(r.players['1']!.bribeReceived).toBe(0);
  });

  it('bribePool 已空 → 开 coin 金库但不派贿赂（不抛错）', () => {
    const s = makeCoinVaultState();
    s.bribePool = s.bribePool.map((b) => ({ ...b, status: 'dealt' as const }));
    const r = runResolveUnlock(s) as SetupState;
    expect(r.vaults[0]!.isOpened).toBe(true);
    expect(r.players['1']!.bribeReceived).toBe(0);
  });
});
