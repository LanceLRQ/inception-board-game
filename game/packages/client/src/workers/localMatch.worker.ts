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
  draw: ['doDraw', 'skipDraw', 'playJokerGamble', 'playBlackSwanTour', 'playBlackHoleLevy'],
  action: [
    'endActionPhase',
    'playShoot',
    'dreamMasterMove',
    'playUnlock',
    // W19-B Bug fix（2026-04-21）：响应类 / peek 三段式中间态 move 不放进 action 白名单
    //   原因：MOVES_BY_PHASE 是 pickBotMove 的合法 move 来源；若包含响应类，
    //         simpleBot.play 会主动选 → engine INVALID_MOVE 污染日志。
    //   正确路径：响应窗口 / pendingPeekDecision / peekReveal 由 autoPlayBots 顶部分支
    //         专用代发（见下方 prw / pendingPeekDecision / peekReveal 拦截分支）。
    //   被移除的 move（仅供顶部分支显式 dispatch，不参与 pickBotMove）：
    //     - respondCancelUnlock / passResponse / resolveUnlock
    //     - masterPeekBribeDecision / peekerAcknowledge
    'playDreamTransit',
    'playCreation',
    'playKick',
    'playTelekinesis',
    'useChessTranspose',
    'masterDealBribe',
    'playPeek',
    'playPeekMaster',
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
    'playGreenRayArrest',
    'playShootSudger',
    'resolveSudgerPick',
    'resolveShootMove',
    'useSagittariusHeartLock',
    'playShift',
    'masterRevealNightmare',
    'masterDiscardNightmare',
    'masterActivateNightmare',
    'playNightmareUnlock',
    'masterDealBribeImperial',
    'playSecretPassageTeleport',
    'useUranusPower',
    'usePlutoBurning',
    'useMarsKill',
    'useSaturnFreeMove',
    'useMarsBattlefield',
    'useVenusDouble',
    'masterDiscardHiddenNightmare',
    'playLibraBalance',
    'resolveLibraSplit',
    'resolveLibraPick',
    'playForgerExchangeSingle',
    'useSpaceQueenStashTop',
    'useBlackHoleAbsorb',
    'useImperialCityWorldShoot',
    'playRevive',
    'useVenusMirrorWorld',
  ],
  discard: ['doDiscard', 'skipDiscard', 'useSpaceQueenStashTop'],
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
  playPeekMaster: 230, // W19-B F10：梦主效果② 默认低优先（Bot L0 不主动使用）
  playGraft: 100,
  playTimeStorm: 101,
  playResonance: 102,
  playGravity: 103,
  resolveGravityPick: 0, // 必须优先结算进行中的挑选
  playShootKing: 104,
  playShootArmor: 105,
  playShootBurst: 106,
  playShootDreamTransit: 107,
  playGreenRayArrest: 109,
  playShootSudger: 111,
  resolveSudgerPick: 0, // 必须优先结算定罪选择
  resolveShootMove: 0, // 必须优先结算 pendingShootMove（发动方选层）
  useSagittariusHeartLock: 112,
  playShift: 108,
  masterRevealNightmare: 200, // 梦主低优先：Bot L0 默认不主动触发
  masterDiscardNightmare: 201,
  masterActivateNightmare: 202,
  playNightmareUnlock: 110,
  masterDealBribeImperial: 210,
  playSecretPassageTeleport: 211,
  useUranusPower: 212,
  usePlutoBurning: 213,
  useMarsKill: 214,
  useSaturnFreeMove: 115, // 盗梦者主动技能（中优先级）
  useMarsBattlefield: 116,
  masterDiscardHiddenNightmare: 215, // 梦主低优先：Bot L0 默认不主动触发
  useVenusDouble: 216, // 金星·重影（梦主低优先，避免 Bot 无手牌时误发）
  playJokerGamble: 220, // 小丑·赌博：draw 阶段替代 doDraw（Bot L0 不主动选）
  playBlackSwanTour: 221, // 黑天鹅·巡演：draw 阶段替代 doDraw（Bot L0 不主动选）

  resolveGraft: 0, // 必须优先结算 pendingGraft，才能推进流程
  resolveLibraSplit: 0, // pendingLibra step 2：优先处理
  resolveLibraPick: 0, // pendingLibra step 3：优先处理
  // W19-B F4b · 响应窗口 / 梦境窥视回合外推进（由 autoPlayBots 顶部分支代发，
  //   不走 pickBotMove 路径；此处记录以保持白名单一致）
  respondCancelUnlock: 0,
  passResponse: 0,
  resolveUnlock: 0,
  masterPeekBribeDecision: 0,
  peekerAcknowledge: 0,
  playLibraBalance: 117, // 天秤入口（盗梦者主动技能，中优先级）
  playForgerExchangeSingle: 118, // 欺诈师入口（同上）
  useSpaceQueenStashTop: 220, // 空间女王·造物（Bot L0 不主动选）
  playBlackHoleLevy: 222, // 黑洞·吞噬（draw 阶段替代，Bot L0 不主动选）
  useBlackHoleAbsorb: 119, // 黑洞·吸纳（盗梦者主动技能，中优先级）
  useImperialCityWorldShoot: 120, // 皇城世界观（中优先级）
  playRevive: 50, // 复活（高优先级，推进游戏流程）
  useVenusMirrorWorld: 130, // 金星·镜界世界观（中低优先级）
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
  // pendingSudgerRolls 存在时由 shooter（= currentPlayer）驱动 A/B 选择
  // 对照：game-engine/src/game.ts resolveSudgerPick guard（currentPlayer !== currentPlayerID → INVALID_MOVE）
  const psr = state?.G?.pendingSudgerRolls;
  if (
    psr &&
    state?.G?.currentPlayerID === botPlayerID &&
    legalMoves.includes('resolveSudgerPick')
  ) {
    return 'resolveSudgerPick';
  }

  // pendingShootMove 存在时，仅发动方（shooterID）可消费；Bot 是发动方 → 立即 resolve
  // 对照：game-engine/src/game.ts resolveShootMove guard
  const psm = state?.G?.pendingShootMove;
  if (psm && psm.shooterID === botPlayerID && legalMoves.includes('resolveShootMove')) {
    return 'resolveShootMove';
  }

  // pendingLibra：engine 已放宽 currentPlayer guard，任一参与方都可代发
  // 单机简化：优先由 bonder（= 当前 Bot 回合）一次性补完 split + pick
  const pl = state?.G?.pendingLibra;
  if (pl && pl.bonderPlayerID === botPlayerID) {
    if (!pl.split && legalMoves.includes('resolveLibraSplit')) return 'resolveLibraSplit';
    if (pl.split && legalMoves.includes('resolveLibraPick')) return 'resolveLibraPick';
  }

  // discard 阶段：手牌超限必须走 doDiscard；否则 skipDiscard
  // 对照：game-engine skipDiscard guard（hand.length > HAND_LIMIT → INVALID_MOVE）
  const handLen = (state?.G?.players?.[botPlayerID]?.hand?.length as number) ?? 0;
  if (legalMoves.includes('doDiscard') || legalMoves.includes('skipDiscard')) {
    if (handLen > HAND_LIMIT && legalMoves.includes('doDiscard')) return 'doDiscard';
    if (handLen <= HAND_LIMIT && legalMoves.includes('skipDiscard')) return 'skipDiscard';
  }

  // 排除 pending-only 的 move（上面已处理有 pending 状态的情况）
  // resolveLibraSplit/Pick 虽然 MOVE_PRIORITY=0 最高，但无 pendingLibra 时调用会 INVALID_MOVE → 必须排除
  const pendingOnly = new Set([
    'resolveGraft',
    'resolveGravityPick',
    'resolveLibraSplit',
    'resolveLibraPick',
    'resolveSudgerPick',
    'resolveShootMove',
  ]);
  const candidates = legalMoves.filter((m) => !pendingOnly.has(m));
  const sorted = [...candidates].sort(
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
    case 'resolveSudgerPick': {
      // Bot 简单策略：选较大的 roll（更可能命中 SHOOT 结算）
      // 对照：game-engine/src/game.ts resolveSudgerPick —— pick: 'A' | 'B'
      const psr = G?.pendingSudgerRolls;
      if (!psr) return ['A'];
      const rollA = (psr.rollA as number) ?? 0;
      const rollB = (psr.rollB as number) ?? 0;
      return [rollA >= rollB ? 'A' : 'B'];
    }
    case 'resolveShootMove': {
      // Bot 简单策略：选择 choices 的第一个（可行即可，L0 不做博弈优化）
      // 对照：game-engine/src/game.ts resolveShootMove
      const psm = G?.pendingShootMove as { choices?: number[] } | null | undefined;
      const choices = psm?.choices ?? [];
      return [choices[0] ?? 1];
    }
    case 'resolveLibraSplit': {
      // Bot 代 target：把 target 手牌对半分（偶数放 pile1，奇数放 pile2）
      // 注意：传入的 state 是 humanClient 的 playerView，target ≠ human 时 hand 被过滤为 null。
      // 必须从 target 自己的 client 读状态（每个 client 能看见自己的手牌）。
      const pl = G?.pendingLibra;
      const targetID = pl?.targetPlayerID as string | undefined;
      let targetHand: string[] = [];
      if (targetID !== undefined) {
        const targetIdx = parseInt(targetID, 10);
        const ownState = getState(clients[targetIdx]);
        const rawHand = ownState?.G?.players?.[targetID]?.hand;
        if (Array.isArray(rawHand)) targetHand = rawHand as string[];
      }
      const pile1: string[] = [];
      const pile2: string[] = [];
      targetHand.forEach((c, i) => (i % 2 === 0 ? pile1 : pile2).push(c));
      return [pile1, pile2];
    }
    case 'resolveLibraPick': {
      // Bot 代 bonder：比较两堆，选大的一堆；等长选 pile1
      const pl = G?.pendingLibra;
      const split = pl?.split;
      if (!split) return ['pile1'];
      const p1: string[] = split.pile1 ?? [];
      const p2: string[] = split.pile2 ?? [];
      return [p1.length >= p2.length ? 'pile1' : 'pile2'];
    }
    default:
      return [];
  }
}

