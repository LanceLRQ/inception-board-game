// 梦主在自己回合开始时若在迷失层，自动复活，不弃牌，落在进入迷失层之前所在的那一层。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/03-game-flow.md 复活 / 迷失层；docs/manual/08-appendix.md 梦主优势

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState, makeLayer } from './testing/fixtures.js';
import { killPlayer, sendToLimbo } from './engine/death.js';
import { fortressColdnessChancesLeft } from './engine/skills.js';
import { movePlayerToLayer } from './stateOps.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
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
const SHOOT = c('action_shoot');

const fixedRandom = (roll: number): RandomSource => ({
  D6: () => roll,
  Die: () => roll,
  Shuffle: (arr) => arr,
});

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

/** 出牌顺序 p1 → pM → p2 → p3 → p4；p1 与梦主同在第 3 层，p2 在第 2 层 */
function scene(): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    playerOrder: ['p1', 'pM', 'p2', 'p3', 'p4'],
    deck: { cards: Array<CardID>(30).fill(KICK), discardPile: [] },
  });
  const layers = {
    1: makeLayer(1 as Layer, { playersInLayer: ['p3', 'p4'] }),
    2: makeLayer(2 as Layer, { playersInLayer: ['p2'] }),
    3: makeLayer(3 as Layer, { playersInLayer: ['p1', 'pM'] }),
    4: makeLayer(4 as Layer),
  };
  const place = (id: string, layer: number, hand: CardID[]) => ({
    ...base.players[id]!,
    currentLayer: layer as Layer,
    hand,
  });
  return {
    ...base,
    layers,
    players: {
      p1: place('p1', 3, [SHOOT, KICK]),
      pM: place('pM', 3, [KICK, UNLOCK, UNLOCK]),
      p2: place('p2', 2, [KICK]),
      p3: place('p3', 1, [KICK]),
      p4: place('p4', 1, [KICK]),
    },
  };
}

function step(
  s: MatchState<SetupState>,
  playerID: string,
  move: string,
  args: unknown[] = [],
  roll = 1,
) {
  const res = applyMove(game, s, { playerID, move, args }, { random: fixedRandom(roll) });
  expect(res.ok).toBe(true);
  if (!res.ok) throw new Error(`${move} 被拒绝`);
  return res.state;
}

describe('梦主迷失层复活的落点', () => {
  it('在第 3 层被击杀，下一个自己的回合开始时回到第 3 层，存活且手牌不变', () => {
    let s = step(load(scene()), 'p1', 'playShoot', ['pM', SHOOT]);
    const lost = s.G.players.pM!;
    expect(lost.isAlive).toBe(false);
    expect(lost.currentLayer).toBe(0);
    expect(lost.layerBeforeLimbo).toBe(3);
    const handAtDeath = lost.hand;
    s = step(s, 'p1', 'endActionPhase');
    s = step(s, 'p1', 'skipDiscard');
    expect(s.ctx.currentPlayer).toBe('pM');
    const master = s.G.players.pM!;
    expect(master.isAlive).toBe(true);
    expect(master.deathTurn).toBeNull();
    expect(master.currentLayer).toBe(3);
    expect(master.hand).toEqual(handAtDeath);
    expect(master.layerBeforeLimbo).toBeNull();
    expect(s.G.layers[3]!.playersInLayer).toContain('pM');
    expect(s.G.layers[0]?.playersInLayer ?? []).not.toContain('pM');
    expect(checkStateInvariants(s.G)).toEqual([]);
  });

  it('非击杀途径从第 2 层进入迷失层，同样回到第 2 层', () => {
    let G = scene();
    G = {
      ...G,
      layers: {
        ...G.layers,
        3: { ...G.layers[3]!, playersInLayer: ['p1'] },
        2: { ...G.layers[2]!, playersInLayer: ['p2', 'pM'] },
      },
      players: { ...G.players, pM: { ...G.players.pM!, currentLayer: 2 as Layer } },
    };
    G = sendToLimbo(G, 'pM');
    expect(G.players.pM!.layerBeforeLimbo).toBe(2);
    let s = step(load(G), 'p1', 'endActionPhase');
    s = step(s, 'p1', 'skipDiscard');
    expect(s.G.players.pM!.isAlive).toBe(true);
    expect(s.G.players.pM!.currentLayer).toBe(2);
  });

  it('没有记录时回落第 1 层', () => {
    let G = sendToLimbo(scene(), 'pM');
    G = { ...G, players: { ...G.players, pM: { ...G.players.pM!, layerBeforeLimbo: null } } };
    let s = step(load(G), 'p1', 'endActionPhase');
    s = step(s, 'p1', 'skipDiscard');
    expect(s.G.players.pM!.currentLayer).toBe(1);
  });

  it('梦魇送进迷失层的盗梦者记下来源层', () => {
    const G = sendToLimbo(scene(), 'p2');
    expect(G.players.p2!.layerBeforeLimbo).toBe(2);
  });

  it('其他复活入口复活后清空该记录', () => {
    // 盗梦者自己的回合复活自己：落点仍是第 1 层，记录清空
    let G = sendToLimbo(scene(), 'p2');
    G = {
      ...G,
      currentPlayerID: 'p2',
      turnNumber: 6,
      players: { ...G.players, p2: { ...G.players.p2!, hand: [KICK, KICK] } },
    };
    const s = step(load(G), 'p2', 'playRevive', [null, [KICK, KICK]]);
    expect(s.G.players.p2!.isAlive).toBe(true);
    expect(s.G.players.p2!.layerBeforeLimbo).toBeNull();
  });
});

