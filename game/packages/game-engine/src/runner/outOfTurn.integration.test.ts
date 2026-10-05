// 回合外响应的集成测试：全部经对局运行器驱动，回合外的玩家以自己的名义响应。
// 每条用例都是：构造局面 → 载入快照 → 由回合主人发出触发它的 move（playShoot / playUnlock / playPeek）
// → 待结算挂起 → 响应者用自己的 playerID 发响应 move；冒充者被拒绝且状态不变。
// 对照：docs/manual/04-action-cards.md 解封 / 梦境窥视；docs/manual/05-dream-thieves.md 双鱼 / 恐怖分子 / 处女 / 白羊 / 雅典娜

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { listAwaiting } from '../engine/actionRights.js';
import { createTestState, makePlayer, withBribes } from '../testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type ApplyMoveOptions,
  type GameDef,
  type MatchState,
} from './matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

const SHOOT = 'action_shoot' as CardID;
const KICK = 'action_kick' as CardID;
const UNLOCK = 'action_unlock' as CardID;
const PEEK = 'action_dream_peek' as CardID;
const NIGHTMARE = 'nightmare_despair_storm' as CardID;

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** 把构造好的状态载入成运行器的对局状态，回合主人取自 G.currentPlayerID */
function load(G: SetupState): MatchState<SetupState> {
  return matchFromSnapshot<SetupState>({
    G,
    ctx: {
      numPlayers: G.playerOrder.length,
      playOrder: G.playerOrder,
      playOrderPos: G.playerOrder.indexOf(G.currentPlayerID),
      currentPlayer: G.currentPlayerID,
      phase: 'playing',
      turn: 1,
    },
    rngState: 1,
    stateID: 0,
  });
}

/** 固定骰值：D6 按顺序取给定的值，用完后恒为 4 */
function dice(...rolls: number[]): ApplyMoveOptions {
  const queue = [...rolls];
  const next = (): number => (queue.length > 0 ? queue.shift()! : 4);
  return {
    random: {
      D6: next,
      Die: (sides: number) => Math.max(1, Math.min(sides, next())),
      Shuffle: <T>(arr: T[]): T[] => arr,
    },
  };
}

function mustApply(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  options: ApplyMoveOptions = {},
): MatchState<SetupState> {
  const res = applyMove(game, state, { playerID, move, args }, options);
  if (!res.ok) throw new Error(`move ${move} by ${playerID} 被拒绝：${res.reason}`);
  return res.state;
}

/** 断言发起者被行动权拒绝（not_active），且状态原样不变 */
function expectNotActive(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
): void {
  const res = applyMove(game, state, { playerID, move, args });
  expect(res.ok, `${playerID} 发 ${move} 应被拒绝`).toBe(false);
  if (!res.ok) expect(res.reason).toBe('not_active');
  expect(res.state).toBe(state);
}

/** 当前所有等待事项：字段 + 可行动的人（排序后便于比较） */
function awaitingOf(G: SetupState): { field: string; actors: string[] }[] {
  return listAwaiting(G).map((e) => ({ field: e.field, actors: [...e.actors].sort() }));
}

// ---------------------------------------------------------------------------
// 双鱼 · 闪避
// ---------------------------------------------------------------------------

