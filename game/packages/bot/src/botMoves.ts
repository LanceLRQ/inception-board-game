// 本地人机对局 Bot 的选 move 与参数构造（面向对局状态的纯函数）
// 策略：尽量推进流程，不主动使用复杂 move（避免参数构造错误）；
//       有待结算事项时优先结算。

import type { SetupState } from '@icgame/game-engine/setup';
import { HAND_LIMIT } from '@icgame/game-engine/config';
import { MOVE_PRIORITY } from './moveTables.js';

/** 仅在存在对应待结算状态时才合法的 move；无待结算时调用会被引擎判为非法，必须从候选中排除 */
const PENDING_ONLY_MOVES: ReadonlySet<string> = new Set([
  'resolveGraft',
  'resolveGravityPick',
  'resolveLibraSplit',
  'resolveLibraPick',
  'resolveSudgerPick',
  'resolveShootMove',
]);

/** 为 Bot 从合法名单里选一个 move 名（需要对局状态做上下文决策） */
export function pickBotMove(G: SetupState, botID: string, legal: readonly string[]): string | null {
  if (legal.length === 0) return null;

  // 嫁接待结算必须优先
  if (G.pendingGraft?.playerID === botID && legal.includes('resolveGraft')) {
    return 'resolveGraft';
  }
  // 万有引力挑牌：由 bonder 驱动（简化）
  const pg = G.pendingGravity;
  if (pg && pg.bonderPlayerID === botID && legal.includes('resolveGravityPick')) {
    return 'resolveGravityPick';
  }
  // 定罪双骰待选：由 shooter（= 当前回合玩家）驱动 A/B 选择
  // 对照：game-engine/src/game.ts resolveSudgerPick 守卫（非当前回合玩家 → 非法）
  if (G.pendingSudgerRolls && G.currentPlayerID === botID && legal.includes('resolveSudgerPick')) {
    return 'resolveSudgerPick';
  }

  // SHOOT 判定为移动、待选层：仅发动方可消费；Bot 是发动方则立即结算
  // 对照：game-engine/src/game.ts resolveShootMove 守卫
  const psm = G.pendingShootMove;
  if (psm && psm.shooterID === botID && legal.includes('resolveShootMove')) {
    return 'resolveShootMove';
  }

  // 天秤待结算：引擎已放宽回合守卫，任一参与方都可代发
  // 单机简化：优先由 bonder 一次性补完 split + pick
  const pl = G.pendingLibra;
  if (pl && pl.bonderPlayerID === botID) {
    if (!pl.split && legal.includes('resolveLibraSplit')) return 'resolveLibraSplit';
    if (pl.split && legal.includes('resolveLibraPick')) return 'resolveLibraPick';
  }

  // 弃牌阶段：手牌超限必须走 doDiscard；否则 skipDiscard
  // 对照：game-engine skipDiscard 守卫（hand.length > HAND_LIMIT → 非法）
  const handLen = G.players[botID]?.hand?.length ?? 0;
  if (legal.includes('doDiscard') || legal.includes('skipDiscard')) {
    if (handLen > HAND_LIMIT && legal.includes('doDiscard')) return 'doDiscard';
    if (handLen <= HAND_LIMIT && legal.includes('skipDiscard')) return 'skipDiscard';
  }

  // 排除仅待结算态可用的 move（有待结算的情况上面已处理）
  const candidates = legal.filter((m) => !PENDING_ONLY_MOVES.has(m));
  const sorted = [...candidates].sort(
    (a, b) => (MOVE_PRIORITY[a] ?? 99) - (MOVE_PRIORITY[b] ?? 99),
  );
  return sorted[0] ?? null;
}

/** 为特定 move 构造默认参数（L0 Bot：最简参数） */
export function defaultArgsFor(move: string, G: SetupState, botID: string): unknown[] {
  const self = G.players[botID];
  switch (move) {
    case 'doDiscard': {
      // 手牌超限则弃掉前 N 张（N = 超出数量）；没超限也返回 [[]]
      const hand = self?.hand ?? [];
      const overflow = Math.max(0, hand.length - HAND_LIMIT);
      return [hand.slice(0, overflow)];
    }
    case 'dreamMasterMove': {
      const cur = self?.currentLayer ?? 1;
      return [Math.max(1, Math.min(4, cur + 1))];
    }
    case 'resolveGraft': {
      // 简单策略：取手牌前 2 张放回牌库顶
      const hand = self?.hand ?? [];
      return [hand.slice(0, 2)];
    }
    case 'resolveGravityPick': {
      // 简单策略：从牌池挑第 1 张
      const pool = G.pendingGravity?.pool ?? [];
      return [pool[0]];
    }
    case 'resolveSudgerPick': {
      // 简单策略：选较大的点数（更可能命中 SHOOT 结算）
      // 对照：game-engine/src/game.ts resolveSudgerPick —— pick: 'A' | 'B'
      const psr = G.pendingSudgerRolls;
      if (!psr) return ['A'];
      return [psr.rollA >= psr.rollB ? 'A' : 'B'];
    }
    case 'resolveShootMove': {
      // 简单策略：选 choices 的第一个（可行即可，L0 不做博弈优化）
      // 对照：game-engine/src/game.ts resolveShootMove
      const choices = G.pendingShootMove?.choices ?? [];
      return [choices[0] ?? 1];
    }
    case 'resolveLibraSplit': {
      // Bot 代被要求分牌的玩家：把其手牌按下标奇偶分两堆（偶数下标放第一堆，奇数下标放第二堆）
      const targetID = G.pendingLibra?.targetPlayerID;
      const targetHand = targetID !== undefined ? (G.players[targetID]?.hand ?? []) : [];
      const pile1: string[] = [];
      const pile2: string[] = [];
      targetHand.forEach((c, i) => (i % 2 === 0 ? pile1 : pile2).push(c));
      return [pile1, pile2];
    }
    case 'resolveLibraPick': {
      // Bot 代 bonder：比较两堆，选大的一堆；等长选 pile1
      const split = G.pendingLibra?.split;
      if (!split) return ['pile1'];
      return [split.pile1.length >= split.pile2.length ? 'pile1' : 'pile2'];
    }
    default:
      return [];
  }
}
