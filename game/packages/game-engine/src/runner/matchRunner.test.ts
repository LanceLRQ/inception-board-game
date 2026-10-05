// 对局运行器的基本行为：建局、回合推进、拒绝、随机数、快照恢复、回合外响应

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState, makePlayer } from '../testing/fixtures.js';
import {
  applyMove,
  createMatch,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
} from './matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;

function start(numPlayers = 5, seed = 'unit'): MatchState<SetupState> {
  return createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
}

function mustApply(
  state: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
): MatchState<SetupState> {
  const res = applyMove(game, state, { playerID, move, args });
  if (!res.ok) throw new Error(`move ${move} by ${playerID} 被拒绝：${res.reason}`);
  return res.state;
}

/** 走完当前玩家的一个最简回合：抽牌 → 结束出牌 → 弃到上限 */
function playMinimalTurn(state: MatchState<SetupState>): MatchState<SetupState> {
  const pid = state.ctx.currentPlayer;
  let s = mustApply(state, pid, 'doDraw');
  s = mustApply(s, pid, 'endActionPhase');
  const skip = applyMove(game, s, { playerID: pid, move: 'skipDiscard', args: [] });
  if (skip.ok) return skip.state;
  const hand = s.G.players[pid]!.hand;
  for (let n = 1; n <= hand.length; n++) {
    const res = applyMove(game, s, { playerID: pid, move: 'doDiscard', args: [hand.slice(0, n)] });
    if (res.ok) return res.state;
  }
  throw new Error('弃牌阶段无法推进');
}

describe('对局运行器 · 建局与回合推进', () => {
  it('建局后处于 setup 阶段，由 0 号玩家行动', () => {
    const s = start();
    expect(s.ctx.phase).toBe('setup');
    expect(s.ctx.currentPlayer).toBe('0');
    expect(s.ctx.turn).toBe(1);
    expect(s.G.phase).toBe('setup');
    expect(s.stateID).toBe(0);
  });

  it('completeSetup 之后进入 playing，回合归属对齐到梦主', () => {
    const s = mustApply(start(), '0', 'completeSetup');
    expect(s.ctx.phase).toBe('playing');
    expect(s.G.dreamMasterID).toBeTruthy();
    expect(s.ctx.currentPlayer).toBe(s.G.dreamMasterID);
    expect(s.G.currentPlayerID).toBe(s.G.dreamMasterID);
    expect(s.G.turnPhase).toBe('draw');
    expect(s.stateID).toBe(1);
  });

  it('走完一个回合后轮到顺时针下一位，并触发回合开始钩子', () => {
    const s0 = mustApply(start(), '0', 'completeSetup');
    const first = s0.ctx.currentPlayer;
    const s1 = playMinimalTurn(s0);
    const order = s1.ctx.playOrder;
    const expected = order[(order.indexOf(first) + 1) % order.length];
    expect(s1.ctx.currentPlayer).toBe(expected);
    expect(s1.G.currentPlayerID).toBe(expected);
    expect(s1.G.turnPhase).toBe('draw');
    expect(s1.ctx.turn).toBe(s0.ctx.turn + 1);
  });

  it('能连续推进多个回合', () => {
    let s = mustApply(start(6, 'many'), '0', 'completeSetup');
    const seen = new Set<string>();
    for (let i = 0; i < 12 && s.ctx.gameover === undefined; i++) {
      seen.add(s.ctx.currentPlayer);
      s = playMinimalTurn(s);
    }
    expect(seen.size).toBe(6);
  });
});