describe('回合外响应 · 双鱼闪避', () => {
  /** p1（梦主，回合主人）在第 2 层对双鱼 p2 开枪，挂起双鱼的闪避响应 */
  function afterShootAtPisces(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'p1',
    });
    const G: SetupState = {
      ...base,
      // 牌库不能为空，否则一结算就触发「牌库耗尽，梦主胜」
      deck: { cards: [SHOOT, SHOOT, SHOOT], discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({
          id: 'p1',
          faction: 'master',
          characterId: 'dm_fortress' as CardID,
          currentLayer: 2 as Layer,
          hand: [SHOOT, UNLOCK],
        }),
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_pisces' as CardID,
          currentLayer: 2 as Layer,
          isRevealed: false,
          hand: [],
        }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 1 as Layer }),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, playersInLayer: ['p3'] },
        2: { ...base.layers[2]!, playersInLayer: ['p1', 'p2'] },
      },
    };
    const s = mustApply(load(G), 'p1', 'playShoot', ['p2', SHOOT], dice(3));
    expect(s.G.pendingShootResponse).toMatchObject({
      shooterID: 'p1',
      targetPlayerID: 'p2',
      responseType: 'pisces',
    });
    return s;
  }

  it('挂起时只有双鱼在等待', () => {
    const s = afterShootAtPisces();
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingShootResponse', actors: ['p2'] }]);
  });

  it('双鱼以自己的名义闪避：移到更小的相邻层并翻面，开枪者的 SHOOT 被弃，回合归属不变', () => {
    const s = afterShootAtPisces();
    const after = mustApply(s, 'p2', 'respondShootEvade');
    expect(after.G.pendingShootResponse).toBeNull();
    expect(after.G.players.p2!.currentLayer).toBe(1);
    expect(after.G.players.p2!.characterId).toBe('thief_pisces_back');
    expect(after.G.players.p2!.isAlive).toBe(true);
    expect(after.G.players.p1!.hand).not.toContain(SHOOT);
    expect(after.G.deck.discardPile).toContain(SHOOT);
    expect(after.ctx.currentPlayer).toBe('p1');
    expect(awaitingOf(after.G)).toEqual([]);
  });

  it('闪避结束后回合主人可以继续行动', () => {
    const after = mustApply(afterShootAtPisces(), 'p2', 'respondShootEvade');
    const next = mustApply(after, 'p1', 'endActionPhase');
    expect(next.G.turnPhase).toBe('discard');
  });

  it('第三个人冒充双鱼被拒绝', () => {
    expectNotActive(afterShootAtPisces(), 'p3', 'respondShootEvade');
  });

  it('回合主人替双鱼响应被拒绝，也不能在挂起期间结束行动阶段', () => {
    const s = afterShootAtPisces();
    expectNotActive(s, 'p1', 'respondShootEvade');
    expectNotActive(s, 'p1', 'endActionPhase');
  });

  it('双鱼选择不闪避：SHOOT 照常结算（掷出 1 命中，双鱼死亡）', () => {
    const s = afterShootAtPisces();
    const after = mustApply(s, 'p2', 'respondShootPass', [], dice(1));
    expect(after.G.pendingShootResponse).toBeNull();
    expect(after.G.players.p2!.isAlive).toBe(false);
    expect(after.G.players.p2!.currentLayer).toBe(0);
    expect(after.G.players.p1!.hand).not.toContain(SHOOT);
    expect(after.G.players.p1!.shootCount).toBe(1);
  });

  it('第三个人替双鱼放弃被拒绝', () => {
    expectNotActive(afterShootAtPisces(), 'p3', 'respondShootPass');
  });
});

// ---------------------------------------------------------------------------
// 恐怖分子
// ---------------------------------------------------------------------------

describe('回合外响应 · 恐怖分子狂热', () => {
  /** p1（恐怖分子，回合主人）在第 2 层对 p2 开枪，挂起 p2 的「弃牌或 -1」选择 */
  function afterTerroristShoot(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      deck: { cards: [SHOOT, SHOOT, SHOOT], discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({
          id: 'p1',
          faction: 'thief',
          characterId: 'thief_terrorist' as CardID,
          currentLayer: 2 as Layer,
          hand: [SHOOT],
        }),
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_aquarius' as CardID,
          currentLayer: 2 as Layer,
          hand: [KICK],
        }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 1 as Layer }),
        pM: makePlayer({
          id: 'pM',
          faction: 'master',
          characterId: 'dm_fortress' as CardID,
          currentLayer: 1 as Layer,
        }),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, playersInLayer: ['p3', 'pM'] },
        2: { ...base.layers[2]!, playersInLayer: ['p1', 'p2'] },
      },
    };
    const s = mustApply(load(G), 'p1', 'playShoot', ['p2', SHOOT]);
    expect(s.G.pendingShootResponse).toMatchObject({
      shooterID: 'p1',
      targetPlayerID: 'p2',
      responseType: 'terrorist',
    });
    return s;
  }

  it('挂起时只有被射击的目标在等待', () => {
    const s = afterTerroristShoot();
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingShootResponse', actors: ['p2'] }]);
  });

  it('目标以自己的名义弃一张牌：骰值不减，掷出 1 击杀', () => {
    const after = mustApply(
      afterTerroristShoot(),
      'p2',
      'respondTerroristDiscard',
      [KICK],
      dice(1),
    );
    expect(after.G.pendingShootResponse).toBeNull();
    expect(after.G.deck.discardPile).toContain(KICK);
    expect(after.G.players.p2!.isAlive).toBe(false);
    expect(after.G.players.p1!.hand).not.toContain(SHOOT);
  });

  it('目标选择接受惩罚：骰值 -1，掷出 1 变成 0 而未命中，手牌保留', () => {
    const after = mustApply(afterTerroristShoot(), 'p2', 'respondTerroristAccept', [], dice(1));
    expect(after.G.pendingShootResponse).toBeNull();
    expect(after.G.players.p2!.isAlive).toBe(true);
    expect(after.G.players.p2!.hand).toContain(KICK);
    expect(after.G.lastShootRoll).toBe(1);
    expect(after.G.players.p1!.hand).not.toContain(SHOOT);
  });

  it('第三个人冒充目标被拒绝', () => {
    const s = afterTerroristShoot();
    expectNotActive(s, 'p3', 'respondTerroristDiscard', [KICK]);
    expectNotActive(s, 'p3', 'respondTerroristAccept');
  });

  it('回合主人（恐怖分子自己）替目标响应被拒绝', () => {
    const s = afterTerroristShoot();
    expectNotActive(s, 'p1', 'respondTerroristAccept');
    expectNotActive(s, 'p1', 'endActionPhase');
  });
});

