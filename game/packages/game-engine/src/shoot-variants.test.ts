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

describe('lastShootRoll 记录', () => {
  it('SHOOT 结算后写入原始骰值', () => {
    const s = makeState({
      players: {
        '0': makePlayer('0', ['action_shoot']),
        '1': makePlayer('1', ['action_unlock']),
      } as SetupState['players'],
    });
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.lastShootRoll).toBe(3);
  });

  it('不同骰值分别记录', () => {
    const s = makeState({
      players: {
        '0': makePlayer('0', ['action_shoot']),
        '1': makePlayer('1', ['action_unlock']),
      } as SetupState['players'],
    });
    const r1 = callMove('playShoot', { ...s }, '1', 'action_shoot', 6);
    expect(r1.lastShootRoll).toBe(6);
    const r2 = callMove('playShoot', { ...s }, '1', 'action_shoot', 1);
    expect(r2.lastShootRoll).toBe(1);
  });
});

describe('SHOOT·刺客之王（playShootKing）', () => {
  it('任意层均可使用（L2 目标命中 move → 挂起 pendingShootMove.choices=[1,3]）', () => {
    const s = makeState();
    // target 处于不同层
    s.players['1']!.currentLayer = 2;
    const r = callMove('playShootKing', s, '1', 'action_shoot_king', 4);
    expect(r).not.toBe('INVALID_MOVE');
    // 规则：由发动方选移动方向（docs/manual/04-action-cards.md）
    // L2 → 两相邻层 [1,3]，必须挂起
    expect(r.pendingShootMove).not.toBeNull();
    expect(r.pendingShootMove.shooterID).toBe('0');
    expect(r.pendingShootMove.targetPlayerID).toBe('1');
    expect(r.pendingShootMove.choices).toEqual([1, 3]);
    // 目标尚未移动
    expect(r.players['1']!.currentLayer).toBe(2);
    // 发动方选 L3 → 移动
    const r2 = moves.resolveShootMove.move(
      {
        G: r,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: r.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 4, Die: () => 4, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      3,
    );
    expect(r2.players['1']!.currentLayer).toBe(3);
    expect(r2.pendingShootMove).toBeNull();
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

// ============================================================================
// SHOOT 发动方选层响应窗口（pendingShootMove + resolveShootMove）
// 对照：docs/manual/04-action-cards.md SHOOT 解析 "由你来选择移动"
// 场景：L1/L4 唯一相邻层 → 自动移动；L2/L3 两相邻层 → 挂起等发动方选
// ============================================================================
describe('SHOOT 发动方选层响应窗口', () => {
  function setupSameLayer(shooterLayer: number, targetLayer: number) {
    const s = makeState();
    s.players['0']!.currentLayer = shooterLayer as 1 | 2 | 3 | 4;
    s.players['1']!.currentLayer = targetLayer as 1 | 2 | 3 | 4;
    // 确保同层通过（普通 SHOOT 要求同层；此处 shooterLayer==targetLayer）
    s.players['0']!.hand = ['action_shoot'] as CardID[];
    s.layers[shooterLayer as 1 | 2] = {
      layer: shooterLayer as 1 | 2,
      dreamCardId: null,
      nightmareId: null,
      nightmareRevealed: false,
      nightmareTriggered: false,
      playersInLayer: ['0', '1'],
      heartLockValue: 0,
    };
    return s;
  }

  it('目标在 L1 → 自动移动到 L2（唯一相邻层，不挂起）', () => {
    const s = setupSameLayer(1, 1);
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.pendingShootMove ?? null).toBeNull();
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('目标在 L2 → 挂起 choices=[1,3]，等发动方选', () => {
    const s = setupSameLayer(2, 2);
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    expect(r.pendingShootMove).toBeTruthy();
    expect(r.pendingShootMove.choices).toEqual([1, 3]);
    expect(r.players['1']!.currentLayer).toBe(2);
  });

  it('目标在 L3 → 挂起 choices=[2,4]，等发动方选', () => {
    const s = makeState();
    s.players['0']!.currentLayer = 3;
    s.players['1']!.currentLayer = 3;
    s.players['0']!.hand = ['action_shoot_king'] as CardID[];
    const r = callMove('playShootKing', s, '1', 'action_shoot_king', 4);
    expect(r.pendingShootMove.choices).toEqual([2, 4]);
    expect(r.players['1']!.currentLayer).toBe(3);
  });

  it('目标在 L4 → 自动移动到 L3（唯一相邻层，不挂起）', () => {
    const s = makeState();
    s.players['0']!.currentLayer = 4;
    s.players['1']!.currentLayer = 4;
    s.players['0']!.hand = ['action_shoot_king'] as CardID[];
    const r = callMove('playShootKing', s, '1', 'action_shoot_king', 4);
    expect(r.pendingShootMove ?? null).toBeNull();
    expect(r.players['1']!.currentLayer).toBe(3);
  });

  it('resolveShootMove：非发动方调用 → INVALID_MOVE', () => {
    const s = setupSameLayer(2, 2);
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    const r2 = moves.resolveShootMove.move(
      {
        G: r,
        ctx: { numPlayers: 2, currentPlayer: '1', playOrder: r.playerOrder, playOrderPos: 0 },
        playerID: '1',
        random: { D6: () => 4, Die: () => 4, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      1,
    );
    expect(r2).toBe('INVALID_MOVE');
  });

  it('resolveShootMove：非相邻层 → INVALID_MOVE', () => {
    const s = setupSameLayer(2, 2);
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    const r2 = moves.resolveShootMove.move(
      {
        G: r,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: r.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 4, Die: () => 4, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      4, // L2 相邻层是 [1,3]，选 4 违规
    );
    expect(r2).toBe('INVALID_MOVE');
  });

  it('resolveShootMove：选择 L1（合法）→ 移动 + 清 pending', () => {
    const s = setupSameLayer(2, 2);
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    const r2 = moves.resolveShootMove.move(
      {
        G: r,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: r.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 4, Die: () => 4, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      1,
    );
    expect(r2.players['1']!.currentLayer).toBe(1);
    expect(r2.pendingShootMove).toBeNull();
  });

  it('梦主作为发动方亦可选层（阵营无关）', () => {
    // 规则：SHOOT 类发动方不分阵营，梦主如有 SHOOT 手牌可发动，同样走选层流程
    // 对照：docs/manual/04-action-cards.md SHOOT（使用时机未限定阵营）
    const s = makeState();
    // 改造：让 '0' 扮演梦主身份同时也是 currentPlayer
    s.dreamMasterID = '0';
    s.players['0']!.faction = 'master';
    s.players['0']!.currentLayer = 2;
    s.players['1']!.currentLayer = 2;
    s.players['0']!.hand = ['action_shoot'] as CardID[];
    s.layers[2] = {
      layer: 2,
      dreamCardId: null,
      nightmareId: null,
      nightmareRevealed: false,
      nightmareTriggered: false,
      playersInLayer: ['0', '1'],
      heartLockValue: 0,
    };
    const r = callMove('playShoot', s, '1', 'action_shoot', 3);
    expect(r).not.toBe('INVALID_MOVE');
    expect(r.pendingShootMove).toBeTruthy();
    expect(r.pendingShootMove.shooterID).toBe('0');
    expect(r.pendingShootMove.choices).toEqual([1, 3]);

    // 梦主作为发动方选择 L3 → 目标移动
    const r2 = moves.resolveShootMove.move(
      {
        G: r,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: r.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 3, Die: () => 3, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      3,
    );
    expect(r2.players['1']!.currentLayer).toBe(3);
    expect(r2.pendingShootMove).toBeNull();
  });

  it('无 pendingShootMove 时调用 resolveShootMove → INVALID_MOVE', () => {
    const s = makeState();
    const r = moves.resolveShootMove.move(
      {
        G: s,
        ctx: { numPlayers: 2, currentPlayer: '0', playOrder: s.playerOrder, playOrderPos: 0 },
        playerID: '0',
        random: { D6: () => 4, Die: () => 4, Shuffle: <T>(a: T[]) => a },
        events: {},
      },
      2,
    );
    expect(r).toBe('INVALID_MOVE');
  });
});
