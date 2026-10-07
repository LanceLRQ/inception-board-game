// 当前状态下应当自动执行的下一步（面向对局运行器状态的纯函数）
//
// 把「待结算事项该由谁、用哪个 move 收尾」与「Bot 回合怎么出牌」统一成一个判定：
// 调用方（本地对局 Worker、全 Bot 对局回归）循环调用它，再交给运行器执行即可。

import type { SetupState } from '@icgame/game-engine/setup';
import type { MatchState } from '@icgame/game-engine/runner';
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

export interface AutoActionOptions {
  /** 由真人操作的玩家；轮到他们决定时返回 null */
  humanPlayerIDs: readonly string[];
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

  // 响应窗口：取第一个还没响应的响应者；Bot 一律放弃响应，由响应者本人发
  const window = G.pendingResponseWindow;
  if (window) {
    const next = window.responders.find((id) => !window.responded.includes(id));
    if (next !== undefined) {
      if (isHuman(next)) return null;
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

  // 回合主人是真人：等他操作
  if (isHuman(owner)) return null;

  // Bot 的回合
  const legal = legalMovesFor(ctx.phase, G.turnPhase);
  const move = pickBotMove(G, owner, legal);
  if (move === null) return null;
  return {
    playerID: owner,
    move,
    args: defaultArgsFor(move, G, owner),
    why: `Bot ${owner} 回合 · ${G.turnPhase}`,
  };
}