// ---------------------------------------------------------------------------
// 处女 · 完美
// ---------------------------------------------------------------------------

describe('回合外响应 · 处女完美', () => {
  /** p1（盗梦者，回合主人）对 p3 开枪，骰值固定为 6；p2 是处女，不是回合主人 */
  function afterShootRollsSix(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      deck: { cards: [SHOOT, SHOOT, SHOOT, SHOOT], discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({
          id: 'p1',
          faction: 'thief',
          currentLayer: 2 as Layer,
          hand: [SHOOT],
        }),
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_virgo' as CardID,
          currentLayer: 3 as Layer,
          hand: [],
        }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 2 as Layer }),
        pM: makePlayer({
          id: 'pM',
          faction: 'master',
          characterId: 'dm_fortress' as CardID,
          currentLayer: 1 as Layer,
        }),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, playersInLayer: ['p4', 'pM'] },
        2: { ...base.layers[2]!, playersInLayer: ['p1', 'p3'] },
        3: { ...base.layers[3]!, playersInLayer: ['p2'] },
      },
    };
    const s = mustApply(load(G), 'p1', 'playShoot', ['p3', SHOOT], dice(6));
    expect(s.G.pendingVirgoChoice).toEqual({ virgoID: 'p2', triggerRoll: 6, shooterID: 'p1' });
    return s;
  }

  it('挂起时只有处女在等待', () => {
    const s = afterShootRollsSix();
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingVirgoChoice', actors: ['p2'] }]);
  });

  it('处女（不是回合主人）以自己的名义选择抽牌：手牌加 2，待选择清空，回合归属不变', () => {
    const s = afterShootRollsSix();
    const handBefore = s.G.players.p2!.hand.length;
    const after = mustApply(s, 'p2', 'respondVirgoPerfect', ['draw_two']);
    expect(after.G.players.p2!.hand.length).toBe(handBefore + 2);
    expect(after.G.pendingVirgoChoice).toBeNull();
    expect(after.ctx.currentPlayer).toBe('p1');
    expect(awaitingOf(after.G)).toEqual([]);
  });

  it('处女选择传送：移到指定层', () => {
    const after = mustApply(afterShootRollsSix(), 'p2', 'respondVirgoPerfect', [
      'teleport',
      { layer: 4 },
    ]);
    expect(after.G.players.p2!.currentLayer).toBe(4);
    expect(after.G.pendingVirgoChoice).toBeNull();
  });

  it('处女响应后回合主人可以继续结束行动阶段', () => {
    const after = mustApply(afterShootRollsSix(), 'p2', 'respondVirgoPerfect', ['skip']);
    const next = mustApply(after, 'p1', 'endActionPhase');
    expect(next.G.turnPhase).toBe('discard');
  });

  it('别人冒充处女被拒绝（被射击者、回合主人、梦主）', () => {
    const s = afterShootRollsSix();
    expectNotActive(s, 'p3', 'respondVirgoPerfect', ['draw_two']);
    expectNotActive(s, 'p1', 'respondVirgoPerfect', ['draw_two']);
    expectNotActive(s, 'pM', 'respondVirgoPerfect', ['draw_two']);
  });

  it('挂起期间回合主人不能结束行动阶段', () => {
    expectNotActive(afterShootRollsSix(), 'p1', 'endActionPhase');
  });
});

// ---------------------------------------------------------------------------
// 白羊 · 星尘
// ---------------------------------------------------------------------------

