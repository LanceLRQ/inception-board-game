// 人机本地模式 Worker
// 在 Worker 内运行 BGIO Local 多人模式：1 个人类 + N 个 Bot
// 对照：plans/design/08-security-ai.md §8.5 L0 Bot

import * as Comlink from 'comlink';
import { Client } from 'boardgame.io/client';
import { Local } from 'boardgame.io/multiplayer';
import { InceptionCityGame } from '@icgame/game-engine';

export interface LocalMatchWorker {
  createLocalMatch: (playerCount: number, matchID?: string) => Promise<void>;
  getState: () => Promise<unknown>;
  makeMove: (move: string, args: unknown[]) => Promise<void>;
  getPlayerId: () => Promise<string>;
}

// 人类固定为玩家 0
const HUMAN_PLAYER_ID = '0';

// 基于 G.turnPhase 的合法 move 白名单
// 对照：game-engine/src/game.ts guardTurnPhase
const MOVES_BY_PHASE: Record<string, string[]> = {
  draw: ['doDraw', 'skipDraw'],
  action: [
    'endActionPhase',
    'playShoot',
    'dreamMasterMove',
    'playUnlock',
    'playDreamTransit',
    'playCreation',
    'playKick',
    'playTelekinesis',
    'useChessTranspose',
    'masterDealBribe',
    'playPeek',
    'playGraft',
    'resolveGraft',
    'playTimeStorm',
    'playResonance',
    'playGravity',
    'resolveGravityPick',
    'playShootKing',
    'playShootArmor',
    'playShootBurst',
    'playShootDreamTransit',
    'playShift',
  ],
  discard: ['doDiscard', 'skipDiscard'],
};

