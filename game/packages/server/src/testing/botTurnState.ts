// Bot 出牌相关测试的局面：回合主人是一名盗梦者，处在出牌阶段、手里有【解封】、所在层心锁大于 0。
// 在真实建局产物上改写，保证结构与引擎一致。

import { InceptionCityGame, sendToLimbo } from '@icgame/game-engine';
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

/** 回合主人是迷失层里的盗梦者，手里有 2 张不会打的牌：出牌阶段能复活自己 */
export function limboThiefTurn(): ThiefActionTurn {
  const base = thiefActionTurn();
  let G = sendToLimbo(base.state.G, base.actor);
  G = {
    ...G,
    players: {
      ...G.players,
      [base.actor]: {
        ...G.players[base.actor]!,
        hand: ['action_kick', 'action_graft'] as CardID[],
      },
    },
  };
  return { ...base, state: { ...base.state, G } };
}

/** 回合主人是梦主（第 1 层），唯一存活的盗梦者在第 4 层：出牌阶段梦主会朝它走一步 */
export function masterMoveTurn(): ThiefActionTurn {
  const base = thiefActionTurn();
  const { master, actor } = base;
  let G = base.state.G;
  for (const id of G.playerOrder) {
    if (id !== master && id !== actor) G = sendToLimbo(G, id);
  }
  const players = { ...G.players };
  players[master] = { ...players[master]!, currentLayer: 1 as Layer, hand: [] };
  players[actor] = { ...players[actor]!, currentLayer: 4 as Layer, hand: [] };
  const layers = { ...G.layers };
  for (const n of [1, 2, 3, 4] as const) {
    layers[n] = {
      ...layers[n]!,
      playersInLayer: G.playerOrder.filter((id) => players[id]!.currentLayer === n),
    };
  }
  G = { ...G, players, layers, currentPlayerID: master };
  return {
    state: {
      ...base.state,
      G,
      ctx: {
        ...base.state.ctx,
        currentPlayer: master,
        playOrderPos: base.state.ctx.playOrder.indexOf(master),
      },
    },
    actor: master,
    master,
  };
}