describe('回合外响应 · 白羊星尘', () => {
  /**
   * p1（盗梦者，回合主人）在第 2 层击杀 p3，骰值固定为 1；
   * 第 2 层有一张未翻开的梦魇，p2 是白羊（在第 3 层，不是回合主人）。
   */
  function afterKillOnNightmareLayer(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      deck: { cards: [SHOOT, SHOOT, SHOOT, SHOOT], discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({
          id: 'p1',
          faction: 'thief',
          currentLayer: 2 as Layer,
          hand: [SHOOT],
        }),
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_aries' as CardID,
          currentLayer: 3 as Layer,
          hand: [],
        }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 2 as Layer, hand: [] }),
        pM: makePlayer({
          id: 'pM',
          faction: 'master',
          characterId: 'dm_fortress' as CardID,
          currentLayer: 1 as Layer,
        }),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, playersInLayer: ['p4', 'pM'] },
        2: {
          ...base.layers[2]!,
          playersInLayer: ['p1', 'p3'],
          nightmareId: NIGHTMARE,
          nightmareRevealed: false,
        },
        3: { ...base.layers[3]!, playersInLayer: ['p2'] },
      },
    };
    const s = mustApply(load(G), 'p1', 'playShoot', ['p3', SHOOT], dice(1));
    expect(s.G.players.p3!.isAlive).toBe(false);
    expect(s.G.pendingAriesChoice).toEqual({ ariesID: 'p2', victimLayer: 2, victimID: 'p3' });
    return s;
  }

  it('挂起时白羊在等待，且不阻塞回合主人', () => {
    const s = afterKillOnNightmareLayer();
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingAriesChoice', actors: ['p2'] }]);
    expect(listAwaiting(s.G)[0]!.blocking).toBe(false);
  });

  it('白羊（不是回合主人）以自己的名义弃掉梦魇：该层梦魇被弃并记为已用，待选择清空', () => {
    const after = mustApply(afterKillOnNightmareLayer(), 'p2', 'playAriesStardustDiscard');
    expect(after.G.pendingAriesChoice).toBeNull();
    expect(after.G.layers[2]!.nightmareId).toBeNull();
    expect(after.G.layers[2]!.nightmareTriggered).toBe(true);
    expect(after.G.usedNightmareIds).toContain(NIGHTMARE);
    expect(after.ctx.currentPlayer).toBe('p1');
  });

  it('别人冒充白羊被拒绝（回合主人、已死的受害者、第三个人）', () => {
    const s = afterKillOnNightmareLayer();
    expectNotActive(s, 'p1', 'playAriesStardustDiscard');
    expectNotActive(s, 'p3', 'playAriesStardustDiscard');
    expectNotActive(s, 'p4', 'playAriesStardustDiscard');
    expectNotActive(s, 'p1', 'playAriesStardustActivate');
  });

  it('白羊不响应：回合主人照常结束行动阶段，待选择在回合结束后被清空', () => {
    const s = afterKillOnNightmareLayer();
    const inDiscard = mustApply(s, 'p1', 'endActionPhase');
    expect(inDiscard.G.turnPhase).toBe('discard');
    // 还没结束回合，待选择仍在
    expect(inDiscard.G.pendingAriesChoice).not.toBeNull();
    const nextTurn = mustApply(inDiscard, 'p1', 'skipDiscard');
    expect(nextTurn.G.pendingAriesChoice).toBeNull();
    expect(nextTurn.G.currentPlayerID).not.toBe('p1');
    // 梦魇没有被动过
    expect(nextTurn.G.layers[2]!.nightmareId).toBe(NIGHTMARE);
  });
});

// ---------------------------------------------------------------------------
// 雅典娜 · 急智
// ---------------------------------------------------------------------------

