// 当前状态下应当自动执行的下一步（面向对局运行器状态的纯函数）
//
// 把「待结算事项该由谁、用哪个 move 收尾」与「Bot 回合怎么出牌」统一成一个判定：
// 调用方（本地对局 Worker、全 Bot 对局回归）循环调用它，再交给运行器执行即可。

import { InceptionCityGame, viewFor } from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine/setup';
import { applyMove, type GameDef, type MatchState } from '@icgame/game-engine/runner';
import { MAX_PLAYS_PER_TURN, planActionPlays, planResponses } from './actionPolicy.js';
import { legalMovesFor } from './moveTables.js';
import { defaultArgsFor, pickBotMove } from './botMoves.js';

export interface AutoAction {
  /** 以谁的名义发起 */
  playerID: string;
  move: string;
  args: unknown[];
  /** 给日志看的简短说明 */
  why: string;
}

const game: GameDef<SetupState> = InceptionCityGame;

export interface AutoActionOptions {
  /** 由真人操作的玩家；轮到他们决定时返回 null */
  humanPlayerIDs: readonly string[];
  /**
   * 按 Bot 策略行动的座位：自己回合的出牌阶段打行动牌，回合外应答解封响应窗口与土星·律令；
   * 缺省不列任何座位（行动阶段只结束出牌，应答一律放弃 / 放过）。
   * 只应列真正的 Bot 座位：超时代发、挂机托管的真人座位不要列入。
   */
  policySeatIDs?: readonly string[];
  /** 一个 Bot 一回合最多打出的行动牌张数，缺省 MAX_PLAYS_PER_TURN */
  maxPlaysPerTurn?: number;
}

/**
 * 按策略给出的候选顺序，用运行器试跑，取第一个被接受的。
 * 试跑只用「接受 / 拒绝」一位信息，不看试跑后的状态；没有候选或都被拒绝返回 null。
 */
function firstAccepted(
  state: MatchState<SetupState>,
  botID: string,
  plans: readonly { move: string; args: unknown[]; why: string }[],
  label: string,
): AutoAction | null {
  for (const plan of plans) {
    const outcome = applyMove(game, state, { playerID: botID, move: plan.move, args: plan.args });
    if (outcome.ok) {
      return {
        playerID: botID,
        move: plan.move,
        args: plan.args,
        why: `Bot ${botID} ${label} · ${plan.why}`,
      };
    }
  }
  return null;
}

/**
 * 回合外应答：按应答策略的候选顺序试跑，取第一个被接受的；没有候选或都被拒绝返回 null，
 * 调用方回到放弃 / 放过。
 */
function pickResponse(state: MatchState<SetupState>, botID: string): AutoAction | null {
  const view = viewFor(state.G, botID, { gameOver: false });
  return firstAccepted(state, botID, planResponses(view, botID), '应答');
}

/** 出牌阶段的 Bot 出牌，受每回合张数上限约束 */
function pickPlay(
  state: MatchState<SetupState>,
  botID: string,
  maxPlays: number,
): AutoAction | null {
  const { G } = state;
  if (G.playedCardsThisTurn.length >= maxPlays) return null;
  const view = viewFor(G, botID, { gameOver: false });
  return firstAccepted(state, botID, planActionPlays(view, botID), '出牌');
}

