// 出牌策略相关测试的局面构造：在真实建局产物上改写座位、手牌与心锁，保证结构与引擎一致。
// 仅供测试使用，不从包入口导出。

import type { CardID, Layer } from '@icgame/shared';
import { InceptionCityGame } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, createMatch, type GameDef, type MatchState } from '@icgame/game-engine/runner';

export const game: GameDef<SetupState> = InceptionCityGame;

const SATURN = 'dm_saturn_territory';

export type State = MatchState<SetupState>;

export interface SceneSeat {
  layer: number;
  hand: string[];
}

export interface SceneOptions {
  numPlayers?: number;
  seed?: string;
  /** 回合主人，必须是对局里的玩家 */
  actor: 'master' | number;
  /** 按 playerOrder 里的盗梦者序号（0 起）或 'master' 指定座位；没写的座位保持原样但清空手牌 */
  seats: Record<string, SceneSeat>;
  /** 各层心锁，缺省 3 */
  locks?: Partial<Record<1 | 2 | 3 | 4, number>>;
}

/** 座位别名：'master' 或盗梦者序号（'t0'、't1'…）换成真实玩家 ID */
export function seatIds(G: SetupState): { master: string; thieves: string[] } {
  return {
    master: G.dreamMasterID,
    thieves: G.playerOrder.filter((id) => id !== G.dreamMasterID),
  };
}

function resolveSeat(G: SetupState, alias: string): string {
  const { master, thieves } = seatIds(G);
  if (alias === 'master') return master;
  const m = /^t(\d+)$/.exec(alias);
  const id = m ? thieves[Number(m[1])] : undefined;
  if (id === undefined) throw new Error(`座位别名无效：${alias}`);
  return id;
}

function startedMatch(numPlayers: number, seed: string): State {
  const created = createMatch(game, { numPlayers, setupData: { rngSeed: seed }, seed });
  const done = applyMove(game, created, {
    playerID: created.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!done.ok) throw new Error('completeSetup 被拒绝');
  return done.state;
}

/** 进入布置完成后的出牌阶段，回合主人为 actor */
export function actionScene(options: SceneOptions): State {
  const numPlayers = options.numPlayers ?? 5;
  let seed = options.seed ?? 'play-scene';
  let s = startedMatch(numPlayers, seed);
  // 土星·领地局里每张出牌都要先问梦主，会让局面多出一个待应答窗口；这里的场景要的是普通梦主
  for (let i = 0; i < 20 && s.G.players[s.G.dreamMasterID]?.characterId === SATURN; i++) {
    seed = `${seed}-r`;
    s = startedMatch(numPlayers, seed);
  }

  const { master, thieves } = seatIds(s.G);
  const actorID = options.actor === 'master' ? master : thieves[options.actor]!;

  const players = { ...s.G.players };
  for (const id of s.G.playerOrder) {
    players[id] = { ...players[id]!, hand: [], currentLayer: 1 as Layer };
  }
  for (const [alias, seat] of Object.entries(options.seats)) {
    const id = resolveSeat(s.G, alias);
    players[id] = {
      ...players[id]!,
      hand: seat.hand as CardID[],
      currentLayer: seat.layer as Layer,
    };
  }
  const layers: SetupState['layers'] = { ...s.G.layers };
  for (const n of [1, 2, 3, 4] as const) {
    layers[n] = {
      ...layers[n]!,
      heartLockValue: options.locks?.[n] ?? 3,
      playersInLayer: s.G.playerOrder.filter((id) => players[id]!.currentLayer === n),
    };
  }
  const G: SetupState = {
    ...s.G,
    players,
    layers,
    currentPlayerID: actorID,
    turnPhase: 'action',
    unlockThisTurn: 0,
    playedCardsThisTurn: [],
  };
  return {
    ...s,
    G,
    ctx: { ...s.ctx, currentPlayer: actorID, playOrderPos: s.ctx.playOrder.indexOf(actorID) },
  };
}
