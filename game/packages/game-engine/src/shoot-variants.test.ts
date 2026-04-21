// SHOOT 三变体单测（刺客之王 / 爆甲螺旋 / 炸裂弹头）
// 对照：docs/manual/04-action-cards.md §SHOOT 变体

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from './game.js';
import { resolveShootCustom } from './dice.js';
import type { SetupState } from './setup.js';
import type { CardID } from '@icgame/shared';

function makePlayer(id: string, hand: string[], layer = 1, alive = true) {
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
    isAlive: alive,
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
      '0': makePlayer('0', ['action_shoot_king', 'action_shoot_armor', 'action_shoot_burst']),
      '1': makePlayer('1', ['action_unlock', 'action_unlock', 'action_shoot', 'action_creation']),
    } as SetupState['players'],
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
        playersInLayer: ['0', '1'],
        heartLockValue: 3,
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
      0: {
        layer: 0,
        dreamCardId: null,
        nightmareId: null,
        nightmareRevealed: false,
        nightmareTriggered: false,
        playersInLayer: [],
        heartLockValue: 0,
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

function callMove(name: string, G: SetupState, targetID: string, cardId: string, roll = 4) {
  return moves[name].move(
    {
      G,
      ctx: { numPlayers: 2, currentPlayer: '0', playOrder: G.playerOrder, playOrderPos: 0 },
      playerID: '0',
      random: { D6: () => roll, Die: () => roll, Shuffle: <T>(a: T[]) => a },
      events: {},
    },
    targetID,
    cardId as CardID,
  );
}

describe('resolveShootCustom 骰面表', () => {
  it('刺客之王：1/2 死 · 3/4/5 移 · 6 miss', () => {
    expect(resolveShootCustom(1, [1, 2], [3, 4, 5])).toBe('kill');
    expect(resolveShootCustom(2, [1, 2], [3, 4, 5])).toBe('kill');
    expect(resolveShootCustom(4, [1, 2], [3, 4, 5])).toBe('move');
    expect(resolveShootCustom(6, [1, 2], [3, 4, 5])).toBe('miss');
  });
});

describe('SHOOT·刺客之王（playShootKing）', () => {
  it('任意层均可使用', () => {
    const s = makeState();
    // target 处于不同层
    s.players['1']!.currentLayer = 2;
    const r = callMove('playShootKing', s, '1', 'action_shoot_king', 4);
    expect(r).not.toBe('INVALID_MOVE');
    // 当前自动方向策略：非顶层向上，顶层 4 向下。从 2 → 3
    expect(r.players['1']!.currentLayer).toBe(3);
  });

  it('骰 1 杀死目标 + 目标入迷失层', () => {
    const r = callMove('playShootKing', makeState(), '1', 'action_shoot_king', 1);
    expect(r.players['1']!.isAlive).toBe(false);
    expect(r.players['1']!.currentLayer).toBe(0);
  });

  it('骰 6 miss → target 无变化', () => {
    const r = callMove('playShootKing', makeState(), '1', 'action_shoot_king', 6);
    expect(r.players['1']!.currentLayer).toBe(1);
    expect(r.players['1']!.isAlive).toBe(true);
  });

  it('cardId 校验', () => {
    expect(callMove('playShootKing', makeState(), '1', 'action_shoot', 4)).toBe('INVALID_MOVE');
  });
});

describe('SHOOT·爆甲螺旋（playShootArmor）', () => {
  it('必须同层', () => {
    const s = makeState();
    s.players['1']!.currentLayer = 2;
    expect(callMove('playShootArmor', s, '1', 'action_shoot_armor', 4)).toBe('INVALID_MOVE');
  });

  it('骰 3-5 移动 + 目标所有解封被弃', () => {
    const r = callMove('playShootArmor', makeState(), '1', 'action_shoot_armor', 4);
    expect(r.players['1']!.hand).not.toContain('action_unlock');
    expect(r.players['1']!.hand).toContain('action_shoot');
    expect(r.players['1']!.hand).toContain('action_creation');
    expect(r.deck.discardPile.filter((c: string) => c === 'action_unlock')).toHaveLength(2);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('骰 1-2 死亡（无弃牌副作用）', () => {
    const r = callMove('playShootArmor', makeState(), '1', 'action_shoot_armor', 2);
    expect(r.players['1']!.isAlive).toBe(false);
  });
});

describe('SHOOT·炸裂弹头（playShootBurst）', () => {
  it('骰 3-5 移动 + 弃掉目标所有 SHOOT 类手牌', () => {
    const s = makeState({
      players: {
        '0': makePlayer('0', ['action_shoot_burst']),
        '1': makePlayer('1', [
          'action_shoot',
          'action_shoot_king',
          'action_shoot_armor',
          'action_unlock',
        ]),
      } as SetupState['players'],
    });
    const r = callMove('playShootBurst', s, '1', 'action_shoot_burst', 4);
    expect(r.players['1']!.hand).toEqual(['action_unlock']);
    expect(r.deck.discardPile).toContain('action_shoot');
    expect(r.deck.discardPile).toContain('action_shoot_king');
    expect(r.deck.discardPile).toContain('action_shoot_armor');
  });
});

describe('通用守卫', () => {
  it('pendingGraft 存在 → 全部变体拒绝', () => {
    const s = makeState({ pendingGraft: { playerID: '0' } });
    expect(callMove('playShootKing', s, '1', 'action_shoot_king', 4)).toBe('INVALID_MOVE');
    expect(callMove('playShootArmor', s, '1', 'action_shoot_armor', 4)).toBe('INVALID_MOVE');
    expect(callMove('playShootBurst', s, '1', 'action_shoot_burst', 4)).toBe('INVALID_MOVE');
  });

  it('不能对自己使用', () => {
    expect(callMove('playShootKing', makeState(), '0', 'action_shoot_king', 4)).toBe(
      'INVALID_MOVE',
    );
  });

  it('目标已死亡 → 拒绝', () => {
    const s = makeState();
    s.players['1']!.isAlive = false;
    expect(callMove('playShootKing', s, '1', 'action_shoot_king', 4)).toBe('INVALID_MOVE');
  });

  it('手牌不含该牌 → 拒绝', () => {
    const s = makeState();
    s.players['0']!.hand = ['action_unlock'] as CardID[];
    expect(callMove('playShootKing', s, '1', 'action_shoot_king', 4)).toBe('INVALID_MOVE');
  });
});

// 基础 SHOOT 的 moveFaces 规则校正：根据 docs/manual/04-action-cards.md
// 骰 1=死亡，骰 2/3/4=移动相邻层，骰 5/6=miss（无效果）
describe('基础 SHOOT 骰面（playShoot）—— [1] 死 / [2,3,4] 移 / [5,6] miss', () => {
  function makeBaseState(): SetupState {
    return makeState({
      players: {
        '0': makePlayer('0', ['action_shoot']),
        '1': makePlayer('1', []),
      } as SetupState['players'],
    });
  }

  it('骰 2 → 移动到相邻层（L1→L2）', () => {
    const r = callMove('playShoot', makeBaseState(), '1', 'action_shoot', 2);
    expect(r.players['1']!.isAlive).toBe(true);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('骰 4 → 移动到相邻层', () => {
    const r = callMove('playShoot', makeBaseState(), '1', 'action_shoot', 4);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('骰 5 → miss（无移动、无击杀）', () => {
    const r = callMove('playShoot', makeBaseState(), '1', 'action_shoot', 5);
    expect(r.players['1']!.isAlive).toBe(true);
    expect(r.players['1']!.currentLayer).toBe(1);
  });

  it('骰 6 → miss（无移动、无击杀）', () => {
    const r = callMove('playShoot', makeBaseState(), '1', 'action_shoot', 6);
    expect(r.players['1']!.isAlive).toBe(true);
    expect(r.players['1']!.currentLayer).toBe(1);
  });

  it('骰 1 → 击杀目标', () => {
    const r = callMove('playShoot', makeBaseState(), '1', 'action_shoot', 1);
    expect(r.players['1']!.isAlive).toBe(false);
    expect(r.players['1']!.currentLayer).toBe(0);
  });
});
