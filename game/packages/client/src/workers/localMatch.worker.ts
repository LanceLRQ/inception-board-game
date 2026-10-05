// 人机本地模式 Worker
// 对局由引擎包的对局运行器驱动：1 个真人（玩家 0）+ N 个 Bot。
// 所有判断都在 LocalMatchSession 里；这里只负责 Comlink 外壳、自动循环的定时调度与日志。

import * as Comlink from 'comlink';
import type { RejectReason } from '@icgame/game-engine/runner';
import { LOCAL_HUMAN_SEAT } from './localSeat.js';
import { LocalMatchSession, MAX_CONSECUTIVE_REJECTS, buildMatchSeed } from './localMatchSession.js';

/** 真人 move 的结果 */
export type LocalMoveResult = { ok: true } | { ok: false; reason: RejectReason };

export interface LocalMatchWorker {
  createLocalMatch: (playerCount: number, matchID?: string) => Promise<void>;
  getState: () => Promise<unknown>;
  /** 会话尚未建立时返回 null；被拒时 reason 是运行器的拒绝码 */
  makeMove: (move: string, args: unknown[]) => Promise<LocalMoveResult | null>;
  getPlayerId: () => Promise<string>;
}

const HUMAN_PLAYER_ID = LOCAL_HUMAN_SEAT;

/** 自动循环的步进间隔（毫秒） */
const STEP_INTERVAL_MS = 100;

// Worker 内不共享 client 的 logger；改用受控 console.* 模仿等级
// 约定：
//   logFlow → INFO（游戏流程关键点，prod 也显示）
//   logAI   → DEBUG（bot 决策细节，prod 静默）
//   logMove → INFO（统一 move dispatch 打点，覆盖 human / bot / 自动代发）
//   logWarn → WARN（move 被拒等可恢复的异常）
//   logError → ERROR（自动循环放弃继续）
function logAI(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.debug(`[ai/worker] ${msg}`, ctx);
  else console.debug(`[ai/worker] ${msg}`);
}
function logFlow(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.info(`[game/worker] ${msg}`, ctx);
  else console.info(`[game/worker] ${msg}`);
}
/**
 * 统一 move dispatch 打点（INFO 级别）。
 *   actor 形如 "human(0)"（真人）/ "auto(2)"（Bot 出牌与所有自动代发的待结算收尾）
 *   move  move 名称
 *   ctx   { args, source?, ... }
 */
function logMove(actor: string, move: string, ctx?: unknown): void {
  if (ctx !== undefined) console.info(`[game/move] ${actor} → ${move}`, ctx);
  else console.info(`[game/move] ${actor} → ${move}`);
}
function logWarn(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.warn(`[game/move] ${msg}`, ctx);
  else console.warn(`[game/move] ${msg}`);
}
function logError(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.error(`[game/move] ${msg}`, ctx);
  else console.error(`[game/move] ${msg}`);
}

let session: LocalMatchSession | null = null;
/** 每次建局递增；定时回调发现代数变了就说明属于已被替换的旧对局 */
let generation = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 上一次记录过流程日志的回合，避免重复打点 */
let loggedTurn: { turn: number; currentPlayer: string } | null = null;
let gameoverLogged = false;

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** 回合切换与终局的流程打点 */
function logFlowChanges(current: LocalMatchSession): void {
  const { ctx } = current.view();
  if (ctx.gameover !== undefined) {
    if (!gameoverLogged) {
      gameoverLogged = true;
      logFlow('gameover', ctx.gameover);
    }
    return;
  }
  if (ctx.phase === 'setup') return;
  if (
    loggedTurn === null ||
    loggedTurn.turn !== ctx.turn ||
    loggedTurn.currentPlayer !== ctx.currentPlayer
  ) {
    loggedTurn = { turn: ctx.turn, currentPlayer: ctx.currentPlayer };
    logFlow('turn begin', { turn: ctx.turn, currentPlayer: ctx.currentPlayer, phase: ctx.phase });
  }
}

/** 安排下一步自动行动；已有未触发的定时器时先取消 */
function scheduleNext(): void {
  clearTimer();
  const scheduledGeneration = generation;
  timer = setTimeout(() => {
    timer = null;
    if (scheduledGeneration !== generation || session === null) return;
    runAutoStep(session);
  }, STEP_INTERVAL_MS);
}

function runAutoStep(current: LocalMatchSession): void {
  const result = current.step();

  if (result.action === null) {
    const { ctx } = current.view();
    if (ctx.gameover === undefined) {
      logAI('waiting for human input or no auto action', {
        currentPlayer: ctx.currentPlayer,
        turn: ctx.turn,
      });
    }
    logFlowChanges(current);
    return;
  }

  const { action } = result;
  if (result.ok) {
    logMove(`auto(${action.playerID})`, action.move, { args: action.args, why: action.why });
    logAI(`auto ${action.playerID} → ${action.move}`, action.why);
  } else {
    logWarn(`move rejected: auto(${action.playerID}) → ${action.move}`, {
      reason: result.reason,
      args: action.args,
      why: action.why,
    });
    if (!result.continue) {
      logError(
        `move rejected ${MAX_CONSECUTIVE_REJECTS} times in a row, auto play stopped: ${action.move}`,
        { playerID: action.playerID, reason: result.reason, why: action.why },
      );
    }
  }

  logFlowChanges(current);
  if (result.continue) scheduleNext();
}

const workerApi: LocalMatchWorker = {
  async createLocalMatch(playerCount: number, matchID?: string) {
    generation += 1;
    clearTimer();
    loggedTurn = null;
    gameoverLogged = false;

    const seed = buildMatchSeed(matchID, Date.now());
    logFlow('createLocalMatch', { playerCount, matchID, seed });
    session = new LocalMatchSession({
      playerCount,
      seed,
      humanPlayerID: HUMAN_PLAYER_ID,
    });
    scheduleNext();
  },

  async getState() {
    return session?.view() ?? null;
  },

  async makeMove(move: string, args: unknown[]) {
    if (!session) return null;
    const result = session.humanMove(move, args);
    if (result.ok) {
      logMove(`human(${HUMAN_PLAYER_ID})`, move, { args });
      logFlowChanges(session);
      // 状态变了才需要重新启动自动循环；被拒的 move 不改变状态
      scheduleNext();
      return { ok: true };
    }
    logWarn(`move rejected: human(${HUMAN_PLAYER_ID}) → ${move}`, {
      reason: result.detail,
      args,
    });
    return { ok: false, reason: result.reason ?? 'invalid_move' };
  },

  async getPlayerId() {
    return HUMAN_PLAYER_ID;
  },
};

Comlink.expose(workerApi);