describe('回合外响应 · 雅典娜急智', () => {
  /** p1 是回合主人；p2 是雅典娜，弃牌堆顶是 SHOOT。尚无任何待结算 */
  function athenaOffTurn(turnOwner = 'p1'): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: turnOwner,
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      deck: { cards: [KICK, KICK, KICK], discardPile: [KICK, SHOOT] },
      players: {
        ...base.players,
        p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand: [KICK] }),
        p2: makePlayer({
          id: 'p2',
          faction: 'thief',
          characterId: 'thief_athena' as CardID,
          currentLayer: 1 as Layer,
          hand: [],
        }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 1 as Layer }),
        pM: makePlayer({
          id: 'pM',
          faction: 'master',
          characterId: 'dm_fortress' as CardID,
          currentLayer: 1 as Layer,
        }),
      },
    };
    return load(G);
  }

  it('不是回合主人的雅典娜以自己的名义发动：拿到弃牌堆顶的牌，回合归属不变', () => {
    const s = athenaOffTurn();
    expect(awaitingOf(s.G)).toEqual([]);
    const after = mustApply(s, 'p2', 'useAthenaWit');
    expect(after.G.players.p2!.hand).toEqual([SHOOT]);
    expect(after.G.deck.discardPile).toEqual([KICK]);
    expect(after.ctx.currentPlayer).toBe('p1');
  });

  it('回合主人自己是雅典娜时发动被拒绝（move 自己的守卫，状态不变）', () => {
    const s = athenaOffTurn('p2');
    const res = applyMove(game, s, { playerID: 'p2', move: 'useAthenaWit', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(res.state).toBe(s);
  });

  it('不是雅典娜的人发动被拒绝', () => {
    const s = athenaOffTurn();
    const res = applyMove(game, s, { playerID: 'p3', move: 'useAthenaWit', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(res.state).toBe(s);
  });

  it('同一回合再发动一次被拒绝', () => {
    const after = mustApply(athenaOffTurn(), 'p2', 'useAthenaWit');
    const res = applyMove(game, after, { playerID: 'p2', move: 'useAthenaWit', args: [] });
    expect(res.ok).toBe(false);
  });

  it('雅典娜在别人回合只能发动急智，不能发其他 move', () => {
    expectNotActive(athenaOffTurn(), 'p2', 'endActionPhase');
  });
});

// ---------------------------------------------------------------------------
// 解封
// ---------------------------------------------------------------------------

describe('回合外响应 · 解封', () => {
  /**
   * p1（盗梦者，回合主人）在第 1 层持有【解封】，心锁为 2。
   * 响应者：p2、p3、pM；p4 已死亡，不在响应者名单里。
   */
  function afterPlayUnlock(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G: SetupState = {
      ...base,
      deck: { cards: [UNLOCK, UNLOCK, UNLOCK], discardPile: [] },
      players: {
        ...base.players,
        p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand: [UNLOCK] }),
        p2: makePlayer({ id: 'p2', faction: 'thief', currentLayer: 2 as Layer, hand: [] }),
        p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 2 as Layer, hand: [] }),
        p4: makePlayer({
          id: 'p4',
          faction: 'thief',
          currentLayer: 1 as Layer,
          isAlive: false,
          deathTurn: 1,
        }),
        pM: makePlayer({ id: 'pM', faction: 'master', currentLayer: 1 as Layer, hand: [] }),
      },
      layers: {
        ...base.layers,
        1: { ...base.layers[1]!, heartLockValue: 2, playersInLayer: ['p1', 'p4', 'pM'] },
        2: { ...base.layers[2]!, playersInLayer: ['p2', 'p3'] },
        3: { ...base.layers[3]!, playersInLayer: [] },
        4: { ...base.layers[4]!, playersInLayer: [] },
      },
    };
    const s = mustApply(load(G), 'p1', 'playUnlock', [UNLOCK]);
    expect(s.G.pendingUnlock).not.toBeNull();
    expect(s.G.pendingResponseWindow?.responders.slice().sort()).toEqual(['p2', 'p3', 'pM']);
    return s;
  }

  it('响应窗口打开时，等待的是所有还没响应的响应者', () => {
    const s = afterPlayUnlock();
    expect(awaitingOf(s.G)).toEqual([
      { field: 'pendingResponseWindow', actors: ['p2', 'p3', 'pM'] },
    ]);
  });

  it('三名响应者依次以自己的名义放弃：最后一人放弃后心锁被解开，待解封清空', () => {
    let s = afterPlayUnlock();
    const heartBefore = s.G.layers[1]!.heartLockValue;

    s = mustApply(s, 'p2', 'passResponse');
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingResponseWindow', actors: ['p3', 'pM'] }]);
    expect(s.G.pendingUnlock).not.toBeNull();

    s = mustApply(s, 'pM', 'passResponse');
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingResponseWindow', actors: ['p3'] }]);
    expect(s.G.pendingUnlock).not.toBeNull();
    expect(s.G.layers[1]!.heartLockValue).toBe(heartBefore);

    s = mustApply(s, 'p3', 'passResponse');
    expect(s.G.pendingUnlock).toBeNull();
    expect(s.G.pendingResponseWindow).toBeNull();
    expect(s.G.layers[1]!.heartLockValue).toBe(heartBefore - 1);
    expect(awaitingOf(s.G)).toEqual([]);
    expect(s.ctx.currentPlayer).toBe('p1');
  });

  it('不在响应者名单里的人（回合主人、已死亡的玩家）放弃被拒绝', () => {
    const s = afterPlayUnlock();
    expectNotActive(s, 'p1', 'passResponse');
    expectNotActive(s, 'p4', 'passResponse');
  });

  it('已经放弃的人再次放弃被拒绝', () => {
    const s = mustApply(afterPlayUnlock(), 'p2', 'passResponse');
    expectNotActive(s, 'p2', 'passResponse');
  });

  it('窗口打开期间回合主人不能自己结算解封，也不能结束行动阶段', () => {
    const s = afterPlayUnlock();
    expectNotActive(s, 'p1', 'resolveUnlock');
    expectNotActive(s, 'p1', 'endActionPhase');
  });
});

