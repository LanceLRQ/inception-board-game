// 待结算闸门与行动权校验
//
// 约定：对局阶段的 move 本体里，ctx.currentPlayer 表示「发起这个 move 的人」；
// 回合主人看 G.currentPlayerID。包装层按行动权表校验发起者，通过后把发起者写进 ctx.currentPlayer 再调原函数。
//
// 打出【嫁接】【万有引力】【解封】等牌，或触发需要他人响应的技能之后，对局进入「待结算」状态。
// 这期间只能做结算它的那几个 move；否则玩家可以继续出牌把手牌耗尽，结算条件无法满足，对局卡死。
// 对照：docs/manual/04-action-cards.md 嫁接、万有引力、解封

import type { SetupState } from '../setup.js';
import { INVALID_MOVE } from './invalidMove.js';
import { denyAction } from './actionRights.js';

/**
 * 每种待结算状态放行的 move。字段有值即视为待结算。
 *
 * 不收录 pendingAriesChoice（白羊·星尘的发动 / 放弃选择）：它的两个结算 move 只能由白羊
 * 在自己的回合发出，白羊不是回合主人时没人能结算；而回合结束时会自动放弃并清空它。
 * 若放进闸门，回合主人连结束行动阶段都做不到，对局会停死。
 * 等回合外响应可用后再收进来。
 */
export const SETTLE_MOVES = {
  pendingGraft: ['resolveGraft'],
  pendingGravity: ['resolveGravityPick'],
  pendingShootMove: ['resolveShootMove'],
  pendingSudgerRolls: ['resolveSudgerPick'],
  pendingLibra: ['resolveLibraSplit', 'resolveLibraPick'],
  pendingUnlock: ['resolveUnlock', 'respondCancelUnlock', 'passResponse'],
  pendingResponseWindow: ['resolveUnlock', 'respondCancelUnlock', 'passResponse'],
  pendingPeekDecision: ['masterPeekBribeDecision'],
  peekReveal: ['peekerAcknowledge'],
  pendingVirgoChoice: ['respondVirgoPerfect'],
  pendingShootResponse: [
    'respondShootEvade',
    'respondShootPass',
    'respondTerroristDiscard',
    'respondTerroristAccept',
  ],
} as const satisfies Partial<Record<keyof SetupState, readonly string[]>>;

export type BlockingField = keyof typeof SETTLE_MOVES;

/**
 * 判断 move 是否被待结算事项挡住。
 * 返回挡住它的字段名；没有待结算事项，或者 move 正是某个待结算事项的结算 move，返回 null。
 */
export function blockedByPending(G: SetupState, move: string): BlockingField | null {
  let first: BlockingField | null = null;
  for (const field of Object.keys(SETTLE_MOVES) as BlockingField[]) {
    if (!G[field]) continue;
    if ((SETTLE_MOVES[field] as readonly string[]).includes(move)) return null;
    first ??= field;
  }
  return first;
}

interface GatedMove {
  move: (...args: never[]) => unknown;
}

interface GateContext {
  G: SetupState;
  ctx: { currentPlayer: string };
  playerID?: string;
}

/**
 * 给一组 move 套上行动权校验：发起者此刻没有行动权时直接返回非法，不进入 move 本身。
 * 发起者取上下文里的 playerID；直接手写上下文调用、没有 playerID 时退回 ctx.currentPlayer。
 * 原函数挂在包装函数的 unwrapped 属性上，供测试工具读取形参。
 */
export function withSettleGate<M extends Record<string, GatedMove>>(moves: M): M {
  const gatedMoves: Record<string, GatedMove> = {};
  for (const [name, def] of Object.entries(moves)) {
    const original = def.move as (ctx: GateContext, ...rest: unknown[]) => unknown;
    const gated = (context: GateContext, ...rest: unknown[]): unknown => {
      const actor = context.playerID ?? context.ctx.currentPlayer;
      if (denyAction(context.G, actor, name) !== null) return INVALID_MOVE;
      return original({ ...context, ctx: { ...context.ctx, currentPlayer: actor } }, ...rest);
    };
    Object.defineProperty(gated, 'unwrapped', { value: original });
    gatedMoves[name] = { ...def, move: gated as never };
  }
  return gatedMoves as M;
}
