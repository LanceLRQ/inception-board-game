// 固定场景的构造：真实建局 + 一组确定的局面调整 + 引擎自己的视角过滤。
//
// 流程：
//   1. 用固定种子经运行器建局并完成开局布置（角色、金库、梦魇、贿赂池、牌库都是引擎发出的）；
//   2. 在完整状态上调整局面：谁回合、手牌（从真实牌库里取出，不凭空造牌）、所处层、翻开情况；
//   3. 带待应答窗口的场景，由回合主人真的打出【解封】，窗口由引擎打开；
//   4. 交给运行器的 viewMatch（引擎的视图钩子）得到本人座位看到的视图。
// 界面拿到的只有第 4 步的结果：他人手牌、牌库顺序、未开金库内容都已被引擎过滤掉。

import {
  InceptionCityGame,
  applyMove,
  createMatch,
  viewMatch,
  type GameDef,
  type MatchState,
  type MatchViewState,
  type SeatInfo,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import type { CardID, Layer } from '@icgame/shared';
import { FIXTURE_DEFAULT_PLAYERS, type FixtureScenarioId } from './scenarios';

const game: GameDef<SetupState> = InceptionCityGame;

const FIXTURE_SEED = 'fixture-scene';
const FIXTURE_TURN_NUMBER = 5;

/** 解封响应窗口场景里，回合主人打出的牌 */
const UNLOCK_CARD = 'action_unlock' as CardID;

/** 非本人的盗梦者按顺序占用的层与是否已翻开（第 0 名盗梦者可能是本人，同样按此表落位） */
const THIEF_LAYOUT: ReadonlyArray<{ layer: Layer; revealed: boolean }> = [
  { layer: 2, revealed: false },
  { layer: 2, revealed: true },
  { layer: 1, revealed: false },
  { layer: 3, revealed: true },
  { layer: 1, revealed: false },
];
const MASTER_LAYER: Layer = 3;
/**
 * 固定场景里的梦主角色：没有回合内主动技能面板的梦主，
 * 免得开局随机到的梦主（例如棋局）在轮到本人时自动弹出技能选择，盖住整个界面。
 */
const PLAIN_MASTER = 'dm_neptune_ocean' as CardID;

const cards = (...ids: string[]): CardID[] => ids as CardID[];

export interface FixtureScenario {
  readonly id: FixtureScenarioId;
  /** 人数 */
  readonly players: number;
  /** 本人座位 */
  readonly seat: string;
  /** 本人座位看到的视图（引擎过滤后的结果） */
  readonly view: MatchViewState;
  /** 座位表：除本人外都显示为 Bot，都在线 */
  readonly seats: SeatInfo[];
}

/** 完成开局布置后的对局状态 */
function startedMatch(players: number): MatchState<SetupState> {
  const created = createMatch(game, {
    numPlayers: players,
    setupData: { rngSeed: FIXTURE_SEED },
    seed: FIXTURE_SEED,
  });
  const res = applyMove(game, created, {
    playerID: created.ctx.currentPlayer,
    move: 'completeSetup',
    args: [],
  });
  if (!res.ok) throw new Error(`固定场景建局失败：completeSetup 被拒绝（${res.reason}）`);
  return res.state;
}

/** 从牌库里取出指定的牌放进某人手牌；牌库里没有就说明场景写错了 */
function dealSpecific(G: SetupState, seat: string, wanted: CardID[]): SetupState {
  const deck = [...G.deck.cards];
  for (const card of wanted) {
    const at = deck.indexOf(card);
    if (at < 0) throw new Error(`固定场景发牌失败：牌库里没有 ${card}`);
    deck.splice(at, 1);
  }
  const player = G.players[seat]!;
  return {
    ...G,
    deck: { ...G.deck, cards: deck },
    players: { ...G.players, [seat]: { ...player, hand: [...player.hand, ...wanted] } },
  };
}

/** 从牌库顶摸若干张给某人 */
function dealTop(G: SetupState, seat: string, count: number): SetupState {
  return dealSpecific(G, seat, G.deck.cards.slice(0, count));
}

/** 牌库顶若干张进弃牌堆 */
function discardTop(G: SetupState, count: number): SetupState {
  return {
    ...G,
    deck: {
      cards: G.deck.cards.slice(count),
      discardPile: [...G.deck.discardPile, ...G.deck.cards.slice(0, count)],
    },
  };
}

/** 摆好各人所处的层，并重建各层的人员名单 */
function placePlayers(
  G: SetupState,
  placement: Record<string, { layer: Layer; revealed: boolean }>,
): SetupState {
  const players = { ...G.players };
  for (const [seat, spot] of Object.entries(placement)) {
    players[seat] = {
      ...players[seat]!,
      currentLayer: spot.layer,
      isRevealed: players[seat]!.isRevealed || spot.revealed,
    };
  }
  const layers: SetupState['layers'] = {};
  for (const [key, layer] of Object.entries(G.layers)) {
    layers[Number(key)] = {
      ...layer,
      playersInLayer: G.playerOrder.filter((id) => players[id]!.currentLayer === layer.layer),
    };
  }
  return { ...G, players, layers };
}

/** 回合交给某人：行动阶段、固定回合数 */
function giveTurn(
  state: MatchState<SetupState>,
  G: SetupState,
  seat: string,
): MatchState<SetupState> {
  const turnShift = FIXTURE_TURN_NUMBER - G.turnNumber;
  return {
    ...state,
    G: {
      ...G,
      turnPhase: 'action',
      turnNumber: FIXTURE_TURN_NUMBER,
      currentPlayerID: seat,
      unlockThisTurn: 0,
    },
    ctx: {
      ...state.ctx,
      currentPlayer: seat,
      playOrderPos: state.ctx.playOrder.indexOf(seat),
      turn: state.ctx.turn + turnShift,
    },
  };
}

const isMasterScenario = (id: FixtureScenarioId): boolean =>
  id === 'master' || id === 'master-pending';
const isPendingScenario = (id: FixtureScenarioId): boolean =>
  id === 'thief-pending' || id === 'master-pending';

/**
 * 场景的完整对局状态（只在服务端与测试里应当出现的那种）和本人座位。
 * 界面不会拿到它，只会拿到 buildFixtureScenario 过滤后的视图。
 */
export function buildFixtureMatch(
  id: FixtureScenarioId,
  players: number = FIXTURE_DEFAULT_PLAYERS,
): {
  state: MatchState<SetupState>;
  viewer: string;
} {
  const base = startedMatch(players);
  const master = base.G.dreamMasterID;
  const thieves = base.G.playerOrder.filter((seat) => seat !== master);
  const viewer = isMasterScenario(id) ? master : thieves[0]!;
  // 待应答场景里由第二名盗梦者当回合主人；其余场景轮到本人
  const actor = isPendingScenario(id) ? thieves[1]! : viewer;

  // 发牌：先给指定的牌，再给其余人摸牌；他们的牌张数各不相同
  let G = base.G;
  G = dealSpecific(
    G,
    viewer,
    isMasterScenario(id)
      ? cards('action_kick', 'action_dream_peek', UNLOCK_CARD)
      : cards('action_shoot', UNLOCK_CARD, 'action_dream_transit', 'action_kick'),
  );
  if (actor !== viewer) G = dealSpecific(G, actor, cards(UNLOCK_CARD, 'action_kick'));
  const others = G.playerOrder.filter((seat) => seat !== viewer && seat !== actor);
  others.forEach((seat, i) => {
    G = dealTop(G, seat, 2 + (i % 3));
  });
  G = discardTop(G, 2);

  // 落位：梦主在第 3 层，盗梦者分散在 1–3 层，有人已翻开
  const placement: Record<string, { layer: Layer; revealed: boolean }> = {
    [master]: { layer: MASTER_LAYER, revealed: true },
  };
  thieves.forEach((seat, i) => {
    placement[seat] = THIEF_LAYOUT[i % THIEF_LAYOUT.length]!;
  });
  G = placePlayers(G, placement);
  G = {
    ...G,
    players: { ...G.players, [master]: { ...G.players[master]!, characterId: PLAIN_MASTER } },
  };

  let state = giveTurn(base, G, actor);

  if (isPendingScenario(id)) {
    const played = applyMove(game, state, {
      playerID: actor,
      move: 'playUnlock',
      args: [UNLOCK_CARD],
    });
    if (!played.ok) throw new Error(`固定场景出牌失败：playUnlock 被拒绝（${played.reason}）`);
    state = played.state;
  }
  return { state, viewer };
}

/** 视图里取玩家昵称；取不到就退回座位号 */
function nicknameIn(view: MatchViewState, seat: string): string {
  const players = (view.G as { players?: Record<string, { nickname?: unknown }> }).players;
  const nick = players?.[seat]?.nickname;
  return typeof nick === 'string' && nick ? nick : seat;
}

export function buildFixtureScenario(
  id: FixtureScenarioId,
  players: number = FIXTURE_DEFAULT_PLAYERS,
): FixtureScenario {
  const { state, viewer } = buildFixtureMatch(id, players);
  const view = viewMatch(game, state, viewer);
  const seats: SeatInfo[] = view.ctx.playOrder.map((seat) => ({
    seat,
    nickname: nicknameIn(view, seat),
    isBot: seat !== viewer,
    connected: true,
    takenOver: false,
  }));
  return { id, players, seat: viewer, view, seats };
}
