// MoveGateway - WS Move 入口统一管道
// 对照：plans/design/07-backend-network.md §7.4 + §7.9
//
// 管道顺序：
//   1. 预加载 intent 幂等状态（Redis 版需要）
//   2. 调用 validateMove（L1-L7 全量）
//   3. 通过 → 转发给 BGIO；失败 → 返回错误响应
//   4. 成功后 recordIntent + recordMove

import {
  validateMove,
  type MoveContext,
  type MovePayload,
  type ValidationResult,
} from '@icgame/game-engine';
import type { SetupState } from '@icgame/game-engine';
import type { RateGuardMutable, RedisRateGuard } from './RateGuardService.js';
import { logger } from '../infra/logger.js';

export interface GatewayInput {
  readonly state: SetupState;
  readonly playerID: string; // WS 鉴权后的真实玩家
  readonly currentPlayer: string; // BGIO 当前玩家
  readonly intentId?: string;
  readonly payload: unknown;
}

export interface GatewayAcceptResult {
  readonly ok: true;
  readonly payload: MovePayload;
  readonly context: MoveContext;
}

export interface GatewayRejectResult {
  readonly ok: false;
  readonly code: string;
  readonly reason: string;
  readonly layer: number;
}

export type GatewayResult = GatewayAcceptResult | GatewayRejectResult;

/**
 * Move 入口：预加载 guard 状态 → 跑 validator → 返回判定结果。
 * 调用方负责：判定通过后执行 BGIO move，再 await gateway.commit()。
 */
export class MoveGateway {
  constructor(private readonly guard: RateGuardMutable) {}

  async accept(input: GatewayInput): Promise<GatewayResult> {
    // 预加载（Redis 版需要；内存版 no-op）
    const rg = this.guard as Partial<RedisRateGuard>;
    if (input.intentId && typeof rg.preloadIntent === 'function') {
      await rg.preloadIntent(input.intentId);
    }
    if (typeof rg.preloadRateCount === 'function') {
      await rg.preloadRateCount(input.playerID);
    }

    const ctx: MoveContext = {
      playerID: input.playerID,
      currentPlayer: input.currentPlayer,
      intentId: input.intentId,
    };

    const result: ValidationResult = validateMove(input.state, ctx, input.payload, this.guard);
    if (!result.ok) {
      logger.warn(
        {
          playerID: input.playerID,
          code: result.code,
          layer: result.layer,
          reason: result.reason,
        },
        'move rejected',
      );
      return {
        ok: false,
        code: result.code,
        reason: result.reason,
        layer: result.layer,
      };
    }
    return {
      ok: true,
      payload: input.payload as MovePayload,
      context: ctx,
    };
  }

  /** Move 成功执行后调用，记录 intent 幂等 + 限流计数 */
  async commit(ctx: MoveContext): Promise<void> {
    if (ctx.intentId) {
      await this.guard.recordIntent(ctx.intentId);
    }
    await this.guard.recordMove(ctx.playerID);
  }
}