// Worker 内不共享 client 的 logger；改用受控 console.* 模仿等级
// 约定：
//   logFlow → INFO（游戏流程关键点，prod 也显示）
//   logAI   → DEBUG（bot 决策细节，prod 静默）
//   logMove → INFO（统一 move dispatch 打点，覆盖 human / bot / 自动代发）
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
 *   actor 形如 "human(0)" / "bot(2)" / "auto-master(4)" / "auto-peeker(1)"
 *   move  move 名称
 *   ctx   { args, source?, ... }
 */
function logMove(actor: string, move: string, ctx?: unknown): void {
  if (ctx !== undefined) console.info(`[game/move] ${actor} → ${move}`, ctx);
  else console.info(`[game/move] ${actor} → ${move}`);
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
      logMove(`auto-setup(${HUMAN_PLAYER_ID})`, 'completeSetup');
      moves['completeSetup']?.();
      scheduleNext();
      return;
    }

    // W19-B F4b · 响应窗口自动推进（栈式 pendingResponseWindow）
    //   - 当前只实装"解封响应"源（sourceAbilityID=action_unlock_effect_1）
    //   - bot responder L0 策略：永远 pass；人类 responder 等 UI（MVP 阶段尚无 UI → 等 F4 后续）
    //   - 所有响应 move 由当前 BGIO ctx.currentPlayer 对应的 client 代发（绕过 BGIO 默认
    //     "只有 currentPlayer 可发 move"限制；engine passResponse(responderID?) 已支持）
    const prw = state.G.pendingResponseWindow as
      | {
          sourceAbilityID: string;
          responders: string[];
          responded: string[];
        }
      | null
      | undefined;
    if (prw) {
      const remaining = prw.responders.filter((id) => !prw.responded.includes(id));
      if (remaining.length > 0) {
        const next = remaining[0]!;
        // 人类响应者 → 等 UI（暂未接入，会卡住；F4 后续批次修）
        if (next === HUMAN_PLAYER_ID) {
          logAI('waiting human response (UI not yet wired)', {
            source: prw.sourceAbilityID,
            pendingResponders: remaining,
          });
          return;
        }
        // bot 响应者：代发 passResponse(responderID)
        const curIdx = parseInt(currentPlayer, 10);
        const curClient = clients[curIdx] ?? humanClient;
        logMove(`auto-responder(${next})`, 'passResponse', {
          source: prw.sourceAbilityID,
          via: `currentPlayer=${currentPlayer}`,
        });
        try {
          getMoves(curClient)['passResponse']?.(next);
        } catch (err) {
          console.warn('[ai/worker] auto passResponse failed', err);
        }
        scheduleNext();
        return;
      }
    }

    // W19-B F4b · 梦境窥视三段式自动推进
    //   - pendingPeekDecision → 梦主决策（人类梦主等 UI；bot 梦主默认 skip bribe 避免浪费池）
    //   - peekReveal → peeker 自动 ack（bot peeker 立即确认；人类 peeker 等 UI）
    const ppd = state.G.pendingPeekDecision as
      | { peekerID: string; targetLayer: number }
      | null
      | undefined;
    if (ppd) {
      const masterID = state.G.dreamMasterID as string;
      if (masterID === HUMAN_PLAYER_ID) {
        logAI('waiting human master peek bribe decision (UI not yet wired)', { ppd });
        return;
      }
      // 用当前 active player（= 盗梦者回合 currentPlayer）的 client 代发 —— BGIO 要求
      // active player；engine masterPeekBribeDecision 已放宽 guard，接受任一 client 代发
      // （参考 passResponse 范式：回合外 move 不 guard ctx.currentPlayer）
      const curIdx = parseInt(currentPlayer, 10);
      const curClient = clients[curIdx] ?? humanClient;
      logMove(`auto-master(${masterID})`, 'masterPeekBribeDecision', {
        deal: false,
        peekerID: ppd.peekerID,
        reason: 'bot master L0 默认 skip 避免浪费贿赂池',
      });
      try {
        getMoves(curClient)['masterPeekBribeDecision']?.(false);
      } catch (err) {
        console.warn('[ai/worker] auto masterPeekBribeDecision failed', err);
      }
      scheduleNext();
      return;
    }

    // W19-B F10：peekReveal 兼容 revealKind='vault'（效果①）与 'bribe'（效果②）
    const pr = state.G.peekReveal as
      | { peekerID: string; revealKind: 'vault'; vaultLayer: number }
      | { peekerID: string; revealKind: 'bribe'; targetThiefID: string }
      | null
      | undefined;
    if (pr) {
      if (pr.peekerID === HUMAN_PLAYER_ID) {
        logAI('waiting human peeker ack (UI not yet wired)', { pr });
        return;
      }
      // peekerAcknowledge 用当前 active player 的 client 代发：
      // 1) peeker=盗梦者 时（效果①）：其回合内 currentPlayer=peekerID → guard 通过
      // 2) peeker=梦主 时（效果②）：梦主回合内 currentPlayer=peekerID → guard 通过
      const curIdx = parseInt(currentPlayer, 10);
      const curClient = clients[curIdx] ?? humanClient;
      logMove(`auto-peeker(${pr.peekerID})`, 'peekerAcknowledge', {
        revealKind: pr.revealKind,
      });
      try {
        getMoves(curClient)['peekerAcknowledge']?.();
      } catch (err) {
        console.warn('[ai/worker] auto peekerAcknowledge failed', err);
      }
      scheduleNext();
      return;
    }

    // pendingLibra 自动补完（单机模式简化：engine 已放宽 currentPlayer guard）：
    //   无论 bonder 是人类还是 Bot，worker 统一代 target 对半分 + 代 bonder 挑大堆。
    //   ——保证人类 bonder 触发 playLibraBalance 后不会卡死。
    //   对照：packages/client/src/workers/localMatch.worker.ts R23
    const pendingLibra = state.G.pendingLibra as
      | { bonderPlayerID: string; targetPlayerID: string; split: unknown }
      | null
      | undefined;
    if (pendingLibra) {
      if (!pendingLibra.split) {
        const args = defaultArgsFor('resolveLibraSplit', state, pendingLibra.targetPlayerID);
        logMove(`auto-libra-target(${pendingLibra.targetPlayerID})`, 'resolveLibraSplit', { args });
        getMoves(humanClient)['resolveLibraSplit']?.(...args);
        scheduleNext();
        return;
      }
      if (pendingLibra.bonderPlayerID !== HUMAN_PLAYER_ID) {
        const args = defaultArgsFor('resolveLibraPick', state, pendingLibra.bonderPlayerID);
        logMove(`auto-libra-bonder(${pendingLibra.bonderPlayerID})`, 'resolveLibraPick', {
          args,
          bonderType: 'bot',
        });
        getMoves(humanClient)['resolveLibraPick']?.(...args);
        scheduleNext();
        return;
      }
      // bonder 是人类时，pick 也由 worker 自动（单机简化，避免引入 UI pile-picker）
      const args = defaultArgsFor('resolveLibraPick', state, HUMAN_PLAYER_ID);
      logMove(`auto-libra-bonder(${HUMAN_PLAYER_ID})`, 'resolveLibraPick', {
        args,
        bonderType: 'human (single-player simplification)',
      });
      getMoves(humanClient)['resolveLibraPick']?.(...args);
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
      // 关键：用 bot 自己 client 的 state 构造参数（它能看到自己的手牌等隐藏信息）；
      // humanClient state 经 playerView 过滤后 bot 的 hand 为 null，会导致 defaultArgsFor 返回空参数。
      const botState = getState(client) ?? state;
      const args = defaultArgsFor(chosen, botState, currentPlayer);
      logMove(`bot(${currentPlayer})`, chosen, { turnPhase, args });
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
      logMove(`human(${HUMAN_PLAYER_ID})`, move, { args });
      fn(...args);
    }
    scheduleNext();
  },

  async getPlayerId() {
    return HUMAN_PLAYER_ID;
  },
};

Comlink.expose(workerApi);