/** 当前状态下应当自动执行的下一步；该等真人、对局已结束、或无事可做时返回 null */
export function nextAutoAction(
  state: MatchState<SetupState>,
  options: AutoActionOptions,
): AutoAction | null {
  const { G, ctx } = state;
  const isHuman = (id: string): boolean => options.humanPlayerIDs.includes(id);
  const owner = ctx.currentPlayer;

  // 对局已结束
  if (ctx.gameover !== undefined) return null;

  // 布置阶段：由回合主人完成布置
  if (ctx.phase === 'setup') {
    return { playerID: owner, move: 'completeSetup', args: [], why: '完成布置，进入对局' };
  }

  // 响应窗口：取第一个还没响应的响应者，由响应者本人发；按策略行动的 Bot 座位可能抵消，其余一律放弃
  const window = G.pendingResponseWindow;
  if (window) {
    const next = window.responders.find((id) => !window.responded.includes(id));
    if (next !== undefined) {
      if (isHuman(next)) return null;
      if (options.policySeatIDs?.includes(next)) {
        const cancel = pickResponse(state, next);
        if (cancel !== null) return cancel;
      }
      return {
        playerID: next,
        move: 'passResponse',
        args: [],
        why: `响应者 ${next} 放弃响应`,
      };
    }
  }

  // 梦境窥视：梦主决定是否派贿赂牌，Bot 梦主一律不派，避免白白消耗贿赂池
  if (G.pendingPeekDecision) {
    if (isHuman(G.dreamMasterID)) return null;
    return {
      playerID: G.dreamMasterID,
      move: 'masterPeekBribeDecision',
      args: [false],
      why: `梦主 ${G.dreamMasterID} 不派贿赂牌`,
    };
  }

  // 金币金库打开：梦主三选一。Bot 梦主池里有可派的牌就派贿赂牌（并弃掉该层梦魇），池空了就弃掉梦魇；
  // 不主动发动梦魇，避免需要附加参数的效果出错而卡住对局。梦主是真人就等他选择。
  if (G.pendingVaultDecision) {
    if (isHuman(G.dreamMasterID)) return null;
    const canDeal = G.bribePool.some((b) => b.status === 'inPool');
    return {
      playerID: G.dreamMasterID,
      move: 'masterVaultDecision',
      args: [canDeal ? 'bribe' : 'discard'],
      why: canDeal ? `梦主 ${G.dreamMasterID} 派贿赂牌` : `梦主 ${G.dreamMasterID} 弃掉梦魇`,
    };
  }

  // 梦境窥视：看牌者确认
  if (G.peekReveal) {
    const { peekerID } = G.peekReveal;
    if (isHuman(peekerID)) return null;
    return { playerID: peekerID, move: 'peekerAcknowledge', args: [], why: `${peekerID} 确认看牌` };
  }

  // 天秤：分牌由被要求分牌的目标发，挑牌由发动者发；轮到真人就等他操作，Bot 以本人的名义代答。
  const libra = G.pendingLibra;
  if (libra) {
    if (!libra.split) {
      if (isHuman(libra.targetPlayerID)) return null;
      return {
        playerID: libra.targetPlayerID,
        move: 'resolveLibraSplit',
        args: defaultArgsFor('resolveLibraSplit', G, libra.targetPlayerID),
        why: `代 ${libra.targetPlayerID} 分牌`,
      };
    }
    if (isHuman(libra.bonderPlayerID)) return null;
    return {
      playerID: libra.bonderPlayerID,
      move: 'resolveLibraPick',
      args: defaultArgsFor('resolveLibraPick', G, libra.bonderPlayerID),
      why: `代 ${libra.bonderPlayerID} 挑牌`,
    };
  }

  // SHOOT 响应窗口：被射击的目标放弃闪避 / 接受惩罚而不弃牌，一律以目标本人的名义发；目标是真人就等他应答。
  const shoot = G.pendingShootResponse;
  if (shoot) {
    const target = shoot.targetPlayerID;
    if (isHuman(target)) return null;
    if (shoot.responseType === 'terrorist') {
      return {
        playerID: target,
        move: 'respondTerroristAccept',
        args: [],
        why: `${target} 接受恐怖分子惩罚`,
      };
    }
    return { playerID: target, move: 'respondShootPass', args: [], why: `${target} 放弃闪避` };
  }

  // 处女·完美：Bot 一律不发动，以处女本人的名义放弃；处女是真人就等她选择。
  const virgo = G.pendingVirgoChoice;
  if (virgo) {
    if (isHuman(virgo.virgoID)) return null;
    return {
      playerID: virgo.virgoID,
      move: 'respondVirgoPerfect',
      args: ['skip'],
      why: `${virgo.virgoID} 不发动完美`,
    };
  }

  // 黑洞·吞噬：名单里的每个人各自交 1 张牌，不限先后。Bot 座位以本人的名义代交，
  // 真人座位等他们自己选；名单里只剩真人时整体等待。
  const levy = G.pendingBlackHoleLevy;
  if (levy) {
    const giver = levy.waiting.find((id) => !isHuman(id));
    if (giver === undefined) return null;
    return {
      playerID: giver,
      move: 'respondBlackHoleLevy',
      args: defaultArgsFor('respondBlackHoleLevy', G, giver),
      why: `代 ${giver} 向黑洞交牌`,
    };
  }

  // 达尔文·淘汰：从抽牌后的手牌里选 2 张放回牌库顶；达尔文是真人就等他选。
  const darwin = G.pendingDarwinReturn;
  if (darwin) {
    if (isHuman(darwin.playerID)) return null;
    return {
      playerID: darwin.playerID,
      move: 'respondDarwinReturn',
      args: defaultArgsFor('respondDarwinReturn', G, darwin.playerID),
      why: `代 ${darwin.playerID} 选牌放回牌库顶`,
    };
  }

  // 雅典娜·急智：Bot 一律放弃，以雅典娜本人的名义应答；雅典娜是真人就等她选择。
  const wit = G.pendingAthenaWit;
  if (wit) {
    if (isHuman(wit.athenaID)) return null;
    return {
      playerID: wit.athenaID,
      move: 'respondAthenaWit',
      args: [null],
      why: `${wit.athenaID} 放弃急智`,
    };
  }

  // 土星·律令：以梦主本人的名义应答；按策略行动的 Bot 梦主有同名牌就抵消，否则放过；梦主是真人就等他选择。
  const decree = G.pendingSaturnDecree;
  if (decree) {
    if (isHuman(decree.masterID)) return null;
    if (options.policySeatIDs?.includes(decree.masterID)) {
      const counter = pickResponse(state, decree.masterID);
      if (counter !== null) return counter;
    }
    return {
      playerID: decree.masterID,
      move: 'respondSaturnDecree',
      args: [null],
      why: `${decree.masterID} 不发动律令`,
    };
  }

  // 回合主人是真人：等他操作
  if (isHuman(owner)) return null;

  // Bot 的回合
  const legal = legalMovesFor(ctx.phase, G.turnPhase);
  const move = pickBotMove(G, owner, legal);
  if (move === null) return null;
  // 出牌阶段：没有待结算的挑选要处理时（pickBotMove 落到 endActionPhase），按策略试着出牌
  if (
    move === 'endActionPhase' &&
    G.turnPhase === 'action' &&
    options.policySeatIDs?.includes(owner)
  ) {
    const play = pickPlay(state, owner, options.maxPlaysPerTurn ?? MAX_PLAYS_PER_TURN);
    if (play !== null) return play;
  }
  return {
    playerID: owner,
    move,
    args: defaultArgsFor(move, G, owner),
    why: `Bot ${owner} 回合 · ${G.turnPhase}`,
  };
}
