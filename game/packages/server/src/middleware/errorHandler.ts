import type { Middleware } from 'koa';
import { ZodError } from 'zod';
import { isAppError } from '../infra/errors.js';
import { logger } from '../infra/logger.js';

// 全局错误处理中间件
export const errorHandler: Middleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (isAppError(err)) {
      ctx.status = err.status;
      ctx.body = err.toJSON();
      return;
    }

    // 请求体不合规是客户端的错，不能落成 500
    if (err instanceof ZodError) {
      ctx.status = 400;
      ctx.body = {
        error: { code: 'VALIDATION_ERROR', message: err.issues[0]?.message ?? 'Invalid request' },
      };
      return;
    }

    if (err instanceof Error && 'status' in err) {
      const status = (err as { status?: number }).status;
      ctx.status = status ?? 500;
      ctx.body = { error: { code: 'VALIDATION_ERROR', message: err.message } };
      return;
    }

    logger.error({ err }, 'Unhandled error');
    ctx.status = 500;
    ctx.body = { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } };
  }
};
