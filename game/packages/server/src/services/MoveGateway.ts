// MoveGateway - 对局 move 的请求入口管道
//
// 管道顺序：
//   1. 限流（形状不对的请求同样受频率约束）
//   2. 校验请求形状与 move 名单（由引擎的 move 表派生）
//   3. 幂等（调用方传了 intentId 时）
//   4. 通过 → 调用方把请求交给对局运行器；失败 → 返回错误响应
//   5. 调用方对每次尝试都 commit 一次，计入限流（不论随后是否被运行器接受）
//
// 合法性判定（行动权、待结算闸门、各 move 的守卫）由对局运行器负责，
// 这里不执行 move，也不做那些判定。

import {
  validateRate,
  validateRequestShape,
  type ValidatedRequest,
  type RateContext,
} from '@icgame/game-engine';
import type { RateGuardMutable, RedisRateGuard } from './RateGuardService.js';
import { logger } from '../infra/logger.js';

export interface GatewayInput {
  /** 引擎的阶段名：'setup' 或 'playing' */
  readonly phase: string;
  /** 连接鉴权后的真实玩家 */
  readonly playerID: string;
  /** 不可信的原始请求：{ move, args, intentId? } */
  readonly request: unknown;
  /** 优先于请求里自带的 intentId */
  readonly intentId?: string;
}

export interface GatewayAcceptResult {
  readonly ok: true;
  readonly request: ValidatedRequest;
  readonly context: RateContext;
}

export interface GatewayRejectResult {
  readonly ok: false;
  readonly code: string;
  readonly reason: string;
}

export type GatewayResult = GatewayAcceptResult | GatewayRejectResult;

export class MoveGateway {
  constructor(private readonly guard: RateGuardMutable) {}

  async accept(input: GatewayInput): Promise<GatewayResult> {
    // 先限流再看形状：形状不对的请求也要受频率约束，否则可以无限发送
    const rg = this.guard as Partial<RedisRateGuard>;
    if (typeof rg.preloadRateCount === 'function') {
      await rg.preloadRateCount(input.playerID);
    }
    const limited = validateRate({ playerID: input.playerID }, this.guard);
    if (!limited.ok) {
      logger.warn({ playerID: input.playerID, code: limited.code }, 'move request rejected');
      return { ok: false, code: limited.code, reason: limited.reason };
    }

    const shape = validateRequestShape(input.request, input.phase);
    if (!shape.ok) {
      logger.warn({ playerID: input.playerID, code: shape.code }, 'move request rejected');
      return { ok: false, code: shape.code, reason: `invalid request: ${shape.code}` };
    }

    const intentId = input.intentId ?? shape.request.intentId;
    if (intentId && typeof rg.preloadIntent === 'function') {
      await rg.preloadIntent(intentId);
    }
    const context: RateContext = { playerID: input.playerID, intentId };
    const duplicate = validateRate(context, this.guard);
    if (!duplicate.ok) {
      logger.warn({ playerID: input.playerID, code: duplicate.code }, 'move request rejected');
      return { ok: false, code: duplicate.code, reason: duplicate.reason };
    }
    return { ok: true, request: shape.request, context };
  }

  /** 记一次请求：intent 幂等（有的话）与限流计数。调用方对每次尝试都应调用，不论是否被运行器接受 */
  async commit(ctx: RateContext): Promise<void> {
    if (ctx.intentId) {
      await this.guard.recordIntent(ctx.intentId);
    }
    await this.guard.recordMove(ctx.playerID);
  }
}
