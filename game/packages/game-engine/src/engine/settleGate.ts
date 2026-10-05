// 行动权校验包装层
//
// 约定：对局阶段的 move 本体里，ctx.currentPlayer 表示「发起这个 move 的人」；
// 回合主人看 G.currentPlayerID。包装层按行动权表（engine/actionRights.ts）校验发起者，
// 通过后把发起者写进 ctx.currentPlayer 再调原函数。
//
// 打出【嫁接】【万有引力】【解封】等牌，或触发需要他人响应的技能之后，对局进入「待结算」状态。
// 这期间只有被等待的人能发结算它的那几个 move；否则玩家可以继续出牌把手牌耗尽，结算条件无法满足，对局卡死。
// 「谁能发什么」只在行动权表里维护一份，这里不再另存 move 清单。
// 行动权通过后，再按参数形状表（moveArgs.ts）校验参数：类型不对的参数在进入 move 之前就被拒绝。
// 对照：docs/manual/04-action-cards.md 嫁接、万有引力、解封

import type { SetupState } from '../setup.js';
import { INVALID_MOVE } from './invalidMove.js';
import { denyAction } from './actionRights.js';
import { checkMoveArgs } from './moveArgs.js';

interface GatedMove {
  move: (...args: never[]) => unknown;
}

interface GateContext {
  G: SetupState;
  ctx: { currentPlayer: string };
  playerID?: string;
}

/**
 * 给一组 move 套上行动权与参数形状校验：发起者此刻没有行动权、或参数类型不对时直接返回非法，不进入 move 本身。
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
      if (!checkMoveArgs(context.G, name, rest)) return INVALID_MOVE;
      return original({ ...context, ctx: { ...context.ctx, currentPlayer: actor } }, ...rest);
    };
    Object.defineProperty(gated, 'unwrapped', { value: original });
    gatedMoves[name] = { ...def, move: gated as never };
  }
  return gatedMoves as M;
}
