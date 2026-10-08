// 处女·完美「复活一位玩家」：不限阵营，落在处女所在层，被复活者的手牌保留。
// 全部经对局运行器驱动真实 move。
// 对照：docs/manual/05-dream-thieves.md 处女；docs/manual/08-appendix.md 盗梦十诫（复活他人移动到自己所在层）

import { describe, it, expect } from 'vitest';
import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from './game.js';
import type { SetupState } from './setup.js';
import { createTestState } from './testing/fixtures.js';
import { sendToLimbo } from './engine/death.js';
import { checkStateInvariants } from './engine/stateInvariants.js';
import {
  applyMove,
  matchFromSnapshot,
  type GameDef,
  type MatchState,
} from './runner/matchRunner.js';

const game: GameDef<SetupState> = InceptionCityGame;
const c = (id: string) => id as CardID;
const KICK = c('action_kick');
const UNLOCK = c('action_unlock');

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

/** p1 是第 3 层的处女，deadID 已在迷失层并带着手牌，等待处女应答 */
function scene(deadID: string): SetupState {
  const base = createTestState({
    phase: 'playing',
    turnPhase: 'action',
    turnNumber: 5,
    currentPlayerID: 'p1',
    dreamMasterID: 'pM',
    deck: { cards: Array<CardID>(10).fill(KICK), discardPile: [] },
  });
  const layers = { ...base.layers };
  layers[1] = { ...layers[1]!, playersInLayer: ['p2', 'p3', 'p4', 'pM'] };
  layers[3] = { ...layers[3]!, playersInLayer: ['p1'] };
  const G: SetupState = {
    ...base,
    layers,
    players: {
      ...base.players,
      p1: {
        ...base.players.p1!,
        characterId: c('thief_virgo'),
        currentLayer: 3 as Layer,
        hand: [KICK],
      },
      [deadID]: { ...base.players[deadID]!, hand: [KICK, UNLOCK, UNLOCK] },
    },
    pendingVirgoChoice: { virgoID: 'p1', triggerRoll: 6, shooterID: 'p2' },
  };
  return sendToLimbo(G, deadID);
}

function revive(deadID: string) {
  const G = scene(deadID);
  const res = applyMove(game, load(G), {
    playerID: 'p1',
    move: 'respondVirgoPerfect',
    args: ['revive', { targetID: deadID }],
  });
  return { G, res };
}

function totalCards(G: SetupState): number {
  return (
    Object.values(G.players).reduce((n, p) => n + p.hand.length, 0) +
    G.deck.cards.length +
    G.deck.discardPile.length +
    G.removedFromGame.length
  );
}

describe('处女·完美：复活一位玩家', () => {
  it('可以复活梦主阵营的死亡玩家', () => {
    const { res } = revive('pM');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.pM!.isAlive).toBe(true);
    expect(res.state.G.players.pM!.deathTurn).toBeNull();
  });

  it('可以复活盗梦者，落点是处女所在层', () => {
    const { res } = revive('p3');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const G = res.state.G;
    expect(G.players.p3!.isAlive).toBe(true);
    expect(G.players.p3!.currentLayer).toBe(3);
    expect(G.layers[3]!.playersInLayer).toContain('p3');
    expect(G.layers[0]?.playersInLayer ?? []).not.toContain('p3');
    expect(G.pendingVirgoChoice).toBeNull();
  });

  it('被复活者的手牌原样保留，牌的总数守恒', () => {
    const { G, res } = revive('p3');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.G.players.p3!.hand).toEqual([KICK, UNLOCK, UNLOCK]);
    expect(totalCards(res.state.G)).toBe(totalCards(G));
    expect(checkStateInvariants(res.state.G)).toEqual([]);
  });

  it('处女自己在迷失层时不能发动', () => {
    const lost = sendToLimbo(scene('p3'), 'p1');
    const res = applyMove(game, load(lost), {
      playerID: 'p1',
      move: 'respondVirgoPerfect',
      args: ['revive', { targetID: 'p3' }],
    });
    expect(res.ok).toBe(false);
  });
});

describe('处女·完美：复活的对象与落点的补充边界', () => {
  it('复活梦主时落在处女所在层，梦主的来源层记录清空，手牌保留', () => {
    const { res } = revive('pM');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const master = res.state.G.players.pM!;
    expect(master.currentLayer).toBe(3);
    expect(master.layerBeforeLimbo).toBeNull();
    expect(master.hand).toEqual([KICK, UNLOCK, UNLOCK]);
    expect(res.state.G.layers[3]!.playersInLayer).toContain('pM');
    expect(checkStateInvariants(res.state.G)).toEqual([]);
  });

  it('活着的玩家和处女自己都不能作为复活对象', () => {
    for (const targetID of ['p2', 'p1']) {
      const res = applyMove(game, load(scene('p3')), {
        playerID: 'p1',
        move: 'respondVirgoPerfect',
        args: ['revive', { targetID }],
      });
      expect(res.ok, targetID).toBe(false);
    }
  });

  it('不带目标的复活被拒绝，待应答状态保留', () => {
    const res = applyMove(game, load(scene('p3')), {
      playerID: 'p1',
      move: 'respondVirgoPerfect',
      args: ['revive'],
    });
    expect(res.ok).toBe(false);
  });
});
