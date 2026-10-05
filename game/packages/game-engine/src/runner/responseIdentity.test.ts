// 响应类 move 的身份：由行动权表放行的发起者就是响应者本人，move 不再接受自报身份。
// 全部经对局运行器驱动：发起者由 applyMove 的 playerID 给出，参数里带的任何 ID 都不起作用。
// 对照：docs/manual/04-action-cards.md 解封 效果② / 梦境窥视 解析

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { createTestState, makePlayer, withBribes } from '../testing/fixtures.js';
import { applyMove, matchFromSnapshot, type GameDef, type MatchState } from './matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;
const UNLOCK = 'action_unlock' as CardID;
const PEEK = 'action_dream_peek' as CardID;

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

/**
 * p1（盗梦者，回合主人）在第 1 层持有【解封】；
 * 响应者：p2（有【解封】）、p3（无牌）、pM（梦主，有【解封】）。
 * 第 1 层心锁为 2，解封后不触发金库开启。
 */
function sceneBeforeUnlock(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 1,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
  });
  return {
    ...base,
    deck: { cards: [UNLOCK, UNLOCK, UNLOCK], discardPile: [] },
    players: {
      ...base.players,
      p1: makePlayer({
        id: 'p1',
        faction: 'thief',
        currentLayer: 1 as Layer,
        hand: [UNLOCK],
      }),
      p2: makePlayer({
        id: 'p2',
        faction: 'thief',
        currentLayer: 2 as Layer,
        hand: [UNLOCK],
      }),
      p3: makePlayer({ id: 'p3', faction: 'thief', currentLayer: 2 as Layer, hand: [] }),
      p4: makePlayer({
        id: 'p4',
        faction: 'thief',
        currentLayer: 1 as Layer,
        hand: [UNLOCK],
        isAlive: false,
        deathTurn: 1,
      }),
      pM: makePlayer({
        id: 'pM',
        faction: 'master',
        currentLayer: 1 as Layer,
        hand: [UNLOCK],
      }),
    },
    layers: {
      ...base.layers,
      1: { ...base.layers[1]!, heartLockValue: 2, playersInLayer: ['p1', 'p4', 'pM'] },
      2: { ...base.layers[2]!, playersInLayer: ['p2', 'p3'] },
      3: { ...base.layers[3]!, playersInLayer: [] },
      4: { ...base.layers[4]!, playersInLayer: [] },
    },
  };
}

/** p1 打出【解封】，响应窗口里是 p2、p3、pM */
function afterPlayUnlock(): MatchState<SetupState> {
  const s = mustApply(load(sceneBeforeUnlock()), 'p1', 'playUnlock', [UNLOCK]);
  expect(s.G.pendingResponseWindow?.responders.slice().sort()).toEqual(['p2', 'p3', 'pM']);
  return s;
}

describe('响应类 move 的身份 · passResponse', () => {
  it('回合主人自己发 passResponse 被拒（不在响应者名单里）', () => {
    const s = afterPlayUnlock();
    const res = applyMove(game, s, { playerID: 'p1', move: 'passResponse', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('响应者发 passResponse 成功，只记他自己', () => {
    const s = mustApply(afterPlayUnlock(), 'p3', 'passResponse');
    expect(s.G.pendingResponseWindow?.responded).toEqual(['p3']);
  });

  it('同一个人再发一次被拒', () => {
    const s = mustApply(afterPlayUnlock(), 'p3', 'passResponse');
    const res = applyMove(game, s, { playerID: 'p3', move: 'passResponse', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('参数里带别人的 ID 被忽略：记的是发起者，不是被带上的那个人', () => {
    const s = mustApply(afterPlayUnlock(), 'p3', 'passResponse', ['pM']);
    expect(s.G.pendingResponseWindow?.responded).toEqual(['p3']);
    // 被冒名的 pM 仍然可以自己响应
    const s2 = mustApply(s, 'pM', 'passResponse');
    expect(s2.G.pendingResponseWindow?.responded).toEqual(['p3', 'pM']);
  });
});

describe('响应类 move 的身份 · respondCancelUnlock', () => {
  it('手里有【解封】的响应者发 respondCancelUnlock 成功，待解封被清空', () => {
    const s = mustApply(afterPlayUnlock(), 'p2', 'respondCancelUnlock');
    expect(s.G.pendingUnlock).toBeNull();
    expect(s.G.pendingResponseWindow).toBeNull();
    expect(s.G.players.p2!.hand).not.toContain(UNLOCK);
  });

  it('手里没有【解封】的响应者被拒', () => {
    const s = afterPlayUnlock();
    const res = applyMove(game, s, { playerID: 'p3', move: 'respondCancelUnlock', args: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('invalid_move');
    expect(res.state.G.pendingUnlock).not.toBeNull();
  });

  it('参数里带别人的 ID 无效：没有【解封】的 p3 借 pM 的名字也抵消不了', () => {
    const s = afterPlayUnlock();
    const res = applyMove(game, s, { playerID: 'p3', move: 'respondCancelUnlock', args: ['pM'] });
    expect(res.ok).toBe(false);
    expect(res.state.G.players.pM!.hand).toContain(UNLOCK);
    expect(res.state.G.pendingUnlock).not.toBeNull();
  });

  it('有【解封】的 p2 带着 pM 的 ID 抵消：弃的是 p2 自己的牌，pM 的牌不动', () => {
    const s = mustApply(afterPlayUnlock(), 'p2', 'respondCancelUnlock', ['pM']);
    expect(s.G.players.p2!.hand).not.toContain(UNLOCK);
    expect(s.G.players.pM!.hand).toContain(UNLOCK);
  });
});

describe('响应类 move 的身份 · masterPeekBribeDecision', () => {
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
        { id: 'bribe-fail-1', kind: 'fail', status: 'inPool', heldBy: null, originalOwnerId: null },
        { id: 'bribe-deal-1', kind: 'deal', status: 'inPool', heldBy: null, originalOwnerId: null },
      ],
    );
    const s = mustApply(load(G), 'p1', 'playPeek', [PEEK, 2]);
    expect(s.G.pendingPeekDecision?.peekerID).toBe('p1');
    return s;
  }

  it('看牌者（回合主人）发 masterPeekBribeDecision 被拒', () => {
    const s = afterPlayPeek();
    const res = applyMove(game, s, {
      playerID: 'p1',
      move: 'masterPeekBribeDecision',
      args: [true],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_active');
  });

  it('梦主发 masterPeekBribeDecision 成功', () => {
    const s = mustApply(afterPlayPeek(), 'pM', 'masterPeekBribeDecision', [false]);
    expect(s.G.pendingPeekDecision).toBeNull();
    expect(s.G.peekReveal?.peekerID).toBe('p1');
  });
});
