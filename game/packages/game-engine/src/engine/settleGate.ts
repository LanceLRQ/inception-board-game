// 待结算闸门
//
// 打出【嫁接】【万有引力】【解封】等牌，或触发需要他人响应的技能之后，对局进入「待结算」状态。
// 这期间只能做结算它的那几个 move；否则玩家可以继续出牌把手牌耗尽，结算条件无法满足，对局卡死。
// 对照：docs/manual/04-action-cards.md 嫁接、万有引力、解封

import type { SetupState } from '../setup.js';

const INVALID_MOVE = 'INVALID_MOVE';

/** 每种待结算状态放行的 move。字段有值即视为待结算 */
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
  pendingAriesChoice: ['playAriesStardustActivate', 'playAriesStardustDiscard'],
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

/**
 * 给一组 move 套上闸门：被挡住时直接返回非法，不进入 move 本身。
 * 原函数挂在包装函数的 unwrapped 属性上，供测试工具读取形参。
 */
export function withSettleGate<M extends Record<string, GatedMove>>(moves: M): M {
  const gatedMoves: Record<string, GatedMove> = {};
  for (const [name, def] of Object.entries(moves)) {
    const original = def.move as (ctx: { G: SetupState }, ...rest: unknown[]) => unknown;
    const gated = (ctx: { G: SetupState }, ...rest: unknown[]): unknown =>
      blockedByPending(ctx.G, name) === null ? original(ctx, ...rest) : INVALID_MOVE;
    Object.defineProperty(gated, 'unwrapped', { value: original });
    gatedMoves[name] = { ...def, move: gated as never };
  }
  return gatedMoves as M;
}
