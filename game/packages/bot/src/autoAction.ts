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

/**
 * 允许回合主人以外的玩家发起的 move，交给运行器的 responseMoves。
 * 这些 move 的引擎守卫要求「当前玩家等于被响应的那个人」，而挂起时回合主人是发动者。
 */
export const RESPONSE_MOVES: ReadonlySet<string> = new Set([
  'respondShootPass',
  'respondTerroristAccept',
  'respondVirgoPerfect',
]);

/** 当前状态下应当自动执行的下一步；该等真人、对局已结束、或无事可做时返回 null */
export function nextAutoAction(
  state: MatchState<SetupState>,
  options: AutoActionOptions,
): AutoAction | null {
  const { G, ctx } = state;
  const isHuman = (id: string): boolean => options.humanPlayerIDs.includes(id);
  const owner = ctx.currentPlayer;

  // 对局已结束
  if (ctx.gameover !== undefined && ctx.gameover !== null) return null;

  // 布置阶段：由回合主人完成布置
  if (ctx.phase === 'setup') {
    return { playerID: owner, move: 'completeSetup', args: [], why: '完成布置，进入对局' };
  }

  // 响应窗口：取第一个还没响应的响应者；Bot 一律放弃响应，由回合主人代发
  const window = G.pendingResponseWindow;
  if (window) {
    const next = window.responders.find((id) => !window.responded.includes(id));
    if (next !== undefined) {
      if (isHuman(next)) return null;
      return {
        playerID: owner,
        move: 'passResponse',
        args: [next],
        why: `响应者 ${next} 放弃响应`,
      };
    }
  }

  // 梦境窥视：梦主决定是否派贿赂牌，Bot 梦主一律不派，避免白白消耗贿赂池
  if (G.pendingPeekDecision) {
    if (isHuman(G.dreamMasterID)) return null;
    return {
      playerID: owner,
      move: 'masterPeekBribeDecision',
      args: [false],
      why: `梦主 ${G.dreamMasterID} 不派贿赂牌`,
    };
  }

  // 梦境窥视：看牌者确认
  if (G.peekReveal) {
    const { peekerID } = G.peekReveal;
    if (isHuman(peekerID)) return null;
    return { playerID: owner, move: 'peekerAcknowledge', args: [], why: `${peekerID} 确认看牌` };
  }

  // 天秤：引擎的分牌与挑牌两步都不核对发起者，由回合主人代发。
  // 单机没有分牌界面，真人参与时同样自动完成，避免对局停住。
  const libra = G.pendingLibra;
  if (libra) {
    if (!libra.split) {
      return {
        playerID: owner,
        move: 'resolveLibraSplit',
        args: defaultArgsFor('resolveLibraSplit', G, libra.targetPlayerID),
        why: `代 ${libra.targetPlayerID} 分牌`,
      };
    }
    return {
      playerID: owner,
      move: 'resolveLibraPick',
      args: defaultArgsFor('resolveLibraPick', G, libra.bonderPlayerID),
      why: `代 ${libra.bonderPlayerID} 挑牌`,
    };
  }

  // SHOOT 响应窗口：被射击的目标是 Bot 时，放弃闪避 / 接受惩罚而不弃牌
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

  // 处女·完美：Bot 处女不发动
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
