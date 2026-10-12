// Bot 出牌相关测试的局面：回合主人是一名盗梦者，处在出牌阶段、手里有【解封】、所在层心锁大于 0。
// 在真实建局产物上改写，保证结构与引擎一致。

import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type MatchState } from '@icgame/game-engine/runner';
import type { CardID, Layer } from '@icgame/shared';

export interface ThiefActionTurn {
  state: MatchState<SetupState>;
  /** 回合主人（盗梦者） */
  actor: string;
  master: string;
}

/** 土星·领地局里每张出牌都要先问梦主，这里要的是普通梦主 */
const SATURN = 'dm_saturn_territory';

export function thiefActionTurn(numPlayers = 5): ThiefActionTurn {
  for (let i = 0; i < 40; i++) {
    const seed = `bot-turn-${i}`;
    const created = createMatch(InceptionCityGame, {
      numPlayers,
      setupData: { rngSeed: seed },
      seed,
    });
    const done = applyMove(InceptionCityGame, created, {
      playerID: created.ctx.currentPlayer,
      move: 'completeSetup',
      args: [],
    });
    if (!done.ok) throw new Error('completeSetup 被拒绝');
    const s = done.state;
    const master = s.G.dreamMasterID;
    if (s.G.players[master]?.characterId === SATURN) continue;
    const actor = s.G.playerOrder.find((id) => id !== master)!;

    const players = { ...s.G.players };
    for (const id of s.G.playerOrder) {
      players[id] = { ...players[id]!, hand: [], currentLayer: 1 as Layer };
    }
    players[actor] = { ...players[actor]!, hand: ['action_unlock'] as CardID[] };
    const layers = { ...s.G.layers };
    for (const n of [1, 2, 3, 4] as const) {
      layers[n] = {
        ...layers[n]!,
        heartLockValue: 3,
        playersInLayer: s.G.playerOrder.filter((id) => players[id]!.currentLayer === n),
      };
    }
    return {
      state: {
        ...s,
        G: {
          ...s.G,
          players,
          layers,
          currentPlayerID: actor,
          turnPhase: 'action',
          unlockThisTurn: 0,
          playedCardsThisTurn: [],
        },
        ctx: { ...s.ctx, currentPlayer: actor, playOrderPos: s.ctx.playOrder.indexOf(actor) },
      },
      actor,
      master,
    };
  }
  throw new Error('找不到合适的种子');
}

/**
 * 盗梦者打出解封后的响应窗口，且除梦主外的响应者都已响应：下一个响应的是梦主，梦主手里有解封。
 */
export function unlockWindowForMaster(numPlayers = 5): {
  state: MatchState<SetupState>;
  actor: string;
  master: string;
} {
  const { state, actor, master } = thiefActionTurn(numPlayers);
  const withHand: MatchState<SetupState> = {
    ...state,
    G: {
      ...state.G,
      players: {
        ...state.G.players,
        [master]: { ...state.G.players[master]!, hand: ['action_unlock'] as CardID[] },
      },
    },
  };
  const played = applyMove(InceptionCityGame, withHand, {
    playerID: actor,
    move: 'playUnlock',
    args: ['action_unlock'],
  });
  if (!played.ok) throw new Error('playUnlock 被拒绝');
  const w = played.state.G.pendingResponseWindow;
  if (!w) throw new Error('没有打开响应窗口');
  const open = {
    ...played.state,
    G: {
      ...played.state.G,
      pendingResponseWindow: { ...w, responded: w.responders.filter((id) => id !== master) },
    },
  };
  return { state: open, actor, master };
}
