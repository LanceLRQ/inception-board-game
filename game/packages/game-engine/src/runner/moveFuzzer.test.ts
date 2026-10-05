// 模糊器：替谁出招

import { describe, it, expect } from 'vitest';
import { InceptionCityGame } from '../game.js';
import type { SetupState } from '../setup.js';
import { applyMove, createMatch, type GameDef, type MatchState } from './matchRunner.js';
import { makeTestRng, pickLegalMove } from './moveFuzzer.js';

const game: GameDef<SetupState> = InceptionCityGame;

/** 回合主人之外的玩家被要求结算嫁接：手里有 3 张牌 */
function graftPending(): { state: MatchState<SetupState>; owner: string; target: string } {
  const s = createMatch(game, { numPlayers: 5, setupData: { rngSeed: 'f' }, seed: 'f' });
  const done = applyMove(game, s, { playerID: '0', move: 'completeSetup', args: [] });
  if (!done.ok) throw new Error('completeSetup 被拒绝');
  const base = done.state;
  const owner = base.ctx.currentPlayer;
  const target = base.ctx.playOrder.find((id) => id !== owner)!;
  const player = base.G.players[target]!;
  const state: MatchState<SetupState> = {
    ...base,
    G: {
      ...base.G,
      turnPhase: 'action',
      players: {
        ...base.G.players,
        [target]: { ...player, hand: ['action_shoot', 'action_kick', 'action_unlock'] },
      },
      pendingGraft: { playerID: target },
    },
  };
  return { state, owner, target };
}

describe('pickLegalMove · 替谁出招', () => {
  it('默认替所有有行动权的玩家出招：回合外的结算者也会被选中', () => {
    const { state, target } = graftPending();
    const cand = pickLegalMove(game, state, makeTestRng(1));
    expect(cand?.move).toBe('resolveGraft');
    expect(cand?.playerID).toBe(target);
  });

  it('ownerOnly 时只替回合主人试，回合主人被挡住就找不到合法 move', () => {
    const { state } = graftPending();
    expect(pickLegalMove(game, state, makeTestRng(1), { ownerOnly: true })).toBeNull();
  });

  it('actors 限定发起者名单', () => {
    const { state, owner, target } = graftPending();
    expect(pickLegalMove(game, state, makeTestRng(1), { actors: [owner] })).toBeNull();
    expect(pickLegalMove(game, state, makeTestRng(1), { actors: [target] })?.playerID).toBe(target);
  });

  it('没有待结算时只替回合主人出招', () => {
    const { state, owner } = graftPending();
    const clean: MatchState<SetupState> = { ...state, G: { ...state.G, pendingGraft: null } };
    for (let i = 1; i <= 10; i++) {
      expect(pickLegalMove(game, clean, makeTestRng(i))?.playerID).toBe(owner);
    }
  });
});