// move 优先级：数字小 = 更优先
// Bot L0 策略：尽量推进流程，不主动使用复杂 move（避免参数构造错误）
// 行动阶段首选 endActionPhase（流程向前推进）
const MOVE_PRIORITY: Record<string, number> = {
  doDraw: 1,
  skipDraw: 2,
  endActionPhase: 1, // action 阶段最高优先：结束回合
  playShoot: 90,
  playUnlock: 91,
  playDreamTransit: 92,
  playCreation: 93,
  dreamMasterMove: 94,
  playKick: 95,
  playTelekinesis: 96,
  useChessTranspose: 97,
  masterDealBribe: 98,
  playPeek: 99,
  playGraft: 100,
  playTimeStorm: 101,
  playResonance: 102,
  playGravity: 103,
  resolveGravityPick: 0, // 必须优先结算进行中的挑选
  playShootKing: 104,
  playShootArmor: 105,
  playShootBurst: 106,
  playShootDreamTransit: 107,
  playShift: 108,

  resolveGraft: 0, // 必须优先结算 pendingGraft，才能推进流程
  skipDiscard: 1,
  doDiscard: 2,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clients: any[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let humanClient: any = null;
let autoPlayEnabled = true;
let autoPlayScheduled = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getState(client: any): { G: Record<string, any>; ctx: Record<string, any> } | null {
  return client?.getState();
}

function getMoves(client: unknown): Record<string, (...args: unknown[]) => void> {
  return (client as { moves: Record<string, (...args: unknown[]) => void> }).moves;
}

/** 根据当前 phase/turnPhase 计算合法 move 名单 */
function legalMovesFor(ctxPhase: string | undefined, turnPhase: string | undefined): string[] {
  if (ctxPhase === 'setup') return ['completeSetup'];
  if (!turnPhase) return [];
  return MOVES_BY_PHASE[turnPhase] ?? [];
}

const HAND_LIMIT = 5;

/** 为 Bot 选择一个合法 move 名（需要 state 以做上下文决策） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBotMove(legalMoves: string[], state: any, botPlayerID: string): string | null {
  if (legalMoves.length === 0) return null;

  // pendingGraft 必须优先结算
  if (state?.G?.pendingGraft?.playerID === botPlayerID && legalMoves.includes('resolveGraft')) {
    return 'resolveGraft';
  }
  // pendingGravity 存在时由 bonder 驱动挑选（MVP 简化）
  const pg = state?.G?.pendingGravity;
  if (pg && pg.bonderPlayerID === botPlayerID && legalMoves.includes('resolveGravityPick')) {
    return 'resolveGravityPick';
  }

  // discard 阶段：手牌超限必须走 doDiscard；否则 skipDiscard
  // 对照：game-engine skipDiscard guard（hand.length > HAND_LIMIT → INVALID_MOVE）
  const handLen = (state?.G?.players?.[botPlayerID]?.hand?.length as number) ?? 0;
  if (legalMoves.includes('doDiscard') || legalMoves.includes('skipDiscard')) {
    if (handLen > HAND_LIMIT && legalMoves.includes('doDiscard')) return 'doDiscard';
    if (handLen <= HAND_LIMIT && legalMoves.includes('skipDiscard')) return 'skipDiscard';
  }

  const sorted = [...legalMoves].sort(
    (a, b) => (MOVE_PRIORITY[a] ?? 99) - (MOVE_PRIORITY[b] ?? 99),
  );
  return sorted[0] ?? null;
}

/** 为特定 move 构造默认参数（L0 Bot：最简参数） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultArgsFor(move: string, state: any, botPlayerID: string): unknown[] {
  const G = state?.G;
  if (!G) return [];
  const self = G.players?.[botPlayerID];
  switch (move) {
    case 'doDiscard': {
      // 手牌超限则弃掉前 N 张（N = 超出数量）；没超限也返回 [[]]
      const hand = (self?.hand as string[]) ?? [];
      const overflow = Math.max(0, hand.length - HAND_LIMIT);
      return [hand.slice(0, overflow)];
    }
    case 'dreamMasterMove': {
      const cur = self?.currentLayer ?? 1;
      return [Math.max(1, Math.min(4, cur + 1))];
    }
    case 'resolveGraft': {
      // Bot 简单策略：取手牌前 2 张放回牌库顶
      const hand = (self?.hand as string[]) ?? [];
      return [hand.slice(0, 2)];
    }
    case 'resolveGravityPick': {
      // Bot 简单策略：从 pool 挑第 1 张
      const pool = (G?.pendingGravity?.pool as string[]) ?? [];
      return [pool[0]];
    }
    default:
      return [];
  }
}

// Worker 内不共享 client 的 logger；改用受控 console.debug 模仿 DEBUG 等级
// 约定：AI 打点走 console.debug（dev 工具默认显示）
function logAI(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.debug(`[ai/worker] ${msg}`, ctx);
  else console.debug(`[ai/worker] ${msg}`);
}
function logFlow(msg: string, ctx?: unknown): void {
  if (ctx !== undefined) console.info(`[game/worker] ${msg}`, ctx);
  else console.info(`[game/worker] ${msg}`);
}

/** Bot 自动循环：当轮到 Bot 时自动执行 move */
function autoPlayBots(): void {
  if (!autoPlayEnabled || autoPlayScheduled) return;
  autoPlayScheduled = true;
  setTimeout(() => {
    autoPlayScheduled = false;
    if (!humanClient) return;
    const state = getState(humanClient);
    if (!state) return;

    // 游戏结束
    if (state.ctx.gameover) {
      logFlow('gameover', state.ctx.gameover);
      return;
    }

    const ctxPhase = state.ctx.phase as string | undefined;
    const currentPlayer = state.ctx.currentPlayer as string;

    // setup 阶段：让玩家 0 调用 completeSetup（一次性）
    if (ctxPhase === 'setup') {
      logFlow('setup complete → playing');
      const moves = getMoves(humanClient);
      moves['completeSetup']?.();
      scheduleNext();
      return;
    }

    // 人类回合：等待用户输入
    if (currentPlayer === HUMAN_PLAYER_ID) return;

    // Bot 回合
    const botIdx = parseInt(currentPlayer, 10);
    const client = clients[botIdx];
    if (!client) return;

    const turnPhase = state.G.turnPhase as string | undefined;
    const legal = legalMovesFor(ctxPhase, turnPhase);
    const chosen = pickBotMove(legal, state, currentPlayer);

    if (!chosen) {
      logAI(`bot ${currentPlayer} has no legal move`, { turnPhase, legal });
      return;
    }

    const moves = getMoves(client);
    const moveFn = moves[chosen];
    if (!moveFn) return;

    try {
      const args = defaultArgsFor(chosen, state, currentPlayer);
      logAI(`bot ${currentPlayer} plays ${chosen}`, { turnPhase, args });
      moveFn(...args);
    } catch (err) {
      console.warn(`[ai/worker] bot ${currentPlayer} move ${chosen} failed`, err);
    }

    scheduleNext();
  }, 50);
}

function scheduleNext(): void {
  setTimeout(() => autoPlayBots(), 50);
}

const workerApi: LocalMatchWorker = {
  async createLocalMatch(playerCount: number, matchID?: string) {
    clients.forEach((c) => c.stop());
    clients = [];

    const effectiveMatchID = matchID ?? `local-${Date.now()}`;
    logFlow('createLocalMatch', { playerCount, matchID: effectiveMatchID });
    const multi = Local();

    for (let i = 0; i < playerCount; i++) {
      const pid = String(i);
      const client = Client({
        game: InceptionCityGame as never,
        numPlayers: playerCount,
        multiplayer: multi,
        playerID: pid,
        matchID: effectiveMatchID,
      });
      client.start();
      clients.push(client);
      if (i === 0) humanClient = client;
    }

    autoPlayEnabled = true;
    autoPlayBots();
  },

  async getState() {
    if (!humanClient) return null;
    return humanClient.getState();
  },

  async makeMove(move: string, args: unknown[]) {
    if (!humanClient) return;
    const moves = getMoves(humanClient);
    const fn = moves[move];
    if (fn) {
      logFlow(`human plays ${move}`, { args });
      fn(...args);
    }
    scheduleNext();
  },

  async getPlayerId() {
    return HUMAN_PLAYER_ID;
  },
};

Comlink.expose(workerApi);