describe('梦主迷失层复活的落点：边界与各条入迷失层的路径', () => {
  /** p1 的回合结束，轮到梦主，返回梦主回合开始后的状态 */
  function toMasterTurn(G: SetupState): MatchState<SetupState> {
    let s = step(load(G), 'p1', 'endActionPhase');
    s = step(s, 'p1', 'skipDiscard');
    expect(s.ctx.currentPlayer).toBe('pM');
    return s;
  }

  function masterAt(layer: 1 | 2 | 3 | 4): SetupState {
    const base = scene();
    const layers = { ...base.layers };
    for (const l of [1, 2, 3, 4] as const) {
      layers[l] = {
        ...layers[l]!,
        playersInLayer: layers[l]!.playersInLayer.filter((id) => id !== 'pM'),
      };
    }
    layers[layer] = { ...layers[layer]!, playersInLayer: [...layers[layer]!.playersInLayer, 'pM'] };
    return {
      ...base,
      layers,
      players: { ...base.players, pM: { ...base.players.pM!, currentLayer: layer as Layer } },
    };
  }

  it.each([1, 4] as const)('在第 %i 层进入迷失层，回合开始回到第 %i 层', (layer) => {
    const G = sendToLimbo(masterAt(layer), 'pM');
    expect(G.players.pM!.layerBeforeLimbo).toBe(layer);
    const s = toMasterTurn(G);
    expect(s.G.players.pM!.currentLayer).toBe(layer);
    expect(s.G.layers[layer]!.playersInLayer).toContain('pM');
    expect(checkStateInvariants(s.G)).toEqual([]);
  });

  it('经 movePlayerToLayer 移向迷失层与被击杀一样记下来源层', () => {
    const moved = movePlayerToLayer(masterAt(2), 'pM', 0);
    expect(moved.players.pM!.layerBeforeLimbo).toBe(2);
    const killed = killPlayer(masterAt(4), 'pM', 'p1');
    expect(killed.players.pM!.layerBeforeLimbo).toBe(4);
  });

  it('已经在迷失层时再次进入迷失层不会冲掉来源层', () => {
    const once = sendToLimbo(masterAt(3), 'pM');
    const twice = sendToLimbo(movePlayerToLayer(once, 'pM', 0), 'pM');
    expect(twice.players.pM!.layerBeforeLimbo).toBe(3);
    expect(toMasterTurn(twice).G.players.pM!.currentLayer).toBe(3);
  });

  it('复活不弃牌：手牌张数与弃牌堆都不变', () => {
    const G = sendToLimbo(masterAt(3), 'pM');
    const s = toMasterTurn(G);
    expect(s.G.players.pM!.hand).toEqual(G.players.pM!.hand);
  });

  it('要塞·冷酷：回合开始的这次复活不产生发动机会', () => {
    let G = sendToLimbo(masterAt(3), 'pM');
    G = {
      ...G,
      players: { ...G.players, pM: { ...G.players.pM!, characterId: c('dm_fortress') } },
    };
    const s = toMasterTurn(G);
    const master = s.G.players.pM!;
    expect(master.currentLayer).toBe(3);
    expect(fortressColdnessChancesLeft(master.skillUsedThisTurn)).toBe(0);
    // 出牌阶段里真的换一次层才有机会：对照组
    expect(s.G.turnPhase).toBe('draw');
  });
});