// ---------------------------------------------------------------------------
// 梦境窥视
// ---------------------------------------------------------------------------

describe('回合外响应 · 梦境窥视', () => {
  /** p1（盗梦者，回合主人）窥视第 2 层的金库；贿赂池里有牌，梦主 pM 需要先做决定 */
  function afterPlayPeek(): MatchState<SetupState> {
    const base = createTestState({
      phase: 'playing',
      turnPhase: 'action',
      turnNumber: 1,
      currentPlayerID: 'p1',
      dreamMasterID: 'pM',
    });
    const G = withBribes(
      {
        ...base,
        deck: { cards: [UNLOCK, UNLOCK, UNLOCK], discardPile: [] },
        players: {
          ...base.players,
          p1: makePlayer({ id: 'p1', faction: 'thief', currentLayer: 1 as Layer, hand: [PEEK] }),
          p2: makePlayer({ id: 'p2', faction: 'thief', currentLayer: 2 as Layer }),
          p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 3 as Layer }),
          p4: makePlayer({ id: 'p4', faction: 'thief', currentLayer: 1 as Layer }),
          pM: makePlayer({ id: 'pM', faction: 'master', currentLayer: 4 as Layer }),
        },
        layers: {
          ...base.layers,
          1: { ...base.layers[1]!, playersInLayer: ['p1', 'p4'] },
          2: { ...base.layers[2]!, playersInLayer: ['p2'] },
          3: { ...base.layers[3]!, playersInLayer: ['p3'] },
          4: { ...base.layers[4]!, playersInLayer: ['pM'] },
        },
      },
      [
        { id: 'bribe-fail-1', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-deal-1', status: 'inPool', heldBy: null, originalOwnerId: null },
      ],
    );
    const s = mustApply(load(G), 'p1', 'playPeek', [PEEK, 2]);
    expect(s.G.pendingPeekDecision).toEqual({ peekerID: 'p1', targetLayer: 2 });
    return s;
  }

  it('梦主决定、看牌者确认，依次由各自以自己的名义完成', () => {
    let s = afterPlayPeek();
    expect(awaitingOf(s.G)).toEqual([{ field: 'pendingPeekDecision', actors: ['pM'] }]);

    s = mustApply(s, 'pM', 'masterPeekBribeDecision', [false]);
    expect(s.G.pendingPeekDecision).toBeNull();
    expect(s.G.peekReveal?.peekerID).toBe('p1');
    expect(awaitingOf(s.G)).toEqual([{ field: 'peekReveal', actors: ['p1'] }]);

    s = mustApply(s, 'p1', 'peekerAcknowledge');
    expect(s.G.peekReveal).toBeNull();
    expect(awaitingOf(s.G)).toEqual([]);
    expect(s.ctx.currentPlayer).toBe('p1');

    // 窥视结束后回合主人可以继续行动
    const next = mustApply(s, 'p1', 'endActionPhase');
    expect(next.G.turnPhase).toBe('discard');
  });

  it('梦主决定之前，看牌者与旁人发梦主的决定被拒绝', () => {
    const s = afterPlayPeek();
    expectNotActive(s, 'p1', 'masterPeekBribeDecision', [false]);
    expectNotActive(s, 'p2', 'masterPeekBribeDecision', [false]);
    expectNotActive(s, 'p1', 'endActionPhase');
  });

  it('看牌结果出来之后，梦主与旁人替看牌者确认被拒绝', () => {
    const s = mustApply(afterPlayPeek(), 'pM', 'masterPeekBribeDecision', [false]);
    expectNotActive(s, 'pM', 'peekerAcknowledge');
    expectNotActive(s, 'p2', 'peekerAcknowledge');
  });
});