describe('对局运行器 · 拒绝', () => {
  it('不是当前玩家：拒绝，状态原样返回', () => {
    const s = mustApply(start(), '0', 'completeSetup');
    const other = s.ctx.playOrder.find((p) => p !== s.ctx.currentPlayer)!;
    const res = applyMove(game, s, { playerID: other, move: 'doDraw', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
    expect(res.state).toBe(s);
  });

  it('当前阶段没有这个 move：拒绝', () => {
    const s = start();
    const res = applyMove(game, s, { playerID: '0', move: 'doDraw', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown_move');
  });

  it('引擎判定非法：拒绝，版本号和随机数状态都不前进', () => {
    const s = mustApply(start(), '0', 'completeSetup');
    const res = applyMove(game, s, {
      playerID: s.ctx.currentPlayer,
      move: 'endActionPhase',
      args: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(res.state.stateID).toBe(s.stateID);
    expect(res.state.rngState).toBe(s.rngState);
  });
});

describe('对局运行器 · 随机数与快照', () => {
  it('相同种子得到相同对局', () => {
    const a = mustApply(start(7, 'same'), '0', 'completeSetup');
    const b = mustApply(start(7, 'same'), '0', 'completeSetup');
    expect(a).toEqual(b);
  });

  it('不同种子分出不同的梦主或角色', () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = mustApply(start(7, `seed-${i}`), '0', 'completeSetup');
      outcomes.add(`${s.G.dreamMasterID}:${s.G.players[s.G.dreamMasterID!]!.characterId}`);
    }
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('用到随机数的 move 会推进随机数状态', () => {
    const s0 = start();
    const s1 = mustApply(s0, '0', 'completeSetup');
    expect(s1.rngState).not.toBe(s0.rngState);
  });

  it('状态经 JSON 往返后可以原样继续', () => {
    const s0 = mustApply(start(5, 'json'), '0', 'completeSetup');
    const restored = matchFromSnapshot<SetupState>(JSON.parse(JSON.stringify(s0)));
    expect(playMinimalTurn(restored)).toEqual(playMinimalTurn(s0));
  });

  it('不修改传入的状态', () => {
    const s0 = mustApply(start(5, 'frozen'), '0', 'completeSetup');
    const before = JSON.stringify(s0);
    playMinimalTurn(s0);
    expect(JSON.stringify(s0)).toBe(before);
  });
});

describe('对局运行器 · 回合外响应', () => {
  const SHOOT = 'action_shoot' as CardID;

  /** p1（梦主）在第 2 层对双鱼 p2 开枪，挂起双鱼的闪避响应 */
  function shootAtPisces(): MatchState<SetupState> {
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
          hand: [SHOOT, 'action_unlock' as CardID],
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
    const s = matchFromSnapshot<SetupState>({
      G,
      ctx: {
        numPlayers: G.playerOrder.length,
        playOrder: G.playerOrder,
        playOrderPos: G.playerOrder.indexOf('p1'),
        currentPlayer: 'p1',
        phase: 'playing',
        turn: 1,
      },
      rngState: 1,
      stateID: 0,
    });
    const res = applyMove(game, s, { playerID: 'p1', move: 'playShoot', args: ['p2', SHOOT] });
    if (!res.ok) throw new Error(`playShoot 被拒绝：${res.reason}`);
    expect(res.state.G.pendingShootResponse?.targetPlayerID).toBe('p2');
    return res.state;
  }

  it('被射击的双鱼可以在别人的回合里闪避，不需要登记响应类 move', () => {
    const s = shootAtPisces();
    const res = applyMove(game, s, { playerID: 'p2', move: 'respondShootEvade', args: [] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.pendingShootResponse).toBeNull();
    expect(res.state.G.players.p2!.currentLayer).toBe(1);
    expect(res.state.G.players.p2!.characterId).toBe('thief_pisces_back');
    expect(res.state.G.players.p1!.hand).not.toContain(SHOOT);
    // 回合归属不变，仍是开枪的人
    expect(res.state.ctx.currentPlayer).toBe('p1');
  });

  it('回合主人不能替被射击者响应', () => {
    const s = shootAtPisces();
    const res = applyMove(game, s, { playerID: 'p1', move: 'respondShootEvade', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('不是被射击者的人响应一样被拒绝', () => {
    const s = shootAtPisces();
    const res = applyMove(game, s, { playerID: 'p3', move: 'respondShootEvade', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('不在对局里的人发 move 被拒绝', () => {
    const s = shootAtPisces();
    const res = applyMove(game, s, { playerID: 'ghost', move: 'respondShootEvade', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('待结算期间被拒绝的请求不改变状态', () => {
    const s = shootAtPisces();
    const res = applyMove(game, s, { playerID: 'p3', move: 'respondShootEvade', args: [] });
    expect(res.state).toBe(s);
  });
});

describe('对局运行器 · 行动权钩子', () => {
  interface Tiny {
    n: number;
    seen: string[];
  }
  const tiny = (rights?: GameDef<Tiny>['actionRights']): GameDef<Tiny> => ({
    setup: () => ({ n: 0, seen: [] }),
    actionRights: rights,
    phases: {
      main: {
        start: true,
        turn: {},
        moves: {
          inc: {
            move: ({ G, ctx }: { G: Tiny; ctx: { currentPlayer: string } }) => ({
              n: G.n + 1,
              seen: [...G.seen, ctx.currentPlayer],
            }),
          },
        },
      },
    },
  });

  it('没提供钩子时只有回合主人可以行动', () => {
    const s = createMatch(tiny(), { numPlayers: 3, seed: 's' });
    const res = applyMove(tiny(), s, { playerID: '1', move: 'inc', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('钩子放行时非回合主人可以行动，运行器不替换传给 move 的 ctx.currentPlayer', () => {
    const g = tiny(() => true);
    const s = createMatch(g, { numPlayers: 3, seed: 's' });
    const res = applyMove(g, s, { playerID: '1', move: 'inc', args: [] });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.G.seen).toEqual(['0']);
  });

  it('钩子返回 false 时被拒绝', () => {
    const g = tiny(({ playerID }) => playerID === '2');
    const s = createMatch(g, { numPlayers: 3, seed: 's' });
    const res = applyMove(g, s, { playerID: '0', move: 'inc', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('发起者不在出牌名单里时，不问钩子直接拒绝', () => {
    const g = tiny(() => true);
    const s = createMatch(g, { numPlayers: 3, seed: 's' });
    const res = applyMove(g, s, { playerID: '9', move: 'inc', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });
});
