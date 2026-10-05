// MoveGateway - 请求入口管道（尚未接入对局房间）
//
// 管道顺序：
//   1. 校验请求形状与 move 名单（由引擎的 move 表派生）
//   2. 预加载 intent 幂等状态（Redis 版需要）
//   3. 幂等与限流
//   4. 通过 → 调用方把请求交给对局运行器；失败 → 返回错误响应
//   5. 运行器接受后，调用方 commit 记录 intent 与限流计数
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
    const shape = validateRequestShape(input.request, input.phase);
    if (!shape.ok) {
      logger.warn({ playerID: input.playerID, code: shape.code }, 'move request rejected');
      return { ok: false, code: shape.code, reason: `invalid request: ${shape.code}` };
    }

    const intentId = input.intentId ?? shape.request.intentId;

    // 预加载（Redis 版需要；内存版 no-op）
    const rg = this.guard as Partial<RedisRateGuard>;
    if (intentId && typeof rg.preloadIntent === 'function') {
      await rg.preloadIntent(intentId);
    }
    if (typeof rg.preloadRateCount === 'function') {
      await rg.preloadRateCount(input.playerID);
    }

    const context: RateContext = { playerID: input.playerID, intentId };
    const rate = validateRate(context, this.guard);
    if (!rate.ok) {
      logger.warn({ playerID: input.playerID, code: rate.code }, 'move request rejected');
      return { ok: false, code: rate.code, reason: rate.reason };
    }
    return { ok: true, request: shape.request, context };
  }

  /** 运行器接受请求后调用，记录 intent 幂等 + 限流计数 */
  async commit(ctx: RateContext): Promise<void> {
    if (ctx.intentId) {
      await this.guard.recordIntent(ctx.intentId);
    }
    await this.guard.recordMove(ctx.playerID);
  }
}
