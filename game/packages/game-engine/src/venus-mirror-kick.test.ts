// 金星·镜界世界观：弃 2 张牌，重复执行本回合内之前任意 1 张牌的非抽牌及弃牌效果。
// 复制 KICK 时执行的是 KICK 的效果（与目标交换梦境层），不是 SHOOT 的击杀。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/06-dream-master.md 金星·镜界；docs/manual/04-action-cards.md KICK

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makeLayer } from './testing/fixtures.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
  type RandomSource,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;
const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const UNLOCK = c('action_unlock');

// 掷 1 点：若被误当成 SHOOT 结算，目标会被击杀
const random: RandomSource = { D6: () => 1, Die: () => 1, Shuffle: (arr) => arr };

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

/** p1 在第 3 层，p3 在第 2 层，梦主是金星·镜界 */
function scene(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(20).fill(UNLOCK), discardPile: [] },
  });
  const at = (id: string, layer: number, hand: CardID[]) => ({
    ...base.players[id]!,
    currentLayer: layer as Layer,
    hand,
  });
  return {
    ...base,
    layers: {
      1: makeLayer(1 as Layer, { playersInLayer: ['p2', 'p4', 'pM'] }),
      2: makeLayer(2 as Layer, { playersInLayer: ['p3'] }),
      3: makeLayer(3 as Layer, { playersInLayer: ['p1'] }),
      4: makeLayer(4 as Layer),
    },
    players: {
      p1: at('p1', 3, [KICK, UNLOCK, UNLOCK, UNLOCK]),
      p2: at('p2', 1, [UNLOCK]),
      p3: at('p3', 2, [UNLOCK, KICK]),
      p4: at('p4', 1, [UNLOCK]),
      pM: { ...at('pM', 1, [UNLOCK]), characterId: c('dm_venus_mirror') },
    },
  };
}

function step(s: MatchState<SetupState>, move: string, args: unknown[]) {
  const res = applyMove(game, s, { playerID: 'p1', move, args }, { random });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state;
}

describe('金星·镜界复制 KICK', () => {
  it('复制的是 KICK 的换层效果：没有人死亡、没有手牌转移', () => {
    let s = step(load(scene()), 'playKick', [KICK, 'p2']);
    // 先踢 p2：p1 到第 1 层，p2 到第 3 层
    expect(s.G.players.p1!.currentLayer).toBe(1);
    expect(s.G.players.p2!.currentLayer).toBe(3);

    const before = s.G;
    s = step(s, 'useVenusMirrorWorld', ['p3', [UNLOCK, UNLOCK]]);
    const G = s.G;
    // 与 p3 换层：p1 从第 1 层到第 2 层，p3 到第 1 层
    expect(G.players.p1!.currentLayer).toBe(2);
    expect(G.players.p3!.currentLayer).toBe(1);
    for (const id of G.playerOrder) expect(G.players[id]!.isAlive).toBe(true);
    // 目标的手牌原样，击杀计数不动；p1 只少了弃掉的 2 张
    expect(G.players.p3!.hand).toEqual(before.players.p3!.hand);
    expect(G.players.p1!.hand.length).toBe(before.players.p1!.hand.length - 2);
    expect(G.players.p1!.shootCount).toBe(0);
    expect(G.layers[0]?.playersInLayer ?? []).toEqual([]);
  });

  it('筑梦师·迷宫困住的目标同样不能被复制出来的 KICK 选中', () => {
    let s = step(load(scene()), 'playKick', [KICK, 'p2']);
    s = {
      ...s,
      G: { ...s.G, mazeState: { mazedPlayerID: 'p3', untilTurnNumber: 99 } },
    };
    const res = applyMove(
      game,
      s,
      { playerID: 'p1', move: 'useVenusMirrorWorld', args: ['p3', [UNLOCK, UNLOCK]] },
      { random },
    );
    expect(res.ok).toBe(false);
  });
});
